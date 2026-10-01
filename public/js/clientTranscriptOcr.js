import { parseOcrTranscriptPages } from "./core/ocrTranscriptParser.js?v=20261001-1";
import { validateTranscriptPayload } from "./core/transcriptValidator.js";

const GENERIC_OCR_ERROR = "Không thể nhận diện ảnh. Hãy dùng ảnh thẳng, rõ chữ hoặc nhập điểm thủ công.";

async function withOcrTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ClientTranscriptOcrError(
        "Nhận diện trên thiết bị phản hồi quá lâu. Hãy thử một ảnh hoặc nhập điểm thủ công.",
        "CLIENT_OCR_TIMEOUT"
      )), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

export class ClientTranscriptOcrError extends Error {
  constructor(message = GENERIC_OCR_ERROR, code = "CLIENT_OCR_FAILED") {
    super(message);
    this.name = "ClientTranscriptOcrError";
    this.code = code;
  }
}

function urlFrom(baseUrl, path) {
  const pageBaseUrl = globalThis.document?.baseURI || globalThis.location?.href || "http://127.0.0.1/";
  return new URL(path, new URL(baseUrl, pageBaseUrl)).toString();
}

async function loadCatalog(catalogUrl, fetchImpl) {
  const response = await fetchImpl(catalogUrl, { cache: "force-cache" });
  if (!response.ok) throw new Error("subject catalog unavailable");
  const catalog = await response.json();
  if (!Array.isArray(catalog?.subjects) || !catalog.subjects.length) throw new Error("invalid subject catalog");
  return catalog;
}

async function loadTesseract(moduleUrl) {
  const imported = await import(moduleUrl);
  const module = imported.default || imported;
  if (typeof module?.createWorker !== "function") throw new Error("Tesseract unavailable");
  return module;
}

export function transcriptTextFromBlocks(blocks, fallbackText = "") {
  const words = (blocks || []).flatMap((block) => (block.paragraphs || []).flatMap((paragraph) =>
    (paragraph.lines || []).flatMap((line) => line.words || [])))
    .filter((word) => word.text?.trim() && [word.bbox?.x0, word.bbox?.y0, word.bbox?.y1].every(Number.isFinite));
  if (!words.length) return fallbackText;
  const heights = words.map((word) => word.bbox.y1 - word.bbox.y0).sort((a, b) => a - b);
  const tolerance = Math.max(6, heights[Math.floor(heights.length / 2)] * 1.2);
  const rows = [];
  for (const word of words.sort((a, b) => (a.bbox.y0 + a.bbox.y1) - (b.bbox.y0 + b.bbox.y1))) {
    const center = (word.bbox.y0 + word.bbox.y1) / 2;
    let row = rows.find((item) => Math.abs(item.center - center) <= tolerance);
    if (!row) { row = { center, words: [] }; rows.push(row); }
    row.words.push(word);
  }
  return rows.map((row) => row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map((word) => word.text).join(" ")).join("\n");
}

export async function recognizeTranscriptInBrowser(images, {
  assetBaseUrl,
  catalog,
  catalogUrl,
  fetchImpl = globalThis.fetch,
  tesseractModule,
  browserEnvironment = globalThis.window,
  onStatus = () => {},
  initializationTimeoutMs = 120_000,
  recognitionTimeoutMs = 120_000
} = {}) {
  if (!browserEnvironment) throw new ClientTranscriptOcrError(GENERIC_OCR_ERROR, "BROWSER_OCR_UNAVAILABLE");
  if (!Array.isArray(images) || images.length === 0) throw new ClientTranscriptOcrError("Hãy chọn ít nhất một ảnh học bạ.", "MISSING_IMAGES");
  if (!assetBaseUrl) throw new ClientTranscriptOcrError();

  let worker;
  let finished = false;
  try {
    onStatus("Đang chuẩn bị nhận diện trên thiết bị...");
    const tesseract = tesseractModule || await withOcrTimeout(loadTesseract(urlFrom(assetBaseUrl, "tesseract/tesseract.esm.min.js")), initializationTimeoutMs);
    const subjectCatalog = catalog || await withOcrTimeout(loadCatalog(catalogUrl || urlFrom(assetBaseUrl, "transcript-subjects.json"), fetchImpl), initializationTimeoutMs);
    let rejectWorkerFailure;
    const workerFailure = new Promise((_, reject) => { rejectWorkerFailure = reject; });
    const workerPromise = tesseract.createWorker(["vie", "eng"], 1, {
      workerPath: urlFrom(assetBaseUrl, "tesseract/worker.min.js?v=20261001-1"),
      corePath: urlFrom(assetBaseUrl, "tesseract-core/"),
      langPath: urlFrom(assetBaseUrl, "tesseract-lang/"),
      workerBlobURL: false,
      errorHandler: (error) => rejectWorkerFailure(error instanceof Error ? error : new Error(String(error)))
    });
    workerPromise.then((createdWorker) => {
      if (finished) createdWorker.terminate().catch(() => {});
    }, () => {});
    worker = await withOcrTimeout(Promise.race([workerPromise, workerFailure]), initializationTimeoutMs);
    await withOcrTimeout(Promise.race([worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "11" }), workerFailure]), initializationTimeoutMs);

    const pages = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      onStatus(`Đang nhận diện ảnh ${index + 1}/${images.length}...`);
      let result;
      try {
        result = await withOcrTimeout(Promise.race([worker.recognize(image.blob, {}, { blocks: true }), workerFailure]), recognitionTimeoutMs);
      } finally {
        image.blob = null;
      }
      pages.push({
        text: transcriptTextFromBlocks(result?.data?.blocks, String(result?.data?.text || "")),
        confidence: Number(result?.data?.confidence) || 0,
        originalname: image.originalName || image.uploadName || `hoc-ba-${index + 1}.jpg`
      });
    }

    const parsed = parseOcrTranscriptPages(pages, subjectCatalog);
    const validated = validateTranscriptPayload(parsed.payload, subjectCatalog);
    return {
      success: true,
      data: validated.data,
      warnings: [
        "Hãy đối chiếu từng ô với ảnh gốc trước khi điền.",
        "Nhận diện trên thiết bị có thể bỏ sót môn hoặc cột điểm. Hãy bổ sung ô còn thiếu bằng tay; không tự suy đoán điểm.",
        ...parsed.warnings,
        ...validated.warnings
      ],
      engine: "browser"
    };
  } catch (error) {
    if (error instanceof ClientTranscriptOcrError) throw error;
    throw new ClientTranscriptOcrError();
  } finally {
    finished = true;
    for (const image of images) image.blob = null;
    if (worker) {
      try { await worker.terminate(); } catch { /* Worker đã được giải phóng. */ }
    }
  }
}
