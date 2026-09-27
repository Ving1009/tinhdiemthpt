import assert from "node:assert/strict";
import test from "node:test";
import { PRACTICE_EXAMS_2026 } from "../public/js/data/practiceExams2026.js";
import { createPracticeAttempt, formatExamTime, gradePracticeExam, normalizePracticeHistory, remainingExamSeconds } from "../public/js/core/practiceExam.js";

test("phòng thi 2026 có đủ môn bắt buộc, tự chọn và bảy ngoại ngữ", () => {
  assert.equal(PRACTICE_EXAMS_2026.length, 18);
  const subjects = new Set(PRACTICE_EXAMS_2026.map((item) => item.subject));
  for (const subject of [
    "Toán", "Ngữ văn", "Vật lí", "Hóa học", "Sinh học", "Lịch sử", "Địa lí",
    "Giáo dục kinh tế và pháp luật", "Tin học", "Công nghệ công nghiệp", "Công nghệ nông nghiệp",
    "Tiếng Anh", "Tiếng Nga", "Tiếng Pháp", "Tiếng Trung Quốc", "Tiếng Đức", "Tiếng Nhật", "Tiếng Hàn"
  ]) assert.equal(subjects.has(subject), true, subject);
});

test("mọi câu hỏi có một đáp án hợp lệ và lời giải", () => {
  const examIds = new Set();
  const questionIds = new Set();
  for (const exam of PRACTICE_EXAMS_2026) {
    assert.equal(examIds.has(exam.id), false, `trùng mã đề ${exam.id}`);
    examIds.add(exam.id);
    assert.ok(exam.durationMinutes > 0);
    assert.ok(exam.officialMinutes > 0);
    assert.ok(exam.questions.length >= 5);
    for (const question of exam.questions) {
      assert.equal(questionIds.has(question.id), false, `trùng mã câu ${question.id}`);
      questionIds.add(question.id);
      assert.ok(question.prompt.trim());
      assert.ok(question.options.length >= 2);
      assert.ok(Number.isInteger(question.answer));
      assert.ok(question.answer >= 0 && question.answer < question.options.length);
      assert.ok(question.explanation.trim());
    }
  }
});

test("chấm điểm trên thang 10 và giữ chi tiết để xem lại", () => {
  const exam = PRACTICE_EXAMS_2026[0];
  const answers = {
    [exam.questions[0].id]: exam.questions[0].answer,
    [exam.questions[1].id]: (exam.questions[1].answer + 1) % exam.questions[1].options.length
  };
  const result = gradePracticeExam(exam, answers);
  assert.equal(result.correctCount, 1);
  assert.equal(result.answeredCount, 2);
  assert.equal(result.unansweredCount, exam.questions.length - 2);
  assert.equal(result.score, Number((10 / exam.questions.length).toFixed(2)));
  assert.equal(result.details[0].correct, true);
  assert.equal(result.details[1].correct, false);
});

test("đồng hồ tiếp tục đúng sau khi tải lại trang", () => {
  const now = 1_000_000;
  const attempt = createPracticeAttempt({ id: "demo", durationMinutes: 12 }, now);
  assert.equal(remainingExamSeconds(attempt, now + 90_000), 630);
  assert.equal(formatExamTime(630), "10:30");
  assert.equal(remainingExamSeconds(attempt, attempt.endsAt + 1), 0);
});

test("lịch sử được sắp xếp mới nhất và giới hạn số lần", () => {
  const value = Array.from({ length: 35 }, (_, index) => ({ id: `a-${index}`, examId: "demo", submittedAt: index }));
  const history = normalizePracticeHistory(value);
  assert.equal(history.length, 30);
  assert.equal(history[0].submittedAt, 34);
});
