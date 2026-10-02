import assert from "node:assert/strict";
import test from "node:test";
import {
  createHuggingFaceVisionService, createRequestyVisionService,
  DEFAULT_HUGGINGFACE_VISION_MODEL, DEFAULT_REQUESTY_VISION_MODEL,
  HUGGINGFACE_VISION_ENDPOINT, REQUESTY_VISION_ENDPOINT
} from "../server/services/extraVisionProviders.js";

function image(text = "image", mimetype = "image/png") {
  return { buffer: Buffer.from(text), mimetype, originalname: "private-student-name.png" };
}

function score(overrides = {}) {
  return { subject: "Toán", grade: 10, semester1: 8, semester2: 8.5, year: 8.3, confidence: 0.95, ...overrides };
}

function completion(scores) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ student: { name: "Private student name" }, scores }) } }] }));
}

const providers = [
  { create: createHuggingFaceVisionService, name: "Hugging Face", code: "HUGGINGFACE_VISION", endpoint: HUGGINGFACE_VISION_ENDPOINT, model: DEFAULT_HUGGINGFACE_VISION_MODEL, tokens: "max_tokens" },
  { create: createRequestyVisionService, name: "Requesty", code: "REQUESTY_VISION", endpoint: REQUESTY_VISION_ENDPOINT, model: DEFAULT_REQUESTY_VISION_MODEL, tokens: "max_completion_tokens", reasoning: "none" }
];

for (const provider of providers) {
  test(`${provider.name} OCR gửi đúng payload và xác thực điểm, loại bỏ tên học sinh`, async () => {
    let request;
    const scan = provider.create({ apiKey: " test-sensitive-key ", model: " ", fetchImpl: async (url, options) => {
      request = { url, options };
      return completion([score({ subject: "Vật lý", semester1: "9", year: 11 })]);
    } });
    const result = await scan([image()]);
    const body = JSON.parse(request.options.body);
    assert.equal(request.url, provider.endpoint);
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.headers.Authorization, "Bearer test-sensitive-key");
    assert.equal(body.model, provider.model);
    assert.equal(body[provider.tokens], 2048);
    assert.equal(body[provider.tokens === "max_tokens" ? "max_completion_tokens" : "max_tokens"], undefined);
    assert.equal(body.reasoning_effort, provider.reasoning);
    assert.equal(body.stream, false);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].content.length, 2);
    assert.match(body.messages[0].content[0].text, /Không trích xuất tên học sinh/);
    assert.equal(body.messages[0].content[1].image_url.url, `data:image/png;base64,${Buffer.from("image").toString("base64")}`);
    assert.deepEqual(result.data.student, { name: null });
    assert.deepEqual(result.data.scores[0], score({ subject: "Vật lí", semester1: null, year: null }));
    assert.match(result.warnings.join(" "), /không hợp lệ/);
    assert.doesNotMatch(request.url + request.options.body + JSON.stringify(result), /test-sensitive-key|Private student name|private-student-name/);
  });

  test(`${provider.name} OCR chỉ thử lại ảnh bị quota hoặc auth bằng khóa khác`, async () => {
    for (const status of [429, 401, 403]) {
      const requests = [];
      const signals = [];
      const scan = provider.create({ apiKeys: ["key-a", "key-b"], model: "custom-vision-model", fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.model, "custom-vision-model");
        const page = Buffer.from(body.messages[0].content[1].image_url.url.split(",")[1], "base64").toString();
        const key = options.headers.Authorization;
        requests.push([page, key]);
        signals.push(options.signal);
        if (page === "page-2" && key === "Bearer key-b") return new Response("private-provider-response", { status });
        return completion([score({ grade: Number(page.at(-1)) + 9 })]);
      } });
      const result = await scan([image("page-1"), image("page-2"), image("page-3")]);
      assert.deepEqual(requests, [["page-1", "Bearer key-a"], ["page-2", "Bearer key-b"], ["page-2", "Bearer key-a"], ["page-3", "Bearer key-a"]]);
      assert.ok(signals.every((signal) => signal === signals[0]));
      assert.deepEqual(result.data.scores.map(({ grade }) => grade), [10, 11, 12]);
    }
  });

  test(`${provider.name} OCR không gọi mạng khi thiếu cấu hình hoặc ảnh không an toàn`, async () => {
    const neverFetch = async () => assert.fail("Không được gọi mạng");
    for (const options of [{ fetchImpl: neverFetch }, { apiKey: "test", fetchImpl: null }]) {
      await assert.rejects(() => provider.create(options)([image()]), (error) => error.code === `${provider.code}_UNAVAILABLE` && error.statusCode === 503);
    }
    const scan = provider.create({ apiKey: "test", fetchImpl: neverFetch });
    for (const images of [[], Array(7).fill(image()), [image("")], [image("html", "text/html")], [{ buffer: Buffer.alloc(7 * 1024 * 1024 + 1), mimetype: "image/png" }]]) {
      await assert.rejects(() => scan(images), (error) => error.code === `${provider.code}_REQUEST_FAILED` && error.statusCode === 400);
    }
  });

  test(`${provider.name} OCR phân loại lỗi HTTP và mạng mà không lộ dữ liệu nhạy cảm`, async () => {
    const failures = [
      [429, "QUOTA", 503], [401, "AUTH", 503], [403, "AUTH", 503], [500, "REQUEST_FAILED", 502], [null, "REQUEST_FAILED", 502]
    ];
    for (const [status, suffix, statusCode] of failures) {
      const scan = provider.create({ apiKey: "test-sensitive-key", fetchImpl: async () => {
        if (status === null) throw new Error("test-sensitive-key private-image private-provider-response");
        return new Response("test-sensitive-key private-image private-provider-response", { status });
      } });
      await assert.rejects(() => scan([image("private-image")]), (error) => {
        assert.equal(error.code, `${provider.code}_${suffix}`);
        assert.equal(error.statusCode, statusCode);
        assert.doesNotMatch(error.message + error.stack, /test-sensitive-key|private-image|private-provider-response/);
        return true;
      });
    }
  });

  test(`${provider.name} OCR từ chối JSON hỏng và dùng lỗi chung khi không có điểm hợp lệ`, async () => {
    for (const body of ["not-json private-provider-response", "{}", '{"choices":[{"message":{"content":"{}"}}]}']) {
      const scan = provider.create({ apiKey: "test", fetchImpl: async () => new Response(body) });
      await assert.rejects(() => scan([image()]), (error) => error.code === `${provider.code}_INVALID_RESPONSE` && !error.message.includes("private-provider-response"));
    }
    for (const scores of [[], [score({ subject: "Môn không tồn tại" })], [score({ grade: 9 })]]) {
      const scan = provider.create({ apiKey: "test", fetchImpl: async () => completion(scores) });
      await assert.rejects(() => scan([image()]), (error) => error.code === "NO_TRANSCRIPT_DATA" && error.statusCode === 422);
    }
  });

  test(`${provider.name} OCR giữ timeout khi đọc response body và không thử thêm khóa`, async () => {
    let signal;
    let calls = 0;
    const scan = provider.create({ apiKeys: ["key-a", "key-b"], timeoutMs: 15, fetchImpl: async (_url, options) => {
      calls += 1;
      signal = options.signal;
      return new Response(new ReadableStream({ start(controller) {
        signal.addEventListener("abort", () => controller.error(new Error("private-image private-provider-response")), { once: true });
      } }));
    } });
    await assert.rejects(() => scan([image()]), (error) => error.code === `${provider.code}_TIMEOUT` && error.statusCode === 504 && !error.message.includes("private-image"));
    assert.equal(signal.aborted, true);
    assert.equal(calls, 1);
  });

  test(`${provider.name} OCR dùng một timeout cho toàn bộ loạt ảnh`, async () => {
    const signals = [];
    const scan = provider.create({ apiKey: "test", timeoutMs: 100, fetchImpl: async (_url, options) => {
      signals.push(options.signal);
      if (signals.length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return completion([score()]);
      }
      return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    } });
    await assert.rejects(() => scan([image("one"), image("two")]), (error) => error.code === `${provider.code}_TIMEOUT` && error.statusCode === 504);
    assert.equal(signals.length, 2);
    assert.equal(signals[0], signals[1]);
  });
}
