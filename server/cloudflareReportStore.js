import { createDataReport } from "../public/js/core/dataReport.js";
import { createSupabaseReportSink } from "./services/supabaseReportSink.js";

export function createCloudflareReportStore(environment = {}, { fetchImpl = globalThis.fetch } = {}) {
  const remoteSink = createSupabaseReportSink({
    url: environment.SUPABASE_URL,
    secretKey: environment.SUPABASE_SECRET_KEY,
    table: environment.SUPABASE_REPORTS_TABLE,
    timeoutMs: environment.SUPABASE_TIMEOUT_MS,
    fetchImpl
  });
  if (!remoteSink) return null;
  return {
    async submit(value) {
      if (!value || value.kind !== "tinh-diem-thpt-data-report" || Number(value.version) !== 1) {
        throw new Error("Báo cáo không đúng định dạng.");
      }
      const validated = createDataReport(value.context, value.report, value.createdAt);
      const receivedAt = new Date().toISOString();
      const record = {
        ...validated,
        id: globalThis.crypto.randomUUID(),
        receivedAt,
        status: "pending_review",
        cloudSyncStatus: "synced",
        cloudSyncedAt: receivedAt
      };
      await remoteSink.upsert([record]);
      return { id: record.id, receivedAt, status: record.status, delivery: "supabase" };
    }
  };
}
