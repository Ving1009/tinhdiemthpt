import assert from "node:assert/strict";
import test from "node:test";
import { createGroqVisionService, DEFAULT_GROQ_VISION_MODEL } from "../server/services/groqVision.js";
import { GROQ_CHAT_ENDPOINT } from "../server/services/groqAssistant.js";

function image(text = "image", mimetype = "image/png") {
  return { buffer: Buffer.from(text), mimetype, originalname: "private-student-name.png" };
}

function score(overrides = {}) {
  return { subject: "Toán", grade: 10, semester1: 8, semester2: 8.5, year: 8.3, confidence: 0.95, ...overrides };
}

function completion(scores, studentName = "Private student name") {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ student: { name: studentName }, scores }) } }] }), { status: 200 });
}

test("Groq OCR gửi một ảnh với model vision, prompt chung và JSON mode có cấu trúc rõ ràng", async () => {
  let request;
  const scan = createGroqVisionService({ apiKey: " groq-test-secret ", fetchImpl: async (url, options) => {
    request = { url, options };
    return completion([score({ subject: "Vật lý" })]);
  } });
  const result = await scan([image()]);
  assert.equal(request.url, GROQ_CHAT_ENDPOINT);
  assert.equal(request.options.headers.Authorization, "Bearer groq-test-secret");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, DEFAULT_GROQ_VISION_MODEL);
  assert.equal(body.reasoning_effort, "none");
  assert.equal(body.stream, false);
  assert.equal(body.max_completion_tokens, 2048);
  assert.equal(body.messages.length, 1);
  assert.match(body.messages[0].content[0].text, /Không suy đoán/);
  assert.match(body.messages[0].content[0].text, /Không trích xuất tên học sinh/);
  assert.equal(body.messages[0].content[1].image_url.url, `data:image/png;base64,${Buffer.from("image").toString("base64")}`);
  assert.deepEqual(body.response_format, { type: "json_object" });
  const prompt = body.messages[0].content[0].text;
  assert.match(prompt, /"student":\{"name":null\},"scores":\[/);
  assert.match(prompt, /"subject":"<tên môn chuẩn>","grade":10,"semester1":null,"semester2":null,"year":null,"confidence":0/);
  assert.match(prompt, /grade là số nguyên 10, 11 hoặc 12/);
  assert.match(prompt, /"scores":\[\]/);
  assert.deepEqual(result.data.student, { name: null });
  assert.equal(result.data.scores[0].subject, "Vật lí");
  assert.doesNotMatch(JSON.stringify(result), /groq-test-secret|Private student name|private-student-name/);
  assert.doesNotMatch(request.options.body, /private-student-name/);
});

test("Groq OCR xử lý tuần tự 6 ảnh và ghép điểm theo môn cùng lớp", async () => {
  const requests = [];
  let active = 0;
  const pages = [
    [score({ semester2: null, year: null, confidence: 0.8 })],
    [score({ semester1: null, semester2: 9, year: null })],
    [score({ grade: 11, semester1: 7, semester2: null, year: null })],
    [score({ grade: 12, semester1: 6, semester2: null, year: null })],
    [],
    [score({ semester1: 8.25, semester2: null, year: 8.4, confidence: 0.99 })]
  ];
  const scan = createGroqVisionService({ apiKey: "test", model: "test-vision-model", fetchImpl: async (_url, options) => {
    assert.equal(active++, 0);
    const body = JSON.parse(options.body);
    requests.push(body);
    const result = completion(pages[requests.length - 1]);
    await Promise.resolve();
    active -= 1;
    return result;
  } });
  const result = await scan(Array.from({ length: 6 }, (_, index) => image(`page-${index}`, index % 2 ? "image/jpeg" : "image/webp")));
  assert.equal(requests.length, 6);
  for (const [index, body] of requests.entries()) {
    assert.equal(body.model, "test-vision-model");
    assert.equal(body.messages[0].content.length, 2);
    assert.ok(body.messages[0].content[1].image_url.url.endsWith(Buffer.from(`page-${index}`).toString("base64")));
  }
  assert.deepEqual(result.data.scores.map(({ grade, semester1 }) => [grade, semester1]), [[10, 8.25], [11, 7], [12, 6]]);
  assert.equal(result.data.scores[0].semester2, 9);
  assert.equal(result.data.scores[0].year, 8.4);
  assert.match(result.warnings.join(" "), /dữ liệu trùng/);
});

test("Groq OCR chỉ gửi lại ảnh lỗi quota hoặc auth, không đọc lại ảnh thành công", async () => {
  for (const status of [429, 401, 403]) {
    const requests = [];
    const signals = [];
    const scan = createGroqVisionService({ apiKeys: ["key-a", "key-b"], fetchImpl: async (_url, options) => {
      const content = JSON.parse(options.body).messages[0].content;
      const page = Buffer.from(content[1].image_url.url.split(",")[1], "base64").toString();
      const key = options.headers.Authorization;
      requests.push([page, key]);
      signals.push(options.signal);
      if (page === "page-2" && key === "Bearer key-b") return new Response("private-error-response", { status });
      return completion([score({ grade: Number(page.at(-1)) + 9 })]);
    } });
    const result = await scan([image("page-1"), image("page-2"), image("page-3")]);
    assert.deepEqual(requests, [
      ["page-1", "Bearer key-a"],
      ["page-2", "Bearer key-b"],
      ["page-2", "Bearer key-a"],
      ["page-3", "Bearer key-a"]
    ]);
    assert.ok(signals.every((signal) => signal === signals[0]));
    assert.deepEqual(result.data.scores.map(({ grade }) => grade), [10, 11, 12]);
    assert.doesNotMatch(JSON.stringify(result), /key-a|key-b|private-error-response/);
  }
});

test("Groq OCR giữ ô null và dùng lỗi NO_TRANSCRIPT_DATA chung khi không có dòng điểm", async () => {
  const scanNull = createGroqVisionService({ apiKey: "test", fetchImpl: async () => completion([score({ semester1: null, semester2: null, year: null, confidence: 0 })]) });
  const result = await scanNull([image()]);
  assert.deepEqual(result.data.scores[0], score({ semester1: null, semester2: null, year: null, confidence: 0 }));
  const scanEmpty = createGroqVisionService({ apiKey: "test", fetchImpl: async () => completion([]) });
  await assert.rejects(() => scanEmpty([image()]), (error) => error.code === "NO_TRANSCRIPT_DATA" && error.statusCode === 422);
});

test("Groq OCR không gọi mạng khi thiếu cấu hình hoặc ảnh không an toàn", async () => {
  const neverFetch = async () => assert.fail("Không được gọi mạng");
  for (const options of [{ apiKey: "", fetchImpl: neverFetch }, { apiKey: "test", fetchImpl: null }]) {
    await assert.rejects(() => createGroqVisionService(options)([image()]), (error) => error.code === "GROQ_VISION_UNAVAILABLE");
  }
  const scan = createGroqVisionService({ apiKey: "test", fetchImpl: neverFetch });
  for (const images of [[], Array(7).fill(image()), [image("", "image/png")], [image("html", "text/html")], [{ buffer: Buffer.alloc(7 * 1024 * 1024 + 1), mimetype: "image/png" }]]) {
    await assert.rejects(() => scan(images), (error) => error.code === "GROQ_VISION_REQUEST_FAILED" && error.statusCode === 400);
  }
});

test("Groq OCR phân loại quota, auth và lỗi HTTP dù response body không phải JSON", async () => {
  for (const [status, code, statusCode] of [[429, "QUOTA", 503], [401, "AUTH", 503], [403, "AUTH", 503], [500, "REQUEST_FAILED", 502]]) {
    const scan = createGroqVisionService({ apiKey: "groq-sensitive-key", fetchImpl: async () => new Response("secret-image student-private raw-response", { status }) });
    await assert.rejects(() => scan([image("secret-image")]), (error) => {
      assert.equal(error.code, `GROQ_VISION_${code}`);
      assert.equal(error.statusCode, statusCode);
      assert.doesNotMatch(error.message + error.stack, /groq-sensitive-key|secret-image|student-private|raw-response/);
      return true;
    });
  }
});

test("Groq OCR từ chối JSON response hỏng, thiếu content hoặc thiếu scores", async () => {
  for (const body of ["not-json secret-response", "{}", JSON.stringify({ choices: [{ message: { content: "{invalid private-name" } }] }), JSON.stringify({ choices: [{ message: { content: "{}" } }] })]) {
    const scan = createGroqVisionService({ apiKey: "test", fetchImpl: async () => new Response(body) });
    await assert.rejects(() => scan([image()]), (error) => {
      assert.equal(error.code, "GROQ_VISION_INVALID_RESPONSE");
      assert.doesNotMatch(error.message + error.stack, /secret-response|private-name/);
      return true;
    });
  }
});

test("Groq OCR giữ timeout trong khi đọc response body", async () => {
  let signal;
  let calls = 0;
  const scan = createGroqVisionService({ apiKeys: ["key-a", "key-b"], timeoutMs: 15, fetchImpl: async (_url, options) => {
    calls += 1;
    signal = options.signal;
    return new Response(new ReadableStream({ start(controller) {
      signal.addEventListener("abort", () => controller.error(new Error("private-image raw-response")), { once: true });
    } }));
  } });
  await assert.rejects(() => scan([image()]), (error) => error.code === "GROQ_VISION_TIMEOUT" && error.statusCode === 504 && !error.message.includes("private-image"));
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
});

test("Groq OCR dùng một timeout cho toàn bộ loạt ảnh", async () => {
  const signals = [];
  const scan = createGroqVisionService({ apiKey: "test", timeoutMs: 100, fetchImpl: async (_url, options) => {
    signals.push(options.signal);
    if (signals.length === 1) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return completion([score()]);
    }
    return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  } });
  const started = Date.now();
  await assert.rejects(() => scan([image("one"), image("two")]), (error) => error.code === "GROQ_VISION_TIMEOUT");
  assert.equal(signals.length, 2);
  assert.equal(signals[0], signals[1]);
  assert.ok(Date.now() - started < 300);
});

test("Groq OCR không đưa nội dung lỗi mạng nhạy cảm ra ngoài", async () => {
  const scan = createGroqVisionService({ apiKey: "groq-sensitive-key", fetchImpl: async () => { throw new Error("groq-sensitive-key secret-image student-private"); } });
  await assert.rejects(() => scan([image("secret-image")]), (error) => {
    assert.equal(error.code, "GROQ_VISION_REQUEST_FAILED");
    assert.doesNotMatch(error.message + error.stack, /groq-sensitive-key|secret-image|student-private/);
    return true;
  });
});
