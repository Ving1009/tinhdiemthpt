import assert from "node:assert/strict";
import test from "node:test";
import { createCloudflareReportStore } from "../server/cloudflareReportStore.js";
import { handleOcrRequest } from "../worker/ocrHandler.js";

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
