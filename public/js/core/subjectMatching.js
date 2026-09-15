const LANGUAGE_KEYS = new Map([
  ["tieng anh", "foreignLanguage:english"],
  ["tieng phap", "foreignLanguage:french"],
  ["tieng trung", "foreignLanguage:chinese"],
  ["tieng trung quoc", "foreignLanguage:chinese"],
  ["tieng nhat", "foreignLanguage:japanese"],
  ["tieng nga", "foreignLanguage:russian"],
  ["tieng duc", "foreignLanguage:german"],
  ["tieng han", "foreignLanguage:korean"],
  ["tieng han quoc", "foreignLanguage:korean"]
]);

export const STANDARD_SUBJECTS = [
  { key: "math", label: "Toán" },
  { key: "literature", label: "Ngữ văn" },
  { key: "physics", label: "Vật lí" },
  { key: "chemistry", label: "Hóa học" },
  { key: "biology", label: "Sinh học" },
  { key: "history", label: "Lịch sử" },
  { key: "geography", label: "Địa lí" },
  { key: "civicEducation", label: "GDKTPL" },
  { key: "informatics", label: "Tin học" },
  { key: "industrialTechnology", label: "Công nghệ công nghiệp" },
  { key: "agriculturalTechnology", label: "Công nghệ nông nghiệp" },
  { key: "foreignLanguage:english", label: "Tiếng Anh" },
  { key: "foreignLanguage:french", label: "Tiếng Pháp" },
  { key: "foreignLanguage:chinese", label: "Tiếng Trung" },
  { key: "foreignLanguage:japanese", label: "Tiếng Nhật" },
  { key: "foreignLanguage:russian", label: "Tiếng Nga" },
  { key: "foreignLanguage:german", label: "Tiếng Đức" },
  { key: "foreignLanguage:korean", label: "Tiếng Hàn" }
];
const STANDARD_KEYS = new Set(STANDARD_SUBJECTS.map((item) => item.key));

export function normalizeVietnamese(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi").trim();
}

export function canonicalSubjectKey(subjectId, label = "") {
  if (subjectId === "foreignLanguage") return LANGUAGE_KEYS.get(normalizeVietnamese(label)) || "foreignLanguage:unknown";
  if (subjectId === "technology") {
    const text = normalizeVietnamese(label);
    if (text.includes("nong nghiep")) return "agriculturalTechnology";
    if (text.includes("cong nghiep")) return "industrialTechnology";
  }
  return subjectId;
}

export function combinationSubjectKeys(combination) {
  return (combination?.subjectIds || []).map((id, index) => canonicalSubjectKey(id, combination.subjects?.[index]));
}

export function isStandardCombination(combination) {
  const keys = combinationSubjectKeys(combination);
  return keys.length === 3 && new Set(keys).size === 3 && keys.every((key) => STANDARD_KEYS.has(key));
}

export function subjectLabelForKey(key) { return STANDARD_SUBJECTS.find((item) => item.key === key)?.label || key; }

