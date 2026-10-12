import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { PRACTICE_EXAMS_2026 } from "../public/js/data/practiceExams2026.js";
import { OFFICIAL_QUESTION_FIGURES_2026 } from "../public/js/data/officialQuestionFigures2026.js";
import { PracticeExamApp } from "../public/js/practiceExam.js";
import { gradePracticeExam } from "../public/js/core/practiceExam.js";

const questionsWithFigures = PRACTICE_EXAMS_2026.flatMap(exam =>
  exam.questions.filter(question => question.figures?.length).map(question => ({ exam, question }))
);

test("mọi hình đã đối chiếu gắn với đúng câu và trang đề gốc có sẵn", () => {
  const attached = questionsWithFigures.flatMap(({ question }) => question.figures);
  assert.equal(questionsWithFigures.length, 65);
  assert.equal(attached.length, 67);
  assert.equal(new Set(attached.map(figure => figure.src)).size, 57);
  for (const [slug, questionFigures] of Object.entries(OFFICIAL_QUESTION_FIGURES_2026)) {
    const exam = PRACTICE_EXAMS_2026.find(item => item.pageImages?.[0].includes(`/${slug}/`));
    assert.ok(exam, `Không có đề cho ${slug}`);
    for (const [key, figures] of Object.entries(questionFigures)) {
      const question = exam.questions.find(item => `${item.type}:${item.number}${item.branch ? `:${item.branch}` : ""}` === key);
      assert.ok(question, `Không có câu ${slug}/${key}`);
      assert.deepEqual(question.figures, figures);
      for (const figure of figures) {
        assert.match(figure.src, /^assets\/practice-2026\/[a-z-]+\/figures\/[a-z0-9-]+\.webp$/);
        assert.ok(existsSync(new URL(`../public/${figure.src}`, import.meta.url)), figure.src);
        assert.ok(exam.pageImages.includes(figure.sourcePage), `Hình thuộc trang đề, không phải trang lời giải: ${figure.src}`);
        assert.ok(existsSync(new URL(`../public/${figure.sourcePage}`, import.meta.url)), figure.sourcePage);
        assert.ok(figure.alt && Number.isInteger(figure.width) && figure.width > 0 && Number.isInteger(figure.height) && figure.height > 0);
      }
    }
  }
});

test("hình hiện ở câu hỏi và xem lại, không đổi đáp án chấm điểm", () => {
  const app = new PracticeExamApp({ querySelector: () => null, querySelectorAll: () => [] });
  for (const { exam, question } of questionsWithFigures) {
    const answer = question.type === "short" ? question.answerText : question.answer;
    const result = gradePracticeExam(exam, { [question.id]: answer });
    const detail = result.details.find(item => item.questionId === question.id);
    assert.equal(detail.correct, true, question.id);
    for (const html of [app.renderQuestion(question, 0, {}, new Set()), app.renderReview(question, 0, detail)]) {
      assert.equal((html.match(/class="practice-question-figure"/g) || []).length, question.figures.length);
      for (const figure of question.figures) {
        assert.ok(html.includes(`src="/${figure.src}"`), question.id);
        assert.ok(html.includes(`href="/${figure.src}"`), question.id);
        assert.ok(html.includes(`width="${figure.width}" height="${figure.height}"`), question.id);
      }
    }
  }
});

test("hình không nhận URL bên ngoài và văn bản thay thế được escape", () => {
  const app = new PracticeExamApp({ querySelector: () => null, querySelectorAll: () => [] });
  const original = questionsWithFigures[0].question;
  const question = { ...original, figures: [
    { ...original.figures[0], alt: '"<script>alert(1)</script>' },
    { src: "https://example.com/track.webp", alt: "Không tải" },
    { src: "javascript:alert(1)", alt: "Không tải" }
  ] };
  const html = app.renderQuestion(question, 0, {}, new Set());
  assert.equal((html.match(/class="practice-question-figure"/g) || []).length, 1);
  assert.doesNotMatch(html, /<script>|example\.com|javascript:/);
  assert.match(html, /&quot;&lt;script&gt;/);
});

test("hình Tin học đúng nhánh và hai câu Vật lí dùng chung dữ kiện gốc", () => {
  const informatics = PRACTICE_EXAMS_2026.find(exam => exam.subject === "Tin học");
  const branches = informatics.questions.filter(question => question.type === "true-false" && question.number === 3);
  assert.equal(branches.find(question => question.branch === "Khoa học máy tính").figures.length, 1);
  assert.ok(informatics.questions.filter(question => question.branch === "Tin học ứng dụng").every(question => question.figures.length === 0));
  const physics = PRACTICE_EXAMS_2026.find(exam => exam.subject === "Vật lí");
  const shared = physics.questions.filter(question => question.type === "short" && [1, 2].includes(question.number));
  assert.equal(shared.length, 2);
  assert.ok(shared[0].context);
  assert.equal(shared[0].context, shared[1].context);
  assert.deepEqual(shared[0].figures, shared[1].figures);
});

test("Hóa có đủ trang đề thứ năm và câu ngắn khớp dữ kiện gốc", () => {
  const chemistry = PRACTICE_EXAMS_2026.find(exam => exam.subject === "Hóa học");
  assert.equal(chemistry.pageImages.length, 5);
  assert.equal(chemistry.pageImages[4], "assets/practice-2026/chemistry/solutions/1.webp");
  assert.equal(chemistry.solutionImages.length, 7);
  assert.equal(chemistry.solutionImages.some(src => chemistry.pageImages.includes(src)), false);
  const short = chemistry.questions.filter(question => question.type === "short");
  for (const [number, pattern] of [[2, /Haber/], [3, /ester/i], [4, /Portland/], [5, /điện cực/], [6, /saccharose/i]]) {
    const question = short.find(item => item.number === number);
    assert.match(`${question.context} ${question.prompt}`, pattern);
  }
});
