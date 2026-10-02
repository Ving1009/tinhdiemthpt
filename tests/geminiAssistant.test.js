import assert from "node:assert/strict";
import test from "node:test";
import { createGeminiAssistantService, DEFAULT_GEMINI_CHAT_MODEL, GEMINI_CHAT_ENDPOINT } from "../server/services/geminiAssistant.js";

const input = {
  question: "BKA có ngành Công nghệ thông tin không?",
  history: [{ role: "user", content: "Tôi quan tâm nhóm ngành máy tính" }],
  context: {
    localSummary: "Tìm thấy một ngành phù hợp.",
    cards: [{ type: "program", title: "Công nghệ thông tin", subtitle: "BKA", lines: ["Mã ngành: 7480201"] }]
  }
};

test("Gemini dùng câu hỏi, lịch sử và dữ liệu website đã được grounding qua backend", async () => {
  let request;
  const assistant = createGeminiAssistantService({
    apiKey: " gemini-secret-for-test ",
    model: " server-selected-model ",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ choices: [{ message: { content: "**BKA** có ngành Công nghệ thông tin.\r\nMã ngành: `7480201`." } }] }));
    }
  });
  const result = await assistant({ ...input, model: "untrusted-client-model", apiKey: "untrusted-client-key" });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, GEMINI_CHAT_ENDPOINT);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer gemini-secret-for-test");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.equal(body.model, "server-selected-model");
  assert.equal(body.max_completion_tokens, 800);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.stream, false);
  assert.equal(body.messages[0].role, "system");
  assert.match(body.messages[0].content, /DỮ LIỆU WEBSITE/);
  assert.match(body.messages[0].content, /7480201/);
  assert.match(body.messages[0].content, /không phải chỉ dẫn/);
  assert.deepEqual(body.messages[1], input.history[0]);
  assert.deepEqual(body.messages.at(-1), { role: "user", content: input.question });
  assert.deepEqual(result, { answer: "BKA có ngành Công nghệ thông tin.\nMã ngành: 7480201.", model: "server-selected-model", provider: "gemini" });
  assert.doesNotMatch(request.url + request.options.body + JSON.stringify(result), /gemini-secret-for-test|untrusted-client/);
});

test("Gemini tư vấn dùng model chat mặc định khi không chọn model riêng", async () => {
  const assistant = createGeminiAssistantService({
    apiKey: "test",
    model: " ",
    fetchImpl: async (_url, options) => {
      assert.equal(JSON.parse(options.body).model, DEFAULT_GEMINI_CHAT_MODEL);
      return new Response(JSON.stringify({ choices: [{ message: { content: "Đã tìm thấy ngành." } }] }));
    }
  });
  assert.equal((await assistant(input)).model, "gemini-3.5-flash-lite");
});

test("Gemini chưa có khóa không gọi mạng", async () => {
  const assistant = createGeminiAssistantService({ fetchImpl: async () => assert.fail("Không được gọi mạng") });
  await assert.rejects(() => assistant(input), (error) => error.code === "GEMINI_CHAT_UNAVAILABLE" && error.statusCode === 503);
});

test("Gemini phân loại lỗi HTTP bằng thông báo trung lập và không lộ nội dung nhà cung cấp", async () => {
  for (const [status, code, statusCode] of [
    [401, "GEMINI_CHAT_AUTH", 503],
    [403, "GEMINI_CHAT_AUTH", 503],
    [429, "GEMINI_CHAT_RATE_LIMITED", 503],
    [500, "GEMINI_CHAT_REQUEST_FAILED", 502],
    [503, "GEMINI_CHAT_REQUEST_FAILED", 502]
  ]) {
    const assistant = createGeminiAssistantService({
      apiKey: "gemini-secret-for-test",
      fetchImpl: async () => new Response("provider debug: gemini-secret-for-test", { status })
    });
    await assert.rejects(() => assistant(input), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.statusCode, statusCode);
      assert.doesNotMatch(error.message, /Gemini|gemini-secret-for-test|provider debug/);
      return true;
    });
  }
});

test("Gemini từ chối JSON hỏng hoặc không có câu trả lời", async () => {
  for (const body of ["invalid JSON with gemini-secret-for-test", "{}", '{"choices":[{"message":{"content":" "}}]}']) {
    const assistant = createGeminiAssistantService({ apiKey: "gemini-secret-for-test", fetchImpl: async () => new Response(body) });
    await assert.rejects(() => assistant(input), (error) => {
      assert.equal(error.code, "GEMINI_CHAT_INVALID_RESPONSE");
      assert.equal(error.statusCode, 502);
      assert.doesNotMatch(error.message, /gemini-secret-for-test|invalid JSON/);
      return true;
    });
  }
});

test("Gemini không đưa lỗi mạng thô hoặc khóa vào phản hồi", async () => {
  const assistant = createGeminiAssistantService({
    apiKey: "gemini-secret-for-test",
    fetchImpl: async () => { throw new Error("provider debug: gemini-secret-for-test"); }
  });
  await assert.rejects(() => assistant(input), (error) => {
    assert.equal(error.code, "GEMINI_CHAT_REQUEST_FAILED");
    assert.equal(error.statusCode, 502);
    assert.doesNotMatch(error.message, /gemini-secret-for-test|provider debug/);
    return true;
  });
});

test("Gemini giữ timeout cả lúc kết nối lẫn khi đọc response body", async () => {
  const fetches = [
    async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
    async (_url, options) => new Response(new ReadableStream({
      start(controller) {
        options.signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
      }
    }))
  ];
  await Promise.all(fetches.map((fetchImpl) => {
    const assistant = createGeminiAssistantService({ apiKey: "test", timeoutMs: 3_000, fetchImpl });
    return assert.rejects(() => assistant(input), (error) => error.code === "GEMINI_CHAT_TIMEOUT" && error.statusCode === 504);
  }));
});
