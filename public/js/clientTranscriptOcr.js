import { parseOcrTranscriptPages } from "./core/ocrTranscriptParser.js";
import { validateTranscriptPayload } from "./core/transcriptValidator.js";

const GENERIC_OCR_ERROR = "Không thể nhận diện ảnh. Hãy dùng ảnh thẳng, rõ chữ hoặc nhập điểm thủ công.";

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

export async function recognizeTranscriptInBrowser(images, {
  assetBaseUrl,
  catalog,
  catalogUrl,
  fetchImpl = globalThis.fetch,
  tesseractModule,
  browserEnvironment = globalThis.window,
  onStatus = () => {}
} = {}) {
  if (!browserEnvironment) throw new ClientTranscriptOcrError(GENERIC_OCR_ERROR, "BROWSER_OCR_UNAVAILABLE");
  if (!Array.isArray(images) || images.length === 0) throw new ClientTranscriptOcrError("Hãy chọn ít nhất một ảnh học bạ.", "MISSING_IMAGES");
  if (!assetBaseUrl) throw new ClientTranscriptOcrError();

  let worker;
  try {
    onStatus("Đang chuẩn bị nhận diện trên thiết bị...");
    const tesseract = tesseractModule || await loadTesseract(urlFrom(assetBaseUrl, "tesseract/tesseract.esm.min.js"));
    const subjectCatalog = catalog || await loadCatalog(catalogUrl || urlFrom(assetBaseUrl, "transcript-subjects.json"), fetchImpl);
    worker = await tesseract.createWorker(["vie", "eng"], 1, {
      workerPath: urlFrom(assetBaseUrl, "tesseract/worker.min.js"),
      corePath: urlFrom(assetBaseUrl, "tesseract-core/"),
      langPath: urlFrom(assetBaseUrl, "tesseract-lang/"),
      workerBlobURL: true,
      errorHandler: () => {}
    });
    await worker.setParameters({ preserve_interword_spaces: "1" });

    const pages = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      onStatus(`Đang nhận diện ảnh ${index + 1}/${images.length}...`);
      let result;
      try {
        result = await worker.recognize(image.blob);
      } finally {
        image.blob = null;
      }
      pages.push({
        text: String(result?.data?.text || ""),
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
        ...parsed.warnings,
        ...validated.warnings
      ],
      engine: "browser"
    };
  } catch (error) {
    if (error instanceof ClientTranscriptOcrError) throw error;
    const hostname = globalThis.location?.hostname;
    if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
      console.warn("Browser OCR diagnostic:", error);
    }
    throw new ClientTranscriptOcrError();
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch { /* Worker đã được giải phóng. */ }
    }
  }
}
