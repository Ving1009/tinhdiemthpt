import { calculateAdmissionPriority, rounded, subjectLabel } from "../../public/js/utils.js";

function calculateCombination(data, explanation) {
  const subjects = data.subjects?.length ? data.subjects : ["math", "literature", "foreignLanguage"];
  const labelFor = (key) => data.subjectLabels?.[key] || subjectLabel(key);
  const examScore = subjects.reduce((sum, key) => sum + Number(data.scores[key] || 0), 0);
  const priority = calculateAdmissionPriority(examScore, data.priorityContext);
  return {
    total: rounded(examScore + priority.adjusted), maxScore: 30, examScore: rounded(examScore), priority, subjects,
    breakdown: subjects.map((key) => ({ label: labelFor(key), value: Number(data.scores[key] || 0) })), explanation
  };
}

/** Công thức tách riêng cho ĐH Công nghệ Mẫu để cập nhật độc lập theo đề án trường. */
export const technologySampleThptFormula = {
  id: "ctm-thpt-2026",
  name: "ĐH Công nghệ Mẫu - Xét điểm THPT",
  year: 2026,
  type: "Theo trường",
  description: "Công thức mẫu riêng của ĐH Công nghệ Mẫu cho phương thức điểm thi THPT.",
  subjects: ["math", "literature", "foreignLanguage"],
  inputs: ["Điểm các môn tổ hợp", "Khu vực", "Đối tượng ưu tiên"],
  expression: "Điểm xét tuyển = Tổng 3 môn theo tổ hợp + Điểm ưu tiên",
  example: "Tổng điểm tổ hợp được tính theo đúng tổ hợp của ngành, sau đó cộng điểm ưu tiên.",
  calculate(data) {
    return { ...calculateCombination(data, "Tổng tổ hợp theo ngành của ĐH Công nghệ Mẫu + điểm ưu tiên"), formula: this.expression };
  },
  formatResult(result) { return `${result.total.toFixed(2)} / ${result.maxScore}`; }
};

/** Công thức tách riêng cho phương thức ĐGNL của ĐH Công nghệ Mẫu. */
export const technologySampleDgnlFormula = {
  id: "ctm-dgnl-2026",
  name: "ĐH Công nghệ Mẫu - Đánh giá năng lực",
  year: 2026,
  type: "Theo trường",
  description: "Khung tính mẫu riêng cho điểm ĐGNL của ĐH Công nghệ Mẫu.",
  subjects: [],
  inputs: ["Điểm bài thi ĐGNL"],
  expression: "Điểm xét tuyển = Điểm ĐGNL theo thang 1.200 của kỳ thi",
  example: "Ví dụ: 880 / 1.200 điểm.",
  calculate(data) {
    const score = Number(data.assessmentScore || 0);
    return { total: rounded(score), maxScore: 1200, examScore: rounded(score), priority: { adjusted: 0, base: 0 }, subjects: [], breakdown: [], explanation: "Điểm ĐGNL theo đề án mẫu của ĐH Công nghệ Mẫu", formula: this.expression };
  },
  formatResult(result) { return `${result.total.toFixed(0)} / ${result.maxScore}`; }
};
