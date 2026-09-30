import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateAdmissionPriority } from "../public/js/utils.js";

test("điểm khu vực và đối tượng ưu tiên được cộng đúng", () => {
  const expectedAreas = { KV1: 0.75, "KV2-NT": 0.5, KV2: 0.25, KV3: 0 };
  for (const [area, points] of Object.entries(expectedAreas)) {
    assert.equal(calculateAdmissionPriority(20, { area, priorityGroup: "none" }).adjusted, points);
  }
  assert.equal(calculateAdmissionPriority(20, { area: "KV3", priorityGroup: "UT1" }).adjusted, 2);
  assert.equal(calculateAdmissionPriority(20, { area: "KV3", priorityGroup: "UT2" }).adjusted, 1);
  assert.equal(calculateAdmissionPriority(20, { area: "KV1", priorityGroup: "UT1" }).adjusted, 2.75);
});

test("điểm ưu tiên giảm đúng sau mốc 22,5 trên thang 30", () => {
  const context = { area: "KV1", priorityGroup: "UT1" };
  assert.deepEqual(calculateAdmissionPriority(22.5, context), {
    area: 0.75, group: 2, base: 2.75, adjusted: 2.75, adjustedOn30: 2.75,
    normalizedScore: 22.5, scale: 30, shouldAdjust: true
  });
  assert.equal(calculateAdmissionPriority(25, context).adjusted, 1.83);
  assert.equal(calculateAdmissionPriority(27.5, context).adjusted, 0.92);
  assert.equal(calculateAdmissionPriority(30, context).adjusted, 0);
});

test("các ca biên ưu tiên trong ví dụ giao diện được làm tròn đúng", () => {
  const kv1 = { area: "KV1", priorityGroup: "none" };
  assert.equal(calculateAdmissionPriority(26, kv1).adjusted, 0.4);
  assert.equal(calculateAdmissionPriority(22.5, kv1).adjusted, 0.75);
  assert.equal(calculateAdmissionPriority(22.49, kv1).adjusted, 0.75);
  assert.equal(calculateAdmissionPriority(30, { area: "KV2", priorityGroup: "UT2" }).adjusted, 0);
  const combined = calculateAdmissionPriority(20, { area: "KV1", priorityGroup: "UT1" });
  assert.equal(combined.base, 2.75);
  assert.equal(combined.adjusted, 2.75);
});

test("ví dụ hero khớp phép tính ưu tiên KV1", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const priority = calculateAdmissionPriority(26, { area: "KV1", priorityGroup: "none" }).adjusted;
  assert.match(html, new RegExp(`<strong>${(26 + priority).toFixed(2)}</strong>`));
  assert.match(html, new RegExp(`<b>\\+ ${priority.toFixed(2)}</b>`));
});

test("thang 40 quy đổi tương đương cả điểm và ưu tiên", () => {
  const priority = calculateAdmissionPriority(33, { area: "KV1", priorityGroup: "UT1" }, 40);
  assert.equal(priority.normalizedScore, 24.75);
  assert.equal(priority.adjustedOn30, 1.93);
  assert.equal(priority.adjusted, 2.57);
});
