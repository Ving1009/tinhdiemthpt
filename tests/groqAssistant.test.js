import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredAdmissionsAssistant } from "../server/configuredAssistant.js";
import { createGroqAssistantService, GROQ_CHAT_ENDPOINT, normalizeAssistantInput } from "../server/services/groqAssistant.js";

test("Groq nhận câu hỏi cùng dữ liệu website qua backend", async () => {
  let request;
  const assistant = createGroqAssistantService({
    apiKey: "groq-secret-for-test",
    model: "test-model",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ choices: [{ message: { content: "BKA có ngành Công nghệ thông tin trong dữ liệu website." } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  const result = await assistant({
    question: "BKA có ngành CNTT không?",
    history: [{ role: "user", content: "Tôi quan tâm nhóm ngành máy tính" }],
    context: {
      localSummary: "Tìm thấy kết quả phù hợp.",
      cards: [{ type: "program", universityId: "bka", majorId: "7480201", title: "Công nghệ thông tin", subtitle: "BKA · Đại học Bách khoa Hà Nội", lines: ["Mã ngành: 7480201"] }]
    }
  });
  assert.equal(request.url, GROQ_CHAT_ENDPOINT);
  assert.equal(request.options.headers.Authorization, "Bearer groq-secret-for-test");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "test-model");
  assert.match(body.messages[0].content, /DỮ LIỆU WEBSITE/);
  assert.match(body.messages[0].content, /7480201/);
  assert.equal(body.messages.at(-1).content, "BKA có ngành CNTT không?");
  assert.equal(result.answer, "BKA có ngành Công nghệ thông tin trong dữ liệu website.");
  assert.doesNotMatch(JSON.stringify(result), /groq-secret-for-test/);
});

test("Groq phân loại lỗi giới hạn để frontend chuyển sang tra cứu nội bộ", async () => {
  const assistant = createGroqAssistantService({ apiKey: "test", fetchImpl: async () => new Response("{}", { status: 429 }) });
  await assert.rejects(() => assistant({ question: "Tìm trường BKA" }), (error) => error.code === "GROQ_RATE_LIMITED" && error.statusCode === 503);
});

test("Cấu hình Groq đọc GROQ_API_KEY_1 và không gọi mạng khi thiếu khóa", async () => {
  const configured = createConfiguredAdmissionsAssistant({}, { fetchImpl: async () => assert.fail("Không được gọi mạng") });
  await assert.rejects(() => configured({ question: "Tìm trường BKA" }), (error) => error.code === "GROQ_UNAVAILABLE");
});

test("Đầu vào trợ lý được giới hạn trước khi gửi tới Groq", () => {
  const input = normalizeAssistantInput({
    question: `  ${"a".repeat(700)}  `,
    history: Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: "b".repeat(1_000) })),
    context: { cards: Array.from({ length: 10 }, (_, index) => ({ title: `Ngành ${index}`, lines: Array(10).fill("dữ liệu") })) }
  });
  assert.equal(input.question.length, 500);
  assert.equal(input.history.length, 6);
  assert.ok(input.history.every((item) => item.content.length <= 800));
  assert.equal(input.context.cards.length, 6);
  assert.ok(input.context.cards.every((card) => card.lines.length <= 5));
});
