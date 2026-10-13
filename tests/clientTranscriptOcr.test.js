import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { recognizeTranscriptInBrowser, transcriptTextFromBlocks, localOcrScore, agreeLocalOcrReadings } from "../public/js/clientTranscriptOcr.js";

const catalog = JSON.parse(await readFile(new URL("../data/transcript-subjects.json", import.meta.url), "utf8"));

function installNativeWorkerStub(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  const workers = [];
  class NativeWorker {
    constructor(url) { this.url = url; this.terminated = 0; workers.push(this); }
    terminate() { this.terminated++; }
  }
  Object.defineProperty(globalThis, "Worker", { value: NativeWorker, writable: true, configurable: true });
  t.after(() => { if (original) Object.defineProperty(globalThis, "Worker", original); else delete globalThis.Worker; });
  return { NativeWorker, workers };
}

test("local OCR không chọn giữa các điểm đọc mâu thuẫn; giữ confidence của đúng từ số", () => {
  const result = (text, confidence) => ({ data: { text, confidence } });
  assert.equal(agreeLocalOcrReadings([result("1.9", 81), result("7.9", 96)]), null);
  assert.equal(agreeLocalOcrReadings([result("7.9", 81)]), null);
  assert.deepEqual(agreeLocalOcrReadings([result("7.9", 81), result("7.9", 96)]), { value: 7.9, confidence: 96 });
  assert.deepEqual(agreeLocalOcrReadings([result("6.3", 96), result("63", 95)]), { value: 6.3, confidence: 96 });
  assert.equal(agreeLocalOcrReadings([result("7.9", 96)], { value: 1.9, confidence: 80 }), null);
  const blocks = [{ paragraphs: [{ lines: [{ words: [{ text: "8.9", confidence: 95 }, { text: ".", confidence: 0 }] }] }] }];
  assert.deepEqual(agreeLocalOcrReadings([{ data: { text: "8.9 .", confidence: 44, blocks } }]), { value: 8.9, confidence: 95 });
});

test("local OCR đọc lại ô điểm không đoán dấu thập phân hay dùng số có độ tin cậy thấp", () => {
  const result = (text, confidence = 96) => ({ data: { text, confidence } });
  assert.equal(localOcrScore(result("8,5\n")), 8.5);
  assert.equal(localOcrScore(result("10.00")), 10);
  for (const text of ["62", "75", "-1", "11", "8.555", "7 8", "8.5 điểm", ""]) assert.equal(localOcrScore(result(text)), null);
  assert.equal(localOcrScore(result("7.5", 40)), null);
  assert.equal(localOcrScore(result("7.5", NaN)), null);
  const blocks = words => [{ paragraphs: [{ lines: [{ words }] }] }];
  assert.equal(localOcrScore({ data: { text: "8.9 .", confidence: 44, blocks: blocks([{ text: "8.9", confidence: 95 }, { text: ".", confidence: 0 }]) } }), 8.9);
  assert.equal(localOcrScore({ data: { text: "8 9", confidence: 95, blocks: blocks([{ text: "8", confidence: 95 }, { text: "9", confidence: 95 }]) } }), null);
});

test("local OCR dùng geometry và không trả tên học sinh, ảnh hoặc dữ liệu thô", async () => {
  const word = (text, x, y) => ({ text, confidence: 95, bbox: { x0: x, y0: y, x1: x + 25, y1: y + 16 } });
  const blocks = [{ paragraphs: [{ lines: [{ words: [word("Lớp 12", 10, 10), word("HK1", 140, 60), word("HK2", 240, 60), word("CN", 340, 60),
    word("Toán", 10, 110), word("8.5", 140, 110), word("9.0", 240, 110), word("8.8", 340, 110)] }] }] }];
  let terminated = 0;
  const images = [{ blob: "photo", originalName: "private.png" }];
  const result = await recognizeTranscriptInBrowser(images, { assetBaseUrl: "/vendor/", catalog, browserEnvironment: {},
    tesseractModule: { createWorker: async () => ({ setParameters: async () => {},
      recognize: async () => ({ data: { blocks, text: "Họ và tên: Thông tin riêng tư", confidence: 95 } }),
      terminate: async () => { terminated++; } }) } });
  assert.equal(result.data.student.name, null);
  assert.deepEqual(result.data.scores.map(({ subject, grade, semester1, semester2, year }) => ({ subject, grade, semester1, semester2, year })),
    [{ subject: "Toán", grade: 12, semester1: 8.5, semester2: 9, year: 8.8 }]);
  assert.equal(JSON.stringify(result).includes("Thông tin riêng tư"), false);
  assert.equal(images[0].blob, null);
  assert.equal(terminated, 1);
  assert.equal(result.evidence.expectedCells, 3);
  assert.equal(result.evidence.expectedCellsReliable, true);
  assert.deepEqual(result.evidence.expectedCellKeys, ["Toán|12|semester1", "Toán|12|semester2", "Toán|12|year"]);
  assert.equal(result.timings.workerCount, 1);
  assert.ok(result.timings.totalMs >= result.timings.workerInitMs);
});

test("local OCR chỉ khôi phục tên môn khi đọc lại đúng nhãn, giữ nguyên các cột điểm", async (t) => {
  const oldDocument = globalThis.document, oldBitmap = globalThis.createImageBitmap;
  t.after(() => { globalThis.document = oldDocument; globalThis.createImageBitmap = oldBitmap; });
  globalThis.createImageBitmap = async () => ({ width: 1600, height: 2133, close() {} });
  globalThis.document = { baseURI: "http://127.0.0.1/", createElement: () => ({
    getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: (callback, type) => callback(new Blob(["image"], { type }))
  }) };
  const word = (text, x, y) => ({ text, confidence: 95, bbox: { x0: x, y0: y, x1: x + 40, y1: y + 16 } });
  const blocks = words => [{ paragraphs: [{ lines: [{ words }] }] }];
  const original = blocks([word("Lớp 12", 10, 10), word("HK1", 140, 60), word("HK2", 240, 60), word("CN", 340, 60),
    word("Toán", 10, 110), word("8.5", 140, 110), word("9.0", 240, 110), word("8.8", 340, 110),
    word("Ngir van", 10, 160), word("7.6", 140, 160), word("6.1", 240, 160), word("6.6", 340, 160),
    word("Lịch sử", 10, 210), word("7.5", 140, 210), word("8.0", 240, 210), word("7.8", 340, 210)]);
  for (const { recoveredLabel, native } of [{ recoveredLabel: "Ngữ văn" }, { recoveredLabel: "Chữ không rõ" }, { recoveredLabel: "Dia lí", native: true }]) {
    let mode, retries = 0;
    const initial = structuredClone(original);
    if (native) initial[0].paragraphs[0].lines[0].words.find(word => word.text === "Ngir van").text = "Bia lí";
    const result = await recognizeTranscriptInBrowser([{ blob: new Blob(["image"]), width: 1600, height: 2133 }], {
      assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, sourceFiles: [{ name: "source.jpg" }],
      tesseractModule: { createWorker: async () => ({ setParameters: async parameters => { mode = parameters.tessedit_pageseg_mode; },
        recognize: async (blob, options) => {
          if (blob.type === "image/png") { retries++; return { data: { text: native ? recoveredLabel : "Không rõ", confidence: 79 } }; }
          if (!options?.rectangle) return { data: { blocks: initial, text: "Lớp 12", confidence: 95 } };
          assert.ok(["7", "13"].includes(mode));
          retries++;
          const recovered = word(native ? "Bia lí" : recoveredLabel, 15, 240);
          recovered.bbox = Object.fromEntries(Object.entries(recovered.bbox).map(([key, value]) => [key, key.startsWith("x") ? value * 1.5 : value]));
          return { data: { blocks: blocks([recovered]), confidence: 95 } };
        }, terminate: async () => {} }) }
    });
    const row = result.data.scores.find(row => row.subject === (native ? "Địa lí" : "Ngữ văn"));
    assert.equal(retries, recoveredLabel === "Ngữ văn" ? 1 : 3);
    if (row) assert.deepEqual([row.semester1, row.semester2, row.year], [7.6, 6.1, 6.6]);
    assert.equal(Boolean(row), recoveredLabel === "Ngữ văn" || Boolean(native));
    assert.equal(result.data.scores.find(row => row.subject === "Toán").semester1, 8.5);
  }
});

test("local OCR chuyển PSM qua setParameters trước khi đọc lại ô, giải phóng ảnh gốc đã xử lý", async (t) => {
  const oldDocument = globalThis.document, oldBitmap = globalThis.createImageBitmap;
  t.after(() => { globalThis.document = oldDocument; globalThis.createImageBitmap = oldBitmap; });
  let closed = 0, terminated = 0, mode;
  const retryModes = [], pageDpis = [];
  globalThis.createImageBitmap = async () => ({ width: 2000, height: 2666, close: () => { closed++; } });
  globalThis.document = { baseURI: "http://127.0.0.1/", createElement: () => ({
    getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: callback => callback(new Blob(["image"]))
  }) };
  const word = (text, x, y, confidence = 95) => ({ text, confidence, bbox: { x0: x, y0: y, x1: x + 25, y1: y + 16 } });
  const blocks = [{ paragraphs: [{ lines: [{ words: [word("Lớp 12", 10, 10), word("HK1", 140, 60), word("HK2", 240, 60), word("CN", 340, 60),
    word("Toán", 10, 110), word("8.5", 140, 110, 40), word("9.0", 240, 110), word("8.8", 340, 110)] }] }] }];
  const images = [1, 2].map(() => ({ blob: new Blob(["image"]), width: 1600, height: 2133 }));
  const result = await recognizeTranscriptInBrowser(images, { assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, sourceFiles: [{ name: "source.jpg" }, { name: "source2.jpg" }],
    tesseractModule: { createWorker: async () => ({
      setParameters: async parameters => {
        if (parameters.tessedit_pageseg_mode) mode = parameters.tessedit_pageseg_mode;
        if (parameters.tessedit_pageseg_mode === "11" && parameters.user_defined_dpi !== undefined) pageDpis.push(parameters.user_defined_dpi);
      },
      recognize: async (_blob, options) => {
        if (!options?.rectangle) return { data: { blocks, text: "Lớp 12", confidence: 95 } };
        assert.equal(options.tessedit_pageseg_mode, undefined);
        retryModes.push(mode);
        return { data: { text: "8.5", confidence: 95 } };
      }, terminate: async () => { terminated++; }
    }) } });
  assert.deepEqual(retryModes, ["13", "7", "13", "7"]);
  assert.deepEqual(pageDpis, ["0", "0"]);
  assert.equal(result.data.scores[0].semester1, 8.5);
  assert.equal(result.data.scores[0].confidence, 0.95);
  assert.equal(closed, 6);
  assert.equal(terminated, 1);
  assert.ok(images.every(image => image.blob === null));
});

test("hủy trước khi quét không tạo worker; hủy khi khởi tạo giải phóng worker đến muộn", async () => {
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  await assert.rejects(() => recognizeTranscriptInBrowser([{ blob: "image" }], {
    assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, signal: alreadyAborted.signal,
    tesseractModule: { createWorker: async () => assert.fail("Không tạo worker sau khi hủy") }
  }), { code: "CLIENT_OCR_ABORTED" });
  const controller = new AbortController();
  let resolveWorker, terminated = 0;
  const pending = recognizeTranscriptInBrowser([{ blob: "image" }], {
    assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, signal: controller.signal,
    tesseractModule: { createWorker: () => new Promise(resolve => { resolveWorker = resolve; queueMicrotask(() => controller.abort()); }) }
  });
  await assert.rejects(() => pending, { code: "CLIENT_OCR_ABORTED" });
  resolveWorker({ terminate: async () => { terminated++; } });
  await Promise.resolve();
  assert.equal(terminated, 1);
});

test("hủy khi nhận diện dừng worker, không đọc ảnh tiếp theo và không trả kết quả cũ", async () => {
  const controller = new AbortController();
  let reads = 0, terminated = 0, timing;
  const images = [{ blob: "one" }, { blob: "two" }];
  await assert.rejects(() => recognizeTranscriptInBrowser(images, {
    assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, signal: controller.signal,
    onTiming: value => { timing = value; },
    tesseractModule: { createWorker: async () => ({ setParameters: async () => {},
      recognize: async () => { reads++; queueMicrotask(() => controller.abort()); return new Promise(() => {}); },
      terminate: async () => { terminated++; } }) }
  }), { code: "CLIENT_OCR_ABORTED" });
  assert.equal(reads, 1);
  assert.equal(terminated, 1);
  assert.ok(images.every(image => image.blob === null));
  assert.equal(timing.workerCount, 1);
  assert.ok(Number.isFinite(timing.totalMs));
});

test("hủy khi giải mã ảnh vẫn giải phóng bitmap hoàn thành muộn và không nhận diện", async (t) => {
  const oldBitmap = globalThis.createImageBitmap;
  t.after(() => { globalThis.createImageBitmap = oldBitmap; });
  const controller = new AbortController();
  let resolveBitmap, closed = 0, terminated = 0;
  globalThis.createImageBitmap = () => new Promise(resolve => { resolveBitmap = resolve; queueMicrotask(() => controller.abort()); });
  await assert.rejects(() => recognizeTranscriptInBrowser([{ blob: null }], {
    assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, sourceFiles: [{ name: "photo.jpg" }], signal: controller.signal,
    tesseractModule: { createWorker: async () => ({ setParameters: async () => {}, recognize: async () => assert.fail("Không đọc ảnh sau khi hủy"),
      terminate: async () => { terminated++; } }) }
  }), { code: "CLIENT_OCR_ABORTED" });
  resolveBitmap({ width: 3468, height: 4624, close() { closed++; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, 1);
  assert.equal(terminated, 1);
});

test("khởi tạo theo dõi tải core, dữ liệu ngôn ngữ và API nhưng không lộ dữ liệu OCR", async () => {
  let timing;
  await recognizeTranscriptInBrowser([{ blob: "image" }], {
    assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, onTiming: value => { timing = value; },
    tesseractModule: { createWorker: async (_langs, _oem, options) => {
      for (const status of ["loading tesseract core", "loading language traineddata", "initializing api"]) {
        options.logger({ status, progress: 0 }); options.logger({ status, progress: 1 });
      }
      options.logger({ status: "private text must be ignored", progress: 1 });
      return { setParameters: async () => {}, recognize: async () => ({ data: { text: "LỚP 12\nMôn học HK1 HK2 Cả năm\nToán 8 9 8,5", confidence: 88 } }),
        terminate: async () => {} };
    } }
  });
  assert.ok([timing.coreLoadMs, timing.languageLoadMs, timing.apiInitMs].every(Number.isFinite));
  assert.equal(JSON.stringify(timing).includes("private text"), false);
  assert.equal(JSON.stringify(timing).includes("Toán"), false);
});

test("quét trực tiếp file xử lý tuần tự và bỏ ảnh chi tiết khi bảng đã rõ", async (t) => {
  const oldDocument = globalThis.document, oldBitmap = globalThis.createImageBitmap;
  t.after(() => { globalThis.document = oldDocument; globalThis.createImageBitmap = oldBitmap; });
  let decodes = 0, closed = 0, terminated = 0;
  const order = [];
  globalThis.createImageBitmap = async () => { decodes++; order.push("decode"); return { width: 3468, height: 4624, close() { closed++; } }; };
  globalThis.document = { baseURI: "http://127.0.0.1/", createElement: () => ({
    getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: (callback, type) => callback(new Blob(["image"], { type }))
  }) };
  const word = (text, x, y) => ({ text, confidence: 95, bbox: { x0: x, y0: y, x1: x + 25, y1: y + 16 } });
  const blocks = [{ paragraphs: [{ lines: [{ words: [word("Lớp 12", 10, 10), word("HK1", 140, 60), word("HK2", 240, 60), word("CN", 340, 60),
    word("Toán", 10, 110), word("8.5", 140, 110), word("9.0", 240, 110), word("8.8", 340, 110)] }] }] }];
  const result = await recognizeTranscriptInBrowser([{ blob: null }, { blob: null }], {
    assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, sourceFiles: [{ name: "one.jpg" }, { name: "two.jpg" }],
    tesseractModule: { createWorker: async (_langs, _oem, options) => {
      assert.equal(options.cacheMethod, "write");
      assert.equal(options.logging, false);
      return { setParameters: async () => {}, recognize: async () => { order.push("recognize"); return { data: { blocks, text: "Lớp 12", confidence: 95 } }; },
        terminate: async () => { terminated++; } };
    } }
  });
  assert.deepEqual(order, ["decode", "recognize", "decode", "recognize"]);
  assert.equal(decodes, 2);
  assert.equal(closed, 2);
  assert.equal(terminated, 1);
  assert.equal(result.data.scores[0].semester1, 8.5);
  assert.equal(result.evidence.expectedCells, 3);
  assert.equal(result.timings.retryReads, 0);
});

test("local OCR đọc lại ô từ ảnh gốc nhưng không sửa dấu thập phân hoặc bỏ qua điểm mâu thuẫn", async (t) => {
  const oldDocument = globalThis.document, oldBitmap = globalThis.createImageBitmap;
  t.after(() => { globalThis.document = oldDocument; globalThis.createImageBitmap = oldBitmap; });
  for (const conflicting of [false, true]) {
    let closed = 0, terminated = 0, isolatedReads = 0;
    globalThis.createImageBitmap = async () => ({ width: 2000, height: 2666, close: () => { closed++; } });
    globalThis.document = { baseURI: "http://127.0.0.1/", createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {}, putImageData() {},
      getImageData: () => ({ data: new Uint8ClampedArray(Array.from({ length: 100 }, (_, index) => index < 20 ? [60, 60, 60, 255] : [220, 220, 220, 255]).flat()) }) }),
      toBlob: (callback, type) => callback(new Blob(["image"], { type })) }) };
    const word = (text, x, y, confidence = 95) => ({ text, confidence, bbox: { x0: x, y0: y, x1: x + 25, y1: y + 16 } });
    const blocks = [{ paragraphs: [{ lines: [{ words: [word("Lớp 12", 10, 10), word("HK1", 140, 60), word("HK2", 240, 60), word("CN", 340, 60),
      word("Hóa học", 10, 110), word(conflicting ? "6.4" : "54", 140, 110, conflicting ? 80 : 95), word("9.0", 240, 110), word("8.8", 340, 110)] }] }] }];
    const result = await recognizeTranscriptInBrowser([{ blob: new Blob(["image"]), width: 1600, height: 2133 }], {
      assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, sourceFiles: [{ name: "source.jpg" }],
      tesseractModule: { createWorker: async () => ({ setParameters: async () => {}, recognize: async (blob, options) => {
        if (blob.type === "image/png" && !options?.rectangle) { isolatedReads++; return { data: { text: "5.4", confidence: 96 } }; }
        return options?.rectangle ? { data: { text: "54", confidence: 96 } } : { data: { blocks, text: "Lớp 12", confidence: 95 } };
      }, terminate: async () => { terminated++; } }) }
    });
    assert.equal(result.data.scores[0].semester1, conflicting ? null : 5.4);
    assert.equal(result.data.scores[0].year, 8.8);
    assert.equal(isolatedReads, conflicting ? 4 : 2);
    assert.equal(closed, 4);
    assert.equal(terminated, 1);
  }
});

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
  assert.equal(result.data.scores[0].year, null);
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0].localValues, [8.5, 9]);
  assert.equal(result.evidence.conflicts, 1);
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

test("hủy khởi tạo chưa bao giờ resolve vẫn terminate native worker và khôi phục constructor ngay", async (t) => {
  const { NativeWorker, workers } = installNativeWorkerStub(t);
  const controller = new AbortController();
  let started;
  const created = new Promise(resolve => { started = resolve; });
  const pending = recognizeTranscriptInBrowser([{ blob: "image" }], {
    assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, signal: controller.signal,
    tesseractModule: { createWorker: (_langs, _oem, options) => {
      new globalThis.Worker(options.workerPath);
      started();
      return new Promise(() => {});
    } }
  });
  await created;
  assert.equal(globalThis.Worker, NativeWorker);
  controller.abort();
  await assert.rejects(() => pending, { code: "CLIENT_OCR_ABORTED" });
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminated, 1);
});

test("timeout, lỗi và throw khi khởi tạo chỉ dừng native worker đúng đường dẫn và restore Worker", async (t) => {
  const { NativeWorker, workers } = installNativeWorkerStub(t);
  for (const mode of ["timeout", "error", "throw"]) {
    const startIndex = workers.length;
    await assert.rejects(() => recognizeTranscriptInBrowser([{ blob: "image" }], {
      assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, initializationTimeoutMs: 5,
      tesseractModule: { createWorker: (_langs, _oem, options) => {
        new globalThis.Worker("https://other.test/unrelated-worker.js");
        new globalThis.Worker(new URL(options.workerPath));
        if (mode === "throw") throw new Error("private startup details");
        if (mode === "error") queueMicrotask(() => options.errorHandler(new Error("private startup details")));
        return new Promise(() => {});
      } }
    }), { code: mode === "timeout" ? "CLIENT_OCR_TIMEOUT" : "CLIENT_OCR_FAILED" });
    assert.equal(globalThis.Worker, NativeWorker);
    assert.equal(workers[startIndex].terminated, 0);
    assert.equal(workers[startIndex + 1].terminated, 1);
  }
});

test("handle khởi tạo đến muộn không terminate lần hai sau khi native worker đã được dừng", async (t) => {
  const { workers } = installNativeWorkerStub(t);
  const controller = new AbortController();
  let resolveWorker, apiTerminates = 0;
  const pending = recognizeTranscriptInBrowser([{ blob: "image" }], {
    assetBaseUrl: "/vendor/", catalog, browserEnvironment: {}, signal: controller.signal,
    tesseractModule: { createWorker: (_langs, _oem, options) => {
      new globalThis.Worker(options.workerPath);
      queueMicrotask(() => controller.abort());
      return new Promise(resolve => { resolveWorker = resolve; });
    } }
  });
  await assert.rejects(() => pending, { code: "CLIENT_OCR_ABORTED" });
  resolveWorker({ terminate: async () => { apiTerminates++; workers[0].terminate(); } });
  await Promise.resolve();
  assert.equal(workers[0].terminated, 1);
  assert.equal(apiTerminates, 0);
});

test("quét bình thường giữ một native worker cho nhiều ảnh và dùng API terminate đúng một lần", async (t) => {
  const { NativeWorker, workers } = installNativeWorkerStub(t);
  let apiTerminates = 0;
  const result = await recognizeTranscriptInBrowser([{ blob: "one" }, { blob: "two" }, { blob: "three" }], {
    assetBaseUrl: "/vendor/", catalog, browserEnvironment: {},
    tesseractModule: { createWorker: async (languages, _oem, options) => {
      assert.deepEqual(languages, ["vie", "eng"]);
      assert.equal(options.workerBlobURL, false);
      const native = new globalThis.Worker(options.workerPath);
      return { setParameters: async () => {}, recognize: async () => ({ data: { text: "Lớp 12\nMôn học HK1 HK2 Cả năm\nToán 8 9 8.5", confidence: 95 } }),
        terminate: async () => { apiTerminates++; native.terminate(); } };
    } }
  });
  assert.equal(globalThis.Worker, NativeWorker);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminated, 1);
  assert.equal(apiTerminates, 1);
  assert.equal(result.timings.workerCount, 1);
  assert.equal(result.data.scores[0].year, 8.5);
});

test("Worker không cho ghi vẫn quét được với cleanup API và không sửa constructor", async (t) => {
  const { NativeWorker, workers } = installNativeWorkerStub(t);
  Object.defineProperty(globalThis, "Worker", { value: NativeWorker, writable: false, configurable: true });
  await recognizeTranscriptInBrowser([{ blob: "one" }], {
    assetBaseUrl: "/vendor/", catalog, browserEnvironment: {},
    tesseractModule: { createWorker: async (_langs, _oem, options) => {
      const native = new globalThis.Worker(options.workerPath);
      return { setParameters: async () => {}, recognize: async () => ({ data: { text: "Lớp 12\nMôn học HK1 HK2 Cả năm\nToán 8 9 8.5", confidence: 95 } }),
        terminate: async () => native.terminate() };
    } }
  });
  assert.equal(globalThis.Worker, NativeWorker);
  assert.equal(workers[0].terminated, 1);
});
