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

test("ghi nhận mã lỗi provider mà không đưa ảnh hay khóa API vào log", async () => {
  const failures = [];
  const scan = createTranscriptScanService([
    { name: "gemini", scan: async () => { throw new AppError("quota", { statusCode: 503, code: "AI_QUOTA" }); } },
    { name: "ocr-space", scan: async () => ({ data: { scores: [] }, warnings: [] }) }
  ], { onProviderError: (failure) => failures.push(failure) });

  await scan([{ buffer: Buffer.from("private-image") }]);

  assert.deepEqual(failures, [{ provider: "gemini", code: "AI_QUOTA", statusCode: 503, hasNext: true }]);
  assert.doesNotMatch(JSON.stringify(failures), /private-image|api.?key/i);
});

test("báo cho trình duyệt dùng Tesseract khi tất cả provider đều hết quota", async () => {
  const scan = createTranscriptScanService([
    { name: "gemini", scan: async () => { throw new AppError("quota", { statusCode: 503, code: "AI_QUOTA" }); } },
    { name: "ocr-space", scan: async () => { throw new AppError("quota", { statusCode: 503, code: "OCR_SPACE_QUOTA" }); } }
  ]);
  await assert.rejects(() => scan([]), (error) => error.code === "SCAN_QUOTA_EXHAUSTED" && /Tesseract/i.test(error.message));
});

test("Gemini hết quota chuyển sang Groq, thành công thì không gọi OCR.space", async () => {
  const calls = [];
  const scan = createTranscriptScanService([
    { name: "gemini", scan: async () => { calls.push("gemini"); throw new AppError("quota", { code: "AI_QUOTA" }); } },
    { name: "groq", scan: async () => { calls.push("groq"); return { data: { scores: [] }, warnings: [] }; } },
    { name: "ocr-space", scan: async () => assert.fail("Không được tải ảnh thêm sau khi Groq thành công") }
  ]);
  const result = await scan([]);
  assert.equal(result.engine, "groq");
  assert.deepEqual(calls, ["gemini", "groq"]);
  assert.match(result.warnings[0], /dự phòng/);
});

test("Groq lỗi quota, auth, timeout, phản hồi sai đều chuyển sang OCR.space", async () => {
  for (const code of ["GROQ_VISION_QUOTA", "GROQ_VISION_AUTH", "GROQ_VISION_TIMEOUT", "GROQ_VISION_REQUEST_FAILED", "GROQ_VISION_INVALID_RESPONSE", "GROQ_VISION_UNAVAILABLE"]) {
    const scan = createTranscriptScanService([
      { name: "groq", scan: async () => { throw new AppError("failed", { code }); } },
      { name: "ocr-space", scan: async () => ({ data: { scores: [] }, warnings: [] }) }
    ]);
    assert.equal((await scan([])).engine, "ocr-space", code);
  }
  const exhausted = createTranscriptScanService([
    { name: "groq", scan: async () => { throw new AppError("quota", { code: "GROQ_VISION_QUOTA" }); } }
  ]);
  await assert.rejects(() => exhausted([]), (error) => error.code === "SCAN_QUOTA_EXHAUSTED" && /Tesseract/.test(error.message));
});
