import assert from "node:assert/strict";
import test from "node:test";
import { loadTranscriptSubjectCatalog, validateTranscriptPayload } from "../server/validators/transcriptValidator.js";

test("chuẩn hóa môn, điểm và bỏ dữ liệu ngoài khoảng", async () => {
  const catalog = await loadTranscriptSubjectCatalog();
  const result = validateTranscriptPayload({
    student: { name: "Nguyễn Minh Anh" },
    scores: [
      { subject: "Vật lý", grade: 10, semester1: 8.2, semester2: 8.5, year: 8.35, confidence: 0.97 },
      { subject: "Hóa", grade: 10, semester1: 12, semester2: null, year: null, confidence: 0.8 },
      { subject: "Môn không rõ", grade: 10, semester1: 8, semester2: 8, year: 8, confidence: 0.9 }
    ]
  }, catalog);
  assert.equal(result.data.student.name, "Nguyễn Minh Anh");
  assert.deepEqual(result.data.scores[0], { subject: "Hóa học", grade: 10, semester1: null, semester2: null, year: null, confidence: 0.8 });
  assert.deepEqual(result.data.scores[1], { subject: "Vật lí", grade: 10, semester1: 8.2, semester2: 8.5, year: 8.35, confidence: 0.97 });
  assert.match(result.warnings.join(" "), /không hợp lệ/);
  assert.match(result.warnings.join(" "), /không xác định được môn/);
});

test("giữ giá trị trùng có độ tin cậy cao hơn và đưa cảnh báo", async () => {
  const catalog = await loadTranscriptSubjectCatalog();
  const result = validateTranscriptPayload({
    student: { name: null },
    scores: [
      { subject: "Toán", grade: 11, semester1: 7.5, semester2: null, year: null, confidence: 0.61 },
      { subject: "Toán", grade: 11, semester1: 8.25, semester2: 8.6, year: null, confidence: 0.94 }
    ]
  }, catalog);
  assert.equal(result.data.scores.length, 1);
  assert.equal(result.data.scores[0].semester1, 8.25);
  assert.equal(result.data.scores[0].semester2, 8.6);
  assert.equal(result.data.scores[0].confidence, 0.94);
  assert.match(result.warnings.join(" "), /dữ liệu trùng/);
});

test("validator giữ riêng hai hướng Công nghệ và để Công nghệ chung chờ người dùng chọn", async () => {
  const catalog = await loadTranscriptSubjectCatalog();
  const result = validateTranscriptPayload({ student: {}, scores: [
    { subject: "Công nghệ công nghiệp", grade: 12, semester1: 8, semester2: 8.2, year: 8.1, confidence: 0.9 },
    { subject: "Công nghệ nông nghiệp", grade: 12, semester1: 9, semester2: 9.2, year: 9.1, confidence: 0.91 },
    { subject: "Công nghệ", grade: 11, semester1: 7, semester2: 7.2, year: 7.1, confidence: 0.8 }
  ] }, catalog);
  assert.deepEqual(result.data.scores.map((item) => item.subject), ["Công nghệ", "Công nghệ công nghiệp", "Công nghệ nông nghiệp"]);
});
