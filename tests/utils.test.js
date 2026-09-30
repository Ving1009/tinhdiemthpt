import assert from "node:assert/strict";
import test from "node:test";
import { debounce, validateScore } from "../public/js/utils.js";

test("validateScore giữ nguyên hợp đồng dùng chung", () => {
  assert.equal(validateScore("0001").valid, false);
  assert.equal(validateScore("-1").message, "Dùng tối đa 2 chữ số thập phân.");
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
