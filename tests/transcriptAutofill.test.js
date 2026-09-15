import assert from "node:assert/strict";
import test from "node:test";
import { autoFillTranscript, buildTranscriptAutofillPlan } from "../public/js/autoFillTranscript.js";

function fakeRoot(initial = {}) {
  const fields = new Map(Object.entries(initial).map(([id, value]) => [id, { value, dispatchEvent() {} }]));
  return { fields, getElementById(id) { return fields.get(id) || null; } };
}

test("Công nghệ có định hướng được ánh xạ đúng và không chép sang hai môn", () => {
  const plan = buildTranscriptAutofillPlan({ scores: [{ subject: "Công nghệ công nghiệp", grade: 12, year: 8.5, confidence: 0.9 }] }, { methodId: "grade-12" });
  assert.deepEqual(plan.assignments.map((item) => item.fieldId), ["academic-industrialTechnology-grade12"]);
  const ambiguous = buildTranscriptAutofillPlan({ scores: [{ subject: "Công nghệ", grade: 12, year: 8.5, confidence: 0.9 }] }, { methodId: "grade-12" });
  assert.equal(ambiguous.assignments.length, 0);
  assert.match(ambiguous.warnings.join(" "), /chưa rõ định hướng/i);
});

test("không tự ghi đè điểm đã nhập khi có xung đột", () => {
  const root = fakeRoot({ "academic-industrialTechnology-grade12": "9" });
  const result = autoFillTranscript({ scores: [{ subject: "Công nghệ công nghiệp", grade: 12, year: 8.5, confidence: 0.9 }] }, { methodId: "grade-12", root });
  assert.equal(result.filled, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal(root.fields.get("academic-industrialTechnology-grade12").value, "9");
  assert.doesNotMatch(result.warnings.join(" "), /academic-/);
});

test("nhiều ngoại ngữ được cảnh báo rõ", () => {
  const plan = buildTranscriptAutofillPlan({ scores: [
    { subject: "Tiếng Anh", grade: 12, year: 8, confidence: 0.9 },
    { subject: "Tiếng Pháp", grade: 12, year: 9, confidence: 0.9 }
  ] }, { methodId: "grade-12" });
  assert.equal(plan.language, "");
  assert.match(plan.warnings.join(" "), /nhiều môn ngoại ngữ/i);
});
