import assert from "node:assert/strict";
import test from "node:test";
import { bkaThptFormula } from "../public/formulas/universities/bka-thpt.js";

test("công thức BKA A00 tính tổng ba môn và giải thích", () => {
  const result = bkaThptFormula.calculate({ combinationCode: "A00", scores: { math: 9, physics: 8, chemistry: 7 }, priorityContext: { area: "KV3", priorityGroup: "none" } });
  assert.equal(result.examScore, 24);
  assert.equal(result.total, 24);
  assert.equal(result.maxScore, 30);
  assert.equal(result.comparisonRule, "three-subject-sum-priority-2026");
  assert.equal(result.breakdown.length, 3);
});

test("BKA áp dụng Toán hệ số 2 cho chương trình có môn chính và điều chỉnh ưu tiên", () => {
  const result = bkaThptFormula.calculate({ combinationCode: "A00", mathIsMain: true, scores: { math: 9, physics: 8, chemistry: 7 }, priorityContext: { area: "KV1" } });
  assert.equal(result.examScore, 24.75);
  assert.equal(result.priority.adjusted, 0.53);
  assert.equal(result.total, 25.28);
  assert.equal(result.breakdown.find((item) => item.label === "Toán").weight, 2);
  assert.equal(result.comparisonRule, "bka-math-main-priority-2026");
});

test("công thức BKA K01 áp dụng đúng trọng số và không dùng UTH120", () => {
  const result = bkaThptFormula.calculate({ combinationCode: "K01", choiceSubject: "physics", scores: { math: 9, literature: 8, physics: 9 }, priorityContext: { area: "KV3", priorityGroup: "none" } });
  assert.equal(result.examScore, 26.5);
  assert.equal(result.total, 26.5);
  assert.equal(result.comparisonRule, "bka-k01-weighted-priority-2026");
  assert.doesNotMatch(result.formula, /UTH120/i);
});
