import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDataReport } from "../public/js/core/dataReport.js";
import { createSupabaseReportSink } from "./services/supabaseReportSink.js";

const DEFAULT_REPORT_PATH = fileURLToPath(new URL("../.local/pending-data-reports.ndjson", import.meta.url));
const DEFAULT_AUDIT_PATH = fileURLToPath(new URL("../.local/data-report-audit.ndjson", import.meta.url));
const REVIEW_STATUSES = new Set(["pending_review", "in_review", "resolved", "rejected"]);

async function readRecords(filePath) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return source.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Hàng chờ báo lỗi ở dòng ${index + 1} không đọc được.`); }
  });
}

async function atomicWriteRecords(filePath, records) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export function createReportStore({ filePath = DEFAULT_REPORT_PATH, auditPath = DEFAULT_AUDIT_PATH, remoteSink = createSupabaseReportSink() } = {}) {
  let operation = Promise.resolve();
  const enqueue = (action) => {
    const next = operation.then(action, action);
    operation = next.catch(() => {});
    return next;
  };
  return {
    submit(value) {
      return enqueue(async () => {
        if (!value || value.kind !== "tinh-diem-thpt-data-report" || Number(value.version) !== 1) throw new Error("Báo cáo không đúng định dạng.");
        const validated = createDataReport(value.context, value.report, value.createdAt);
        const record = {
          ...validated,
          id: randomUUID(),
          receivedAt: new Date().toISOString(),
          status: "pending_review",
          cloudSyncStatus: remoteSink ? "pending" : "not_configured"
        };
        await mkdir(dirname(filePath), { recursive: true });
        await appendFile(filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
        let delivery = remoteSink ? "queued" : "local";
        if (remoteSink) {
          try {
            await remoteSink.upsert([record]);
            record.cloudSyncStatus = "synced";
            record.cloudSyncedAt = new Date().toISOString();
            const records = await readRecords(filePath);
            const index = records.findIndex((item) => item.id === record.id);
            if (index >= 0) records[index] = record;
            await atomicWriteRecords(filePath, records);
            delivery = "supabase";
          } catch {
            // Bản cục bộ đã được lưu và sẽ được đồng bộ lại sau.
          }
        }
        return { id: record.id, receivedAt: record.receivedAt, status: record.status, delivery };
      });
    },
    list({ status = "", limit = 500 } = {}) {
      return enqueue(async () => {
        const records = await readRecords(filePath);
        const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 500));
        return records
          .filter((record) => !status || record.status === status)
          .sort((a, b) => String(b.receivedAt || "").localeCompare(String(a.receivedAt || "")))
          .slice(0, safeLimit);
      });
    },
    updateStatus(id, status, note = "") {
      return enqueue(async () => {
        const reportId = String(id || "").trim();
        const nextStatus = String(status || "").trim();
        const reviewNote = String(note || "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(reportId)) throw new Error("Mã báo cáo không hợp lệ.");
        if (!REVIEW_STATUSES.has(nextStatus)) throw new Error("Trạng thái duyệt không hợp lệ.");
        if (reviewNote.length > 500) throw new Error("Ghi chú duyệt tối đa 500 ký tự.");
        const records = await readRecords(filePath);
        const index = records.findIndex((record) => record.id === reportId);
        if (index < 0) throw new Error("Không tìm thấy báo cáo.");
        const previousStatus = records[index].status;
        const changedAt = new Date().toISOString();
        records[index] = {
          ...records[index], status: nextStatus, reviewedAt: changedAt, reviewNote,
          cloudSyncStatus: remoteSink ? "pending" : "not_configured", cloudSyncedAt: undefined
        };
        await atomicWriteRecords(filePath, records);
        await mkdir(dirname(auditPath), { recursive: true });
        await appendFile(auditPath, `${JSON.stringify({ id: randomUUID(), reportId, previousStatus, status: nextStatus, note: reviewNote, changedAt })}\n`, { encoding: "utf8", mode: 0o600 });
        let delivery = remoteSink ? "queued" : "local";
        if (remoteSink) {
          try {
            await remoteSink.upsert([records[index]]);
            records[index].cloudSyncStatus = "synced";
            records[index].cloudSyncedAt = new Date().toISOString();
            await atomicWriteRecords(filePath, records);
            delivery = "supabase";
          } catch {
            // Trạng thái cục bộ vẫn hợp lệ và sẽ được đồng bộ lại sau.
          }
        }
        return { id: reportId, previousStatus, status: nextStatus, reviewedAt: changedAt, delivery };
      });
    },
    syncPending({ limit = 100 } = {}) {
      return enqueue(async () => {
        if (!remoteSink) return { configured: false, attempted: 0, synced: 0, pending: 0 };
        const records = await readRecords(filePath);
        const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
        const candidates = records.filter((record) => record.cloudSyncStatus !== "synced").slice(0, safeLimit);
        if (!candidates.length) return { configured: true, attempted: 0, synced: 0, pending: 0 };
        try {
          await remoteSink.upsert(candidates);
          const syncedAt = new Date().toISOString();
          const ids = new Set(candidates.map((record) => record.id));
          for (const record of records) {
            if (!ids.has(record.id)) continue;
            record.cloudSyncStatus = "synced";
            record.cloudSyncedAt = syncedAt;
          }
          await atomicWriteRecords(filePath, records);
          return { configured: true, attempted: candidates.length, synced: candidates.length, pending: records.filter((record) => record.cloudSyncStatus !== "synced").length };
        } catch (error) {
          return { configured: true, attempted: candidates.length, synced: 0, pending: candidates.length, errorCode: error?.code || "SUPABASE_REPORT_REQUEST_FAILED" };
        }
      });
    }
  };
}
