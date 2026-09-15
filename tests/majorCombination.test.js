import assert from "node:assert/strict";
import test from "node:test";
import { majorHasCombination, normalizeCombinationCode, parseCombinationCodes } from "../lib/majorCombination.js";

test("parser tách chính xác danh sách tổ hợp và loại trùng", () => {
  assert.deepEqual(parseCombinationCodes(" A00; A01, D01 / D07 | A01 "), ["A00", "A01", "D01", "D07"]);
  assert.equal(normalizeCombinationCode(" d01 "), "D01");
});

test("lọc tổ hợp dùng token chính xác, không dùng includes chuỗi", () => {
  const major = { combination: "A00; A010; D01" };
  assert.equal(majorHasCombination(major, "A01"), false);
  assert.equal(majorHasCombination(major, "A010"), true);
  assert.equal(majorHasCombination(major, "d01"), true);
});

test("valid-code catalog loại token không tồn tại", () => {
  assert.deepEqual(parseCombinationCodes("A00; FAKE; D01", new Set(["A00", "D01"])), ["A00", "D01"]);
});
