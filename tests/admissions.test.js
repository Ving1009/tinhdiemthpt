import assert from "node:assert/strict";
import test from "node:test";
import { cutoffLabel, cutoffStatusLabel, paginate, publicProfileNote, publishableCutoff, verifiedCutoff } from "../public/js/admissions.js";

test("client chỉ công bố điểm đã được API làm sạch và đủ năm, điểm, thang điểm", () => {
  const verified = { cutoff: { year: 2026, score: 26.35, scale: 30, status: "verified" } };
  assert.equal(verifiedCutoff(verified), true);
  assert.equal(cutoffLabel(verified), "26,35 / 30");
  assert.equal(verifiedCutoff({ cutoff: { ...verified.cutoff, scale: null } }), false);
  assert.equal(cutoffLabel({ cutoff: { year: 2026, score: null, status: "not_published" } }), "Chưa công bố");
});

test("client hiển thị điểm tham khảo đúng thang mà không cần nhận metadata nội bộ", () => {
  const reference = { cutoff: { year: 2026, score: 94, scale: 150, status: "reference" } };
  assert.equal(verifiedCutoff(reference), false);
  assert.equal(publishableCutoff(reference), true);
  assert.equal(cutoffLabel(reference), "94 / 150");
  assert.equal(cutoffStatusLabel(reference), "~ Tham khảo");
});

test("phân trang luôn giữ trang trong phạm vi hợp lệ", () => {
  assert.deepEqual(paginate([1, 2, 3], 99, 2), { items: [3], total: 3, page: 2, pages: 2 });
  assert.deepEqual(paginate([], -2, 24), { items: [], total: 0, page: 1, pages: 1 });
});

test("ghi chú hồ sơ công khai chỉ dựa trên trạng thái đã làm sạch", () => {
  assert.equal(publicProfileNote({ status: "official_verified" }), "Thông tin tuyển sinh 2026 đã được xác minh.");
  const partial = publicProfileNote({ status: "official_verified_partial" });
  assert.match(partial, /Một phần/);
  assert.match(partial, /các mục còn lại/);
  assert.notEqual(partial, "Thông tin tuyển sinh 2026 đã được xác minh.");
  assert.equal(publicProfileNote({ hasReference: true }), "Thông tin tuyển sinh 2026 đang ở mức tham khảo.");
  assert.equal(publicProfileNote({ classified: "Tuyển sinh theo quy định đặc thù" }), "Tuyển sinh theo quy định đặc thù");
});
