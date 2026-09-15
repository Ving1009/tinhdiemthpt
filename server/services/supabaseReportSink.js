import { AppError } from "../errors.js";

const DEFAULT_TABLE = "data_reports";
const DEFAULT_TIMEOUT_MS = 10_000;

function configuredUrl(value) {
  const url = new URL(String(value || ""));
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) throw new Error("SUPABASE_URL phải dùng HTTPS.");
  return url.origin;
}

function configuredTable(value) {
  const table = String(value || DEFAULT_TABLE).trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(table)) throw new Error("SUPABASE_REPORTS_TABLE không hợp lệ.");
  return table;
}

function timeoutValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1_000, Math.min(60_000, parsed)) : DEFAULT_TIMEOUT_MS;
}

function cloudError(response, payload) {
  const code = String(payload?.code || "");
  if (response.status === 401 || response.status === 403) return new AppError("Không thể xác thực nơi nhận báo cáo.", { statusCode: 503, code: "SUPABASE_REPORT_AUTH" });
  if (response.status === 404 || /^PGRST(?:125|205)$/.test(code)) return new AppError("Bảng nhận báo cáo chưa được tạo trên Supabase.", { statusCode: 503, code: "SUPABASE_REPORT_TABLE_NOT_FOUND" });
  return new AppError("Supabase chưa nhận được báo cáo.", { statusCode: 503, code: "SUPABASE_REPORT_REQUEST_FAILED" });
}

function remoteRecord(record) {
  const { cloudSyncStatus, cloudSyncedAt, ...payload } = record;
  return {
    id: record.id,
    created_at: record.receivedAt,
    status: record.status,
    report_type: "incorrect_admission_data",
    university_id: record.context?.universityId || null,
    university_name: record.context?.university || null,
    major_id: record.context?.majorId || null,
    major_name: record.context?.major || null,
    page_url: null,
    message: record.report?.description || "",
    contact_email: null,
    payload
  };
}

export function createSupabaseReportSink({
  url = process.env.SUPABASE_URL,
  secretKey = process.env.SUPABASE_SECRET_KEY,
  table = process.env.SUPABASE_REPORTS_TABLE,
  timeoutMs = process.env.SUPABASE_TIMEOUT_MS,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!String(url || "").trim() || !String(secretKey || "").trim()) return null;
  const baseUrl = configuredUrl(url);
  const tableName = configuredTable(table);
  const requestTimeoutMs = timeoutValue(timeoutMs);

  return {
    async upsert(records) {
      if (!Array.isArray(records) || !records.length) return;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetchImpl(`${baseUrl}/rest/v1/${encodeURIComponent(tableName)}?on_conflict=id`, {
          method: "POST",
          headers: {
            apikey: secretKey,
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal"
          },
          body: JSON.stringify(records.map(remoteRecord)),
          signal: controller.signal
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw cloudError(response, payload);
        }
      } catch (error) {
        if (error?.name === "AbortError" || error?.name === "TimeoutError") throw new AppError("Supabase phản hồi quá lâu.", { statusCode: 504, code: "SUPABASE_REPORT_TIMEOUT" });
        if (error instanceof AppError) throw error;
        throw new AppError("Không kết nối được nơi nhận báo cáo.", { statusCode: 503, code: "SUPABASE_REPORT_REQUEST_FAILED" });
      } finally {
        clearTimeout(timeoutId);
      }
    }
  };
}
