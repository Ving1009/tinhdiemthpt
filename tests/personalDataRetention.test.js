import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSONAL_DATA_LAST_VISIT_KEY,
  PERSONAL_DATA_RETENTION_MS,
  refreshPersonalDataRetention
} from "../public/js/core/personalDataRetention.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
    set(key, value) { values.set(key, value); },
    remove(key) { values.delete(key); }
  };
}

test("lần truy cập mới tạo mốc lưu giữ và không xóa dữ liệu", () => {
  const store = memoryStorage({ form: { score: 8 }, theme: "dark" });
  const result = refreshPersonalDataRetention(store, ["form"], 1_000_000);
  assert.equal(result.expired, false);
  assert.deepEqual(store.get("form"), { score: 8 });
  assert.equal(store.get(PERSONAL_DATA_LAST_VISIT_KEY), 1_000_000);
});

test("dưới 30 ngày giữ dữ liệu và làm mới mốc truy cập", () => {
  const now = 2_000_000_000;
  const store = memoryStorage({ form: { score: 8 }, [PERSONAL_DATA_LAST_VISIT_KEY]: now - PERSONAL_DATA_RETENTION_MS + 1 });
  const result = refreshPersonalDataRetention(store, ["form"], now);
  assert.equal(result.expired, false);
  assert.deepEqual(store.get("form"), { score: 8 });
  assert.equal(store.get(PERSONAL_DATA_LAST_VISIT_KEY), now);
});

test("đủ 30 ngày xóa dữ liệu cá nhân nhưng giữ tùy chọn giao diện", () => {
  const now = 3_000_000_000;
  const store = memoryStorage({ form: { score: 8 }, wishes: [1], theme: "dark", [PERSONAL_DATA_LAST_VISIT_KEY]: now - PERSONAL_DATA_RETENTION_MS });
  const result = refreshPersonalDataRetention(store, ["form", "wishes"], now);
  assert.equal(result.expired, true);
  assert.equal(store.get("form"), null);
  assert.equal(store.get("wishes"), null);
  assert.equal(store.get("theme"), "dark");
  assert.equal(store.get(PERSONAL_DATA_LAST_VISIT_KEY), now);
});
