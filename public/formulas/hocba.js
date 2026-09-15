import { calculateAdmissionPriority, rounded, subjectLabel } from "../js/utils.js";

export const ACADEMIC_METHODS = {
  "three-years": {
    name: "Xét học bạ 3 năm",
    columns: [
      { id: "grade10", label: "Cả năm lớp 10" },
      { id: "grade11", label: "Cả năm lớp 11" },
      { id: "grade12", label: "Cả năm lớp 12" }
    ]
  },
  "six-semesters": {
    name: "Xét học bạ 6 học kỳ",
    columns: [
      { id: "grade10s1", label: "HK1 lớp 10" },
      { id: "grade10s2", label: "HK2 lớp 10" },
      { id: "grade11s1", label: "HK1 lớp 11" },
      { id: "grade11s2", label: "HK2 lớp 11" },
      { id: "grade12s1", label: "HK1 lớp 12" },
      { id: "grade12s2", label: "HK2 lớp 12" }
    ]
  },
  "grade-12": {
    name: "Xét học bạ cả năm lớp 12",
    columns: [{ id: "grade12", label: "Cả năm lớp 12" }]
  },
  "grade-10-11-12h1": {
    name: "Lớp 10, lớp 11, HK1 lớp 12",
    columns: [
      { id: "grade10", label: "Cả năm lớp 10" },
      { id: "grade11", label: "Cả năm lớp 11" },
      { id: "grade12s1", label: "HK1 lớp 12" }
    ]
  },
  "three-semesters": {
    name: "Xét học bạ 3 học kỳ",
    columns: [
      { id: "grade11s1", label: "HK1 lớp 11" },
      { id: "grade11s2", label: "HK2 lớp 11" },
      { id: "grade12s1", label: "HK1 lớp 12" }
    ]
  },
  "five-semesters": {
    name: "Xét học bạ 5 học kỳ",
    columns: [
      { id: "grade10s1", label: "HK1 lớp 10" },
      { id: "grade10s2", label: "HK2 lớp 10" },
      { id: "grade11s1", label: "HK1 lớp 11" },
      { id: "grade11s2", label: "HK2 lớp 11" },
      { id: "grade12s1", label: "HK1 lớp 12" }
    ]
  }
};

/** Công thức học bạ quy điểm trung bình từng môn về tổng tổ hợp thang 30. */
export const hocBaFormula = {
  id: "hocba-example",
  name: "Xét học bạ THPT",
  year: 2026,
  verified: true,
  generic: true,
  type: "Học bạ",
  description: "Tính trung bình học bạ theo phương thức và tổ hợp; hỗ trợ điểm môn có trọng số.",
  subjects: ["math", "literature", "foreignLanguage"],
  inputs: ["Phương thức học bạ", "Điểm theo học kỳ/năm", "Tổ hợp môn", "Khu vực", "Đối tượng ưu tiên"],
  expression: "ĐTB môn = trung bình các cột điểm; Điểm thô = tổng (ĐTB môn × hệ số). Điểm ưu tiên chỉ áp dụng trực tiếp trên thang 30 hoặc sau một quy tắc chuẩn hóa đã xác minh.",
  example: "A01: Toán 8.00, Vật lí 7.50, Ngoại ngữ 8.50, điểm tổ hợp là 24.00.",
  methods: ACADEMIC_METHODS,
  calculate(data) {
    const subjects = data.subjects?.length ? data.subjects : this.subjects;
    const method = ACADEMIC_METHODS[data.method] || ACADEMIC_METHODS["three-years"];
    const labelFor = (key) => data.subjectLabels?.[key] || subjectLabel(key);
    const subjectAverages = Object.fromEntries(subjects.map((key) => {
      const values = method.columns.map((column) => Number(data.academicScores?.[key]?.[column.id] || 0));
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      return [key, rounded(average)];
    }));
    const multipliers = data.subjectMultipliers || {};
    const weights = Object.fromEntries(subjects.map((key) => [key, Number(multipliers[key] || 1)]));
    const rawScore = rounded(subjects.reduce((sum, key) => sum + subjectAverages[key] * weights[key], 0));
    const rawScale = subjects.reduce((sum, key) => sum + 10 * weights[key], 0);
    const normalization = data.normalization;
    const requestedOutputScale = Number(normalization?.outputScale);
    const canNormalize = rawScale !== 30 && normalization?.verified === true &&
      normalization.type === "linear" && Number.isFinite(requestedOutputScale) && requestedOutputScale > 0;
    const examScore = canNormalize ? rounded((rawScore / rawScale) * requestedOutputScale) : rawScore;
    const maxScore = canNormalize ? requestedOutputScale : rawScale;
    const canApplyPriority = rawScale === 30 || (canNormalize && maxScore === 30 && data.priorityApplication === "after-normalization");
    const priority = canApplyPriority ? calculateAdmissionPriority(examScore, data.priorityContext) : { area: 0, group: 0, base: 0, adjusted: 0, shouldAdjust: false, applicable: false };
    return {
      total: rounded(examScore + priority.adjusted),
      maxScore,
      examScore,
      rawScore,
      rawScale,
      normalizationApplied: canNormalize,
      priority,
      subjects,
      method: method.name,
      breakdown: subjects.map((key) => ({ label: `ĐTB ${labelFor(key)}${weights[key] === 2 ? " ×2" : ""}`, value: subjectAverages[key], weight: weights[key] })),
      weighted: maxScore !== 30,
      priorityApplied: canApplyPriority,
      explanation: method.name,
      formula: this.expression
    };
  },
  formatResult(result) { return `${result.total.toFixed(2)} / ${result.maxScore}`; }
};
