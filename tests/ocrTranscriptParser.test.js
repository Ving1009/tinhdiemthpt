import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseOcrTranscriptPages } from "../lib/ocrTranscriptParser.js";

const catalog = JSON.parse(await readFile(new URL("../data/transcript-subjects.json", import.meta.url), "utf8"));

test("OCR tách HK1, HK2 và cả năm khi tiêu đề cột và lớp rõ ràng", () => {
  const result = parseOcrTranscriptPages([{
    originalname: "hoc-ba-lop-12.png",
    confidence: 84,
    text: "HỌ VÀ TÊN: Nguyễn Văn An\nLỚP 12\nMONHOC  HK1  HK2  CANAM\nToán 8,0 8,6 8,3\nNgữ văn 7.5 8.1 7.8"
  }], catalog);
  assert.equal(result.payload.student.name, "Nguyễn Văn An");
  assert.deepEqual(result.payload.scores.map(({ subject, grade, semester1, semester2, year }) => ({ subject, grade, semester1, semester2, year })), [
    { subject: "Toán", grade: 12, semester1: 8, semester2: 8.6, year: 8.3 },
    { subject: "Ngữ văn", grade: 12, semester1: 7.5, semester2: 8.1, year: 7.8 }
  ]);
});

test("OCR đọc bảng điểm cả năm ba lớp nhưng không tự suy diễn cột mơ hồ", () => {
  const summary = parseOcrTranscriptPages([{
    confidence: 70,
    text: "Môn học  Lớp 10  Lớp 11  Lớp 12\nToán 7,5 8,0 8,5\nCông nghệ 8 9 9,5"
  }], catalog);
  assert.equal(summary.payload.scores.length, 6);
  assert.deepEqual(summary.payload.scores.filter((item) => item.subject === "Công nghệ").map((item) => item.year), [8, 9, 9.5]);

  const ambiguous = parseOcrTranscriptPages([{
    originalname: "lop-11.png",
    confidence: 75,
    text: "Bảng điểm lớp 11\nToán 8 7 9 8 8,5"
  }], catalog);
  assert.equal(ambiguous.payload.scores.length, 0);
  assert.match(ambiguous.warnings.join(" "), /bố cục điểm chưa đủ rõ/i);
});

test("OCR nhận lớp có dấu hai chấm và hậu tố tên lớp, không nhầm lớp 101", () => {
  for (const grade of [10, 11, 12]) {
    const result = parseOcrTranscriptPages([{
      text: `Lớp: ${grade}TN7\nMôn học HọckìI HọckìII Cả năm\nToán học 5.6 6.2 6.0`, confidence: 85
    }], catalog);
    assert.equal(result.payload.scores.length, 1);
    assert.deepEqual(result.payload.scores[0], { subject: "Toán", grade, semester1: 5.6, semester2: 6.2, year: 6, confidence: 0.61 });
  }
  const invalid = parseOcrTranscriptPages([{ text: "Lớp: 101\nHK1 HK2 Cả năm\nToán 5 6 7" }], catalog);
  assert.equal(invalid.payload.scores.length, 0);
});

test("OCR giữ đúng vị trí cột bị mất dấu thập phân, không đoán 62 thành 6.2", () => {
  const result = parseOcrTranscriptPages([{ text: "Lớp:\n11TN7\nHọc kì I Học kì II Cả năm\nToán 5.6 62 6.0" }], catalog);
  assert.deepEqual(result.payload.scores.map(({ grade, semester1, semester2, year }) => ({ grade, semester1, semester2, year })), [
    { grade: 11, semester1: 5.6, semester2: null, year: 6 }
  ]);
  assert.match(result.warnings.join(" "), /để trống/);
});
