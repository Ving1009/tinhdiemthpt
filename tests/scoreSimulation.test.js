import assert from "node:assert/strict";
import test from "node:test";
import { simulateScoreChange } from "../public/js/core/scoreSimulation.js";

test("mô phỏng tính trên bản sao và không sửa điểm thật", () => {
  const entries = [{ subjectKey: "math", score: 7 }, { subjectKey: "physics", score: 8 }];
  const result = simulateScoreChange({ entries, subjectKey: "math", delta: 1, calculate: (items) => items.reduce((sum, item) => sum + item.score, 0) });
  assert.equal(entries[0].score, 7);
  assert.equal(result.before, 15);
  assert.equal(result.after, 16);
  assert.equal(result.simulatedScore, 8);
});

test("mô phỏng từ chối điểm vượt khoảng", () => {
  assert.throws(() => simulateScoreChange({ entries: [{ subjectKey: "math", score: 10 }], subjectKey: "math", delta: 0.5, calculate: () => 0 }), /0 đến 10/);
});
