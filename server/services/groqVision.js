import { Buffer } from "node:buffer";
import { AppError } from "../errors.js";
import { buildTranscriptPrompt } from "../prompts/transcriptPrompt.js";
import { loadTranscriptSubjectCatalog, validateTranscriptPayload } from "../validators/transcriptValidator.js";
import { GROQ_CHAT_ENDPOINT } from "./groqAssistant.js";
import { createProviderPool } from "./providerPool.js";

export const DEFAULT_GROQ_VISION_MODEL = "qwen/qwen3.8-27b";

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function serviceError(code, message, statusCode = 502) {
  return new AppError(message, { code: `GROQ_VISION_${code}`, statusCode });
}

function responseError(status) {
  if (status === 429) return serviceError("QUOTA", "Groq đang quá tải hoặc đã hết hạn mức. Hệ thống sẽ thử bộ máy khác.", 503);
  if (status === 401 || status === 403) return serviceError("AUTH", "Không thể xác thực Groq. Hãy kiểm tra cấu hình máy chủ.", 503);
  return serviceError("REQUEST_FAILED", "Groq chưa xử lý được ảnh học bạ. Hệ thống sẽ thử bộ máy khác.");
}

function parseTranscript(payload) {
  try {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error();
    const transcript = JSON.parse(content);
    if (!transcript || typeof transcript !== "object" || !Array.isArray(transcript.scores)) throw new Error();
    return transcript.scores;
  } catch {
    throw serviceError("INVALID_RESPONSE", "Groq trả về dữ liệu học bạ không hợp lệ.");
  }
}

export function createGroqVisionService({
  apiKey,
  apiKeys,
  model = DEFAULT_GROQ_VISION_MODEL,
  timeoutMs = 45_000,
  fetchImpl = globalThis.fetch
} = {}) {
  const keys = [...new Set((Array.isArray(apiKeys) && apiKeys.length ? apiKeys : [apiKey]).map((key) => String(key || "").trim()).filter(Boolean))];
  const selectedModel = String(model || "").trim().slice(0, 120) || DEFAULT_GROQ_VISION_MODEL;
  const configuredTimeout = Number(timeoutMs);
  const scanTimeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? Math.min(60_000, Math.max(1, Math.floor(configuredTimeout))) : 45_000;
  const requestWithKeyPool = createProviderPool({
    keys,
    createService: (key) => async (options) => {
      let response;
      try {
        if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
        response = await fetchImpl(GROQ_CHAT_ENDPOINT, { ...options, headers: { ...options.headers, Authorization: `Bearer ${key}` } });
      } catch (error) {
        if (options.signal.aborted || error?.name === "AbortError") throw serviceError("TIMEOUT", "Groq đọc ảnh học bạ quá lâu. Hệ thống sẽ thử bộ máy khác.", 504);
        throw serviceError("REQUEST_FAILED", "Không thể kết nối Groq OCR. Hệ thống sẽ thử bộ máy khác.");
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw responseError(response.status);
      }
      return response;
    },
    retryCodes: new Set(["GROQ_VISION_QUOTA", "GROQ_VISION_AUTH"]),
    cooldownMsByCode: { GROQ_VISION_QUOTA: 5 * 60_000, GROQ_VISION_AUTH: 60 * 60_000 },
    unavailableError: () => serviceError("UNAVAILABLE", "Máy chủ chưa được cấu hình Groq OCR.", 503)
  });

  return async function scanTranscriptWithGroq(images) {
    if (!keys.length || typeof fetchImpl !== "function") throw serviceError("UNAVAILABLE", "Máy chủ chưa được cấu hình Groq OCR.", 503);
    if (!Array.isArray(images) || !images.length || images.length > MAX_IMAGES || images.some((image) =>
      !Buffer.isBuffer(image?.buffer) || !image.buffer.length || image.buffer.length > MAX_IMAGE_BYTES || !SUPPORTED_MIME_TYPES.has(image.mimetype))) {
      throw serviceError("REQUEST_FAILED", "Hãy chọn tối đa 6 ảnh JPG, PNG hoặc WEBP, mỗi ảnh không quá 7 MB.", 400);
    }

    const catalog = await loadTranscriptSubjectCatalog();
    const prompt = `${buildTranscriptPrompt(catalog)}
Chỉ xử lý ảnh hiện tại, không dùng dữ liệu từ ảnh khác. Không trích xuất tên học sinh; luôn trả student.name là null.
Cấu trúc JSON bắt buộc: {"student":{"name":null},"scores":[{"subject":"<tên môn chuẩn>","grade":10,"semester1":null,"semester2":null,"year":null,"confidence":0}]}.
Thay các giá trị mẫu bằng dữ liệu nhìn thấy trong ảnh. Mỗi dòng chỉ có các trường trên: subject là tên môn chuẩn; grade là số nguyên 10, 11 hoặc 12; semester1, semester2, year là số từ 0 đến 10 hoặc null; confidence là số từ 0 đến 1. Không dùng chuỗi cho số và không thêm trường.
Nếu không có dòng xác định chắc được cả môn và lớp, trả {"student":{"name":null},"scores":[]}.`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), scanTimeout);
    const scores = [];
    try {
      for (const image of images) {
        let response;
        let payload;
        try {
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
          response = await requestWithKeyPool({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: selectedModel,
              messages: [{ role: "user", content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:${image.mimetype};base64,${image.buffer.toString("base64")}` } }
              ] }],
              response_format: { type: "json_object" },
              reasoning_effort: "none",
              temperature: 0.2,
              max_completion_tokens: 2048,
              stream: false
            }),
            signal: controller.signal
          });
          payload = await response.json().catch((error) => {
            if (controller.signal.aborted) throw error;
            return null;
          });
          if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        } catch (error) {
          if (controller.signal.aborted || error?.name === "AbortError") throw serviceError("TIMEOUT", "Groq đọc ảnh học bạ quá lâu. Hệ thống sẽ thử bộ máy khác.", 504);
          if (error instanceof AppError) throw error;
          throw serviceError("REQUEST_FAILED", "Không thể kết nối Groq OCR. Hệ thống sẽ thử bộ máy khác.");
        }
        scores.push(...parseTranscript(payload));
      }
      return validateTranscriptPayload({ student: { name: null }, scores }, catalog);
    } finally {
      clearTimeout(timeout);
    }
  };
}
