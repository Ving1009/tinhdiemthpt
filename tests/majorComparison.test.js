import assert from "node:assert/strict";
import test from "node:test";
import { chooseBestCombination, comparisonCompatibility, comparisonContextKey } from "../lib/majorComparison.js";

const major = {
  id: "m1", universityId: "u1", code: "7480201", name: "Công nghệ thông tin", combination: "A00; A01",
  method: "THPT", methodDetails: "Chương trình chuẩn", formula: "verified-formula", calculationVerified: true,
  comparisonRules: { A00: "three-subject-sum-priority-2026", A01: "three-subject-sum-priority-2026" },
  cutoff: { year: 2026, score: 25, scale: 30, status: "verified" }
};

test("chọn tổ hợp có lợi nhất và xử lý hòa điểm theo mã ổn định", () => {
  const result = chooseBestCombination(major, [
    { combination: "A01", score: 26, scale: 30, year: 2026, method: "THPT", ruleId: "three-subject-sum-priority-2026" },
    { combination: "A00", score: 27, scale: 30, year: 2026, method: "THPT", ruleId: "three-subject-sum-priority-2026" }
  ]);
  assert.equal(result.best.combination, "A00");
  assert.equal(result.best.difference, 2);
  const tied = chooseBestCombination(major, [
    { combination: "A01", score: 27, scale: 30, year: 2026, method: "THPT", ruleId: "three-subject-sum-priority-2026" },
    { combination: "A00", score: 27, scale: 30, year: 2026, method: "THPT", ruleId: "three-subject-sum-priority-2026" }
  ]);
  assert.equal(tied.best.combination, "A00");
});

test("không so sánh khi khác thang, năm, phương thức hoặc quy tắc", () => {
  const base = { combination: "A00", score: 26, scale: 30, year: 2026, method: "THPT", ruleId: "three-subject-sum-priority-2026" };
  assert.equal(comparisonCompatibility(major, base).compatible, true);
  assert.equal(comparisonCompatibility(major, { ...base, scale: 40 }).compatible, false);
  assert.equal(comparisonCompatibility(major, { ...base, year: 2025 }).compatible, false);
  assert.equal(comparisonCompatibility(major, { ...base, method: "Học bạ" }).compatible, false);
  assert.equal(comparisonCompatibility(major, { ...base, ruleId: "weighted" }).compatible, false);
});

test("không gộp nhầm chương trình hoặc điều kiện phương thức", () => {
  assert.notEqual(comparisonContextKey(major), comparisonContextKey({ ...major, methodDetails: "Chương trình tiên tiến" }));
  assert.notEqual(comparisonContextKey(major), comparisonContextKey({ ...major, campus: "Cơ sở 2" }));
});
