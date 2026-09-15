function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLocaleLowerCase("vi").replace(/\s+/g, " ").trim();
}

export function normalizeAdmissionMethodCode(value) {
  const text = normalize(value);
  if (!text) return "";
  if (text === "thpt" || /tot nghiep.*thpt|diem thi.*thpt/.test(text)) return "thpt";
  if (/hoc ba/.test(text)) return "hoc-ba";
  if (/v-act|dgnl.*dhqg.*tp|danh gia nang luc.*tp/.test(text)) return "v-act";
  if (/\bhsa\b|dgnl.*dhqg.*ha noi/.test(text)) return "hsa";
  if (/\btsa\b|danh gia tu duy|dgt[d]?(?:\s|$)/.test(text)) return "tsa";
  if (/\bspt\b|dgnl.*su pham/.test(text)) return "spt";
  if (/v-sat/.test(text)) return "v-sat";
  if (/ket hop/.test(text)) return "ket-hop";
  if (/tuyen thang|uu tien xet tuyen/.test(text)) return "tuyen-thang";
  return `khac:${text.slice(0, 80)}`;
}

export function admissionMethodMatches(majorMethod, requestedMethod) {
  if (!requestedMethod) return true;
  return normalizeAdmissionMethodCode(majorMethod) === normalizeAdmissionMethodCode(requestedMethod);
}
