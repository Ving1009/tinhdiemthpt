import assert from "node:assert/strict";
import test from "node:test";
import { applyCertificateToEntries } from "../public/js/core/certificateApplication.js";

test("áp dụng chứng chỉ trên bản sao, giữ nguyên điểm thi gốc và ngữ cảnh", () => {
  const original = [
    { subjectKey: "math", score: "8.25" },
    { subjectKey: "foreignLanguage:english", score: "7.5" }
  ];
  const result = applyCertificateToEntries(original, {
    rowIndex: 1,
    subjectKey: "foreignLanguage:english",
    value: 9,
    recordId: "rule-1",
    universityId: "uni-1",
    year: 2026,
    certificate: "IELTS",
    method: "THPT kết hợp"
  });
  assert.equal(original[1].score, "7.5");
  assert.equal(result[1].score, 9);
  assert.equal(result[1].certificateApplication.universityId, "uni-1");
  assert.equal(result[1].certificateApplication.method, "THPT kết hợp");
});

test("không áp dụng khi người dùng đã đổi môn hoặc bỏ lớp quy đổi", () => {
  const original = [{ subjectKey: "physics", score: "8" }];
  const application = { rowIndex: 0, subjectKey: "foreignLanguage:english", value: 9 };
  assert.deepEqual(applyCertificateToEntries(original, application), original);
  assert.deepEqual(applyCertificateToEntries(original, null), original);
  assert.notEqual(applyCertificateToEntries(original, null), original);
});
