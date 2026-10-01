import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredAdmissionsAssistant } from "../server/configuredAssistant.js";
import { createCloudflareWorkersAssistantService } from "../server/services/cloudflareWorkersAssistant.js";
import { createOpenAiCompatibleAssistantService } from "../server/services/openAiCompatibleAssistant.js";
import { createGroqAssistantService } from "../server/services/groqAssistant.js";

const question = { question: "Tìm trường BKA", context: { localSummary: "Có dữ liệu trường BKA.", cards: [] } };

test("mọi provider AI giữ timeout trong khi đọc response body chậm", async () => {
  const fetchImpl = async (_url, options) => new Response(new ReadableStream({
    start(controller) { options.signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true }); }
  }));
  const assistants = [
    createGroqAssistantService({ apiKey: "test", timeoutMs: 3000, fetchImpl }),
    createCloudflareWorkersAssistantService({ apiToken: "test", accountId: "a".repeat(32), timeoutMs: 3000, fetchImpl }),
    createOpenAiCompatibleAssistantService({ apiKey: "test", endpoint: "https://test.example", model: "test", provider: "test", providerCode: "TEST", providerLabel: "Test", timeoutMs: 3000, fetchImpl })
  ];
  await Promise.all(assistants.map((assistant) => assert.rejects(() => assistant(question), (error) => error.statusCode === 504 && /TIMEOUT$/.test(error.code))));
});

test("Cloudflare Workers AI đọc response Chat Completions và không lộ token", async () => {
  let request;
  const assistant = createCloudflareWorkersAssistantService({
    apiToken: "cloudflare-secret",
    accountId: "a".repeat(32),
    model: "@cf/openai/gpt-oss-20b",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ success: true, result: { choices: [{ message: { content: "Đã tìm thấy BKA." } }] } }), { status: 200 });
    }
  });
  const result = await assistant(question);
  assert.match(request.url, /accounts\/a{32}\/ai\/run\/@cf\/openai\/gpt-oss-20b$/);
  assert.equal(request.options.headers.Authorization, "Bearer cloudflare-secret");
  assert.deepEqual(result, { answer: "Đã tìm thấy BKA.", model: "@cf/openai/gpt-oss-20b", provider: "cloudflare-workers-ai" });
  assert.doesNotMatch(JSON.stringify(result), /cloudflare-secret/);
});

test("dịch vụ OpenAI-compatible dùng đúng endpoint, model và header riêng", async () => {
  let request;
  const assistant = createOpenAiCompatibleAssistantService({
    apiKey: "provider-secret",
    endpoint: "https://provider.example/v1/chat/completions",
    model: "test-model",
    provider: "test-provider",
    providerCode: "TEST_PROVIDER",
    providerLabel: "Provider thử nghiệm",
    extraHeaders: { "X-Test": "enabled" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ choices: [{ message: { content: "Câu trả lời thử nghiệm." } }] }), { status: 200 });
    }
  });
  const result = await assistant(question);
  assert.equal(request.url, "https://provider.example/v1/chat/completions");
  assert.equal(request.options.headers["X-Test"], "enabled");
  assert.equal(JSON.parse(request.options.body).model, "test-model");
  assert.deepEqual(result, { answer: "Câu trả lời thử nghiệm.", model: "test-model", provider: "test-provider" });
});

test("bộ điều phối luân phiên Groq, Cloudflare, Mistral và OpenRouter", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("api.cloudflare.com")) {
      return new Response(JSON.stringify({ success: true, result: { choices: [{ message: { content: "Cloudflare" } }] } }), { status: 200 });
    }
    const answer = url.includes("groq.com") ? "Groq" : url.includes("mistral.ai") ? "Mistral" : "OpenRouter";
    return new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }), { status: 200 });
  };
  const assistant = createConfiguredAdmissionsAssistant({
    GROQ_API_KEY_1: "groq-key",
    CloudFlare_Workers_Ai_API_1: "cloudflare-key",
    CLOUDFLARE_ACCOUNT_ID: "b".repeat(32),
    Mistral_API_1: "mistral-key",
    OpenRouter_Free_API_1: "openrouter-key"
  }, { fetchImpl });
  const results = [];
  for (let index = 0; index < 4; index += 1) results.push(await assistant(question));
  assert.deepEqual(results.map((result) => result.provider), ["groq", "cloudflare-workers-ai", "mistral", "openrouter"]);
  assert.equal(calls.length, 4);
});

test("bộ điều phối chuyển nhà cung cấp khi Groq hết hạn mức", async () => {
  const calls = [];
  const assistant = createConfiguredAdmissionsAssistant({ GROQ_API_KEY_1: "groq-key", Mistral_API_1: "mistral-key" }, {
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("groq.com")) return new Response("{}", { status: 429 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "Mistral dự phòng thành công." } }] }), { status: 200 });
    }
  });
  const result = await assistant(question);
  assert.equal(result.provider, "mistral");
  assert.equal(calls.length, 2);
});
