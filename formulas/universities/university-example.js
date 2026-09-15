import { calculateAdmissionPriority, rounded, subjectLabel } from "../../public/js/utils.js";

/** Công thức đang được gán cho Trường Đại học ABC trong data/universities.json. */
export const universityExampleFormula = {
  id: "abc-thpt-2026",
  name: "ĐH ABC – Xét điểm THPT",
  year: 2026,
  type: "Theo trường",
  description: "Công thức mẫu riêng của Trường Đại học ABC: tổng điểm tổ hợp D01 cộng ưu tiên.",
  subjects: ["math", "literature", "foreignLanguage"],
  inputs: ["Điểm Toán", "Điểm Ngữ văn", "Điểm Ngoại ngữ", "Điểm ưu tiên"],
  expression: "Điểm xét tuyển = Toán + Ngữ văn + Ngoại ngữ + Điểm ưu tiên",
  example: "7.25 + 7.00 + 7.00 + 0.75 = 22.00 (ví dụ tổng tổ hợp dưới 22.50).",
  calculate(data) {
    const subjects = data.subjects?.length ? data.subjects : this.subjects;
    const labelFor = (key) => data.subjectLabels?.[key] || subjectLabel(key);
    const examScore = subjects.reduce((sum, subject) => sum + Number(data.scores[subject] || 0), 0);
    const priority = calculateAdmissionPriority(examScore, data.priorityContext);
    return {
      total: rounded(examScore + priority.adjusted), maxScore: 30, examScore: rounded(examScore), priority, subjects,
      breakdown: subjects.map((key) => ({ label: labelFor(key), value: Number(data.scores[key] || 0) })),
      explanation: "Tổng ba môn theo tổ hợp + điểm ưu tiên", formula: this.expression
    };
  },
  formatResult(result) { return `${result.total.toFixed(2)} / ${result.maxScore}`; }
};
