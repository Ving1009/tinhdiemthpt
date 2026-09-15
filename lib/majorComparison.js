import { parseCombinationCodes } from "./majorCombination.js";
import { normalizeAdmissionMethodCode } from "./admissionMethod.js";

const DIRECT_RAW_METHOD_SCALES = new Map([
  ["v-act", new Set([1200])],
  ["hsa", new Set([150])],
  ["tsa", new Set([100])],
  ["spt", new Set([150])],
  ["v-sat", new Set([450])]
]);

function finite(value) { return Number.isFinite(Number(value)); }

export function comparisonContextKey(major) {
  return [
    major.universityId,
    major.programId || major.code,
    major.name,
    major.campusId || major.campus || "",
    major.programType || "",
    major.method,
    major.methodDetails || "",
    major.cutoff?.year || "",
    major.cutoff?.scale || "",
    major.formula || ""
  ].join("|");
}

export function comparisonCompatibility(major, context = {}, validCombinationCodes = null, knownCombinationCodes = null) {
  const cutoff = major?.cutoff;
  if (!finite(context.score) || !finite(context.scale) || Number(context.scale) <= 0) return { compatible: false, reason: "Điểm đối chiếu hoặc thang điểm không hợp lệ." };
  if (!cutoff || !["verified", "reference"].includes(cutoff.status) || !finite(cutoff.score) || !finite(cutoff.scale)) return { compatible: false, reason: "Chưa có mốc điểm chuẩn có thể đối chiếu." };
  if (Number(cutoff.year) !== Number(context.year)) return { compatible: false, reason: "Khác năm tuyển sinh." };
  const methodCode = major.methodCode || normalizeAdmissionMethodCode(major.method);
  const contextMethodCode = context.methodCode || normalizeAdmissionMethodCode(context.method);
  if (methodCode !== contextMethodCode) return { compatible: false, reason: "Khác phương thức xét tuyển." };
  if (Number(cutoff.scale) !== Number(context.scale)) return { compatible: false, reason: `Khác thang điểm (${cutoff.scale} và ${context.scale}).` };
  const majorCodes = knownCombinationCodes || parseCombinationCodes(major.combination, validCombinationCodes);
  if (context.combination && !majorCodes.includes(String(context.combination).toLocaleUpperCase("vi"))) {
    return { compatible: false, reason: "Ngành không sử dụng tổ hợp này." };
  }

  if (DIRECT_RAW_METHOD_SCALES.has(contextMethodCode)) {
    if (!DIRECT_RAW_METHOD_SCALES.get(contextMethodCode).has(Number(context.scale))) return { compatible: false, reason: "Mốc điểm của trường đã được quy đổi sang thang khác." };
    if (context.ruleId !== "raw-exam-score") return { compatible: false, reason: "Thiếu ngữ cảnh điểm thi gốc." };
    return { compatible: true, confidence: cutoff.status };
  }

  const expectedRule = major.comparisonRules?.[context.combination] || major.comparisonRule;
  if (major.calculationVerified !== true || !expectedRule) return { compatible: false, reason: "Công thức của ngành chưa đủ căn cứ để so điểm của bạn." };
  if (!context.ruleId || expectedRule !== context.ruleId) return { compatible: false, reason: "Quy tắc tính điểm không tương thích." };
  return { compatible: true, confidence: cutoff.status };
}

export function chooseBestCombination(major, contexts, validCombinationCodes = null, knownCombinationCodes = null) {
  const parsedCodes = knownCombinationCodes || parseCombinationCodes(major.combination, validCombinationCodes);
  const codes = new Set(parsedCodes);
  const alternatives = contexts
    .filter((context) => codes.has(String(context.combination || "").toLocaleUpperCase("vi")))
    .map((context) => {
      const check = comparisonCompatibility(major, context, validCombinationCodes, parsedCodes);
      const difference = check.compatible ? Number((Number(context.score) - Number(major.cutoff.score)).toFixed(2)) : null;
      return {
        combination: context.combination,
        userScore: Number(context.score),
        scale: Number(context.scale),
        year: Number(context.year),
        ruleId: context.ruleId,
        compatible: check.compatible,
        reason: check.reason,
        confidence: check.confidence,
        difference
      };
    })
    .sort((a, b) => Number(b.compatible) - Number(a.compatible) || (b.difference ?? -Infinity) - (a.difference ?? -Infinity) || b.userScore - a.userScore || a.combination.localeCompare(b.combination, "vi"));
  return { best: alternatives.find((item) => item.compatible) || alternatives[0] || null, alternatives };
}

export function sortComparedMajors(items, sort = "difference-desc") {
  const schoolName = (item) => item.university?.name || "";
  const comparable = (item) => item.comparison?.compatible === true;
  const stableTie = (a, b) => schoolName(a).localeCompare(schoolName(b), "vi") || String(a.name || "").localeCompare(String(b.name || ""), "vi") || String(a.id || "").localeCompare(String(b.id || ""), "vi");
  const cutoffByScale = (a, b, direction) => {
    const scaleA = Number.isFinite(Number(a.cutoff?.scale)) ? Number(a.cutoff.scale) : Infinity;
    const scaleB = Number.isFinite(Number(b.cutoff?.scale)) ? Number(b.cutoff.scale) : Infinity;
    if (scaleA !== scaleB) return scaleA - scaleB;
    const scoreA = Number.isFinite(Number(a.cutoff?.score)) ? Number(a.cutoff.score) : (direction > 0 ? Infinity : -Infinity);
    const scoreB = Number.isFinite(Number(b.cutoff?.score)) ? Number(b.cutoff.score) : (direction > 0 ? Infinity : -Infinity);
    return direction * (scoreA - scoreB);
  };
  return [...items].sort((a, b) => {
    if (comparable(a) !== comparable(b)) return comparable(a) ? -1 : 1;
    if (sort === "difference-asc") return (a.comparison?.difference ?? Infinity) - (b.comparison?.difference ?? Infinity) || stableTie(a, b);
    if (sort === "cutoff-asc") return cutoffByScale(a, b, 1) || stableTie(a, b);
    if (sort === "cutoff-desc") return cutoffByScale(a, b, -1) || stableTie(a, b);
    if (sort === "school") return stableTie(a, b);
    return (b.comparison?.difference ?? -Infinity) - (a.comparison?.difference ?? -Infinity) || stableTie(a, b);
  });
}
