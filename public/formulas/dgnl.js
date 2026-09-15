import { rounded } from "../js/utils.js";

/** Mẫu công thức đánh giá năng lực, tách riêng để dễ thêm trường có thang khác. */
export const dgnlFormula = {
  id: "dgnl-example",
  name: "Đánh giá năng lực (mẫu)",
  year: 2026,
  type: "ĐGNL",
  description: "Mẫu quy đổi điểm ĐGNL. Phương thức này cần điểm ĐGNL riêng, không dùng bốn ô điểm THPT phía trên.",
  subjects: [],
  inputs: ["Điểm bài thi ĐGNL", "Điểm cộng (nếu có)"],
  expression: "Điểm xét tuyển = Điểm ĐGNL quy đổi + điểm cộng theo đề án trường",
  example: "850 / 1.200 điểm → áp dụng ngưỡng/quy đổi do trường công bố",
  calculate(data) {
    const score = Number(data.assessmentScore || 0);
    return { total: rounded(score), maxScore: 1200, examScore: rounded(score), priority: { adjusted: 0, base: 0 }, subjects: [], breakdown: [], explanation: "Điểm ĐGNL được tiếp nhận theo thang điểm của kỳ thi", formula: this.expression };
  },
  formatResult(result) { return `${result.total.toFixed(0)} / ${result.maxScore}`; }
};
