import { rounded } from "../public/js/utils.js";

/** Mẫu công thức đánh giá tư duy — module sẵn sàng để mở rộng. */
export const dgtFormula = {
  id: "dgt-example",
  name: "Đánh giá tư duy (mẫu)",
  year: 2026,
  type: "ĐGTD",
  description: "Khung công thức cho phương thức xét điểm đánh giá tư duy của trường.",
  subjects: [],
  inputs: ["Điểm bài thi ĐGTD", "Điểm cộng (nếu có)"],
  expression: "Điểm xét tuyển = Điểm ĐGTD + điểm cộng theo đề án trường",
  example: "Ví dụ 72 / 100 điểm trước khi áp dụng điều kiện riêng.",
  calculate(data) { const score = Number(data.assessmentScore || 0); return { total: rounded(score), maxScore: 100, examScore: rounded(score), priority: { adjusted: 0, base: 0 }, subjects: [], breakdown: [], explanation: "Điểm ĐGTD theo thang do đơn vị tổ chức công bố", formula: this.expression }; },
  formatResult(result) { return `${result.total.toFixed(2)} / ${result.maxScore}`; }
};
