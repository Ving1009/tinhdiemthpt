import assert from "node:assert/strict";
import test from "node:test";
import {
  moveWishById, normalizeWishList, removeWishById, wishIdentity
} from "../public/js/core/wishList.js";

const wish = { id: "m1", universityId: "u1", university: "Trường A", name: "Ngành A", code: "7480201", year: 2026, method: "THPT", combination: "A00", scale: 30, cutoff: 25, userScore: 26 };

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
  assert.equal(normalizeWishList([wish, same]).length, 1);
});

test("xóa và di chuyển theo wishId chỉ tác động đúng một mục", () => {
  const items = normalizeWishList([wish, { ...wish, id: "m2", name: "Ngành B", code: "7340101" }, { ...wish, id: "m3", name: "Ngành C", code: "7220201" }]);
  const moved = moveWishById(items, items[2].wishId, -1);
  assert.deepEqual(moved.map((item) => item.name), ["Ngành A", "Ngành C", "Ngành B"]);
  const removed = removeWishById(moved, moved[1].wishId);
  assert.equal(removed.removed.name, "Ngành C");
  assert.deepEqual(removed.items.map((item) => item.name), ["Ngành A", "Ngành B"]);
});
