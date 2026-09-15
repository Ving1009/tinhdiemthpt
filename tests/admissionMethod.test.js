import assert from "node:assert/strict";
import test from "node:test";
import { admissionMethodMatches, normalizeAdmissionMethodCode } from "../lib/admissionMethod.js";

test("chuẩn hóa mã phương thức nhưng giữ mô tả chi tiết ở dữ liệu gốc", () => {
  assert.equal(normalizeAdmissionMethodCode("Xét điểm thi tốt nghiệp THPT"), "thpt");
  assert.equal(normalizeAdmissionMethodCode("Xét tuyển học bạ 6 học kỳ"), "hoc-ba");
  assert.equal(normalizeAdmissionMethodCode("ĐGNL HSA - ĐHQG Hà Nội"), "hsa");
  assert.equal(admissionMethodMatches("Điểm thi tốt nghiệp THPT", "THPT"), true);
  assert.equal(admissionMethodMatches("Học bạ", "THPT"), false);
});
