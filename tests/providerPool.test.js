import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../server/errors.js";
import { createConfiguredScanProviders } from "../server/server.js";
import { collectApiKeys, createProviderPool } from "../server/services/providerPool.js";

test("thu thập khóa từ biến riêng và danh sách, bỏ trùng và placeholder", () => {
  const keys = collectApiKeys({
    GEMINI_API_KEY: "key-a",
    GEMINI_API_KEY_1: "key-a",
    GEMINI_API_KEY_2: "key-b",
    GEMINI_API_KEY_3: "your_gemini_api_key_here",
    GEMINI_API_KEYS: "key-c, key-b;key-d\nkey-e"
  }, { primaryName: "GEMINI_API_KEY", listName: "GEMINI_API_KEYS", numberedStart: 1, numberedEnd: 5 });
  assert.deepEqual(keys, ["key-a", "key-b", "key-c", "key-d", "key-e"]);
});

test("xoay vòng khóa khỏe và tạm bỏ khóa vừa gặp quota", async () => {
  let clock = 1_000;
  const calls = [];
  let firstKeyHasQuota = true;
  const scan = createProviderPool({
    keys: ["key-a", "key-b"],
    createService: (key) => async () => {
      calls.push(key);
      if (key === "key-a" && firstKeyHasQuota) {
        firstKeyHasQuota = false;
        throw new AppError("quota", { statusCode: 503, code: "AI_QUOTA" });
      }
      return { data: key };
    },
    retryCodes: new Set(["AI_QUOTA"]),
    cooldownMsByCode: { AI_QUOTA: 300_000 },
    now: () => clock
  });

  assert.equal((await scan([])).data, "key-b");
  assert.deepEqual(calls, ["key-a", "key-b"]);
  calls.length = 0;
  assert.equal((await scan([])).data, "key-b");
  assert.deepEqual(calls, ["key-b"]);
  clock += 300_001;
  calls.length = 0;
  assert.equal((await scan([])).data, "key-a");
  assert.deepEqual(calls, ["key-a"]);
});

test("không thử khóa tiếp theo với lỗi nội dung không thể khắc phục bằng đổi khóa", async () => {
  const calls = [];
  const scan = createProviderPool({
    keys: ["key-a", "key-b"],
    createService: (key) => async () => {
      calls.push(key);
      throw new AppError("bad image", { statusCode: 422, code: "NO_TRANSCRIPT_DATA" });
    },
    retryCodes: new Set(["AI_QUOTA"])
  });
  await assert.rejects(() => scan([]), (error) => error.code === "NO_TRANSCRIPT_DATA");
  assert.deepEqual(calls, ["key-a"]);
});

test("backend chỉ cấu hình Gemini và OCR.space; biến Tesseract cũ bị bỏ qua", () => {
  const providers = createConfiguredScanProviders({
    GEMINI_API_KEY: "gemini-one",
    GEMINI_API_KEY_2: "gemini-two",
    OCR_SPACE_API_KEY_1: "ocr-one",
    OCR_SPACE_API_KEY_2: "ocr-two",
    TESSERACT_FALLBACK_ENABLED: "true"
  });
  assert.deepEqual(providers.map((provider) => provider.name), ["gemini", "ocr-space"]);
});
