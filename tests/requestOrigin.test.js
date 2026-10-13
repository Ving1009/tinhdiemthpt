import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import mainWorker from "../worker/index.js";
import { createApp } from "../server/server.js";
import { isAllowedApiOrigin } from "../lib/requestOrigin.js";

test("Origin phải đúng địa chỉ, loopback phát triển chỉ được gọi server loopback", () => {
  const target = "https://tinhdiemthpt.id.vn/api/assistant-chat";
  for (const origin of ["", "null", "https://tinhdiemthpt.id.vn.evil.invalid", "https://tinhdiemthpt.id.vn/", "https://tinhdiemthpt.id.vn@evil.invalid", "http://tinhdiemthpt.id.vn", "http://localhost:5500"]) {
    assert.equal(isAllowedApiOrigin(target, origin), false, origin);
  }
  assert.equal(isAllowedApiOrigin(target, null, "cross-site"), false);
  assert.equal(isAllowedApiOrigin("http://127.0.0.1:3000/api/test", "http://localhost:5500", "cross-site"), true);
  assert.equal(isAllowedApiOrigin("http://127.0.0.1:3000/api/test", "http://localhost.evil.invalid:5500"), false);
});

test("Worker từ chối POST liên trang trước limiter, tài khoản, Turnstile và dịch vụ trả phí", async () => {
  for (const path of ["/api/assistant-chat", "/api/auth/login", "/api/auth/logout", "/api/auth/register", "/api/auth/data", "/api/scan-transcript", "/api/data-reports"]) {
    for (const headers of [{ Origin: "https://attacker.invalid" }, { Origin: "null" }, { "Sec-Fetch-Site": "cross-site" }, { Origin: "http://127.0.0.1:5500" }]) {
      const blocked = () => assert.fail(`Không được chạm dịch vụ phía sau: ${path}`);
      const limiter = { limit: blocked };
      const response = await mainWorker.fetch(new Request(`https://tinhdiemthpt.id.vn${path}`, {
        method: "POST", headers: { ...headers, "Content-Type": "text/plain" }, body: '{"question":"Tìm trường BKA"}'
      }), { AUTH_RATE_LIMITER: limiter, OCR_RATE_LIMITER: limiter, REPORT_RATE_LIMITER: limiter, AI_RATE_LIMITER: limiter, AUTH_DB: { prepare: blocked }, OCR_SERVICE: { fetch: blocked } });
      assert.equal(response.status, 403, path);
      assert.equal((await response.json()).error.code, "INVALID_ORIGIN");
    }
  }
});

test("Worker vẫn xử lý yêu cầu cùng origin và công cụ không gửi Origin", async () => {
  for (const headers of [{}, { Origin: "https://tinhdiemthpt.id.vn" }, { Origin: "https://tinhdiemthpt.id.vn", "Sec-Fetch-Site": "same-origin" }]) {
    let calls = 0;
    const response = await mainWorker.fetch(new Request("https://tinhdiemthpt.id.vn/api/assistant-chat", { method: "POST", headers, body: "{" }), {
      AI_RATE_LIMITER: { async limit() { calls++; return { success: true }; } }
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_JSON");
    assert.equal(calls, 1);
  }
});

let server, baseUrl, providerCalls = 0;
before(async () => {
  const app = createApp({ environment: {}, reportStore: {}, scanTranscript: async () => assert.fail("Không được quét ảnh"), admissionsAssistant: async () => { providerCalls++; return { answer: "Dữ liệu thử", model: "mock" }; } });
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });

test("Express chặn origin lạ trước đọc JSON hoặc nhận ảnh, không gọi AI", async () => {
  const initialCalls = providerCalls;
  for (const path of ["/api/assistant-chat", "/api/scan-transcript", "/api/data-reports"]) {
    const response = await fetch(baseUrl + path, { method: "POST", headers: { Origin: "https://attacker.invalid", "Content-Type": "application/json" }, body: '{"question":"Tìm trường BKA"}' });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "INVALID_ORIGIN");
  }
  const malformed = await fetch(baseUrl + "/api/assistant-chat", { method: "POST", headers: { Origin: "null", "Content-Type": "application/json" }, body: "{" });
  assert.equal(malformed.status, 403);
  assert.equal(providerCalls, initialCalls);
});

test("Express cho phép website cùng origin và Live Server loopback", async () => {
  for (const origin of [baseUrl, "http://127.0.0.1:5500", "http://localhost:5500", "http://[::1]:5500"]) {
    const response = await fetch(baseUrl + "/api/assistant-chat", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: '{"question":"Tìm trường BKA"}' });
    assert.equal(response.status, 200, origin);
  }
});
