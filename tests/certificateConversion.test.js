import assert from "node:assert/strict";
import test from "node:test";
import { calculateCertificateConversion, sanitizeCertificateRecord, validateCertificateConversions } from "../lib/certificateConversion.js";

const trusted = { status: "verified", sourceUrl: "https://example.edu.vn/admissions-2026", sourceTitle: "Internal audit record", updatedAt: "2026-08-20" };
const records = [
  {
    id: "uni-ielts-subject", universityId: "uni-a", year: 2026, certificate: "IELTS", method: "THPT kết hợp",
    target: { type: "subjectScore", subject: "english" }, outputScale: 10, ...trusted,
    rules: [
      { type: "exact", value: 5.5, output: 8 },
      { type: "range", min: 6, max: 6.5, output: 9 },
      { type: "minimum", min: 7, output: 10 }
    ]
  },
  {
    id: "uni-bonus", universityId: "uni-a", year: 2026, certificate: "TOEFL iBT", method: "Xét kết hợp",
    target: { type: "bonusScore" }, outputScale: 3, ...trusted,
    rules: [{ type: "range", min: 80, max: 100, output: 1.5 }]
  },
  {
    id: "uni-eligibility", universityId: "uni-a", year: 2026, certificate: "JLPT", method: "Xét điều kiện",
    target: { type: "eligibilityOnly" }, ...trusted,
    rules: [{ type: "exact", value: "N2", eligible: true }]
  }
];
const convert = (overrides = {}) => calculateCertificateConversion(records, {
  universityId: "uni-a", year: 2026, certificate: "IELTS", method: "THPT kết hợp", value: 6, ...overrides
});

test("validator chấp nhận fixture đủ trường, năm, loại đích và metadata nội bộ", () => {
  assert.deepEqual(validateCertificateConversions(records, { universityIds: new Set(["uni-a"]) }), { valid: true, errors: [] });
});

test("exact và hai biên range cho kết quả đúng", () => {
  assert.equal(convert({ value: 5.5 }).value, 8);
  assert.equal(convert({ value: 6 }).value, 9);
  assert.equal(convert({ value: 6.5 }).value, 9);
  assert.equal(convert({ value: "7,0" }).value, 10);
});

test("dưới ngưỡng, trên khoảng và chứng chỉ không hỗ trợ không tạo kết quả", () => {
  assert.deepEqual(convert({ value: 5 }), { available: true, matched: false, status: "verified", target: { type: "subjectScore", subject: "english" } });
  const aboveRange = convert({ certificate: "TOEFL iBT", method: "Xét kết hợp", value: 101 });
  assert.equal(aboveRange.available, true);
  assert.equal(aboveRange.matched, false);
  assert.deepEqual(convert({ certificate: "ACT" }), { available: false });
});

test("không dùng rule sai trường, năm hoặc phương thức", () => {
  assert.deepEqual(convert({ universityId: "uni-b" }), { available: false });
  assert.deepEqual(convert({ year: 2025 }), { available: false });
  assert.deepEqual(convert({ method: "Học bạ" }), { available: false });
});

test("subjectScore chỉ tự áp dụng khi verified; bonusScore không bị coi là điểm môn", () => {
  const subject = convert({ value: 6.25 });
  assert.equal(subject.target.type, "subjectScore");
  assert.equal(subject.canApply, true);
  assert.deepEqual(subject.provenance, {
    recordId: "uni-ielts-subject",
    universityId: "uni-a",
    year: 2026,
    certificate: "IELTS",
    method: "THPT kết hợp",
    target: { type: "subjectScore", subject: "english" }
  });
  const bonus = convert({ certificate: "TOEFL iBT", method: "Xét kết hợp", value: 90 });
  assert.equal(bonus.target.type, "bonusScore");
  assert.equal(bonus.value, 1.5);
  assert.equal(bonus.canApply, false);
});

test("eligibilityOnly hỗ trợ cấp độ dạng chữ mà không tạo điểm", () => {
  const result = convert({ certificate: "JLPT", method: "Xét điều kiện", value: "n2" });
  assert.equal(result.matched, true);
  assert.equal(result.target.type, "eligibilityOnly");
  assert.equal(result.value, null);
  assert.equal(result.eligible, true);
  assert.equal(result.canApply, false);
});

test("validator từ chối khoảng chồng lấn mâu thuẫn và output vượt scale", () => {
  const invalid = [{
    id: "bad", universityId: "uni-a", year: 2026, certificate: "IELTS", method: "Combined",
    target: { type: "componentScore" }, outputScale: 10, ...trusted,
    rules: [{ type: "range", min: 5, max: 6.5, output: 9 }, { type: "range", min: 6, max: 7, output: 11 }]
  }];
  const result = validateCertificateConversions(invalid, { universityIds: new Set(["uni-a"]) });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.includes("chồng lấn")));
  assert.ok(result.errors.some((item) => item.includes("vượt thang điểm")));
});

test("bản public loại bỏ toàn bộ metadata nguồn ở mọi cấp", () => {
  const clean = sanitizeCertificateRecord({ ...records[0], referenceSources: [{ sourceUrl: "https://hidden.example" }] });
  const serialized = JSON.stringify(clean);
  assert.doesNotMatch(serialized, /sourceUrl|sourceTitle|referenceSources|hidden\.example/i);
  assert.equal(clean.status, "verified");
});
