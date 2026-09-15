import assert from "node:assert/strict";
import test from "node:test";
import { createOcrSpaceVisionService } from "../server/services/ocrSpaceVision.js";

function image(overrides = {}) {
  return {
    buffer: Buffer.from("image"),
    mimetype: "image/png",
    originalname: "hoc-ba-lop-10.png",
    ...overrides
  };
}

test("OCR.space gửi cấu hình bảng tiếng Việt và chuẩn hóa kết quả", async () => {
  let request;
  const scan = createOcrSpaceVisionService({
    apiKey: "test-key",
    fetchImpl: async (endpoint, options) => {
      request = { endpoint, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          IsErroredOnProcessing: false,
          ParsedResults: [{ FileParseExitCode: 1, ParsedText: "Lớp 10\nHK1 HK2 Cả năm\nToán 8.0 8.5 8.3" }]
        })
      };
    }
  });
  const result = await scan([image()]);
  assert.equal(request.endpoint, "https://api.ocr.space/parse/image");
  assert.equal(request.options.headers.apikey, "test-key");
  assert.equal(request.options.body.get("language"), "vnm");
  assert.equal(request.options.body.get("isTable"), "true");
  assert.equal(request.options.body.get("scale"), "true");
  assert.equal(request.options.body.get("OCREngine"), "2");
  assert.deepEqual(result.data.scores[0], {
    subject: "Toán", grade: 10, semester1: 8, semester2: 8.5, year: 8.3, confidence: 0.39
  });
  assert.match(result.warnings[0], /OCR\.space/);
});

test("OCR.space phân loại quota để bộ điều phối đổi khóa", async () => {
  const scan = createOcrSpaceVisionService({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      json: async () => ({ IsErroredOnProcessing: true, ErrorMessage: ["Daily quota exceeded"] })
    })
  });
  await assert.rejects(() => scan([image()]), (error) => error.code === "OCR_SPACE_QUOTA" && !error.message.includes("test-key"));
});

test("OCR.space vẫn nhận biết HTTP 429 khi body không phải JSON", async () => {
  const scan = createOcrSpaceVisionService({
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => { throw new SyntaxError("html"); } })
  });
  await assert.rejects(() => scan([image()]), (error) => error.code === "OCR_SPACE_QUOTA");
});

test("OCR.space bỏ qua WEBP để Tesseract xử lý", async () => {
  let calls = 0;
  const scan = createOcrSpaceVisionService({ apiKey: "test-key", fetchImpl: async () => { calls += 1; } });
  await assert.rejects(() => scan([image({ mimetype: "image/webp" })]), (error) => error.code === "OCR_SPACE_UNSUPPORTED_IMAGE");
  assert.equal(calls, 0);
});

test("OCR.space không gửi ảnh vượt giới hạn cấu hình", async () => {
  let calls = 0;
  const scan = createOcrSpaceVisionService({ apiKey: "test-key", maxImageBytes: 4, fetchImpl: async () => { calls += 1; } });
  await assert.rejects(() => scan([image()]), (error) => error.code === "OCR_SPACE_FILE_TOO_LARGE");
  assert.equal(calls, 0);
});
