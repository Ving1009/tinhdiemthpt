import assert from "node:assert/strict";
import test from "node:test";
import { buildRasterPdf, createWishPdfModel, wishPdfFilename } from "../public/js/core/wishPdf.js";

test("tên PDF an toàn và model giữ đủ dữ liệu nguyện vọng", () => {
  assert.equal(wishPdfFilename(new Date("2026-09-21T00:00:00Z")), "nganh-phu-hop-2026-09-21.pdf");
  const model = createWishPdfModel([{
    name: "Công nghệ thông tin", university: "Đại học Bách khoa Hà Nội", code: "7480201",
    method: "THPT", combination: "A00", year: 2026, userScore: 27.25, cutoff: 26.5,
    scale: 30, cutoffStatus: "verified", comparisonStatus: "compatible"
  }], new Date("2026-09-21T00:00:00Z"));
  assert.equal(model.items[0].name, "Công nghệ thông tin");
  assert.equal(model.items[0].method, "THPT");
  assert.equal(model.items[0].userScore, "27,25");
  assert.equal(model.items[0].cutoffStatus, "Đã xác minh");
});

test("builder tạo PDF A4 nhiều trang với xref hợp lệ", () => {
  const bytes = buildRasterPdf([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])]);
  const text = new TextDecoder("latin1").decode(bytes);
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /\/Type \/Pages \/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(text, /xref\n0 9/);
  assert.match(text, /%%EOF\n$/);
});
