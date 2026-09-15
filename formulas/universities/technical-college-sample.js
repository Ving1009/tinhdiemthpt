import { calculateAdmissionPriority, rounded, subjectLabel } from "../../public/js/utils.js";

/** Công thức tách riêng cho Cao đẳng Kỹ thuật Mẫu, sẵn sàng thay đổi độc lập theo đề án. */
export const technicalCollegeThptFormula = {
  id: "ktm-thpt-2026",
  name: "CĐ Kỹ thuật Mẫu - Xét điểm THPT",
  year: 2026,
  type: "Theo trường",
  description: "Công thức mẫu riêng của Cao đẳng Kỹ thuật Mẫu cho tổ hợp điểm thi THPT.",
  subjects: ["math", "literature", "foreignLanguage"],
  inputs: ["Điểm các môn tổ hợp", "Khu vực", "Đối tượng ưu tiên"],
  expression: "Điểm xét tuyển = Tổng 3 môn theo tổ hợp + Điểm ưu tiên",
  example: "Tổng điểm tổ hợp được tính theo đúng tổ hợp của ngành, sau đó cộng điểm ưu tiên.",
  calculate(data) {
    const subjects = data.subjects?.length ? data.subjects : this.subjects;
    const labelFor = (key) => data.subjectLabels?.[key] || subjectLabel(key);
    const examScore = subjects.reduce((sum, key) => sum + Number(data.scores[key] || 0), 0);
    const priority = calculateAdmissionPriority(examScore, data.priorityContext);
    return {
      total: rounded(examScore + priority.adjusted), maxScore: 30, examScore: rounded(examScore), priority, subjects,
      breakdown: subjects.map((key) => ({ label: labelFor(key), value: Number(data.scores[key] || 0) })),
      explanation: "Tổng tổ hợp theo ngành của Cao đẳng Kỹ thuật Mẫu + điểm ưu tiên", formula: this.expression
    };
  },
  formatResult(result) { return `${result.total.toFixed(2)} / ${result.maxScore}`; }
};
