import assert from "node:assert/strict";
import test from "node:test";
import { createGeminiVisionService } from "../server/services/geminiVision.js";

function image(text = "image", mimetype = "image/png") {
  return { buffer: Buffer.from(text), mimetype, originalname: "private-student-name.png" };
}

function score(overrides = {}) {
  return { subject: "Toán", grade: 10, semester1: 8, semester2: 8.5, year: 8.3, confidence: 0.95, ...overrides };
}

function generatedResponse(payload) {
  return new Response(JSON.stringify({
    candidates: [{ content: { role: "model", parts: [{ text: typeof payload === "string" ? payload : JSON.stringify(payload) }] }, finishReason: "STOP" }]
  }), { headers: { "Content-Type": "application/json" } });
}

async function withMockFetch(fetchImpl, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("Gemini OCR dùng model hiện hành, gửi ba ảnh với JSON schema và bỏ tên học sinh", async () => {
  const requests = [];
  const images = [image("page-one"), image("page-two", "image/jpeg"), image("page-three", "image/webp")];
  await withMockFetch(async (url, options) => {
    requests.push({ url: String(url), options });
    return generatedResponse({ student: { name: "Private student name" }, scores: [score({ subject: "Vật lý" })] });
  }, async () => {
    const result = await createGeminiVisionService({ apiKey: "test-sensitive-key" })(images);
    assert.equal(requests.length, 1);
    const request = requests[0];
    const body = JSON.parse(request.options.body);
    assert.equal(new URL(request.url).hostname, "generativelanguage.googleapis.com");
    assert.match(new URL(request.url).pathname, /\/models\/gemini-3\.5-flash-lite:generateContent$/);
    assert.equal(request.options.method, "POST");
    assert.equal(new Headers(request.options.headers).get("x-goog-api-key"), "test-sensitive-key");
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    const schema = body.generationConfig.responseSchema;
    assert.equal(schema.type.toLowerCase(), "object");
    assert.deepEqual(schema.required, ["student", "scores"]);
    assert.equal(schema.properties.student.properties.name.nullable, true);
    assert.deepEqual(schema.properties.scores.items.required, ["subject", "grade", "semester1", "semester2", "year", "confidence"]);
    assert.equal(body.contents.length, 1);
    const parts = body.contents[0].parts;
    assert.equal(parts.length, 4);
    assert.match(parts[0].text, /Không suy đoán/);
    assert.match(parts[0].text, /Không trích xuất tên học sinh; luôn trả student.name là null/);
    assert.deepEqual(parts.slice(1).map((part) => part.inlineData), images.map((item) => ({ mimeType: item.mimetype, data: item.buffer.toString("base64") })));
    assert.deepEqual(result.data.student, { name: null });
    assert.deepEqual(result.data.scores[0], score({ subject: "Vật lí" }));
    assert.doesNotMatch(request.url + request.options.body + JSON.stringify(result), /test-sensitive-key|Private student name|private-student-name/);
  });
});

test("Gemini OCR giữ model riêng và ghép điểm giữa các nhóm ảnh, luôn bỏ tên", async () => {
  const requests = [];
  await withMockFetch(async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url: String(url), body });
    return generatedResponse({
      student: { name: "Private student name" },
      scores: [score(requests.length === 1 ? { semester2: null, year: null } : { semester1: null, semester2: 9, year: 8.8 })]
    });
  }, async () => {
    const result = await createGeminiVisionService({ apiKey: "test", model: "custom-vision-model" })(Array.from({ length: 5 }, (_, index) => image(`page-${index}`)));
    assert.equal(requests.length, 2);
    assert.ok(requests.every((request) => new URL(request.url).pathname.endsWith("/models/custom-vision-model:generateContent")));
    assert.deepEqual(requests.map((request) => request.body.contents[0].parts.filter((part) => part.inlineData).length), [4, 1]);
    assert.deepEqual(result.data.student, { name: null });
    assert.deepEqual(result.data.scores, [score({ semester2: 9, year: 8.8 })]);
    assert.doesNotMatch(JSON.stringify(result), /Private student name/);
  });
});

test("Gemini OCR thiếu khóa không gọi mạng", async () => {
  await withMockFetch(async () => assert.fail("Không được gọi mạng"), async () => {
    await assert.rejects(() => createGeminiVisionService()([image()]), (error) => error.code === "MISSING_API_KEY" && error.statusCode === 503);
  });
});

test("Gemini OCR phân loại lỗi SDK HTTP và chỉ ghi chẩn đoán đã lọc", async () => {
  for (const [status, code, statusCode] of [[429, "AI_QUOTA", 503], [401, "AI_AUTH", 503], [403, "AI_AUTH", 503], [500, "AI_REQUEST_FAILED", 502]]) {
    const diagnostics = [];
    await withMockFetch(async () => new Response(JSON.stringify({ error: { code: status, message: "test-sensitive-key private-image private-provider-response" } }), {
      status, headers: { "Content-Type": "application/json" }
    }), async () => {
      const scan = createGeminiVisionService({ apiKey: "test-sensitive-key", onError: (error) => diagnostics.push(error) });
      await assert.rejects(() => scan([image("private-image")]), (error) => {
        assert.equal(error.code, code);
        assert.equal(error.statusCode, statusCode);
        assert.doesNotMatch(error.message + error.stack, /test-sensitive-key|private-image|private-provider-response/);
        return true;
      });
      assert.equal(diagnostics.length, 1);
      assert.deepEqual(Object.keys(diagnostics[0]).sort(), ["code", "name", "status"]);
      assert.equal(diagnostics[0].status, status);
      assert.doesNotMatch(JSON.stringify(diagnostics), /test-sensitive-key|private-image|private-provider-response/);
    });
  }
});

test("Gemini OCR không lộ lỗi mạng từ SDK", async () => {
  const diagnostics = [];
  await withMockFetch(async () => { throw new Error("test-sensitive-key private-image private-provider-response"); }, async () => {
    const scan = createGeminiVisionService({ apiKey: "test-sensitive-key", onError: (error) => diagnostics.push(error) });
    await assert.rejects(() => scan([image()]), (error) => error.code === "AI_REQUEST_FAILED" && error.statusCode === 502 && !/test-sensitive-key|private-image|private-provider-response/.test(error.message + error.stack));
    assert.doesNotMatch(JSON.stringify(diagnostics), /test-sensitive-key|private-image|private-provider-response/);
  });
});

test("Gemini OCR từ chối JSON được tạo bị hỏng mà không lộ nội dung", async () => {
  for (const text of ["{invalid private-provider-response", "", "```json\n{}\n```"] ) {
    await withMockFetch(async () => generatedResponse(text), async () => {
      const scan = createGeminiVisionService({ apiKey: "test" });
      await assert.rejects(() => scan([image()]), (error) => error.code === "INVALID_AI_JSON" && error.statusCode === 502 && !error.message.includes("private-provider-response"));
    });
  }
});

test("Gemini OCR xác thực điểm cuối cùng và dùng lỗi chung nếu không có dòng hợp lệ", async () => {
  await withMockFetch(async () => generatedResponse({ student: { name: "Private student name" }, scores: [score({ semester1: "9", year: 11, confidence: 2 })] }), async () => {
    const result = await createGeminiVisionService({ apiKey: "test" })([image()]);
    assert.deepEqual(result.data.student, { name: null });
    assert.deepEqual(result.data.scores, [score({ semester1: null, year: null, confidence: 0 })]);
    assert.match(result.warnings.join(" "), /không hợp lệ/);
  });
  for (const scores of [[], [score({ subject: "Môn không tồn tại" })], [score({ grade: 9 })]]) {
    await withMockFetch(async () => generatedResponse({ student: { name: "Private student name" }, scores }), async () => {
      await assert.rejects(() => createGeminiVisionService({ apiKey: "test" })([image()]), (error) => error.code === "NO_TRANSCRIPT_DATA" && error.statusCode === 422);
    });
  }
});
