import assert from "node:assert/strict";
import test from "node:test";
import {
  GUEST_SESSION_LEFT_AT_KEY,
  GUEST_SESSION_RETENTION_MS,
  markGuestSessionLeft,
  refreshPersonalDataRetention
} from "../public/js/core/personalDataRetention.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
    set(key, value) { values.set(key, value); },
    remove(key) { values.delete(key); }
  };
}

test("khách quay lại trước 15 phút vẫn giữ phiên", () => {
  const now = 2_000_000_000;
  const store = memoryStorage({ form: { score: 8 }, [GUEST_SESSION_LEFT_AT_KEY]: now - GUEST_SESSION_RETENTION_MS + 1 });
  const result = refreshPersonalDataRetention(store, ["form"], now);
  assert.equal(result.expired, false);
  assert.deepEqual(store.get("form"), { score: 8 });
});

test("khách quay lại sau 15 phút bị xóa dữ liệu cá nhân nhưng giữ giao diện", () => {
  const now = 3_000_000_000;
  const store = memoryStorage({ form: { score: 8 }, wishes: [1], theme: "dark", [GUEST_SESSION_LEFT_AT_KEY]: now - GUEST_SESSION_RETENTION_MS });
  const result = refreshPersonalDataRetention(store, ["form", "wishes"], now);
  assert.equal(result.expired, true);
  assert.equal(store.get("form"), null);
  assert.equal(store.get("wishes"), null);
  assert.equal(store.get("theme"), "dark");
});

test("tài khoản đăng nhập không bị xóa và không ghi mốc rời của khách", () => {
  const store = memoryStorage({ form: { score: 8 } });
  markGuestSessionLeft(store, 1000, true);
  assert.equal(store.get(GUEST_SESSION_LEFT_AT_KEY), null);
  const result = refreshPersonalDataRetention(store, ["form"], 2000, { authenticated: true });
  assert.equal(result.authenticated, true);
  assert.deepEqual(store.get("form"), { score: 8 });
});
