import assert from "node:assert/strict";
import test from "node:test";
import { createSupabaseReportSink } from "../server/services/supabaseReportSink.js";

const record = {
  id: "6c0329d9-ece8-47d4-a957-f86c85ed833f",
  receivedAt: "2026-09-14T01:00:00.000Z",
  status: "pending_review",
  cloudSyncStatus: "pending",
  context: { universityId: "u1", university: "Trường A", majorId: "m1", major: "Ngành A" },
  report: { field: "Điểm chuẩn", description: "Điểm cần kiểm tra.", proposedValue: "25", evidenceUrl: "" }
};

test("không tạo Supabase sink khi thiếu cấu hình", () => {
  assert.equal(createSupabaseReportSink({ url: "", secretKey: "" }), null);
});

test("Supabase sink chỉ gửi dữ liệu báo cáo đã ánh xạ từ backend", async () => {
  let request;
  const sink = createSupabaseReportSink({
    url: "https://project.supabase.co/rest/v1/",
    secretKey: "test-secret-key",
    table: "data_reports",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 201 };
    }
  });
  await sink.upsert([record]);
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, "https://project.supabase.co/rest/v1/data_reports?on_conflict=id");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.apikey, "test-secret-key");
  assert.equal(body[0].id, record.id);
  assert.equal(body[0].university_name, "Trường A");
  assert.equal(body[0].message, "Điểm cần kiểm tra.");
  assert.equal(Object.hasOwn(body[0].payload, "cloudSyncStatus"), false);
  assert.equal(request.options.body.includes("test-secret-key"), false);
});

test("Supabase sink phân loại đúng trường hợp chưa tạo bảng", async () => {
  const sink = createSupabaseReportSink({
    url: "https://project.supabase.co",
    secretKey: "test-secret-key",
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ code: "PGRST125" }) })
  });
  await assert.rejects(() => sink.upsert([record]), (error) => error.code === "SUPABASE_REPORT_TABLE_NOT_FOUND" && !error.message.includes("test-secret-key"));
});
