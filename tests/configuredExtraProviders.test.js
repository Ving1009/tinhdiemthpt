import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../server/server.js";
import { createConfiguredAdmissionsAssistant } from "../server/configuredAssistant.js";
import { createConfiguredScanProviders } from "../server/configuredScanProviders.js";
import { GEMINI_CHAT_ENDPOINT, DEFAULT_GEMINI_CHAT_MODEL } from "../server/services/geminiAssistant.js";
import { HUGGINGFACE_CHAT_ENDPOINT, REQUESTY_CHAT_ENDPOINT } from "../server/services/extraAssistantProviders.js";
import { DEFAULT_HUGGINGFACE_VISION_MODEL, DEFAULT_REQUESTY_VISION_MODEL } from "../server/services/extraVisionProviders.js";
import { createTranscriptScanService } from "../server/services/transcriptScanService.js";
import { handleOcrRequest } from "../worker/ocrHandler.js";

const QUESTION = { question: "Tìm ngành Công nghệ thông tin", context: { localSummary: "Có dữ liệu BKA.", cards: [] } };
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");
const IMAGE = { buffer: PNG, mimetype: "image/png", originalname: "private-student-name.png" };
const SCORE = { subject: "Vật lí", grade: 10, semester1: 8, semester2: 8.5, year: 8.3, confidence: 0.95 };
const TRANSCRIPT = { student: { name: "Private student name" }, scores: [{ ...SCORE, subject: "Vật lý" }] };

function chatResponse(answer = "Đã tìm thấy dữ liệu website.") {
  return new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }));
}

function visionResponse() {
  return chatResponse(JSON.stringify(TRANSCRIPT));
}

function imageForm() {
  const form = new FormData();
  form.append("images[]", new Blob([PNG], { type: "image/png" }), IMAGE.originalname);
  return form;
}

async function withMockFetch(mock, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await run(originalFetch);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Each subtest finishes before the next temporary global fetch stub is installed.
test("cấu hình các provider Gemini, HF và Requesty", { concurrency: false }, async (suite) => {
  await suite.test("trợ lý luân phiên ba provider và dùng model chat riêng từ environment", async () => {
    const environment = {
      GEMINI_API_KEY: "test-gemini-key", GEMINI_CHAT_MODEL: "gemini-chat-selected", GEMINI_MODEL: "gemini-scan-selected",
      HUGGINGFACE_API_KEY: "test-hf-key", HUGGINGFACE_CHAT_MODEL: "hf-chat-selected", HUGGINGFACE_VISION_MODEL: "hf-scan-selected",
      REQUESTY_API_KEY: "test-requesty-key", REQUESTY_CHAT_MODEL: "requesty-chat-selected", REQUESTY_VISION_MODEL: "requesty-scan-selected"
    };
    const requests = [];
    await withMockFetch(async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return chatResponse();
    }, async () => {
      const assistant = createConfiguredAdmissionsAssistant(environment);
      const results = [];
      for (let index = 0; index < 3; index += 1) results.push(await assistant({ ...QUESTION, apiKey: "untrusted-client-key", model: "untrusted-client-model" }));
      assert.deepEqual(results.map((result) => result.provider), ["gemini", "huggingface", "requesty"]);
      assert.deepEqual(requests.map(({ url }) => url), [GEMINI_CHAT_ENDPOINT, HUGGINGFACE_CHAT_ENDPOINT, REQUESTY_CHAT_ENDPOINT]);
      assert.deepEqual(requests.map(({ body }) => body.model), ["gemini-chat-selected", "hf-chat-selected", "requesty-chat-selected"]);
      assert.deepEqual(requests.map(({ options }) => options.headers.Authorization), ["Bearer test-gemini-key", "Bearer test-hf-key", "Bearer test-requesty-key"]);
      for (const { body } of requests) {
        assert.match(body.messages[0].content, /DỮ LIỆU WEBSITE/);
        assert.doesNotMatch(JSON.stringify(body), /test-.*-key|untrusted-client/);
      }
      assert.equal(requests[2].body.reasoning_effort, "none");
      assert.doesNotMatch(JSON.stringify(results), /test-.*-key/);
    });
  });

  await suite.test("trợ lý bỏ qua Gemini và HF hết quota rồi dùng Requesty", async () => {
    const requests = [];
    await withMockFetch(async (url) => {
      requests.push(url);
      return url === REQUESTY_CHAT_ENDPOINT ? chatResponse() : new Response("private provider debug", { status: 429 });
    }, async () => {
      const assistant = createConfiguredAdmissionsAssistant({ GEMINI_API_KEY: "gemini-key", HF_TOKEN: "hf-key", REQUESTY_API_KEY: "requesty-key" });
      assert.equal((await assistant(QUESTION)).provider, "requesty");
      assert.equal((await assistant(QUESTION)).provider, "requesty");
      assert.deepEqual(requests, [GEMINI_CHAT_ENDPOINT, HUGGINGFACE_CHAT_ENDPOINT, REQUESTY_CHAT_ENDPOINT, REQUESTY_CHAT_ENDPOINT]);
    });
  });

  await suite.test("GEMINI_MODEL dành cho OCR và không thay thế model chat mặc định", async () => {
    const requests = [];
    await withMockFetch(async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      if (String(url) === GEMINI_CHAT_ENDPOINT) return chatResponse();
      return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify({ student: { name: null }, scores: [SCORE] }) }] }, finishReason: "STOP" }] }), { headers: { "Content-Type": "application/json" } });
    }, async () => {
      const environment = { GEMINI_API_KEY: "test-gemini-key", GEMINI_MODEL: "gemini-scan-selected" };
      const assistant = createConfiguredAdmissionsAssistant(environment);
      assert.equal((await assistant(QUESTION)).model, DEFAULT_GEMINI_CHAT_MODEL);
      const scan = createTranscriptScanService(createConfiguredScanProviders(environment));
      assert.equal((await scan([IMAGE])).engine, "gemini");
      assert.equal(requests[0].body.model, DEFAULT_GEMINI_CHAT_MODEL);
      assert.match(requests[1].url, /models\/gemini-scan-selected:generateContent$/);
      assert.ok(requests[1].body.contents.some((content) => content.parts.some((part) => part.inlineData?.data === PNG.toString("base64"))));
    });
  });

  await suite.test("HF_TOKEN và danh sách khóa HF được nhận, bỏ trùng và luân phiên", async () => {
    const environment = { HUGGINGFACE_API_KEY_1: "hf-first-key", HUGGINGFACE_API_KEYS: "hf-second-key,hf-first-key", HF_TOKEN: "hf-alias-key" };
    const chatKeys = [];
    await withMockFetch(async (url, options) => {
      assert.equal(url, HUGGINGFACE_CHAT_ENDPOINT);
      chatKeys.push(options.headers.Authorization);
      return chatResponse();
    }, async () => {
      const assistant = createConfiguredAdmissionsAssistant(environment);
      for (let index = 0; index < 4; index += 1) assert.equal((await assistant(QUESTION)).provider, "huggingface");
    });
    assert.deepEqual(chatKeys, ["Bearer hf-first-key", "Bearer hf-second-key", "Bearer hf-alias-key", "Bearer hf-first-key"]);
    const scanKeys = [];
    await withMockFetch(async (url, options) => {
      assert.equal(url, HUGGINGFACE_CHAT_ENDPOINT);
      scanKeys.push(options.headers.Authorization);
      assert.equal(JSON.parse(options.body).model, DEFAULT_HUGGINGFACE_VISION_MODEL);
      return options.headers.Authorization === "Bearer hf-alias-key" ? visionResponse() : new Response("quota", { status: 429 });
    }, async () => {
      const scan = createTranscriptScanService(createConfiguredScanProviders({ ...environment, HUGGINGFACE_VISION_MODEL: DEFAULT_HUGGINGFACE_VISION_MODEL }));
      assert.equal((await scan([IMAGE])).engine, "huggingface");
    });
    assert.deepEqual(scanKeys, ["Bearer hf-first-key", "Bearer hf-second-key", "Bearer hf-alias-key"]);
  });

  await suite.test("model không có khóa không đăng ký provider và không gọi mạng", async () => {
    await withMockFetch(async () => assert.fail("Không được gọi mạng"), async () => {
      const environment = { GEMINI_CHAT_MODEL: "chat", HUGGINGFACE_CHAT_MODEL: "chat", REQUESTY_CHAT_MODEL: "chat", REQUESTY_VISION_MODEL: "vision" };
      const assistant = createConfiguredAdmissionsAssistant(environment);
      await assert.rejects(() => assistant(QUESTION), (error) => error.code === "AI_ASSISTANT_UNAVAILABLE");
      const providers = createConfiguredScanProviders(environment);
      assert.deepEqual(providers.map((provider) => provider.name), ["gemini"]);
      await assert.rejects(() => createTranscriptScanService(providers)([IMAGE]), (error) => error.code === "MISSING_API_KEY");
    });
  });

  await suite.test("khóa HF bật chat nhưng chỉ bật OCR khi có HUGGINGFACE_VISION_MODEL rõ ràng", async () => {
    let requests = 0;
    await withMockFetch(async (url) => {
      requests += 1;
      assert.equal(url, HUGGINGFACE_CHAT_ENDPOINT);
      return chatResponse();
    }, async () => {
      for (const keys of [{ HF_TOKEN: "hf-alias-key" }, { HUGGINGFACE_API_KEY: "hf-key" }]) {
        for (const visionModel of [undefined, "", " "]) {
          const environment = { ...keys, HUGGINGFACE_CHAT_MODEL: "hf-chat-model", HUGGINGFACE_MODEL: "hf-other-model", HUGGINGFACE_VISION_MODEL: visionModel };
          assert.equal((await createConfiguredAdmissionsAssistant(environment)(QUESTION)).provider, "huggingface");
          const providers = createConfiguredScanProviders(environment);
          assert.deepEqual(providers.map((provider) => provider.name), ["gemini"]);
          await assert.rejects(() => createTranscriptScanService(providers)([IMAGE]), (error) => error.code === "MISSING_API_KEY");
        }
      }
    });
    assert.equal(requests, 6);
  });

  await suite.test("khóa Requesty chỉ bật OCR khi có REQUESTY_VISION_MODEL rõ ràng", async () => {
    await withMockFetch(async (url, options) => {
      assert.equal(url, REQUESTY_CHAT_ENDPOINT);
      assert.equal(options.headers.Authorization, "Bearer requesty-key");
      const body = JSON.parse(options.body);
      assert.equal(body.model, DEFAULT_REQUESTY_VISION_MODEL);
      assert.equal(body.reasoning_effort, "none");
      return visionResponse();
    }, async () => {
      const environment = { REQUESTY_API_KEY: "requesty-key", REQUESTY_CHAT_MODEL: "requesty-chat-model", REQUESTY_MODEL: "requesty-other-model" };
      for (const visionModel of [undefined, " "]) {
        const providers = createConfiguredScanProviders({ ...environment, REQUESTY_VISION_MODEL: visionModel });
        assert.deepEqual(providers.map((provider) => provider.name), ["gemini"]);
        await assert.rejects(() => createTranscriptScanService(providers)([IMAGE]), (error) => error.code === "MISSING_API_KEY");
      }
      const providers = createConfiguredScanProviders({ ...environment, REQUESTY_VISION_MODEL: DEFAULT_REQUESTY_VISION_MODEL });
      assert.deepEqual(providers.map((provider) => provider.name), ["requesty"]);
      assert.equal((await createTranscriptScanService(providers)([IMAGE])).engine, "requesty");
    });
  });

  await suite.test("OCR chuyển HF sang Requesty khi quota hoặc JSON sai", async () => {
    for (const failure of ["quota", "malformed"]) {
      const requests = [];
      const failures = [];
      await withMockFetch(async (url) => {
        requests.push(url);
        if (url === HUGGINGFACE_CHAT_ENDPOINT) return failure === "quota" ? new Response("quota", { status: 429 }) : new Response("malformed JSON");
        assert.equal(url, REQUESTY_CHAT_ENDPOINT);
        return visionResponse();
      }, async () => {
        const scan = createTranscriptScanService(createConfiguredScanProviders({ HF_TOKEN: "hf-key", HUGGINGFACE_VISION_MODEL: DEFAULT_HUGGINGFACE_VISION_MODEL, REQUESTY_API_KEY: "requesty-key", REQUESTY_VISION_MODEL: DEFAULT_REQUESTY_VISION_MODEL }), { onProviderError: (error) => failures.push(error) });
        const result = await scan([IMAGE]);
        assert.equal(result.engine, "requesty");
        assert.deepEqual(result.data, { student: { name: null }, scores: [SCORE] });
        assert.match(result.warnings[0], /dự phòng/);
        assert.equal(failures[0].code, failure === "quota" ? "HUGGINGFACE_VISION_QUOTA" : "HUGGINGFACE_VISION_INVALID_RESPONSE");
      });
      assert.deepEqual(requests, [HUGGINGFACE_CHAT_ENDPOINT, REQUESTY_CHAT_ENDPOINT]);
    }
  });

  await suite.test("quota của mọi provider OCR trở thành SCAN_QUOTA_EXHAUSTED", async () => {
    const requests = [];
    await withMockFetch(async (url) => {
      requests.push(url);
      return new Response("private provider debug hf-key requesty-key", { status: 429 });
    }, async () => {
      const scan = createTranscriptScanService(createConfiguredScanProviders({ HF_TOKEN: "hf-key", HUGGINGFACE_VISION_MODEL: DEFAULT_HUGGINGFACE_VISION_MODEL, REQUESTY_API_KEY: "requesty-key", REQUESTY_VISION_MODEL: DEFAULT_REQUESTY_VISION_MODEL }));
      await assert.rejects(() => scan([IMAGE]), (error) => {
        assert.equal(error.code, "SCAN_QUOTA_EXHAUSTED");
        assert.equal(error.statusCode, 503);
        assert.match(error.message, /Tesseract/);
        assert.doesNotMatch(error.message, /private provider debug|hf-key|requesty-key/);
        return true;
      });
    });
    assert.deepEqual(requests, [HUGGINGFACE_CHAT_ENDPOINT, REQUESTY_CHAT_ENDPOINT]);
  });

  await suite.test("Express OCR dùng HF_TOKEN từ environment và không lộ tên hay khóa", async () => {
    const environment = { HF_TOKEN: "test-express-hf-key", HUGGINGFACE_CHAT_MODEL: "hf-chat-model", HUGGINGFACE_VISION_MODEL: DEFAULT_HUGGINGFACE_VISION_MODEL, TURNSTILE_SITE_KEY: "test-site-key", TURNSTILE_SECRET_KEY: "test-secret-key" };
    const requests = [];
    await withMockFetch(async (url, options) => {
      if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        assert.equal(options.body.get("secret"), environment.TURNSTILE_SECRET_KEY);
        assert.equal(options.body.get("response"), "test-token");
        return new Response(JSON.stringify({ success: true, action: "scan_transcript", hostname: "127.0.0.1" }));
      }
      assert.equal(url, HUGGINGFACE_CHAT_ENDPOINT);
      requests.push(options);
      return visionResponse();
    }, async (request) => {
      const app = createApp({ environment });
      const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
      try {
        const baseUrl = `http://127.0.0.1:${server.address().port}`;
        const response = await request(`${baseUrl}/api/scan-transcript`, { method: "POST", headers: { "X-Turnstile-Token": "test-token" }, body: imageForm() });
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.engine, "huggingface");
        assert.deepEqual(body.data, { student: { name: null }, scores: [SCORE] });
        assert.equal(requests.length, 1);
        assert.equal(requests[0].headers.Authorization, `Bearer ${environment.HF_TOKEN}`);
        const sent = JSON.parse(requests[0].body);
        assert.equal(sent.model, DEFAULT_HUGGINGFACE_VISION_MODEL);
        assert.notEqual(sent.model, environment.HUGGINGFACE_CHAT_MODEL);
        assert.equal(sent.messages[0].content[1].image_url.url, `data:image/png;base64,${PNG.toString("base64")}`);
        assert.doesNotMatch(requests[0].body, /private-student-name|Private student name/);
        const publicConfig = await (await request(`${baseUrl}/api/security-config`)).text();
        for (const content of [JSON.stringify(body), publicConfig]) assert.doesNotMatch(content, /test-express-hf-key|test-secret-key|private-student-name|Private student name/);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    });
  });

  await suite.test("Worker OCR bật Requesty bằng environment riêng và không lộ tên hay khóa", async () => {
    const environment = { REQUESTY_API_KEY: "test-worker-requesty-key", REQUESTY_CHAT_MODEL: "requesty-chat-selected", REQUESTY_VISION_MODEL: DEFAULT_REQUESTY_VISION_MODEL };
    let sent;
    await withMockFetch(async (url, options) => {
      assert.equal(url, REQUESTY_CHAT_ENDPOINT);
      assert.equal(options.headers.Authorization, `Bearer ${environment.REQUESTY_API_KEY}`);
      sent = JSON.parse(options.body);
      assert.doesNotMatch(options.body, /private-student-name|Private student name/);
      return visionResponse();
    }, async () => {
      const scan = createTranscriptScanService(createConfiguredScanProviders(environment));
      const response = await handleOcrRequest(new Request("https://example.com/api/scan-transcript", { method: "POST", body: imageForm() }), scan);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.engine, "requesty");
      assert.deepEqual(body.data, { student: { name: null }, scores: [SCORE] });
      assert.equal(sent.model, DEFAULT_REQUESTY_VISION_MODEL);
      assert.notEqual(sent.model, environment.REQUESTY_CHAT_MODEL);
      assert.equal(sent.reasoning_effort, "none");
      assert.doesNotMatch(JSON.stringify(body), /test-worker-requesty-key|private-student-name|Private student name/);
    });
  });
});
