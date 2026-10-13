import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredScanProviders } from "../server/configuredScanProviders.js";
import { createTranscriptScanService } from "../server/services/transcriptScanService.js";

const IMAGE = { buffer: Buffer.from("image"), mimetype: "image/png", originalname: "hoc-ba.png" };
const SCORE = { subject: "Toán", grade: 10, semester1: 8, semester2: 8.5, year: 8.3, confidence: 0.95 };
const transcript = JSON.stringify({ student: { name: null }, scores: [SCORE] });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const geminiResponse = () => json({ candidates: [{ content: { role: "model", parts: [{ text: transcript }] }, finishReason: "STOP" }] });
const visionResponse = () => json({ choices: [{ message: { content: transcript } }] });

async function withMockFetch(fetchImpl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { await run(); } finally { globalThis.fetch = original; }
}

test("OCR cấu hình thực ưu tiên Groq và không gửi ảnh thêm khi Groq thành công", async () => {
  const hosts = [];
  await withMockFetch(async (url) => { hosts.push(new URL(url).hostname); return visionResponse(); }, async () => {
    const scan = createTranscriptScanService(createConfiguredScanProviders({ GROQ_API_KEY: "groq-key", GEMINI_API_KEY: "gemini-key", OCR_SPACE_API_KEY_1: "ocr-key" }));
    const result = await scan([IMAGE]);
    assert.equal(result.engine, "groq");
    assert.deepEqual(result.data.scores, [SCORE]);
    assert.deepEqual(hosts, ["api.groq.com"]);
  });
});

test("Groq hết quota vẫn đổi khóa rồi chuyển sang Gemini dự phòng", async () => {
  const hosts = [];
  await withMockFetch(async (url) => {
    const host = new URL(url).hostname;
    hosts.push(host);
    return host === "api.groq.com" ? json({ error: { code: "rate_limit" } }, 429) : geminiResponse();
  }, async () => {
    const scan = createTranscriptScanService(createConfiguredScanProviders({ GROQ_API_KEYS: "groq-a,groq-b", GEMINI_API_KEY: "gemini-key", OCR_SPACE_API_KEY_1: "ocr-key" }));
    const result = await scan([IMAGE]);
    assert.equal(result.engine, "gemini");
    assert.deepEqual(result.data.scores, [SCORE]);
    assert.deepEqual(hosts, ["api.groq.com", "api.groq.com", "generativelanguage.googleapis.com"]);
  });
});

test("Gemini timeout chuyển sang OCR.space sau một request, không chờ 5 khóa hết hạn", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const hosts = [];
  let ready, signal;
  const started = new Promise(resolve => { ready = resolve; });
  await withMockFetch(async (url, options) => {
    const host = new URL(url).hostname;
    hosts.push(host);
    if (host === "api.ocr.space") return json({ IsErroredOnProcessing: false, ParsedResults: [{ FileParseExitCode: 1, ParsedText: "Lớp 10\nHK1 HK2 Cả năm\nToán 8.0 8.5 8.3" }] });
    signal = options.signal;
    ready();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  }, async () => {
    const environment = { GEMINI_API_KEYS: "gemini-a,gemini-b,gemini-c,gemini-d,gemini-e", OCR_SPACE_API_KEY_1: "ocr-key" };
    const scan = createTranscriptScanService(createConfiguredScanProviders(environment));
    const response = scan([IMAGE]);
    await started;
    context.mock.timers.tick(45_000);
    const result = await response;
    assert.equal(signal.aborted, true);
    assert.equal(result.engine, "ocr-space");
    assert.equal(result.data.scores[0].semester1, 8);
    assert.deepEqual(hosts, ["generativelanguage.googleapis.com", "api.ocr.space"]);
  });
});

test("OCR.space timeout bỏ qua khóa còn lại và dùng provider tiếp theo", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const hosts = [];
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  await withMockFetch(async (url, options) => {
    const host = new URL(url).hostname;
    hosts.push(host);
    if (host !== "api.ocr.space") return visionResponse();
    ready();
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  }, async () => {
    const environment = { OCR_SPACE_API_KEYS: "ocr-a,ocr-b", OCR_SPACE_TIMEOUT_MS: "100", HUGGINGFACE_API_KEY: "hf-key", HUGGINGFACE_VISION_MODEL: "hf-vision-model" };
    const scan = createTranscriptScanService(createConfiguredScanProviders(environment));
    const response = scan([IMAGE]);
    await started;
    context.mock.timers.tick(100);
    assert.equal((await response).engine, "huggingface");
    assert.deepEqual(hosts, ["api.ocr.space", "router.huggingface.co"]);
  });
});
