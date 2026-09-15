import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker } from "tesseract.js";
import { parseOcrTranscriptPages } from "../../lib/ocrTranscriptParser.js";
import { AppError } from "../errors.js";
import { loadTranscriptSubjectCatalog, validateTranscriptPayload } from "../validators/transcriptValidator.js";

const taskRequire = createRequire(import.meta.url);
const CACHE_PATH = fileURLToPath(new URL("../../.local/tesseract-cache/", import.meta.url));
const LANGUAGE_PATH = fileURLToPath(new URL("../../.local/tesseract-languages/", import.meta.url));
const LOCAL_LANGUAGES = [
  { packageName: "@tesseract.js-data/vie", code: "vie" },
  { packageName: "@tesseract.js-data/eng", code: "eng" }
];
const MAX_WORKER_JOBS = 24;
const MAX_WORKER_AGE_MS = 30 * 60 * 1000;
const DEFAULT_TOTAL_TIMEOUT_MS = 180_000;

async function loadLanguageData() {
  await mkdir(LANGUAGE_PATH, { recursive: true });
  await Promise.all(LOCAL_LANGUAGES.map(async ({ packageName, code }) => {
    const packageRoot = dirname(taskRequire.resolve(`${packageName}/package.json`));
    await copyFile(join(packageRoot, "4.0.0_best_int", `${code}.traineddata.gz`), join(LANGUAGE_PATH, `${code}.traineddata.gz`));
  }));
}

function timeoutValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(30_000, Math.min(10 * 60_000, parsed)) : DEFAULT_TOTAL_TIMEOUT_MS;
}

function timeout(promise, milliseconds) {
  let timeoutId;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new AppError("OCR cục bộ xử lý quá lâu. Hãy thử ít ảnh hơn hoặc ảnh rõ hơn.", { statusCode: 504, code: "OCR_TIMEOUT" })), milliseconds);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeoutId));
}

export function createTesseractVisionService({ totalTimeoutMs = process.env.TESSERACT_TIMEOUT_MS } = {}) {
  const scanTimeoutMs = timeoutValue(totalTimeoutMs);
  let workerPromise = null;
  let workerCreatedAt = 0;
  let workerJobs = 0;
  let queue = Promise.resolve();

  async function disposeWorker() {
    const current = workerPromise;
    workerPromise = null;
    workerCreatedAt = 0;
    workerJobs = 0;
    if (!current) return;
    try { await (await current).terminate(); } catch { /* Worker đã dừng. */ }
  }

  async function getWorker() {
    if (workerPromise && (workerJobs >= MAX_WORKER_JOBS || Date.now() - workerCreatedAt > MAX_WORKER_AGE_MS)) await disposeWorker();
    if (!workerPromise) {
      workerCreatedAt = Date.now();
      workerPromise = (async () => {
        await mkdir(CACHE_PATH, { recursive: true });
        await loadLanguageData();
        const worker = await createWorker(LOCAL_LANGUAGES.map((item) => item.code), 1, {
          cachePath: CACHE_PATH,
          langPath: LANGUAGE_PATH,
          errorHandler: () => {}
        });
        await worker.setParameters({ preserve_interword_spaces: "1" });
        return worker;
      })().catch((error) => {
        workerPromise = null;
        throw error;
      });
    }
    return workerPromise;
  }

  async function scan(images) {
    const catalog = await loadTranscriptSubjectCatalog();
    const deadline = Date.now() + scanTimeoutMs;
    const pages = [];
    try {
      for (const image of images) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new AppError("OCR cục bộ xử lý quá lâu. Hãy thử ít ảnh hơn hoặc ảnh rõ hơn.", { statusCode: 504, code: "OCR_TIMEOUT" });
        const worker = await getWorker();
        const result = await timeout(worker.recognize(image.buffer), remaining);
        workerJobs += 1;
        pages.push({ text: result.data.text, confidence: result.data.confidence, originalname: image.originalname });
      }
      const parsed = parseOcrTranscriptPages(pages, catalog);
      const validated = validateTranscriptPayload(parsed.payload, catalog);
      return {
        data: validated.data,
        warnings: [
          "Kết quả được nhận diện bằng OCR Tesseract trên máy chủ và có độ tin cậy thấp hơn mô hình AI. Hãy đối chiếu từng ô với ảnh gốc.",
          ...parsed.warnings,
          ...validated.warnings
        ]
      };
    } catch (error) {
      if (error?.code === "OCR_TIMEOUT") await disposeWorker();
      if (error instanceof AppError) throw error;
      await disposeWorker();
      throw new AppError("OCR cục bộ chưa đọc được ảnh học bạ. Hãy dùng ảnh thẳng, rõ chữ hoặc nhập điểm thủ công.", { statusCode: 422, code: "OCR_FAILED" });
    }
  }

  return function scanTranscriptWithTesseract(images) {
    const next = queue.then(() => scan(images), () => scan(images));
    queue = next.catch(() => {});
    return next;
  };
}
