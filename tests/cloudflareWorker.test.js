import assert from "node:assert/strict";
import test from "node:test";
import { createCloudflareReportStore } from "../server/cloudflareReportStore.js";
import { handleOcrRequest, MAX_IMAGES, MAX_MULTIPART_BYTES, MAX_TOTAL_BYTES } from "../worker/ocrHandler.js";
import mainWorker from "../worker/index.js";
import { handleAssistantApi } from "../worker/assistantApi.js";

test("Cloudflare OCR nhận multipart hợp lệ và giữ schema response của frontend", async () => {
  const form = new FormData();
  form.append("images[]", new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], "hoc-ba.jpg", { type: "image/jpeg" }));
  let received;
  const response = await handleOcrRequest(new Request("https://example.com/api/scan-transcript", {
    method: "POST",
    body: form
  }), async (images) => {
    received = images;
    return { data: { student: { name: "An" }, scores: [] }, warnings: ["Kiểm tra lại"], engine: "mock" };
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(received.length, 1);
  assert.equal(received[0].mimetype, "image/jpeg");
  assert.deepEqual(payload, {
    success: true,
    data: { student: { name: "An" }, scores: [] },
    warnings: ["Kiểm tra lại"],
    engine: "mock"
  });
});

test("Cloudflare OCR từ chối nội dung giả mạo kiểu ảnh", async () => {
  const form = new FormData();
  form.append("images[]", new File(["khong-phai-anh"], "hoc-ba.jpg", { type: "image/jpeg" }));
  const response = await handleOcrRequest(new Request("https://example.com/api/scan-transcript", {
    method: "POST",
    body: form
  }), async () => assert.fail("Không được gọi scanner"));
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "INVALID_IMAGE");
});

test("Cloudflare OCR chặn request khai báo vượt giới hạn trước khi đọc multipart", async () => {
  const response = await handleOcrRequest(new Request("https://example.com/api/scan-transcript", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=test", "Content-Length": String(MAX_MULTIPART_BYTES + 1) },
    body: "--test--",
    duplex: "half"
  }), async () => assert.fail("Không được gọi scanner"));
  const payload = await response.json();
  assert.equal(response.status, 413);
  assert.equal(payload.error.code, "REQUEST_TOO_LARGE");
});

test("Cloudflare OCR giữ trần an toàn cho bộ nhớ Worker", () => {
  assert.equal(MAX_IMAGES, 6);
  assert.equal(MAX_TOTAL_BYTES, 10 * 1024 * 1024);
  assert.equal(MAX_MULTIPART_BYTES, 11 * 1024 * 1024);
});

test("Cloudflare report store chỉ xác nhận sau khi Supabase nhận báo cáo", async () => {
  let request;
  const store = createCloudflareReportStore({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: "secret-for-test",
    SUPABASE_REPORTS_TABLE: "data_reports"
  }, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 201 };
    }
  });
  const result = await store.submit({
    kind: "tinh-diem-thpt-data-report",
    version: 1,
    createdAt: "2026-09-21T00:00:00.000Z",
    context: { universityId: "u1", university: "Trường A", majorId: "m1", major: "Ngành A", year: 2026 },
    report: { field: "Điểm chuẩn", description: "Mốc điểm này cần kiểm tra lại.", evidenceUrl: "https://example.edu.vn" }
  });
  assert.equal(result.status, "pending_review");
  assert.equal(result.delivery, "supabase");
  assert.match(result.id, /^[0-9a-f-]{36}$/i);
  assert.equal(request.url, "https://project.supabase.co/rest/v1/data_reports?on_conflict=id");
  assert.equal(JSON.parse(request.options.body)[0].status, "pending_review");
});

test("Cloudflare report store chặn nội dung rác trước Supabase", async () => {
  let remoteCalls = 0;
  const store = createCloudflareReportStore({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: "secret-for-test",
    SUPABASE_REPORTS_TABLE: "data_reports"
  }, {
    fetchImpl: async () => { remoteCalls += 1; return { ok: true, status: 201 }; }
  });
  await assert.rejects(() => store.submit({
    kind: "tinh-diem-thpt-data-report",
    version: 1,
    context: { universityId: "u1" },
    report: { field: "Khác", description: "aaaaaaaaaaaaaaaaaaaa" }
  }), /lặp|vô nghĩa/i);
  assert.equal(remoteCalls, 0);
});

test("Worker chỉ công khai site key và trạng thái Turnstile", async () => {
  const response = await mainWorker.fetch(new Request("https://tinhdiemthpt.id.vn/api/security-config"), {
    TURNSTILE_SITE_KEY: "public-site-key",
    TURNSTILE_SECRET_KEY: "private-secret"
  });
  const payload = await response.json();
  assert.deepEqual(payload.data, { turnstile: { enabled: true, siteKey: "public-site-key" } });
  assert.doesNotMatch(JSON.stringify(payload), /private-secret/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(response.headers.get("strict-transport-security"), /max-age=31536000/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("Worker gắn security headers cho static asset và CSP không dùng wildcard nguy hiểm", async () => {
  const response = await mainWorker.fetch(new Request("https://tinhdiemthpt.id.vn/"), {
    ASSETS: { async fetch() { return new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }); } }
  });
  const csp = response.headers.get("content-security-policy") || "";
  assert.equal(response.status, 200);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /https:\/\/fonts\.googleapis\.com/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\s\*\s/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("Worker chuyển HTTP sang HTTPS trước khi đọc static asset", async () => {
  let assetFetched = false;
  const response = await mainWorker.fetch(new Request("http://tinhdiemthpt.id.vn/?from=test"), {
    ASSETS: { async fetch() { assetFetched = true; return new Response("unexpected"); } }
  });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://tinhdiemthpt.id.vn/?from=test");
  assert.equal(response.headers.get("strict-transport-security"), null);
  assert.equal(assetFetched, false);
});

test("Worker chuyển tên miền workers.dev cũ sang tên miền chính", async () => {
  let assetFetched = false;
  const response = await mainWorker.fetch(new Request("https://tinhdiemthpt.tinh-diem-thpt.workers.dev/api/security-config?from=legacy"), {
    ASSETS: { async fetch() { assetFetched = true; return new Response("unexpected"); } }
  });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://tinhdiemthpt.id.vn/api/security-config?from=legacy");
  assert.equal(assetFetched, false);
});

test("Worker chặn request OCR trước service khi thiếu token Turnstile", async () => {
  let forwarded = false;
  let rateLimitChecked = false;
  const response = await mainWorker.fetch(new Request("https://tinhdiemthpt.id.vn/api/scan-transcript", { method: "POST" }), {
    TURNSTILE_SITE_KEY: "public-site-key",
    TURNSTILE_SECRET_KEY: "private-secret",
    OCR_RATE_LIMITER: { async limit() { rateLimitChecked = true; return { success: true }; } },
    OCR_SERVICE: { async fetch() { forwarded = true; return new Response("forwarded"); } }
  });
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "TURNSTILE_REQUIRED");
  assert.equal(rateLimitChecked, false);
  assert.equal(forwarded, false);
});

test("Worker bắt buộc Turnstile trước khi tạo tài khoản", async () => {
  let databaseTouched = false;
  const response = await mainWorker.fetch(new Request("https://tinhdiemthpt.id.vn/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test-user", password: "Matkhau2026" })
  }), {
    TURNSTILE_SITE_KEY: "public-site-key",
    TURNSTILE_SECRET_KEY: "private-secret",
    AUTH_RATE_LIMITER: { async limit() { return { success: true }; } },
    AUTH_DB: { prepare() { databaseTouched = true; throw new Error("Không được truy cập D1 trước Turnstile"); } }
  });
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "TURNSTILE_REQUIRED");
  assert.equal(databaseTouched, false);
});

test("Worker khóa đăng ký nếu Turnstile chưa được cấu hình", async () => {
  const response = await mainWorker.fetch(new Request("https://tinhdiemthpt.id.vn/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test-user", password: "Matkhau2026" })
  }), {
    AUTH_RATE_LIMITER: { async limit() { return { success: true }; } },
    AUTH_DB: { prepare() { throw new Error("Không được truy cập D1 khi thiếu Turnstile"); } }
  });
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.error.code, "TURNSTILE_REQUIRED_FOR_REGISTRATION");
});

test("Worker fail-closed Turnstile trên hostname lạ cho đăng ký, OCR và báo sai dữ liệu", async () => {
  const environment = {
    TURNSTILE_SITE_KEY: "public-site-key",
    TURNSTILE_SECRET_KEY: "private-secret",
    TURNSTILE_ALLOWED_HOSTNAMES: "tinhdiemthpt.id.vn",
    AUTH_RATE_LIMITER: { async limit() { return { success: true }; } },
    OCR_RATE_LIMITER: { async limit() { throw new Error("Không được rate-limit OCR trước Turnstile."); } },
    REPORT_RATE_LIMITER: { async limit() { throw new Error("Không được rate-limit báo cáo trước Turnstile."); } },
    AUTH_DB: { prepare() { throw new Error("Không được truy cập D1 trước Turnstile."); } },
    OCR_SERVICE: { async fetch() { throw new Error("Không được gọi OCR service trước Turnstile."); } }
  };
  const protectedRequests = [
    new Request("https://evil.example/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Turnstile-Token": "token" },
      body: JSON.stringify({ username: "test-user", password: "Matkhau2026" })
    }),
    new Request("https://evil.example/api/scan-transcript", { method: "POST", headers: { "X-Turnstile-Token": "token" } }),
    new Request("https://evil.example/api/data-reports", { method: "POST", headers: { "Content-Type": "application/json", "X-Turnstile-Token": "token" }, body: "{}" })
  ];

  for (const request of protectedRequests) {
    const response = await mainWorker.fetch(request, environment);
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.error.code, "TURNSTILE_HOSTNAME_NOT_ALLOWED");
  }
});

test("Worker chặn báo sai dữ liệu khi thiếu token Turnstile", async () => {
  let rateLimitChecked = false;
  const response = await mainWorker.fetch(new Request("https://tinhdiemthpt.id.vn/api/data-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  }), {
    TURNSTILE_SITE_KEY: "public-site-key",
    TURNSTILE_SECRET_KEY: "private-secret",
    REPORT_RATE_LIMITER: { async limit() { rateLimitChecked = true; return { success: true }; } }
  });
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "TURNSTILE_REQUIRED");
  assert.equal(rateLimitChecked, false);
});

test("Cloudflare Worker trả lời trợ lý qua service backend", async () => {
  let received;
  const request = new Request("https://tinhdiemthpt.id.vn/api/assistant-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Tìm ngành CNTT" })
  });
  const response = await handleAssistantApi(request, {}, async (input) => {
    received = input;
    return { answer: "Đã tìm thấy ngành phù hợp.", model: "test-model" };
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(received.question, "Tìm ngành CNTT");
  assert.deepEqual(payload.data, { answer: "Đã tìm thấy ngành phù hợp.", model: "test-model" });
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("Cloudflare Worker giới hạn tần suất trước khi gọi Groq", async () => {
  const response = await mainWorker.fetch(new Request("https://tinhdiemthpt.id.vn/api/assistant-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Tìm trường BKA" })
  }), {
    AI_RATE_LIMITER: { async limit() { return { success: false }; } }
  });
  const payload = await response.json();
  assert.equal(response.status, 429);
  assert.equal(payload.error.code, "RATE_LIMITED");
});
