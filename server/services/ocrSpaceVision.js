import { parseOcrTranscriptPages } from "../../lib/ocrTranscriptParser.js";
import { AppError } from "../errors.js";
import { loadTranscriptSubjectCatalog, validateTranscriptPayload } from "../validators/transcriptValidator.js";

const DEFAULT_ENDPOINT = "https://api.ocr.space/parse/image";
const DEFAULT_MAX_IMAGE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), maximum) : fallback;
}

function endpointValue(value) {
  try {
    const endpoint = new URL(value || DEFAULT_ENDPOINT);
    if (endpoint.protocol !== "https:") throw new Error("HTTPS required");
    return endpoint.toString();
  } catch {
    throw new AppError("Địa chỉ OCR.space không hợp lệ. Hãy dùng endpoint HTTPS.", { statusCode: 503, code: "OCR_SPACE_CONFIG" });
  }
}

function messageFrom(payload) {
  const parts = [payload?.ErrorMessage, payload?.ErrorDetails].flat(2).filter(Boolean);
  return parts.join(" ").toLocaleLowerCase("en");
}

function serviceError(code, message, statusCode = 503) {
  return new AppError(message, { statusCode, code });
}

function classifyResponseError(status, payload) {
  const message = messageFrom(payload);
  if (status === 429 || /quota|rate.?limit|maximum.*request|daily.*limit/.test(message)) {
    return serviceError("OCR_SPACE_QUOTA", "OCR.space đang quá tải hoặc đã hết hạn mức. Hệ thống sẽ thử bộ máy khác.");
  }
  if (status === 401 || status === 403 || /api.?key|unauthori[sz]ed|forbidden|invalid key/.test(message)) {
    return serviceError("OCR_SPACE_AUTH", "Không thể xác thực OCR.space. Hãy kiểm tra cấu hình máy chủ.");
  }
  return serviceError("OCR_SPACE_REQUEST_FAILED", "OCR.space chưa xử lý được ảnh. Hệ thống sẽ thử bộ máy khác.", 502);
}

async function fetchJsonWithTimeout(fetchImpl, endpoint, options, milliseconds) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), milliseconds);
  try {
    const response = await fetchImpl(endpoint, { ...options, signal: controller.signal });
    let payload;
    try {
      payload = await response.json();
    } catch {
      if (!response.ok) throw classifyResponseError(response.status, null);
      throw serviceError("OCR_SPACE_INVALID_RESPONSE", "OCR.space trả về dữ liệu không hợp lệ.", 502);
    }
    if (!response.ok || payload?.IsErroredOnProcessing) throw classifyResponseError(response.status, payload);
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw serviceError("OCR_SPACE_TIMEOUT", "OCR.space phản hồi quá lâu. Hệ thống sẽ thử bộ máy khác.", 504);
    if (error instanceof AppError) throw error;
    throw serviceError("OCR_SPACE_REQUEST_FAILED", "Không kết nối được OCR.space. Hệ thống sẽ thử bộ máy khác.", 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

function fileExtension(mimetype) {
  return mimetype === "image/png" ? "png" : "jpg";
}

export function createOcrSpaceVisionService({
  apiKey,
  endpoint = process.env.OCR_SPACE_ENDPOINT,
  engine = process.env.OCR_SPACE_ENGINE,
  maxImageBytes = process.env.OCR_SPACE_MAX_IMAGE_BYTES,
  totalTimeoutMs = process.env.OCR_SPACE_TIMEOUT_MS,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!apiKey) {
    return async () => { throw serviceError("MISSING_OCR_SPACE_API_KEY", "Máy chủ chưa được cấu hình OCR.space API key."); };
  }
  const serviceEndpoint = endpointValue(endpoint);
  const selectedEngine = ["2", "3"].includes(String(engine || "2")) ? String(engine || "2") : "2";
  const imageLimit = positiveInteger(maxImageBytes, DEFAULT_MAX_IMAGE_BYTES, 7 * 1024 * 1024);
  const scanTimeout = positiveInteger(totalTimeoutMs, DEFAULT_TIMEOUT_MS, 5 * 60_000);

  return async function scanTranscriptWithOcrSpace(images) {
    for (const image of images) {
      if (!SUPPORTED_MIME_TYPES.has(image.mimetype)) {
        throw serviceError("OCR_SPACE_UNSUPPORTED_IMAGE", "OCR.space không nhận định dạng ảnh này. Hệ thống sẽ dùng OCR cục bộ.", 422);
      }
      if (image.buffer.length > imageLimit) {
        throw serviceError("OCR_SPACE_FILE_TOO_LARGE", "Ảnh vượt giới hạn dung lượng OCR.space. Hệ thống sẽ dùng OCR cục bộ.", 413);
      }
    }

    const catalog = await loadTranscriptSubjectCatalog();
    const deadline = Date.now() + scanTimeout;
    const pages = [];
    const warnings = [];
    for (let index = 0; index < images.length; index += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw serviceError("OCR_SPACE_TIMEOUT", "OCR.space phản hồi quá lâu. Hệ thống sẽ thử bộ máy khác.", 504);
      const image = images[index];
      const form = new FormData();
      form.append("file", new Blob([image.buffer], { type: image.mimetype }), `hoc-ba-${index + 1}.${fileExtension(image.mimetype)}`);
      form.append("language", "vnm");
      form.append("isOverlayRequired", "false");
      form.append("detectOrientation", "true");
      form.append("scale", "true");
      form.append("isTable", "true");
      form.append("OCREngine", selectedEngine);
      const payload = await fetchJsonWithTimeout(fetchImpl, serviceEndpoint, {
        method: "POST",
        headers: { apikey: apiKey },
        body: form
      }, remaining);
      if (!Array.isArray(payload?.ParsedResults) || !payload.ParsedResults.length) {
        throw serviceError("OCR_SPACE_INVALID_RESPONSE", "OCR.space không trả về kết quả nhận diện hợp lệ.", 502);
      }
      const parsedText = payload.ParsedResults.map((result) => String(result?.ParsedText || "")).join("\n");
      if (payload.ParsedResults.some((result) => Number(result?.FileParseExitCode) === 2)) warnings.push(`Ảnh ${index + 1} chỉ được OCR.space đọc một phần.`);
      if (payload.ParsedResults.every((result) => Number(result?.FileParseExitCode) >= 3)) throw classifyResponseError(200, payload);
      pages.push({ text: parsedText, confidence: 55, originalname: image.originalname });
    }

    const parsed = parseOcrTranscriptPages(pages, catalog);
    const validated = validateTranscriptPayload(parsed.payload, catalog);
    return {
      data: validated.data,
      warnings: [
        "Kết quả được nhận diện qua OCR.space. Hãy đối chiếu từng ô với ảnh gốc trước khi điền.",
        ...warnings,
        ...parsed.warnings,
        ...validated.warnings
      ]
    };
  };
}
