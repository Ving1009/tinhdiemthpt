export const transcriptResponseSchema = {
  type: "object",
  properties: {
    student: {
      type: "object",
      properties: {
        name: { type: "string", nullable: true }
      },
      required: ["name"]
    },
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subject: { type: "string" },
          grade: { type: "integer" },
          semester1: { type: "number", nullable: true },
          semester2: { type: "number", nullable: true },
          year: { type: "number", nullable: true },
          confidence: { type: "number" }
        },
        required: ["subject", "grade", "semester1", "semester2", "year", "confidence"]
      }
    }
  },
  required: ["student", "scores"]
};

export function buildTranscriptPrompt(subjectCatalog) {
  const subjects = subjectCatalog.subjects.map((subject) => subject.canonical).join(", ");
  return `Bạn là hệ thống trích xuất dữ liệu nhìn thấy trong ảnh học bạ THPT Việt Nam.

Chỉ đọc dữ liệu xuất hiện rõ ràng trong ảnh. Không suy đoán, không tự sửa điểm, không tính điểm trung bình, không tính điểm xét tuyển, không áp dụng bất kỳ công thức tuyển sinh nào.

Nhận diện môn học, lớp 10/11/12, HK1, HK2 và cột cả năm nếu chúng được in trong ảnh. Nếu một ô mờ, bị che, không có hoặc không chắc chắn, trả về null cho đúng ô đó. Nếu không xác định chắc được môn hoặc lớp, không tạo dòng điểm đó.

Dùng đúng một trong các tên môn chuẩn sau khi có thể xác định chắc chắn: ${subjects}.
Nếu ảnh ghi tên biến thể, chỉ quy về tên chuẩn khi chắc chắn tương đương. Ví dụ Vật lý là Vật lí, Hoá là Hóa học, Anh là Tiếng Anh. Không biến một môn không chắc chắn thành môn khác.

confidence là độ tin cậy của dòng, từ 0 đến 1. Nếu điểm không đọc được nhưng môn và lớp chắc chắn, vẫn trả về dòng với các điểm null và confidence 0.

Chỉ trả về JSON khớp schema. Không dùng Markdown và không thêm giải thích.`;
}
