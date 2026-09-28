import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PRACTICE_EXAMS_2026 } from "../public/js/data/practiceExams2026.js";
import {
  createPracticeAttempt,
  formatExamTime,
  gradePracticeExam,
  isPracticeQuestionAnswered,
  normalizePracticeHistory,
  remainingExamSeconds
} from "../public/js/core/practiceExam.js";

test("phòng thi 2026 có đủ 18 môn và 17 đề nguồn", () => {
  assert.equal(PRACTICE_EXAMS_2026.length, 18);
  const subjects = new Set(PRACTICE_EXAMS_2026.map((item) => item.subject));
  for (const subject of [
    "Toán", "Ngữ văn", "Vật lí", "Hóa học", "Sinh học", "Lịch sử", "Địa lí",
    "Giáo dục kinh tế và pháp luật", "Tin học", "Công nghệ công nghiệp", "Công nghệ nông nghiệp",
    "Tiếng Anh", "Tiếng Nga", "Tiếng Pháp", "Tiếng Trung Quốc", "Tiếng Đức", "Tiếng Nhật", "Tiếng Hàn"
  ]) assert.equal(subjects.has(subject), true, subject);
  assert.equal(PRACTICE_EXAMS_2026.filter((item) => item.sourceKind === "official-paper").length, 17);
  assert.equal(PRACTICE_EXAMS_2026.find((item) => item.subject === "Ngữ văn").sourceKind, undefined);
});

test("mã đề, dạng câu và thang điểm đều hợp lệ", () => {
  const examIds = new Set();
  const questionIds = new Set();
  for (const exam of PRACTICE_EXAMS_2026) {
    assert.equal(examIds.has(exam.id), false, `trùng mã đề ${exam.id}`);
    examIds.add(exam.id);
    assert.ok(exam.durationMinutes > 0);
    assert.ok(exam.officialMinutes > 0);
    assert.ok(exam.questions.length >= 5);
    if (exam.sourceKind === "official-paper") {
      assert.match(exam.examCode, /^\d{4}$/);
      const scoreSets = exam.answerBranches?.length
        ? exam.answerBranches.map((branch) => exam.questions.filter((question) => !question.branch || question.branch === branch))
        : [exam.questions];
      for (const scoreSet of scoreSets) {
        assert.equal(Number(scoreSet.reduce((sum, question) => sum + question.points, 0).toFixed(3)), 10);
        assert.equal(scoreSet.length, exam.questionCount || exam.questions.length);
      }
    }
    for (const question of exam.questions) {
      assert.equal(questionIds.has(question.id), false, `trùng mã câu ${question.id}`);
      questionIds.add(question.id);
      assert.ok(question.prompt.trim());
      if (question.type === "true-false") {
        assert.equal(question.statements.length, 4);
        assert.equal(question.answer.length, 4);
        assert.ok(question.answer.every((item) => typeof item === "boolean"));
      } else if (question.type === "short") {
        assert.ok(question.answerText.trim());
      } else {
        assert.ok(question.options.length >= 2);
        assert.ok(Number.isInteger(question.answer));
        assert.ok(question.answer >= 0 && question.answer < question.options.length);
      }
    }
  }
});

test("toàn bộ trang đề và lời giải đã được đóng gói cho website", () => {
  for (const exam of PRACTICE_EXAMS_2026.filter((item) => item.sourceKind === "official-paper")) {
    assert.ok(exam.pageImages.length >= 4, exam.subject);
    for (const image of [...exam.pageImages, ...(exam.answerImages || []), ...(exam.solutionImages || [])]) {
      assert.equal(existsSync(resolve("public", image)), true, image);
    }
  }
  for (const subject of ["Toán", "Vật lí", "Hóa học", "Sinh học", "Lịch sử", "Địa lí", "Giáo dục kinh tế và pháp luật", "Tiếng Anh"]) {
    assert.ok(PRACTICE_EXAMS_2026.find((item) => item.subject === subject).solutionImages.length > 0, subject);
  }
  for (const subject of ["Tin học", "Công nghệ nông nghiệp", "Tiếng Nga", "Tiếng Pháp", "Tiếng Trung Quốc", "Tiếng Đức", "Tiếng Nhật", "Tiếng Hàn"]) {
    assert.ok(PRACTICE_EXAMS_2026.find((item) => item.subject === subject).answerImages.length > 0, subject);
  }
});

test("chấm đúng thang điểm chính thức cho chọn đáp án, đúng sai và trả lời ngắn", () => {
  const exam = PRACTICE_EXAMS_2026.find((item) => item.subject === "Vật lí");
  const single = exam.questions.find((item) => item.type === "single");
  const trueFalse = exam.questions.find((item) => item.type === "true-false");
  const short = exam.questions.find((item) => item.type === "short");
  const partialTf = [...trueFalse.answer];
  partialTf[3] = !partialTf[3];
  const answers = {
    [single.id]: single.answer,
    [trueFalse.id]: partialTf,
    [short.id]: "2.52"
  };
  const result = gradePracticeExam(exam, answers);
  assert.equal(result.score, 1);
  assert.equal(result.correctCount, 2);
  assert.equal(result.answeredCount, 3);
  assert.equal(result.unansweredCount, exam.questions.length - 3);
  assert.equal(result.details.find((item) => item.questionId === trueFalse.id).points, 0.5);
  assert.equal(result.details.find((item) => item.questionId === short.id).correct, true);
});

test("đề luyện cũ vẫn được chấm đều trên thang 10", () => {
  const exam = PRACTICE_EXAMS_2026.find((item) => item.subject === "Ngữ văn");
  const answers = {
    [exam.questions[0].id]: exam.questions[0].answer,
    [exam.questions[1].id]: (exam.questions[1].answer + 1) % exam.questions[1].options.length
  };
  const result = gradePracticeExam(exam, answers);
  assert.equal(result.correctCount, 1);
  assert.equal(result.answeredCount, 2);
  assert.equal(result.score, 2);
});

test("trạng thái đã trả lời nhận đủ ba dạng câu", () => {
  assert.equal(isPracticeQuestionAnswered({ type: "single" }, 0), true);
  assert.equal(isPracticeQuestionAnswered({ type: "true-false" }, [null, false, null, null]), true);
  assert.equal(isPracticeQuestionAnswered({ type: "short" }, "  "), false);
  assert.equal(isPracticeQuestionAnswered({ type: "short" }, "7,35"), true);
});

test("đồng hồ tiếp tục đúng sau khi tải lại trang", () => {
  const now = 1_000_000;
  const attempt = createPracticeAttempt({ id: "demo", durationMinutes: 12 }, now);
  assert.equal(remainingExamSeconds(attempt, now + 90_000), 630);
  assert.equal(formatExamTime(630), "10:30");
  assert.equal(remainingExamSeconds(attempt, attempt.endsAt + 1), 0);
});

test("Tin học giữ đủ hai định hướng nhưng mỗi lượt chỉ chấm một định hướng", () => {
  const exam = PRACTICE_EXAMS_2026.find((item) => item.subject === "Tin học");
  assert.deepEqual(exam.answerBranches, ["Khoa học máy tính", "Tin học ứng dụng"]);
  assert.equal(exam.questions.length, 30);
  assert.equal(exam.questionCount, 28);
  const attempt = createPracticeAttempt(exam, 1_000);
  assert.equal(attempt.branch, "Khoa học máy tính");
});

test("lịch sử được sắp xếp mới nhất và giới hạn số lần", () => {
  const value = Array.from({ length: 35 }, (_, index) => ({ id: `a-${index}`, examId: "demo", submittedAt: index }));
  const history = normalizePracticeHistory(value);
  assert.equal(history.length, 30);
  assert.equal(history[0].submittedAt, 34);
});
