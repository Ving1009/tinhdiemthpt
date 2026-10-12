import assert from "node:assert/strict";
import test from "node:test";
import { PRACTICE_EXAMS_2026 } from "../public/js/data/practiceExams2026.js";
import { PracticeExamApp } from "../public/js/practiceExam.js";
import { createPracticeAttempt, gradePracticeExam } from "../public/js/core/practiceExam.js";

function practiceApp() {
  const root = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], scrollIntoView() {} };
  const app = new PracticeExamApp(root);
  app.history = [];
  app.active = null;
  app.startTimer = () => {};
  return app;
}

test("danh sách đề ghi nguồn cung cấp, không suy ra xác minh chính thức từ sourceKind", () => {
  const app = practiceApp();
  app.renderDashboard();
  assert.equal((app.root.innerHTML.match(/class="practice-subject-card"/g) || []).length, 18);
  assert.equal((app.root.innerHTML.match(/class="practice-category">Tài liệu 2026/g) || []).length, 17);
  assert.equal((app.root.innerHTML.match(/Nguồn: Đề thi do người dùng cung cấp/g) || []).length, 17);
  assert.equal((app.root.innerHTML.match(/Nguồn: Tính Điểm THPT tự biên soạn/g) || []).length, 1);
  assert.match(app.root.innerHTML, /đề luyện ngắn, không phải đề chính thức/);
  assert.doesNotMatch(app.root.innerHTML, /class="practice-category[^>]*>Đề chính thức/);
});

test("bài đang làm giữ tên tài liệu nhưng phân biệt nguồn và đáp án tham khảo", () => {
  const app = practiceApp();
  const exam = PRACTICE_EXAMS_2026.find(item => item.subject === "Toán");
  app.active = createPracticeAttempt(exam);
  app.renderExam();
  assert.match(app.root.innerHTML, /Luyện thi THPT 2027 · Tài liệu tham khảo 2026/);
  assert.ok(app.root.innerHTML.includes(exam.title));
  assert.match(app.root.innerHTML, /Nguồn: Đề thi do người dùng cung cấp/);
  assert.match(app.root.innerHTML, /chưa phải xác nhận nguồn chính thức/);
  assert.match(app.root.innerHTML, /đáp án và lời giải chỉ để tham khảo/);
  assert.match(app.root.innerHTML, /data-submit-exam/);
  assert.match(app.root.innerHTML, /id="practice-timer"/);
});

test("kết quả nêu nguồn chấm và không gắn nguồn lời giải với xác nhận chính thức", () => {
  const app = practiceApp();
  for (const subject of ["Toán", "Công nghệ công nghiệp"]) {
    const exam = PRACTICE_EXAMS_2026.find(item => item.subject === subject);
    const attempt = createPracticeAttempt(exam);
    attempt.result = gradePracticeExam(exam, {});
    app.renderResult(attempt);
    assert.match(app.root.innerHTML, /Nguồn: Đề thi do người dùng cung cấp/);
    assert.match(app.root.innerHTML, /Kết quả dựa trên đáp án đã số hóa/);
    assert.match(app.root.innerHTML, /href="\/lien-he\/"/);
    if (exam.solutionImages?.length) assert.match(app.root.innerHTML, /Ảnh lời giải tham khảo để đối chiếu/);
    if (exam.answerSource) {
      assert.ok(app.root.innerHTML.includes(`href="${exam.answerSource}"`));
      assert.match(app.root.innerHTML, /Liên kết này không tự xác nhận đây là đáp án chính thức/);
    }
    assert.doesNotMatch(app.root.innerHTML, /Ảnh lời giải gốc/);
  }
});

test("sáu câu trả lời ngắn Sinh học khớp trang 5–6 của tài liệu thay vì ghép câu khác", () => {
  const exam = PRACTICE_EXAMS_2026.find(item => item.subject === "Sinh học");
  const questions = exam.questions.filter(item => item.type === "short");
  const topics = [/70 và 55 nhịp\/phút/, /3 hạt màu nâu : 3 hạt màu vàng/, /quá trình diễn thế trên vùng đất trống/, /co nguyên sinh/, /malate dehydrogenase/, /quần thể cây ngải dại/];
  questions.forEach((question, index) => assert.match(question.prompt, topics[index]));
  assert.deepEqual(questions.map(item => item.id), Array.from({ length: 6 }, (_, index) => `${exam.id}-short-${index + 1}`));
  assert.deepEqual(questions.map(item => item.answerText), ["0,12", "25,00%", "2603", "3142", "0,35", "1480"]);
  const answers = Object.fromEntries(questions.map(item => [item.id, item.answerText]));
  const result = gradePracticeExam(exam, answers);
  assert.equal(result.correctCount, 6);
  assert.equal(result.score, 1.5);
  assert.match(questions[2].prompt, /trang 5.*Đối chiếu đề gốc/);
  assert.match(questions[4].prompt, /M₁M₃: 119; M₂M₂: 48; M₂M₃: 108; M₃M₃: 61/);
  assert.match(questions[5].prompt, /16, 14, 17, 15 và 12/);
});

test("trang 5–6 chứa câu hỏi Sinh học nằm trong đề gốc, không bị gọi nhầm là lời giải", () => {
  const exam = PRACTICE_EXAMS_2026.find(item => item.subject === "Sinh học");
  assert.equal(exam.pageImages.length, 6);
  assert.deepEqual(exam.pageImages.slice(-2), ["assets/practice-2026/biology/solutions/1.webp", "assets/practice-2026/biology/solutions/2.webp"]);
  assert.equal(exam.solutionImages.length, 16);
  assert.equal(exam.solutionImages.some(image => exam.pageImages.includes(image)), false);
  assert.equal(exam.solutionImages[0], "assets/practice-2026/biology/solutions/3.webp");
});

test("ký hiệu allele và phép tính Sinh học đã khôi phục theo tài liệu, không còn chỗ trống", () => {
  const exam = PRACTICE_EXAMS_2026.find(item => item.subject === "Sinh học");
  const question = (type, number) => exam.questions.find(item => item.type === type && item.number === number);
  assert.match(question("single", 8).explanation, /w⁺/);
  assert.match(question("single", 8).explanation, /w⁻/);
  assert.match(question("single", 8).explanation, /Xʷ⁺Y/);
  assert.match(question("single", 18).explanation, /MM × mm/);
  assert.match(question("single", 18).explanation, /100% kiểu gene Mm/);
  assert.match(question("short", 1).explanation, /6\/11 − 3\/7 = 9\/77/);
  assert.match(question("short", 2).explanation, /YyGg × Yygg/);
  assert.match(question("short", 5).explanation, /119 \+ 108 \+ 122 = 349/);
  assert.match(question("short", 5).explanation, /349\/1000 = 0,349/);
  assert.match(question("short", 6).explanation, /0,148 × 10000 = 1480/);
  assert.match(question("true-false", 1).explanation, /306\/3 = 102 amino acid/);
  assert.match(question("true-false", 2).explanation, /cá Dᵢ/);
  assert.match(question("true-false", 2).explanation, /12,4 − 3,9 = 8,5/);
  assert.match(question("true-false", 4).explanation, /XᴬXᵃ/);
  assert.match(question("true-false", 4).explanation, /\(1\/4\) × \(1\/3\) = 1\/12/);
  assert.equal(Math.round(((119 + 108 + 2 * 61) / (2 * 500)) * 100) / 100, 0.35);
});
