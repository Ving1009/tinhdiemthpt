import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeMajor, sanitizePublicValue, validateCutoff, validateDataset } from "../lib/dataValidation.js";

test("verified và reference có số hợp lệ theo đúng scale riêng", () => {
  for (const status of ["verified", "reference"]) {
    const result = validateCutoff({ year: 2026, score: 94, scale: 150, status, sourceUrl: "https://example.edu.vn/result" });
    assert.equal(result.valid, true);
    assert.equal(result.publishable, true);
  }
  assert.equal(validateCutoff({ year: 2026, score: 34.66, scale: 40, status: "reference", sourceUrl: "https://example.edu.vn/result" }).valid, true);
});

test("validator không mặc định scale và bắt buộc metadata nội bộ cho số công bố", () => {
  assert.equal(validateCutoff({ year: 2026, score: 25, status: "verified", sourceUrl: "https://example.edu.vn" }).valid, false);
  assert.equal(validateCutoff({ year: 2026, score: 25, scale: 30, status: "verified" }).valid, false);
  assert.equal(validateCutoff({ year: 2026, score: 31, scale: 30, status: "reference", sourceUrl: "https://example.edu.vn" }).valid, false);
});

test("unverified và not_published không được mang điểm số", () => {
  assert.equal(validateCutoff({ year: 2026, score: 20, scale: 30, status: "unverified" }).valid, false);
  assert.equal(validateCutoff({ year: 2026, score: null, status: "unverified" }).valid, true);
  assert.equal(validateCutoff({ year: 2026, score: undefined, status: "not_published" }).valid, true);
});

test("sanitizer xóa metadata nguồn đệ quy nhưng giữ website chính của trường", () => {
  const clean = sanitizePublicValue({
    website: "https://university.example.edu.vn", sourceUrl: "https://collector.example", referenceNote: "private",
    admissions: { formulaSourceUrl: "https://hidden.example", referenceSources: [{ url: "https://hidden.example" }] },
    cutoff: { year: 2026, score: 25, scale: 30, status: "reference", sourceTitle: "hidden" }
  });
  assert.equal(clean.website, "https://university.example.edu.vn");
  assert.equal(clean.cutoff.status, "reference");
  assert.doesNotMatch(JSON.stringify(clean), /source|referenceNote|hidden\.example|collector\.example/i);
});

test("major chưa xác minh không xuất bản điểm số", () => {
  const clean = sanitizeMajor({ id: "m1", cutoff: { year: 2026, score: 20, scale: 30, status: "unverified" } });
  assert.equal(clean.cutoff.score, null);
});

test("31 hồ sơ trống đã phân loại là warning, hồ sơ trống chưa phân loại là error", () => {
  const base = { majors: [], combinations: [] };
  const classified = validateDataset({ ...base, universities: [{ id: "u1", code: "U1", admissions: { status: "member_units", note: "Theo đơn vị thành viên" } }] });
  assert.equal(classified.errors.length, 0);
  assert.equal(classified.warnings.length, 1);
  const missing = validateDataset({ ...base, universities: [{ id: "u2", code: "U2" }] });
  assert.equal(missing.errors.length, 1);
});
