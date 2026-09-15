import assert from "node:assert/strict";
import test from "node:test";
import { createFinderScoreContext, createScoreProfile, finderContextIsFresh, formatFinderScoreContext } from "../public/js/core/scoreState.js";

test("ngữ cảnh tìm ngành giữ đúng điểm hiển thị của từng tổ hợp", () => {
  const profile = createScoreProfile({ type: "THPT", method: "THPT", year: 2026, inputVersion: 4, priorityContext: { area: "KV1", priorityGroup: "none" }, results: [
    { combination: "A00", score: 25, scale: 30, ruleId: "three-subject-sum-priority-2026" },
    { combination: "A01", score: 24.5, scale: 30, ruleId: "three-subject-sum-priority-2026" }
  ] });
  const context = createFinderScoreContext(profile);
  assert.equal(context.results[0].score, 25);
  assert.match(formatFinderScoreContext(context, (value) => value.toFixed(2)), /A00 — 25\.00\/30/);
  assert.match(formatFinderScoreContext(context, (value) => value.toFixed(2)), /A01 — 24\.50\/30/);
  assert.equal(finderContextIsFresh(context, profile), true);
});

test("sửa hoặc xóa điểm làm ngữ cảnh tìm kiếm cũ hết hiệu lực", () => {
  const original = createScoreProfile({ type: "THPT", method: "THPT", year: 2026, inputVersion: 1, results: [{ combination: "A00", score: 25, scale: 30 }] });
  const context = createFinderScoreContext(original);
  const edited = createScoreProfile({ type: "THPT", method: "THPT", year: 2026, inputVersion: 2, results: [{ combination: "A00", score: 24, scale: 30 }] });
  assert.equal(finderContextIsFresh(context, edited), false);
  assert.equal(finderContextIsFresh(context, null), false);
});
