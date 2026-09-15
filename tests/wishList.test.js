import assert from "node:assert/strict";
import test from "node:test";
import {
  createWishBackup, mergeWishLists, moveWishById, normalizeWishList, parseWishBackup,
  removeWishById, spreadsheetSafeText, wishIdentity, wishesToXlsxBytes
} from "../public/js/core/wishList.js";

const wish = { id: "m1", universityId: "u1", university: "Trường A", name: "Ngành A", code: "7480201", year: 2026, method: "THPT", combination: "A00", scale: 30, cutoff: 25, userScore: 26 };

function unzipStoredEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    files.set(name, bytes.slice(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return files;
}

test("xuất và nhập JSON giữ đủ ngữ cảnh nguyện vọng phiên bản 3", () => {
  const backup = createWishBackup([wish], "2026-09-13T00:00:00.000Z");
  const parsed = parseWishBackup(JSON.stringify(backup));
  assert.equal(parsed.version, 3);
  assert.equal(parsed.items[0].sourceId, "m1");
  assert.equal(parsed.items[0].userScore, 26);
  assert.match(parsed.items[0].wishId, /^wish-/);
  assert.equal(parsed.report.valid, 1);
});

test("các chương trình BVU cùng mã ngành vẫn là các phương án riêng", () => {
  const base = { ...wish, universityId: "bvu", code: "7220201", id: "bvu-1", name: "Ngôn ngữ Anh" };
  const translation = { ...base, id: "bvu-2", name: "Ngôn ngữ Anh (Tiếng Anh biên - phiên dịch - Chương trình chuẩn)" };
  const tourism = { ...base, id: "bvu-3", name: "Ngôn ngữ Anh (Tiếng Anh du lịch - thương mại - Chương trình chuẩn)" };
  const items = normalizeWishList([base, translation, tourism]);
  assert.equal(items.length, 3);
  assert.equal(new Set(items.map((item) => item.wishId)).size, 3);
  assert.notEqual(wishIdentity(items[0]), wishIdentity(items[1]));
});

test("phân biệt cơ sở và phương thức nhưng gộp bản ghi thực sự trùng", () => {
  const same = { ...wish, id: "m-source-2" };
  const otherCampus = { ...wish, id: "m2", campus: "Cơ sở 2" };
  const otherMethod = { ...wish, id: "m3", method: "Học bạ" };
  const items = normalizeWishList([wish, same, otherCampus, otherMethod]);
  assert.equal(items.length, 3);
  assert.equal(mergeWishLists([wish], [same], "merge").length, 1);
});

test("xóa và di chuyển theo wishId chỉ tác động đúng một mục", () => {
  const items = normalizeWishList([wish, { ...wish, id: "m2", name: "Ngành B", code: "7340101" }, { ...wish, id: "m3", name: "Ngành C", code: "7220201" }]);
  const moved = moveWishById(items, items[2].wishId, -1);
  assert.deepEqual(moved.map((item) => item.name), ["Ngành A", "Ngành C", "Ngành B"]);
  const removed = removeWishById(moved, moved[1].wishId);
  assert.equal(removed.removed.name, "Ngành C");
  assert.deepEqual(removed.items.map((item) => item.name), ["Ngành A", "Ngành B"]);
});

test("nhập dữ liệu cũ giữ thứ tự và báo số mục trùng hoặc sai", () => {
  const payload = { kind: "tinh-diem-thpt-wishes", version: 2, exportedAt: "2026-01-01", items: [wish, { ...wish, id: "duplicate" }, { bad: true }, { ...wish, id: "m2", name: "Ngành B", code: "7340101" }] };
  const parsed = parseWishBackup(JSON.stringify(payload));
  assert.deepEqual(parsed.items.map((item) => item.name), ["Ngành A", "Ngành B"]);
  assert.equal(parsed.report.duplicates, 1);
  assert.equal(parsed.report.invalid, 1);
});

test("từ chối JSON sai, ngăn công thức và tạo XLSX OpenXML hợp lệ", () => {
  assert.throws(() => parseWishBackup('{"items":[]}'), /định dạng/);
  assert.equal(spreadsheetSafeText("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
  const bytes = wishesToXlsxBytes([{ ...wish, name: "=1+1" }], "2026-09-14T00:00:00.000Z");
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const files = unzipStoredEntries(bytes);
  assert.ok(files.has("[Content_Types].xml"));
  assert.ok(files.has("xl/worksheets/sheet1.xml"));
  const sheet = new TextDecoder().decode(files.get("xl/worksheets/sheet1.xml"));
  assert.match(sheet, /autoFilter ref="A1:O2"/);
  assert.match(sheet, /<v>2026<\/v>/);
  assert.match(sheet, /&apos;=1\+1/);
});
