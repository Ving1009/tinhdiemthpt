export function verifiedCutoff(major, year = 2026) {
  const cutoff = major?.cutoff;
  return cutoff?.year === year && cutoff.status === "verified" &&
    Number.isFinite(cutoff.score) && cutoff.score >= 0 &&
    Number.isFinite(cutoff.scale) && cutoff.scale > 0 && cutoff.score <= cutoff.scale;
}

export function publishableCutoff(major, year = 2026) {
  const cutoff = major?.cutoff;
  return cutoff?.year === year && ["verified", "reference"].includes(cutoff.status) &&
    Number.isFinite(cutoff.score) && cutoff.score >= 0 &&
    Number.isFinite(cutoff.scale) && cutoff.scale > 0 && cutoff.score <= cutoff.scale;
}

export function publicProfileNote({ status = "", hasReference = false, classified = "" } = {}) {
  if (status === "official_verified_partial") return "Một phần thông tin tuyển sinh 2026 đã được xác minh; các mục còn lại giữ trạng thái tham khảo hoặc đang cập nhật.";
  if (["official_verified", "official_announced", "official_proposed_methods_with_published_results"].includes(status)) {
    return "Thông tin tuyển sinh 2026 đã được xác minh.";
  }
  if (status === "reference_2026" || hasReference) return "Thông tin tuyển sinh 2026 đang ở mức tham khảo.";
  return classified || "Thông tin tuyển sinh đang được cập nhật.";
}

export function cutoffStatusLabel(major) {
  if (!publishableCutoff(major)) return "";
  return major.cutoff.status === "verified" ? "✓ Đã xác minh" : "~ Tham khảo";
}

export function cutoffLabel(major) {
  if (publishableCutoff(major)) return `${major.cutoff.score.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} / ${major.cutoff.scale}`;
  return major?.cutoff?.status === "not_published" ? "Chưa công bố" : "Chưa xác minh";
}

export function canCalculateMajor(major, formula) { return major?.calculationVerified === true && formula?.verified === true; }

export function paginate(items, requestedPage = 1, pageSize = 24) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.max(1, Math.min(pages, Number(requestedPage) || 1));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pages };
}
