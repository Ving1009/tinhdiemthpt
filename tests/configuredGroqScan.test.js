import assert from "node:assert/strict";
import test from "node:test";
import { createApp, createConfiguredScanProviders } from "../server/server.js";
import { GROQ_CHAT_ENDPOINT } from "../server/services/groqAssistant.js";
import { DEFAULT_GROQ_VISION_MODEL } from "../server/services/groqVision.js";
import { createTranscriptScanService } from "../server/services/transcriptScanService.js";
import { handleOcrRequest } from "../worker/ocrHandler.js";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");
const ENVIRONMENT = {
  TURNSTILE_SITE_KEY: "test-site-key",
  TURNSTILE_SECRET_KEY: "test-turnstile-secret",
  GROQ_API_KEY: "test-groq-backend-key",
  GROQ_MODEL: "test-chat-model",
  GROQ_VISION_MODEL: "test-vision-model"
};
const SCORE = { subject: "Vật lí", grade: 10, semester1: 8, semester2: 8.5, year: 8.3, confidence: 0.95 };

function imageForm() {
  const form = new FormData();
  form.append("images[]", new Blob([PNG], { type: "image/png" }), "private-student-name.png");
  return form;
}

function groqResponse() {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    student: { name: "Private student name" }, scores: [{ ...SCORE, subject: "Vật lý" }]
  }) } }] }));
}

async function withConfiguredServer(environment, providerFetch, run) {
  const originalFetch = globalThis.fetch;
  const turnstileRequests = [];
  let server;
  globalThis.fetch = providerFetch;
  try {
    const app = createApp({
      environment,
      turnstileFetch: async (url, options) => {
        assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
        assert.equal(options.method, "POST");
        assert.equal(options.body.get("secret"), environment.TURNSTILE_SECRET_KEY);
        assert.equal(options.body.get("response"), "test-token");
        turnstileRequests.push(url);
        return new Response(JSON.stringify({ success: true, action: "scan_transcript", hostname: "127.0.0.1" }));
      }
    });
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    await run(`http://127.0.0.1:${server.address().port}`, originalFetch, turnstileRequests);
  } finally {
    globalThis.fetch = originalFetch;
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("endpoint OCR dùng key backend và model vision từ environment riêng của Groq", async () => {
  const providerRequests = [];
  await withConfiguredServer(ENVIRONMENT, async (url, options) => {
    assert.equal(url, GROQ_CHAT_ENDPOINT);
    providerRequests.push(options);
    return groqResponse();
  }, async (baseUrl, request, turnstileRequests) => {
    const response = await request(`${baseUrl}/api/scan-transcript`, {
      method: "POST", headers: { "X-Turnstile-Token": "test-token" }, body: imageForm()
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.engine, "groq");
    assert.deepEqual(body.data, { student: { name: null }, scores: [SCORE] });
    assert.equal(turnstileRequests.length, 1);
    assert.equal(providerRequests.length, 1);
    assert.equal(providerRequests[0].headers.Authorization, `Bearer ${ENVIRONMENT.GROQ_API_KEY}`);
    const sent = JSON.parse(providerRequests[0].body);
    assert.equal(sent.model, ENVIRONMENT.GROQ_VISION_MODEL);
    assert.notEqual(sent.model, ENVIRONMENT.GROQ_MODEL);
    assert.equal(sent.messages[0].content[1].image_url.url, `data:image/png;base64,${PNG.toString("base64")}`);
    assert.doesNotMatch(providerRequests[0].body, /private-student-name/);
    const publicConfig = await (await request(`${baseUrl}/api/security-config`)).text();
    for (const content of [JSON.stringify(body), publicConfig]) {
      assert.equal(content.includes(ENVIRONMENT.GROQ_API_KEY), false);
      assert.equal(content.includes(ENVIRONMENT.TURNSTILE_SECRET_KEY), false);
    }
  });
});

test("endpoint OCR thiếu token Turnstile không gửi ảnh tới Groq", async () => {
  let providerCalls = 0;
  await withConfiguredServer(ENVIRONMENT, async () => {
    providerCalls += 1;
    return groqResponse();
  }, async (baseUrl, request, turnstileRequests) => {
    const response = await request(`${baseUrl}/api/scan-transcript`, { method: "POST", body: imageForm() });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "TURNSTILE_REQUIRED");
    assert.equal(turnstileRequests.length, 0);
    assert.equal(providerCalls, 0);
  });
});

test("endpoint OCR hết quota mọi Groq key chuyển tiếp ảnh sang OCR.space", async () => {
  const environment = { ...ENVIRONMENT, GROQ_API_KEY_1: "test-groq-second-key", OCR_SPACE_API_KEY: "test-ocr-space-key" };
  const requests = [];
  await withConfiguredServer(environment, async (url, options) => {
    requests.push({ url, options });
    if (url === GROQ_CHAT_ENDPOINT) return new Response("quota", { status: 429 });
    assert.equal(url, "https://api.ocr.space/parse/image");
    assert.equal(options.headers.apikey, environment.OCR_SPACE_API_KEY);
    assert.equal(options.body.get("file").type, "image/png");
    return new Response(JSON.stringify({ IsErroredOnProcessing: false, ParsedResults: [
      { FileParseExitCode: 1, ParsedText: "Lớp 10\nHK1 HK2 Cả năm\nToán 8.0 8.5 8.3" }
    ] }));
  }, async (baseUrl, request) => {
    const response = await request(`${baseUrl}/api/scan-transcript`, {
      method: "POST", headers: { "X-Turnstile-Token": "test-token" }, body: imageForm()
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.engine, "ocr-space");
    assert.equal(body.data.scores[0].subject, "Toán");
    assert.equal(body.data.scores[0].year, 8.3);
    assert.match(body.warnings[0], /dự phòng/);
    assert.deepEqual(requests.map(({ url }) => url), [GROQ_CHAT_ENDPOINT, GROQ_CHAT_ENDPOINT, "https://api.ocr.space/parse/image"]);
    assert.deepEqual(requests.slice(0, 2).map(({ options }) => options.headers.Authorization), [
      `Bearer ${environment.GROQ_API_KEY}`, `Bearer ${environment.GROQ_API_KEY_1}`
    ]);
    assert.equal(JSON.stringify(body).includes(environment.GROQ_API_KEY), false);
    assert.equal(JSON.stringify(body).includes(environment.OCR_SPACE_API_KEY), false);
  });
});

test("Worker OCR dùng provider cấu hình chung và không dùng model chat làm vision", async () => {
  const originalFetch = globalThis.fetch;
  const environment = { GROQ_API_KEY: "test-worker-groq-key", GROQ_MODEL: "test-chat-model" };
  let sent;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, GROQ_CHAT_ENDPOINT);
    assert.equal(options.headers.Authorization, `Bearer ${environment.GROQ_API_KEY}`);
    sent = JSON.parse(options.body);
    return groqResponse();
  };
  try {
    const scan = createTranscriptScanService(createConfiguredScanProviders(environment));
    const response = await handleOcrRequest(new Request("https://example.com/api/scan-transcript", {
      method: "POST", body: imageForm()
    }), scan);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.engine, "groq");
    assert.deepEqual(body.data, { student: { name: null }, scores: [SCORE] });
    assert.equal(sent.model, DEFAULT_GROQ_VISION_MODEL);
    assert.notEqual(sent.model, environment.GROQ_MODEL);
    assert.equal(JSON.stringify(body).includes(environment.GROQ_API_KEY), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
