import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { recognizeTranscriptInBrowser, transcriptTextFromBlocks } from "../public/js/clientTranscriptOcr.js";

const catalog = JSON.parse(await readFile(new URL("../data/transcript-subjects.json", import.meta.url), "utf8"));

test("OCR ghép chữ ở các ô cùng hàng theo tọa độ, không trộn hai hàng", () => {
  const word = (text, x0, y0) => ({ text, bbox: { x0, y0, y1: y0 + 16 } });
  const blocks = [{ paragraphs: [{ lines: [{ words: [word("6.0", 260, 104), word("Toán", 20, 100), word("5.6", 160, 102)] }, { words: [word("Vật lí", 20, 165), word("4.9", 160, 167)] }] }] }];
  assert.equal(transcriptTextFromBlocks(blocks), "Toán 5.6 6.0\nVật lí 4.9");
  assert.equal(transcriptTextFromBlocks(null, "old engine"), "old engine");
});

test("Tesseract trình duyệt tạo đúng một worker, nhận diện tuần tự và terminate", async () => {
  const calls = [];
  let active = 0;
  let peak = 0;
  const worker = {
    setParameters: async () => {},
    recognize: async (blob) => {
      active += 1;
      peak = Math.max(peak, active);
      calls.push(`recognize-${blob}`);
      await Promise.resolve();
      active -= 1;
      return { data: { text: `LỚP 12\nMôn học HK1 HK2 Cả năm\nToán 8 9 ${blob === "one" ? "8,5" : "9,0"}`, confidence: 88 } };
    },
    terminate: async () => calls.push("terminate")
  };
  let createCount = 0;
  const tesseractModule = {
    createWorker: async (languages, oem, options) => {
      createCount += 1;
      assert.deepEqual(languages, ["vie", "eng"]);
      assert.equal(oem, 1);
      assert.equal(new URL(options.workerPath).pathname.endsWith("/worker.min.js"), true);
      assert.equal(options.workerBlobURL, false);
      return worker;
    }
  };
  const result = await recognizeTranscriptInBrowser([
    { blob: "one", originalName: "one.jpg" },
    { blob: "two", originalName: "two.jpg" }
  ], { assetBaseUrl: "/vendor/", catalog, tesseractModule, browserEnvironment: {} });
  assert.equal(result.success, true);
  assert.equal(result.engine, "browser");
  assert.equal(createCount, 1);
  assert.equal(peak, 1);
  assert.deepEqual(calls, ["recognize-one", "recognize-two", "terminate"]);
});

test("worker vẫn được terminate khi nhận diện lỗi", async () => {
  let terminated = 0;
  const tesseractModule = { createWorker: async () => ({
    setParameters: async () => {},
    recognize: async () => { throw new Error("technical details"); },
    terminate: async () => { terminated += 1; }
  }) };
  await assert.rejects(
    () => recognizeTranscriptInBrowser([{ blob: "bad" }], { assetBaseUrl: "https://local.test/vendor/", catalog, tesseractModule, browserEnvironment: {} }),
    (error) => error.code === "CLIENT_OCR_FAILED" && !/technical details/.test(error.message)
  );
  assert.equal(terminated, 1);
});

test("lỗi khởi tạo worker được trả về thay vì treo vô thời hạn", async () => {
  const tesseractModule = {
    createWorker: (_languages, _oem, options) => {
      queueMicrotask(() => options.errorHandler(new Error("worker blocked")));
      return new Promise(() => {});
    }
  };

  await assert.rejects(
    () => recognizeTranscriptInBrowser([{ blob: "one" }], {
      assetBaseUrl: "/vendor/",
      catalog,
      tesseractModule,
      browserEnvironment: {}
    }),
    (error) => error.code === "CLIENT_OCR_FAILED" && !/worker blocked/.test(error.message)
  );
});

test("worker khởi tạo quá hạn kết thúc yêu cầu và được giải phóng nếu đến muộn", async () => {
  let resolveWorker;
  let terminated = 0;
  const images = [{ blob: "one" }];
  await assert.rejects(() => recognizeTranscriptInBrowser(images, {
    assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, initializationTimeoutMs: 10,
    tesseractModule: { createWorker: () => new Promise((resolve) => { resolveWorker = resolve; }) }
  }), { code: "CLIENT_OCR_TIMEOUT" });
  assert.equal(images[0].blob, null);
  resolveWorker({ terminate: async () => { terminated += 1; } });
  await Promise.resolve();
  assert.equal(terminated, 1);
});

test("nhận diện quá hạn hoặc worker báo lỗi giữa chừng đều terminate", async () => {
  for (const mode of ["timeout", "worker-error"]) {
    let terminated = 0;
    let handler;
    await assert.rejects(() => recognizeTranscriptInBrowser([{ blob: "one" }], {
      assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, recognitionTimeoutMs: 10,
      tesseractModule: { createWorker: async (_languages, _oem, options) => {
        handler = options.errorHandler;
        return {
          setParameters: async () => {},
          recognize: () => {
            if (mode === "worker-error") queueMicrotask(() => handler(new Error("private details")));
            return new Promise(() => {});
          },
          terminate: async () => { terminated += 1; }
        };
      } }
    }), (error) => error.code === (mode === "timeout" ? "CLIENT_OCR_TIMEOUT" : "CLIENT_OCR_FAILED") && !/private details/.test(error.message));
    assert.equal(terminated, 1);
  }
});
