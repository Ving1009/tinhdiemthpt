import assert from "node:assert/strict";
import test from "node:test";
import { readJsonObject, readLimitedBody } from "../lib/requestBody.js";
import { handleAuthRequest } from "../worker/auth.js";
import { handleAssistantApi } from "../worker/assistantApi.js";
import { handleOcrRequest, MAX_MULTIPART_BYTES } from "../worker/ocrHandler.js";

function streamedRequest(path, totalBytes, chunkBytes, headers = {}) {
  let produced = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      if (produced >= totalBytes) return controller.close();
      const size = Math.min(chunkBytes, totalBytes - produced);
      produced += size;
      controller.enqueue(new Uint8Array(size).fill(32));
    },
    cancel() { cancelled = true; }
  }, { highWaterMark: 0 });
  return { request: new Request(`https://tinhdiemthpt.id.vn${path}`, { method: "POST", headers, body: stream, duplex: "half" }), produced: () => produced, cancelled: () => cancelled };
}

test("body streaming chặn ngay khi vượt giới hạn dù thiếu hoặc giả Content-Length", async () => {
  for (const headers of [{}, { "Content-Length": "1" }]) {
    const fixture = streamedRequest("/api/test", 64 * 1024, 1024, headers);
    await assert.rejects(() => readLimitedBody(fixture.request, 2048), { code: "REQUEST_TOO_LARGE", statusCode: 413 });
    assert.equal(fixture.produced(), 3072);
    assert.equal(fixture.cancelled(), true);
  }
});

test("body giới hạn theo byte UTF-8 và JSON phải là object", async () => {
  const makeRequest = (body) => new Request("https://example.com/api/test", { method: "POST", body });
  const value = '{"name":"Đại học"}';
  const bytes = new TextEncoder().encode(value).byteLength;
  assert.deepEqual(await readJsonObject(makeRequest(value), bytes), { name: "Đại học" });
  await assert.rejects(() => readJsonObject(makeRequest(value), bytes - 1), { code: "REQUEST_TOO_LARGE" });
  for (const body of ["null", "[]", "1", '"text"', "{", ""]) await assert.rejects(() => readJsonObject(makeRequest(body), 1024), { code: "INVALID_JSON" });
  assert.deepEqual(await readJsonObject(makeRequest(""), 1024, { allowEmpty: true }), {});
});

test("auth và trợ lý không đọc hết body quá lớn hoặc gọi dịch vụ phía sau", async () => {
  const auth = streamedRequest("/api/auth/register", 64 * 1024, 1024);
  await assert.rejects(() => handleAuthRequest(auth.request, { AUTH_DB: { prepare() { assert.fail("Không được ghi D1"); } } }), { code: "REQUEST_TOO_LARGE" });
  assert.equal(auth.produced(), 17 * 1024);
  assert.equal(auth.cancelled(), true);
  const assistant = streamedRequest("/api/assistant-chat", 64 * 1024, 1024);
  const response = await handleAssistantApi(assistant.request, {}, async () => assert.fail("Không được gọi AI"));
  assert.equal(response.status, 413);
  assert.equal(assistant.produced(), 33 * 1024);
  assert.equal(assistant.cancelled(), true);
});

test("OCR chặn multipart streaming quá lớn trước khi parse ảnh", async () => {
  const fixture = streamedRequest("/api/scan-transcript", 20 * 1024 * 1024, 512 * 1024, { "Content-Type": "multipart/form-data; boundary=test" });
  const response = await handleOcrRequest(fixture.request, async () => assert.fail("Không được gọi OCR"));
  assert.equal(response.status, 413);
  assert.equal(fixture.produced(), MAX_MULTIPART_BYTES + 512 * 1024);
  assert.equal(fixture.cancelled(), true);
});

test("OCR trả lỗi nhập liệu khi multipart hỏng hoặc chứa file ngoài danh sách ảnh", async () => {
  const malformed = new Request("https://example.com/api/scan-transcript", { method: "POST", body: "broken" });
  assert.equal((await handleOcrRequest(malformed, async () => assert.fail())).status, 400);
  const form = new FormData();
  form.append("images[]", new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], "a.jpg", { type: "image/jpeg" }));
  form.append("extra", new File(["not allowed"], "extra.txt"));
  const response = await handleOcrRequest(new Request("https://example.com/api/scan-transcript", { method: "POST", body: form }), async () => assert.fail());
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "LIMIT_UNEXPECTED_FILE");
});
