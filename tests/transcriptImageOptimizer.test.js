import assert from "node:assert/strict";
import test from "node:test";
import {
  fitImageDimensions,
  optimizeTranscriptImage,
  optimizeTranscriptImagesSequentially
} from "../public/js/transcriptImageOptimizer.js";

test("ảnh chỉ thu nhỏ theo cạnh dài và không phóng lớn", () => {
  assert.deepEqual(fitImageDimensions(4032, 3024, 2000), { width: 2000, height: 1500 });
  assert.deepEqual(fitImageDimensions(900, 1200, 2000), { width: 900, height: 1200 });
});

test("optimizer đóng bitmap và thu hồi canvas sau khi tạo JPEG", async () => {
  let closed = 0;
  const calls = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      set fillStyle(value) { calls.push(["fillStyle", value]); },
      fillRect: (...args) => calls.push(["fillRect", ...args]),
      drawImage: (...args) => calls.push(["drawImage", ...args])
    }),
    toBlob: (callback, type, quality) => {
      calls.push(["toBlob", type, quality]);
      callback(new Blob(["jpeg"], { type }));
    }
  };
  const result = await optimizeTranscriptImage({ name: "hoc-ba.heic" }, {
    decoder: async () => ({ source: {}, width: 4000, height: 3000, close: () => { closed += 1; } }),
    canvasFactory: () => canvas
  });
  assert.equal(result.width, 2000);
  assert.equal(result.height, 1500);
  assert.equal(result.uploadName, "hoc-ba.jpg");
  assert.equal(result.blob.type, "image/jpeg");
  assert.equal(closed, 1);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
  assert.deepEqual(calls.find((call) => call[0] === "toBlob"), ["toBlob", "image/jpeg", 0.86]);
});

test("nhiều ảnh luôn được tối ưu tuần tự", async () => {
  let active = 0;
  let peak = 0;
  const order = [];
  const result = await optimizeTranscriptImagesSequentially(["a", "b", "c"], {
    optimize: async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      order.push(`start-${value}`);
      await Promise.resolve();
      order.push(`end-${value}`);
      active -= 1;
      return value.toUpperCase();
    }
  });
  assert.deepEqual(result, ["A", "B", "C"]);
  assert.equal(peak, 1);
  assert.deepEqual(order, ["start-a", "end-a", "start-b", "end-b", "start-c", "end-c"]);
});
