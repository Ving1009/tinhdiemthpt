import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { recognizeTranscriptInBrowser } from "../public/js/clientTranscriptOcr.js";

const catalog = JSON.parse(await readFile(new URL("../data/transcript-subjects.json", import.meta.url), "utf8"));

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
      assert.match(options.workerPath, /worker\.min\.js$/);
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
