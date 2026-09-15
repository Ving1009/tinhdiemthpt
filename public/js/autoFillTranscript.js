import { ACADEMIC_METHODS } from "../formulas/hocba.js";

const SUBJECT_FORM_IDS = new Map([
  ["toan", "math"],
  ["ngu van", "literature"],
  ["tieng anh", "foreignLanguage"],
  ["tieng phap", "foreignLanguage"],
  ["tieng trung", "foreignLanguage"],
  ["tieng nhat", "foreignLanguage"],
  ["tieng nga", "foreignLanguage"],
  ["tieng duc", "foreignLanguage"],
  ["tieng han", "foreignLanguage"],
  ["ngoai ngu", "foreignLanguage"],
  ["vat li", "physics"],
  ["vat ly", "physics"],
  ["hoa hoc", "chemistry"],
  ["sinh hoc", "biology"],
  ["lich su", "history"],
  ["dia li", "geography"],
  ["dia ly", "geography"],
  ["tin hoc", "informatics"],
  ["cong nghe cong nghiep", "industrialTechnology"],
  ["cong nghiep", "industrialTechnology"],
  ["cong nghe nong nghiep", "agriculturalTechnology"],
  ["nong nghiep", "agriculturalTechnology"],
  ["giao duc kinh te va phap luat", "civicEducation"]
]);
const LANGUAGE_NAMES = new Map([
  ["tieng anh", "Tiếng Anh"], ["tieng phap", "Tiếng Pháp"], ["tieng trung", "Tiếng Trung"], ["tieng nhat", "Tiếng Nhật"],
  ["tieng nga", "Tiếng Nga"], ["tieng duc", "Tiếng Đức"], ["tieng han", "Tiếng Hàn"]
]);

function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi").trim();
}

function asObservedScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number <= 10 ? Number(number.toFixed(2)) : null;
}

function observedColumns(methodId, grade, score) {
  const columns = [];
  const add = (column, value) => {
    const observed = asObservedScore(value);
    if (observed !== null) columns.push({ column, value: observed });
  };
  if (methodId === "three-years") add(`grade${grade}`, score.year);
  if (methodId === "six-semesters") { add(`grade${grade}s1`, score.semester1); add(`grade${grade}s2`, score.semester2); }
  if (methodId === "grade-12" && grade === 12) add("grade12", score.year);
  if (methodId === "grade-10-11-12h1") {
    if (grade === 10 || grade === 11) add(`grade${grade}`, score.year);
    if (grade === 12) add("grade12s1", score.semester1);
  }
  if (methodId === "three-semesters") {
    if (grade === 11) { add("grade11s1", score.semester1); add("grade11s2", score.semester2); }
    if (grade === 12) add("grade12s1", score.semester1);
  }
  if (methodId === "five-semesters") {
    if (grade === 10 || grade === 11) { add(`grade${grade}s1`, score.semester1); add(`grade${grade}s2`, score.semester2); }
    if (grade === 12) add("grade12s1", score.semester1);
  }
  return columns;
}

function preferDestination(destinations, candidate, warnings) {
  const current = destinations.get(candidate.fieldId);
  if (!current) {
    destinations.set(candidate.fieldId, candidate);
    return;
  }
  if (current.value === candidate.value) return;
  if (candidate.confidence > current.confidence) {
    destinations.set(candidate.fieldId, candidate);
    warnings.push(`${candidate.label} có dữ liệu trùng, đã chọn giá trị có độ tin cậy cao hơn.`);
  } else if (candidate.confidence < current.confidence) {
    warnings.push(`${candidate.label} có dữ liệu trùng, giữ giá trị có độ tin cậy cao hơn.`);
  } else {
    warnings.push(`${candidate.label} có dữ liệu trùng cùng độ tin cậy, chưa tự ghi đè.`);
  }
}

export function buildTranscriptAutofillPlan(transcript, { methodId } = {}) {
  const method = ACADEMIC_METHODS[methodId];
  if (!method) throw new Error("Phương thức học bạ chưa hợp lệ.");
  const warnings = [];
  const destinations = new Map();
  const detectedLanguages = new Set();
  for (const score of transcript?.scores || []) {
    const normalizedSubject = normalize(score.subject);
    if (normalizedSubject === "cong nghe") {
      warnings.push("Môn Công nghệ chưa rõ định hướng. Hãy chọn Công nghệ công nghiệp hoặc Công nghệ nông nghiệp ở bước xem trước.");
      continue;
    }
    const subjectId = SUBJECT_FORM_IDS.get(normalizedSubject);
    if (!subjectId) {
      warnings.push(`${score.subject || "Môn học"} chưa có ô tương ứng trong bảng học bạ.`);
      continue;
    }
    const language = LANGUAGE_NAMES.get(normalize(score.subject));
    if (language) detectedLanguages.add(language);
    for (const item of observedColumns(methodId, Number(score.grade), score)) {
      preferDestination(destinations, {
        fieldId: `academic-${subjectId}-${item.column}`,
        label: `${score.subject} lớp ${score.grade}`,
        value: item.value,
        confidence: Number(score.confidence) || 0
      }, warnings);
    }
  }
  const language = detectedLanguages.size === 1 ? [...detectedLanguages][0] : "";
  if (detectedLanguages.size > 1) warnings.push("Ảnh có nhiều môn ngoại ngữ, hãy tự chọn lại môn ngoại ngữ trước khi tính.");
  return { assignments: [...destinations.values()], warnings, language, method: method.name };
}

export function autoFillTranscript(transcript, { root = document, methodId, overwriteConflicts = false } = {}) {
  const plan = buildTranscriptAutofillPlan(transcript, { methodId });
  const warnings = [...plan.warnings];
  const conflicts = [];
  let filled = 0;
  for (const destination of plan.assignments) {
    const input = root.getElementById(destination.fieldId);
    if (!input) {
      warnings.push(`${destination.label} không có cột phù hợp trong phương thức đang chọn.`);
      continue;
    }
    const existing = String(input.value ?? "").trim().replace(",", ".");
    if (existing && Number(existing) !== destination.value && !overwriteConflicts) {
      conflicts.push({ fieldId: destination.fieldId, label: destination.label, existing: Number(existing), incoming: destination.value });
      warnings.push(`${destination.label} khác điểm đã nhập nên chưa được ghi đè.`);
      continue;
    }
    input.value = String(destination.value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    filled += 1;
  }
  return { filled, warnings, conflicts, language: plan.language, method: plan.method };
}
