import assert from "node:assert/strict";
import test from "node:test";
import { createDataReport } from "../public/js/core/dataReport.js";

test("báo dữ liệu sai lưu đúng ngữ cảnh và không giả trạng thái đã gửi", () => {
  const report = createDataReport({ universityId: "u1", university: "Trường A", majorId: "m1", major: "Ngành A", code: "7480201", method: "THPT", year: 2026 }, { field: "Điểm chuẩn", description: "Mốc điểm này cần kiểm tra lại.", evidenceUrl: "https://example.edu.vn/thong-bao" }, "2026-09-13T00:00:00.000Z");
  assert.equal(report.status, "saved-locally-not-sent");
  assert.equal(report.context.method, "THPT");
  assert.equal(report.report.field, "Điểm chuẩn");
});

test("báo dữ liệu sai kiểm tra mô tả và liên kết", () => {
  assert.throws(() => createDataReport({}, { field: "Khác", description: "sai" }), /mô tả/);
  assert.throws(() => createDataReport({}, { field: "Khác", description: "Mô tả hợp lệ", evidenceUrl: "javascript:alert(1)" }), /liên kết/i);
});
