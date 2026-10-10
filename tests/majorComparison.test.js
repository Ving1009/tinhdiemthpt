import assert from "node:assert/strict";
import test from "node:test";
import { chooseBestCombination, comparisonCompatibility, comparisonContextKey, sortComparedMajors } from "../lib/majorComparison.js";

test("sắp theo điểm đúng chiều, giữ riêng phương thức/thang điểm và đẩy điểm thiếu xuống cuối", () => {
  const rows = [
    { ...major, id: "thpt-low", cutoff: { ...major.cutoff, score: 20 } },
    { ...major, id: "thpt-high", cutoff: { ...major.cutoff, score: 29 }, comparison: { compatible: true, difference: -3 } },
    { ...major, id: "thpt-missing", cutoff: { ...major.cutoff, score: null, status: "not_published" } },
    { ...major, id: "hsa-high", method: "ĐGNL HSA", cutoff: { ...major.cutoff, score: 110, scale: 150 } },
    { ...major, id: "hsa-low", method: "ĐGNL HSA", cutoff: { ...major.cutoff, score: 90, scale: 150 } },
    { ...major, id: "academic", method: "Học bạ", cutoff: { ...major.cutoff, score: 27 } },
    { ...major, id: "thpt-40", cutoff: { ...major.cutoff, score: 32, scale: 40 } }
  ];
  for (const sort of ["cutoff-asc", "cutoff-desc"]) {
    const sorted = sortComparedMajors(rows, sort);
    assert.equal(sorted.at(-1).id, "thpt-missing");
    assert.deepEqual(sorted.filter(item => item.method === "THPT" && item.cutoff.scale === 30 && item.cutoff.score !== null).map(item => item.id), sort === "cutoff-asc" ? ["thpt-low", "thpt-high"] : ["thpt-high", "thpt-low"]);
    assert.deepEqual(sorted.filter(item => item.method === "ĐGNL HSA").map(item => item.id), sort === "cutoff-asc" ? ["hsa-low", "hsa-high"] : ["hsa-high", "hsa-low"]);
  }
  assert.equal(rows[0].id, "thpt-low", "không sửa thứ tự dữ liệu đầu vào");
});

test("sắp tên ngành dùng thứ tự tiếng Việt và gần điểm dùng độ lệch tuyệt đối", () => {
  const rows = [
    { ...major, id: "z", name: "Toán", comparison: { compatible: true, difference: 5 } },
    { ...major, id: "a", name: "An toàn thông tin" },
    { ...major, id: "k", name: "Kế toán", comparison: { compatible: true, difference: -0.1 } },
    { ...major, id: "s", name: "Sư phạm Toán", comparison: { compatible: true, difference: 0.4 } }
  ];
  assert.deepEqual(sortComparedMajors(rows, "major-asc").map(item => item.id), ["a", "k", "s", "z"]);
  assert.deepEqual(sortComparedMajors(rows, "major-desc").map(item => item.id), ["z", "s", "k", "a"]);
  assert.deepEqual(sortComparedMajors(rows, "difference-nearest").map(item => item.id), ["k", "s", "z", "a"]);
  assert.deepEqual(sortComparedMajors(rows, "difference-desc").map(item => item.id), ["z", "s", "k", "a"]);
  assert.deepEqual(sortComparedMajors(rows, "difference-asc").map(item => item.id), ["k", "s", "z", "a"]);
});

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
