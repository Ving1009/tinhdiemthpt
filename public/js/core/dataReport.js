const REPORT_FIELDS = new Set(["Hồ sơ trường", "Tên ngành", "Mã ngành", "Tổ hợp", "Phương thức", "Điểm chuẩn", "Công thức", "Khác"]);
function text(value, limit = 500) { return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit); }

export function createDataReport(context, input, createdAt = new Date().toISOString()) {
  const field = REPORT_FIELDS.has(input?.field) ? input.field : "Khác";
  const description = text(input?.description, 1200);
  if (description.length < 5) throw new Error("Hãy mô tả dữ liệu cần kiểm tra.");
  let evidenceUrl = "";
  if (input?.evidenceUrl) {
    try { const url = new URL(input.evidenceUrl); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); evidenceUrl = url.href; }
    catch { throw new Error("Liên kết kiểm chứng phải bắt đầu bằng http:// hoặc https://."); }
  }
  return {
    kind: "tinh-diem-thpt-data-report",
    version: 1,
    createdAt,
    status: "saved-locally-not-sent",
    context: {
      universityId: text(context?.universityId, 180), university: text(context?.university, 240),
      majorId: text(context?.majorId, 220), major: text(context?.major, 240), code: text(context?.code, 80),
      method: text(context?.method, 180), year: Number(context?.year) || 2026
    },
    report: { field, description, proposedValue: text(input?.proposedValue, 500), evidenceUrl }
  };
}
