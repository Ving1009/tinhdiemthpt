/**
 * TEMPLATE CÔNG THỨC RIÊNG CỦA TRƯỜNG
 *
 * 1. Đổi id để không trùng với công thức khác.
 * 2. Khai báo metadata để giao diện tự hiển thị card/modal.
 * 3. Chỉnh calculate(data); không cần sửa HTML hay JavaScript giao diện.
 */
export const templateFormula = {
  id: "university-template",
  name: "Công thức mẫu",
  year: 2026,
  type: "Tuỳ chỉnh",
  description: "Đây là công thức mẫu để phát triển thêm cho từng trường hoặc ngành.",
  subjects: ["math", "literature", "foreignLanguage"],
  inputs: ["subject1", "subject2", "subject3", "priority"],
  expression: "Điểm xét tuyển = Môn 1 + Môn 2 + Môn 3 + Điểm ưu tiên",
  example: "8.00 + 7.50 + 8.25 + 0.75 = 24.50",
  calculate(data) {
    // Đọc đầu vào. UI truyền scores và priorityContext vào đối tượng data.
    const subject1 = Number(data.scores.math || 0);
    const subject2 = Number(data.scores.literature || 0);
    const subject3 = Number(data.scores.foreignLanguage || 0);
    const priority = Number(data.priorityContext?.manualPriority || 0);

    // Đây là nơi thay đổi công thức của trường/ngành.
    const total = subject1 + subject2 + subject3 + priority;

    // Trả về cấu trúc chuẩn để Calculator Engine và UI hiểu được kết quả.
    return { total, breakdown: { subject1, subject2, subject3, priority } };
  }
};
