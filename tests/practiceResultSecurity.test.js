import assert from "node:assert/strict";
import test from "node:test";
import { PracticeExamApp } from "../public/js/practiceExam.js";
import { PRACTICE_EXAMS_2026 } from "../public/js/data/practiceExams2026.js";
import { gradePracticeExam, normalizePracticeHistory } from "../public/js/core/practiceExam.js";

test("restored practice result counters cannot inject HTML into the result or question review", () => {
  const exam = PRACTICE_EXAMS_2026.find(item => item.subject === "Toán");
  const payload = '<img src="/invalid-security-probe" onerror="window.practiceInjected=true"><a href="https://example.invalid">Xác minh tài khoản</a>';
  const result = gradePracticeExam(exam, {});
  for (const key of ["correctCount", "totalQuestions", "answeredCount", "unansweredCount"]) result[key] = payload;
  result.details.find(item => item.correctItems !== null && item.correctItems !== undefined).correctItems = payload;
  const restored = normalizePracticeHistory(JSON.parse(JSON.stringify([
    { id: "security-test", examId: exam.id, submittedAt: Date.now(), result }
  ])))[0];
  const root = { innerHTML: "", scrollIntoView() {} };
  new PracticeExamApp(root).renderResult(restored);
  assert.match(root.innerHTML, /practice-review-list/);
  assert.doesNotMatch(root.innerHTML, /<img src="\/invalid-security-probe"|<a href="https:\/\/example\.invalid"/);
  assert.doesNotMatch(root.innerHTML, /practiceInjected/);
});

test("incomplete restored practice results remain readable without trusting their shape", () => {
  const exam = PRACTICE_EXAMS_2026.find(item => item.subject === "Toán");
  const root = { innerHTML: "", scrollIntoView() {} };
  const app = new PracticeExamApp(root);
  for (const details of [null, {}, [null], []]) {
    assert.doesNotThrow(() => app.renderResult({ examId: exam.id, result: { score: "2.5", details } }));
    assert.match(root.innerHTML, /2\.50<span>\/10/);
    assert.match(root.innerHTML, /practice-review-list/);
  }
});
