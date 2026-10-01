import assert from "node:assert/strict";
import test from "node:test";
import { debounce, validateScore } from "../public/js/utils.js";

test("validateScore phân biệt lỗi số, khoảng điểm và số chữ số thập phân", () => {
  assert.equal(validateScore("0001").valid, false);
  for (const value of ["-1", "11", "100"]) assert.equal(validateScore(value).message, "Điểm phải nằm trong khoảng 0 đến 10.");
  assert.equal(validateScore("abc").message, "Điểm phải là số.");
  assert.equal(validateScore("8.555").message, "Dùng tối đa 2 chữ số thập phân.");
  assert.equal(validateScore("").message, "Vui lòng nhập điểm.");
  assert.deepEqual(validateScore("", false), { valid: true, value: null });
  assert.deepEqual(validateScore("8,5"), { valid: true, value: 8.5 });
});

test("debounce.cancel hủy callback đang chờ", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { setTimeout };
  try {
    let calls = 0;
    const callback = debounce(() => { calls += 1; }, 10);
    callback();
    callback.cancel();
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(calls, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
