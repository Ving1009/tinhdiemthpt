import assert from "node:assert/strict";
import test from "node:test";
import {
  fitImageDimensions,
  optimizeTranscriptImage,
  optimizeTranscriptImagesSequentially,
  prepareTranscriptCell,
  cropTranscriptRectangle
} from "../public/js/transcriptImageOptimizer.js";

test("ảnh chỉ thu nhỏ theo cạnh dài và không phóng lớn", () => {
  assert.deepEqual(fitImageDimensions(4032, 3024), { width: 1600, height: 1200 });
  assert.deepEqual(fitImageDimensions(900, 1200), { width: 900, height: 1200 });
  assert.deepEqual(fitImageDimensions(700, 933, 2400, true), { width: 1801, height: 2400 });
});

test("cắt ô giữ đúng pixel, không phóng lớn hoặc xử lý dấu thập phân; canvas được giải phóng", async () => {
  const calls = [];
  const canvas = { getContext: () => ({ drawImage: (...args) => calls.push(args) }),
    toBlob: (callback, type) => callback(new Blob(["crop"], { type })) };
  const decoded = { source: "detail", width: 2400, height: 3200 };
  const result = await cropTranscriptRectangle(decoded, { left: 120, top: 240, width: 90, height: 50 }, { canvasFactory: () => canvas });
  assert.deepEqual(calls, [["detail", 0, 112, 338, 306, 0, 0, 338, 306]]);
  assert.equal(result.blob.type, "image/png");
  assert.deepEqual([result.width, result.height], [338, 306]);
  assert.deepEqual(result.rectangle, { left: 120, top: 128, width: 90, height: 50 });
  assert.deepEqual([canvas.width, canvas.height], [1, 1]);
  assert.equal(await cropTranscriptRectangle(decoded, { left: 2500, top: 0, width: 10, height: 10 }), null);
});

test("hủy tối ưu ảnh dừng ảnh kế tiếp và giải phóng các blob đã tạo", async () => {
  const controller = new AbortController();
  const created = [];
  let calls = 0;
  await assert.rejects(() => optimizeTranscriptImagesSequentially(["one", "two", "three"], {
    signal: controller.signal,
    optimize: async () => {
      calls++;
      const image = { blob: new Blob(["image"]) }; created.push(image);
      controller.abort();
      return image;
    }
  }), { name: "AbortError" });
  assert.equal(calls, 1);
  assert.equal(created[0].blob, null);
  await assert.rejects(() => optimizeTranscriptImagesSequentially(["one"], {
    signal: controller.signal, optimize: async () => assert.fail("Không xử lý ảnh sau khi hủy")
  }), { name: "AbortError" });
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
  assert.equal(result.width, 1600);
  assert.equal(result.height, 1200);
  assert.equal(result.uploadName, "hoc-ba.jpg");
  assert.equal(result.blob.type, "image/jpeg");
  assert.equal(closed, 1);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
  assert.deepEqual(calls.find((call) => call[0] === "toBlob"), ["toBlob", "image/jpeg", 0.8]);
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

test("tăng tương phản chỉ khi được chọn, vẫn đóng bitmap và canvas", async () => {
  const pixels = { data: new Uint8ClampedArray([180, 180, 180, 255, 239, 239, 239, 255]) };
  let written, closed = 0;
  const canvas = { getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: () => pixels,
    putImageData: value => { written = value; } }), toBlob: callback => callback(new Blob(["image"])) };
  await optimizeTranscriptImage({ name: "screenshot.png" }, { threshold: 210,
    decoder: async () => ({ source: {}, width: 2, height: 1, close: () => { closed++; } }), canvasFactory: () => canvas });
  assert.deepEqual([...written.data], [0, 0, 0, 255, 255, 255, 255, 255]);
  assert.equal(closed, 1);
  assert.equal(canvas.width, 1);
});

test("ô điểm dùng tọa độ ảnh gốc, tăng tương phản và xuất PNG có viền trắng", async () => {
  const calls = [], canvases = [];
  const pixels = { data: new Uint8ClampedArray(Array.from({ length: 100 }, (_, index) => index < 20 ? [60, 60, 60, 255] : [220, 220, 220, 255]).flat()) };
  const blob = await prepareTranscriptCell({ source: "original", width: 400, height: 600 }, { left: 10, top: 20, width: 30, height: 40 }, 100, {
    canvasFactory: () => {
      const canvas = { getContext: () => ({ fillRect: (...args) => calls.push(["padding", ...args]),
        drawImage: (...args) => calls.push(["draw", ...args]), getImageData: () => pixels,
        putImageData: value => calls.push(["contrast", value]) }),
        toBlob: (callback, type) => { calls.push(["format", type]); callback(new Blob(["cell"], { type })); } };
      canvases.push(canvas); return canvas;
    }
  });
  assert.deepEqual(calls.find(call => call[0] === "draw").slice(1), ["original", 40, 80, 120, 160, 16, 16, 60, 80]);
  assert.equal(blob.type, "image/png");
  assert.equal(pixels.data[0], 0);
  assert.equal(pixels.data[80], 255);
  assert.ok(calls.some(call => call[0] === "padding"));
  assert.ok(canvases.every(canvas => canvas.width === 1 && canvas.height === 1));
});

test("ô trắng hoặc vùng nằm ngoài ảnh không được biến thành ảnh điểm giả", async () => {
  let canvas;
  const decoded = { source: {}, width: 400, height: 600 };
  assert.equal(await prepareTranscriptCell(decoded, { left: 500, top: 0, width: 20, height: 20 }, 400), null);
  assert.equal(await prepareTranscriptCell(decoded, { left: 0, top: 0, width: NaN, height: 20 }, 400), null);
  const result = await prepareTranscriptCell(decoded, { left: 10, top: 20, width: 30, height: 40 }, 400, {
    canvasFactory: () => (canvas = { getContext: () => ({ fillRect() {}, drawImage() {},
      getImageData: () => ({ data: new Uint8ClampedArray(400).fill(255) }), putImageData() { assert.fail("Không xử lý ô trắng thành chữ"); } }) })
  });
  assert.equal(result, null);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
});

test("vùng tên môn giữ màu ảnh gốc khi không chọn nhị phân hóa", async () => {
  const canvases = [];
  const blob = await prepareTranscriptCell({ source: "original", width: 400, height: 600 }, { left: 10, top: 20, width: 30, height: 40 }, 100, {
    zoom: 1.5, binarize: false, canvasFactory: () => {
      const canvas = { getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: (callback, type) => callback(new Blob(["crop"], { type })) };
      canvases.push(canvas); return canvas;
    }
  });
  assert.equal(blob.type, "image/png");
  assert.equal(canvases.length, 1);
  assert.ok(canvases.every(canvas => canvas.width === 1 && canvas.height === 1));
});
