const REPORT_FIELDS = new Set(["Hồ sơ trường", "Tên ngành", "Mã ngành", "Tổ hợp", "Phương thức", "Điểm chuẩn", "Công thức", "Liên kết nguồn", "Khác"]);
function normalizedText(value) { return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); }
function text(value, limit = 500) { return normalizedText(value).slice(0, limit); }

export function isGibberishReportText(value) {
  const source = normalizedText(value).toLocaleLowerCase("vi");
  const compact = source.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, "");
  if (!/\p{L}/u.test(source)) return true;
  if (/([a-z0-9])\1{5,}/i.test(compact)) return true;
  if (/(?:asdfghjkl|lkjhgfdsa|qwertyuiop|poiuytrewq|zxcvbnm|mnbvcxz|1234567890)/i.test(compact)) return true;
  if (compact.length >= 12 && new Set(compact).size <= 3) return true;
  if (compact.length >= 12 && /^(.{1,4})\1{2,}$/u.test(compact)) return true;
  const words = source.match(/[\p{L}\p{N}]+/gu) || [];
  return words.length >= 4 && new Set(words).size === 1;
}

export function createDataReport(context, input, createdAt = new Date().toISOString()) {
  const field = REPORT_FIELDS.has(input?.field) ? input.field : "Khác";
  const description = normalizedText(input?.description);
  if (description.length < 15) throw new Error("Mô tả dữ liệu cần kiểm tra phải có ít nhất 15 ký tự.");
  if (description.length > 1000) throw new Error("Mô tả dữ liệu cần kiểm tra tối đa 1.000 ký tự.");
  if (isGibberishReportText(description)) throw new Error("Mô tả có dấu hiệu lặp hoặc vô nghĩa. Hãy nêu rõ dữ liệu cần sửa.");
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
