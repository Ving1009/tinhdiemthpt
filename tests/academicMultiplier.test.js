import assert from "node:assert/strict";
import test from "node:test";
import { calculateAcademicCombinations } from "../public/js/core/academicCalculator.js";
import { Calculator } from "../public/js/calculator.js";

const combinations = [
  { id: "d01", code: "D01", subjectIds: ["math", "literature", "foreignLanguage"], subjects: ["Toán", "Ngữ văn", "Tiếng Anh"], subjectText: "Toán, Ngữ văn, Tiếng Anh" },
  { id: "a00", code: "A00", subjectIds: ["math", "physics", "chemistry"], subjects: ["Toán", "Vật lí", "Hóa học"], subjectText: "Toán, Vật lí, Hóa học" }
];
const scores = {
  math: { grade12: 8 }, literature: { grade12: 7 }, foreignLanguage: { grade12: 9 },
  physics: { grade12: 7.5 }, chemistry: { grade12: 7 }
};

test("tắt hệ số giữ hành vi thang 30", () => {
  const result = calculateAcademicCombinations({ combinations, scores, methodId: "grade-12", languageLabel: "Tiếng Anh" });
  const d01 = result.results.find((item) => item.combination.code === "D01").result;
  assert.equal(d01.examScore, 24);
  assert.equal(d01.maxScore, 30);
  assert.equal(d01.priorityApplied, true);
});

test("bật hệ số 2 nhân đúng môn, giữ raw scale 40 và chưa cộng ưu tiên thang 30", () => {
  const result = calculateAcademicCombinations({
    combinations, scores, methodId: "grade-12", languageLabel: "Tiếng Anh",
    priorityContext: { area: "KV1", priorityGroup: "UT1" }, multiplierEnabled: true, multiplierSubject: "foreignLanguage:english"
  });
  assert.equal(result.scale, 40);
  assert.deepEqual(result.results.map((item) => item.combination.code), ["D01"]);
  const d01 = result.results[0].result;
  assert.equal(d01.rawScore, 33);
  assert.equal(d01.examScore, 33);
  assert.equal(d01.total, 33);
  assert.equal(d01.maxScore, 40);
  assert.equal(d01.priority.adjusted, 0);
  assert.equal(d01.priorityApplied, false);
  assert.equal(d01.breakdown.find((item) => item.label.includes("Tiếng Anh")).weight, 2);
  assert.equal(d01.breakdown.find((item) => item.label.includes("Toán")).weight, 1);
});

test("môn hệ số phải thuộc tổ hợp và ranking không trộn thang điểm", () => {
  const result = calculateAcademicCombinations({ combinations, scores, methodId: "grade-12", languageLabel: "Tiếng Anh", multiplierEnabled: true, multiplierSubject: "math" });
  assert.equal(result.results.length, 2);
  assert.ok(result.results.every((item) => item.result.maxScore === 40));
  assert.ok(result.results.every((item, index, rows) => index === 0 || rows[index - 1].result.total >= item.result.total));
  const missing = calculateAcademicCombinations({ combinations, scores, methodId: "grade-12", languageLabel: "Tiếng Anh", multiplierEnabled: true, multiplierSubject: "biology" });
  assert.equal(missing.results.length, 0);
});

test("fixture quy tắc trường đã xác minh chuẩn hóa /40 về /30 trước khi cộng ưu tiên", () => {
  const result = Calculator.calculate({
    formula: "hocba-example",
    method: "grade-12",
    academicScores: { math: scores.math, literature: scores.literature, foreignLanguage: scores.foreignLanguage },
    subjects: ["math", "literature", "foreignLanguage"],
    subjectLabels: { math: "Toán", literature: "Ngữ văn", foreignLanguage: "Tiếng Anh" },
    subjectMultipliers: { foreignLanguage: 2 },
    normalization: { type: "linear", verified: true, outputScale: 30 },
    priorityApplication: "after-normalization",
    priorityContext: { area: "KV1", priorityGroup: "none" }
  });
  assert.equal(result.rawScore, 33);
  assert.equal(result.rawScale, 40);
  assert.equal(result.examScore, 24.75);
  assert.equal(result.maxScore, 30);
  assert.equal(result.normalizationApplied, true);
  assert.equal(result.priorityApplied, true);
  assert.equal(result.priority.adjusted, 0.53);
  assert.equal(result.total, 25.28);
});

test("normalization chưa xác minh không được áp dụng", () => {
  const result = Calculator.calculate({
    formula: "hocba-example", method: "grade-12",
    academicScores: { math: scores.math, literature: scores.literature, foreignLanguage: scores.foreignLanguage },
    subjects: ["math", "literature", "foreignLanguage"], subjectMultipliers: { foreignLanguage: 2 },
    normalization: { type: "linear", verified: false, outputScale: 30 }, priorityApplication: "after-normalization",
    priorityContext: { area: "KV1" }
  });
  assert.equal(result.total, 33);
  assert.equal(result.maxScore, 40);
  assert.equal(result.normalizationApplied, false);
  assert.equal(result.priorityApplied, false);
});
