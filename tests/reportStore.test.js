import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createReportStore } from "../server/reportStore.js";

test("report store ghi hàng chờ private và không sửa dữ liệu chính", async () => {
  const directory = await mkdtemp(join(tmpdir(), "thpt-report-"));
  try {
    const filePath = join(directory, "pending.ndjson");
    const auditPath = join(directory, "audit.ndjson");
    const store = createReportStore({ filePath, auditPath });
    const result = await store.submit({
      kind: "tinh-diem-thpt-data-report", version: 1, createdAt: "2026-09-14T00:00:00.000Z",
      context: { universityId: "u1", university: "Trường A", majorId: "m1", major: "Ngành A", code: "7480201", method: "THPT", year: 2026 },
      report: { field: "Điểm chuẩn", description: "Đề nghị kiểm tra lại mốc điểm.", proposedValue: "25", evidenceUrl: "" }
    });
    assert.equal(result.status, "pending_review");
    const record = JSON.parse((await readFile(filePath, "utf8")).trim());
    assert.equal(record.status, "pending_review");
    assert.equal(record.context.majorId, "m1");
    assert.equal((await store.list({ status: "pending_review" })).length, 1);
    const reviewed = await store.updateStatus(result.id, "resolved", "Đã đối chiếu nguồn chính thức.");
    assert.equal(reviewed.previousStatus, "pending_review");
    assert.equal(reviewed.status, "resolved");
    assert.equal((await store.list({ status: "pending_review" })).length, 0);
    const updated = (await store.list({ status: "resolved" }))[0];
    assert.equal(updated.reviewNote, "Đã đối chiếu nguồn chính thức.");
    const audit = JSON.parse((await readFile(auditPath, "utf8")).trim());
    assert.equal(audit.reportId, result.id);
    assert.equal(audit.status, "resolved");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("report store lưu cục bộ rồi đánh dấu đã đồng bộ Supabase", async () => {
  const directory = await mkdtemp(join(tmpdir(), "thpt-report-cloud-"));
  try {
    const filePath = join(directory, "pending.ndjson");
    const received = [];
    const store = createReportStore({
      filePath,
      auditPath: join(directory, "audit.ndjson"),
      remoteSink: { async upsert(records) { received.push(...records); } }
    });
    const result = await store.submit({
      kind: "tinh-diem-thpt-data-report", version: 1,
      context: { universityId: "u1", university: "Trường A", majorId: "m1", major: "Ngành A", code: "7480201", method: "THPT", year: 2026 },
      report: { field: "Điểm chuẩn", description: "Đề nghị kiểm tra lại mốc điểm.", proposedValue: "25", evidenceUrl: "" }
    });
    assert.equal(result.delivery, "supabase");
    assert.equal(received.length, 1);
    const saved = JSON.parse((await readFile(filePath, "utf8")).trim());
    assert.equal(saved.cloudSyncStatus, "synced");
    assert.ok(saved.cloudSyncedAt);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("report store giữ báo cáo khi Supabase lỗi và gửi lại sau", async () => {
  const directory = await mkdtemp(join(tmpdir(), "thpt-report-retry-"));
  let unavailable = true;
  try {
    const filePath = join(directory, "pending.ndjson");
    const store = createReportStore({
      filePath,
      auditPath: join(directory, "audit.ndjson"),
      remoteSink: { async upsert() { if (unavailable) throw new Error("offline"); } }
    });
    const submitted = await store.submit({
      kind: "tinh-diem-thpt-data-report", version: 1,
      context: { universityId: "u1", university: "Trường A", majorId: "m1", major: "Ngành A", code: "7480201", method: "THPT", year: 2026 },
      report: { field: "Điểm chuẩn", description: "Đề nghị kiểm tra lại mốc điểm.", proposedValue: "25", evidenceUrl: "" }
    });
    assert.equal(submitted.delivery, "queued");
    assert.equal(JSON.parse((await readFile(filePath, "utf8")).trim()).cloudSyncStatus, "pending");
    unavailable = false;
    const synced = await store.syncPending();
    assert.deepEqual(synced, { configured: true, attempted: 1, synced: 1, pending: 0 });
    assert.equal(JSON.parse((await readFile(filePath, "utf8")).trim()).cloudSyncStatus, "synced");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
