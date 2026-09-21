import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../server/errors.js";
import { createTranscriptScanService } from "../server/services/transcriptScanService.js";

test("chuyển sang OCR.space khi Gemini hết hạn mức", async () => {
  const calls = [];
  const scan = createTranscriptScanService([
    { name: "gemini", label: "Gemini", scan: async () => { calls.push("gemini"); throw new AppError("limit", { statusCode: 503, code: "AI_QUOTA" }); } },
    { name: "ocr-space", label: "OCR.space", scan: async () => { calls.push("ocr-space"); return { data: { scores: [] }, warnings: ["Kiểm tra lại."] }; } }
  ]);
  const result = await scan([]);
  assert.deepEqual(calls, ["gemini", "ocr-space"]);
  assert.equal(result.engine, "ocr-space");
  assert.match(result.warnings[0], /phương án nhận diện dự phòng/i);
});

test("dừng ở OCR.space khi phương án từ xa dự phòng thành công", async () => {
  const calls = [];
  const scan = createTranscriptScanService([
    { name: "gemini", label: "Gemini", scan: async () => { calls.push("gemini"); throw new AppError("limit", { statusCode: 503, code: "AI_QUOTA" }); } },
    { name: "ocr-space", label: "OCR.space", scan: async () => { calls.push("ocr-space"); return { data: { scores: [] }, warnings: [] }; } }
  ]);
  const result = await scan([]);
  assert.deepEqual(calls, ["gemini", "ocr-space"]);
  assert.equal(result.engine, "ocr-space");
  assert.match(result.warnings[0], /phương án nhận diện dự phòng/i);
});

test("không đổi provider khi lỗi không thuộc nhóm có thể dự phòng", async () => {
  let fallbackCalls = 0;
  const scan = createTranscriptScanService([
    { name: "primary", label: "Primary", scan: async () => { throw new AppError("Ảnh sai.", { statusCode: 400, code: "INVALID_IMAGE" }); } },
    { name: "fallback", label: "Fallback", scan: async () => { fallbackCalls += 1; return {}; } }
  ]);
  await assert.rejects(() => scan([]), (error) => error.code === "INVALID_IMAGE");
  assert.equal(fallbackCalls, 0);
});
