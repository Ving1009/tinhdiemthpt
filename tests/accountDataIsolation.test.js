import assert from "node:assert/strict";
import test from "node:test";
import { AccountDataIsolation } from "../public/js/core/accountDataIsolation.js";

const PERSONAL_KEYS = [
  "thpt-calculator-form-v2",
  "thpt-wishlist-v1",
  "thpt-comparison-v1",
  "thpt-practice-history-v1"
];
const AUTH_SESSION_KEY = "thpt-auth-session-v2";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function memoryStorage() {
  const values = new Map();
  return {
    get(key, fallback = null) {
      return values.has(key) ? clone(values.get(key)) : fallback;
    },
    set(key, value) {
      values.set(key, clone(value));
    },
    remove(key) {
      values.delete(key);
    }
  };
}

test("dữ liệu cá nhân được cô lập theo user và không xóa tùy chọn giao diện", () => {
  const storage = memoryStorage();
  const isolation = new AccountDataIsolation({ storage, personalKeys: PERSONAL_KEYS, authSessionKey: AUTH_SESSION_KEY });

  storage.set("theme", "dark");
  storage.set(PERSONAL_KEYS[0], { score: 26 });
  storage.set(PERSONAL_KEYS[1], ["A-old"]);

  isolation.beginUser("user-a");
  assert.equal(storage.get(PERSONAL_KEYS[0], null), null);
  assert.equal(storage.get("theme"), "dark");
  assert.equal(isolation.completeUser("user-a", { [PERSONAL_KEYS[0]]: { score: 24 }, "theme": "light" }), true);
  assert.deepEqual(storage.get(PERSONAL_KEYS[0]), { score: 24 });
  assert.equal(storage.get("theme"), "dark");
  assert.deepEqual(isolation.snapshotFor("user-a"), { [PERSONAL_KEYS[0]]: { score: 24 } });

  isolation.beginUser("user-b");
  assert.equal(storage.get(PERSONAL_KEYS[0], null), null);
  assert.equal(isolation.snapshotFor("user-a"), null);
  assert.equal(isolation.completeUser("user-b", { [PERSONAL_KEYS[1]]: ["B-only"], unrelated: true }), true);
  assert.deepEqual(isolation.snapshotFor("user-b"), { [PERSONAL_KEYS[1]]: ["B-only"] });
});

test("không áp dụng bản khôi phục nếu tài khoản đã đổi giữa chừng", () => {
  const storage = memoryStorage();
  const isolation = new AccountDataIsolation({ storage, personalKeys: PERSONAL_KEYS, authSessionKey: AUTH_SESSION_KEY });

  isolation.beginUser("user-a");
  isolation.beginUser("user-b");

  assert.equal(isolation.completeUser("user-a", { [PERSONAL_KEYS[0]]: { score: 28 } }), false);
  assert.equal(storage.get(PERSONAL_KEYS[0], null), null);
  assert.equal(isolation.completeUser("user-b", { [PERSONAL_KEYS[0]]: { score: 21 } }), true);
  assert.deepEqual(storage.get(PERSONAL_KEYS[0]), { score: 21 });
});

test("đăng xuất xóa dữ liệu cá nhân và marker phiên cục bộ", () => {
  const storage = memoryStorage();
  const isolation = new AccountDataIsolation({ storage, personalKeys: PERSONAL_KEYS, authSessionKey: AUTH_SESSION_KEY });

  storage.set("theme", "dark");
  isolation.beginUser("user-a");
  isolation.completeUser("user-a", { [PERSONAL_KEYS[2]]: { ids: ["BKA"] } });
  isolation.clearSession();

  assert.equal(storage.get(AUTH_SESSION_KEY, null), null);
  assert.equal(storage.get(PERSONAL_KEYS[2], null), null);
  assert.equal(storage.get("theme"), "dark");
});
