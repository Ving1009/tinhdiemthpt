import { sanitizePublicValue, validHttpUrl } from "./dataValidation.js";

const TARGET_TYPES = new Set(["subjectScore", "componentScore", "bonusScore", "finalAdmissionScore", "eligibilityOnly"]);
const RULE_TYPES = new Set(["exact", "range", "minimum"]);
const STATUSES = new Set(["verified", "reference", "unverified"]);

function finite(value) { return Number.isFinite(Number(value)); }
function exactKey(value) { return String(value ?? "").trim().toLocaleLowerCase("vi"); }

export function validateCertificateConversions(records, { universityIds = null } = {}) {
  const errors = [];
  const ids = new Set();
  for (const record of records) {
    const prefix = record.id || "certificate-rule";
    if (!record.id || ids.has(record.id)) errors.push(`${prefix}: id thiếu hoặc bị trùng.`);
    ids.add(record.id);
    if (universityIds && !universityIds.has(record.universityId)) errors.push(`${prefix}: universityId không tồn tại.`);
    if (!Number.isInteger(record.year) || record.year < 2000 || record.year > 2100) errors.push(`${prefix}: year không hợp lệ.`);
    if (!record.certificate || !record.method) errors.push(`${prefix}: thiếu certificate hoặc method.`);
    if (!STATUSES.has(record.status)) errors.push(`${prefix}: status không hợp lệ.`);
    if (["verified", "reference"].includes(record.status) && !validHttpUrl(record.sourceUrl)) errors.push(`${prefix}: thiếu sourceUrl nội bộ hợp lệ.`);
    if (!TARGET_TYPES.has(record.target?.type)) errors.push(`${prefix}: target.type không hợp lệ.`);
    if (record.target?.type === "subjectScore" && !record.target.subject) errors.push(`${prefix}: thiếu target.subject.`);
    if (record.target?.type !== "eligibilityOnly" && (!finite(record.outputScale) || Number(record.outputScale) <= 0)) errors.push(`${prefix}: outputScale không hợp lệ.`);
    if (!Array.isArray(record.rules) || !record.rules.length) errors.push(`${prefix}: thiếu rules.`);
    const intervals = [];
    const exactRules = new Map();
    for (const [index, rule] of (record.rules || []).entries()) {
      const label = `${prefix}#${index + 1}`;
      if (!RULE_TYPES.has(rule.type)) errors.push(`${label}: rule type không hợp lệ.`);
      let min;
      let max;
      if (rule.type === "exact") {
        const key = exactKey(rule.value);
        if (!key) errors.push(`${label}: giá trị exact không hợp lệ.`);
        if (exactRules.has(key) && exactRules.get(key) !== rule.output) errors.push(`${prefix}: các giá trị exact trùng nhau và cho kết quả khác nhau.`);
        exactRules.set(key, rule.output);
        if (finite(rule.value)) min = max = Number(rule.value);
      }
      if (rule.type === "range") { min = Number(rule.min); max = Number(rule.max); }
      if (rule.type === "minimum") { min = Number(rule.min); max = Number.POSITIVE_INFINITY; }
      if (rule.type !== "exact" && (!finite(min) || (rule.type !== "minimum" && !finite(max)) || min > max)) errors.push(`${label}: khoảng đầu vào không hợp lệ.`);
      if (record.target?.type !== "eligibilityOnly") {
        if (!finite(rule.output) || Number(rule.output) < 0) errors.push(`${label}: output không hợp lệ.`);
        if (finite(record.outputScale) && Number(rule.output) > Number(record.outputScale)) errors.push(`${label}: output vượt thang điểm.`);
      }
      if (Number.isFinite(min) || max === Number.POSITIVE_INFINITY) intervals.push({ min, max, output: rule.output, index });
    }
    intervals.sort((a, b) => a.min - b.min || a.max - b.max);
    for (let i = 1; i < intervals.length; i += 1) {
      const previous = intervals[i - 1];
      const current = intervals[i];
      if (current.min <= previous.max && current.output !== previous.output) errors.push(`${prefix}: các khoảng quy đổi chồng lấn và cho kết quả khác nhau.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function findCertificateRule(record, rawValue) {
  const value = Number(String(rawValue ?? "").replace(",", "."));
  const key = exactKey(rawValue);
  if (!key) return null;
  return (record.rules || []).find((rule) => {
    if (rule.type === "exact") return finite(rule.value) && Number.isFinite(value) ? value === Number(rule.value) : key === exactKey(rule.value);
    if (rule.type === "range") return Number.isFinite(value) && value >= Number(rule.min) && value <= Number(rule.max);
    if (rule.type === "minimum") return Number.isFinite(value) && value >= Number(rule.min);
    return false;
  }) || null;
}

export function calculateCertificateConversion(records, input) {
  const record = records.find((item) =>
    item.universityId === input.universityId &&
    item.year === Number(input.year) &&
    item.certificate === input.certificate &&
    item.method === input.method &&
    (!input.purpose || item.id === input.purpose)
  );
  if (!record) return { available: false };
  const rule = findCertificateRule(record, input.value);
  if (!rule) return { available: true, matched: false, status: record.status, target: record.target };
  return {
    available: true,
    matched: true,
    status: record.status,
    target: record.target,
    outputScale: record.outputScale ?? null,
    value: record.target.type === "eligibilityOnly" ? null : Number(rule.output),
    eligible: record.target.type === "eligibilityOnly" ? rule.eligible !== false : undefined,
    canApply: record.status === "verified" && record.target.type === "subjectScore",
    provenance: {
      recordId: record.id,
      universityId: record.universityId,
      year: record.year,
      certificate: record.certificate,
      method: record.method,
      target: record.target
    }
  };
}

export function sanitizeCertificateRecord(record) {
  return sanitizePublicValue(record);
}
