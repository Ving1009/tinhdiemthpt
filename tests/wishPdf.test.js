import assert from "node:assert/strict";
import test from "node:test";
import { buildRasterPdf, createWishPdfBlob, createWishPdfModel, WISHES_PER_PAGE, wishPdfFilename } from "../public/js/core/wishPdf.js";

function fakeDocument() {
  const context = {
    fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {},
    measureText(value) { return { width: String(value).length * 8 }; }
  };
  return {
    fonts: { ready: Promise.resolve() },
    createElement() {
      return {
        width: 0, height: 0,
        getContext() { return context; },
        toBlob(callback) { callback(new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" })); }
      };
    }
  };
}

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
  assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  assert.match(text, /xref\n0 9/);
  assert.match(text, /%%EOF\n$/);
});

test("mỗi trang PDF chứa tối đa 15 nguyện vọng", () => {
  assert.equal(WISHES_PER_PAGE, 15);
});

test("15 nguyện vọng tạo một trang và mục thứ 16 mở trang thứ hai", async () => {
  const wishes = Array.from({ length: 16 }, (_, index) => ({
    name: `Ngành ${index + 1}`, university: `Trường ${index + 1}`, code: `748${String(index).padStart(4, "0")}`,
    method: "THPT", combination: "A00", year: 2026, userScore: 25, cutoff: 24, scale: 30,
    cutoffStatus: "verified", comparisonStatus: "compatible"
  }));
  const onePage = new TextDecoder("latin1").decode(await (await createWishPdfBlob(wishes.slice(0, 15), { documentRef: fakeDocument() })).arrayBuffer());
  const twoPages = new TextDecoder("latin1").decode(await (await createWishPdfBlob(wishes, { documentRef: fakeDocument() })).arrayBuffer());
  assert.match(onePage, /\/Type \/Pages \/Count 1/);
  assert.match(twoPages, /\/Type \/Pages \/Count 2/);
});
