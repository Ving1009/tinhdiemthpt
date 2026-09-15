import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateAutomaticCombinations, findMatchingCombinations, validateSubjectEntries } from "../public/js/core/thptCombinations.js";
import { isStandardCombination } from "../public/js/core/subjectMatching.js";

const combinations = JSON.parse(await readFile(new URL("../data/combinations.json", import.meta.url), "utf8"));
const entry = (subjectKey, score = 8) => ({ subjectKey, score });

test("bốn môn Toán, Lí, Hóa, Anh chỉ tạo các tổ hợp thật và xếp điểm giảm dần", () => {
  const result = calculateAutomaticCombinations({
    entries: [entry("math", "8,5"), entry("physics", 8), entry("chemistry", 7.5), entry("foreignLanguage:english", 9)],
    combinations,
    priorityContext: { area: "KV3", priorityGroup: "none" }
  });
  assert.equal(result.valid, true);
  const codes = result.results.map(({ combination }) => combination.code);
  assert.deepEqual(codes.slice(0, 3), ["A01", "D07", "A00"]);
  assert.deepEqual(result.results.slice(0, 3).map(({ result: item }) => item.examScore), [25.5, 25, 24]);
  assert.ok(result.results.every(({ combination }) => combinations.some((item) => item.id === combination.id)));
});

test("calculator tiêu chuẩn chỉ nhận tổ hợp đúng ba môn tiêu chuẩn", () => {
  const standard = combinations.find((item) => item.code === "A00");
  assert.equal(isStandardCombination(standard), true);
  assert.equal(isStandardCombination({ id: "art", code: "H00", subjectIds: ["literature", "ve-my-thuat-1", "ve-my-thuat-2"], subjects: ["Ngữ văn", "Vẽ 1", "Vẽ 2"] }), false);
  assert.equal(isStandardCombination({ code: "BAD", subjectIds: ["math", "physics", "chemistry", "biology"], subjects: ["Toán", "Lí", "Hóa", "Sinh"] }), false);
});

test("matcher không tự đặt mã cho tổ hợp không có trong catalog", () => {
  const catalog = [{ id: "a00", code: "A00", subjectIds: ["math", "physics", "chemistry"], subjects: ["Toán", "Vật lí", "Hóa học"] }];
  const matches = findMatchingCombinations([entry("math"), entry("physics"), entry("chemistry"), entry("biology")], catalog);
  assert.deepEqual(matches.map((item) => item.code), ["A00"]);
});

test("validation từ chối môn trùng, thiếu môn và điểm không hợp lệ", () => {
  assert.equal(validateSubjectEntries([entry("math"), entry("math"), entry("physics"), entry("chemistry")]).valid, false);
  assert.equal(validateSubjectEntries([entry("math"), entry("physics"), entry("chemistry")]).valid, false);
  assert.equal(validateSubjectEntries([entry("math", -1), entry("physics"), entry("chemistry"), entry("biology")]).valid, false);
  assert.equal(validateSubjectEntries([entry("math", 11), entry("physics"), entry("chemistry"), entry("biology")]).valid, false);
  assert.equal(validateSubjectEntries([entry("math", "abc"), entry("physics"), entry("chemistry"), entry("biology")]).valid, false);
  assert.equal(validateSubjectEntries([entry("math", "8.123"), entry("physics"), entry("chemistry"), entry("biology")]).valid, false);
});

test("validation nhận số nguyên, dấu phẩy và tối đa hai chữ số thập phân", () => {
  const result = validateSubjectEntries([entry("math", 8), entry("physics", "8.5"), entry("chemistry", "8,25"), entry("biology", "0.00")]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.entries.map((item) => item.score), [8, 8.5, 8.25, 0]);
});

test("điểm ưu tiên được tính riêng trên điểm của từng tổ hợp", () => {
  const result = calculateAutomaticCombinations({
    entries: [entry("math", 8.5), entry("physics", 8), entry("chemistry", 7.5), entry("foreignLanguage:english", 9)],
    combinations,
    priorityContext: { area: "KV1", priorityGroup: "none" }
  });
  const a01 = result.results.find(({ combination }) => combination.code === "A01").result;
  const a00 = result.results.find(({ combination }) => combination.code === "A00").result;
  assert.notEqual(a01.priority.adjusted, a00.priority.adjusted);
  assert.ok(result.results.every((item, index, rows) => index === 0 || rows[index - 1].result.total >= item.result.total));
});

test("Tiếng Anh chỉ khớp đúng mã ngoại ngữ tiếng Anh", () => {
  const matches = findMatchingCombinations([
    entry("math"), entry("literature"), entry("history"), entry("foreignLanguage:english")
  ], combinations).map((item) => item.code);
  assert.ok(matches.includes("D01"));
  for (const wrong of ["D03", "D04", "D05", "D06", "D28", "AH3"]) assert.equal(matches.includes(wrong), false, `không được match ${wrong}`);
});

test("Toán, Lí, Anh khớp A01 và không khớp mã dùng ngoại ngữ khác", () => {
  const matches = findMatchingCombinations([
    entry("math"), entry("physics"), entry("geography"), entry("foreignLanguage:english")
  ], combinations).map((item) => item.code);
  assert.ok(matches.includes("A01"));
  for (const wrong of ["D28", "AH3"]) assert.equal(matches.includes(wrong), false, `không được match ${wrong}`);
});
