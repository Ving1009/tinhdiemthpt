import { calculateAdmissionPriority, rounded, subjectLabel } from "../public/js/utils.js";

/**
 * Công thức điểm xét tuyển bằng kết quả thi THPT.
 * Khi quy định đổi, chỉ cần điều chỉnh file công thức này, giao diện không đổi.
 */
export const thptFormula = {
  id: "thpt-standard-2026",
  name: "Điểm thi THPT 2026",
  year: 2026,
  type: "Thi THPT",
  description: "Cộng điểm 3 môn trong tổ hợp và điểm ưu tiên theo dữ liệu đầu vào.",
  subjects: ["math", "literature", "foreignLanguage"],
  inputs: ["Điểm các môn trong tổ hợp", "Khu vực", "Đối tượng ưu tiên"],
  expression: "Điểm xét tuyển = Môn 1 + Môn 2 + Môn 3 + Điểm ưu tiên",
  example: "7.25 + 7.00 + 7.00 + 0.75 = 22.00 (ví dụ tổng tổ hợp dưới 22.50).",
  calculate(data) {
    const subjects = data.subjects?.length ? data.subjects : this.subjects;
    const labelFor = (key) => data.subjectLabels?.[key] || subjectLabel(key);
    const examScore = subjects.reduce((total, key) => total + Number(data.scores[key] || 0), 0);
    const priority = calculateAdmissionPriority(examScore, data.priorityContext);
    const total = rounded(examScore + priority.adjusted);
    return {
      total,
      maxScore: 30,
      examScore: rounded(examScore),
      priority,
      subjects,
      breakdown: subjects.map((key) => ({ label: labelFor(key), value: Number(data.scores[key] || 0) })),
      explanation: `${subjects.map((key) => labelFor(key)).join(" + ")} + điểm ưu tiên`,
      formula: this.expression
    };
  },
  formatResult(result) {
    return `${result.total.toFixed(2)} / ${result.maxScore}`;
  }
};
