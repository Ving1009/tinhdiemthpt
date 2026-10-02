import { Buffer } from "node:buffer";
import { AppError } from "../errors.js";
import { buildTranscriptPrompt } from "../prompts/transcriptPrompt.js";
import { loadTranscriptSubjectCatalog, validateTranscriptPayload } from "../validators/transcriptValidator.js";
import { createProviderPool } from "./providerPool.js";

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function createOpenAiCompatibleVisionService({
  apiKey,
  apiKeys,
  endpoint,
  model,
  providerCode,
  providerLabel,
  timeoutMs = 45_000,
  maxTokensProperty = "max_completion_tokens",
  extraBody = {},
  fetchImpl = globalThis.fetch
} = {}) {
  const keys = [...new Set((Array.isArray(apiKeys) && apiKeys.length ? apiKeys : [apiKey]).map((key) => String(key || "").trim()).filter(Boolean))];
  const selectedModel = String(model || "").trim().slice(0, 120);
  const selectedEndpoint = String(endpoint || "").trim();
  const code = String(providerCode || "AI_VISION").replace(/[^A-Z0-9_]/g, "_");
  const label = String(providerLabel || "Dịch vụ AI");
  const configuredTimeout = Number(timeoutMs);
  const scanTimeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? Math.min(60_000, Math.max(1, Math.floor(configuredTimeout))) : 45_000;

  function serviceError(suffix, message, statusCode = 502) {
    return new AppError(message, { code: `${code}_${suffix}`, statusCode });
  }

  function responseError(status) {
    if (status === 429) return serviceError("QUOTA", `${label} đang quá tải hoặc đã hết hạn mức. Hệ thống sẽ thử bộ máy khác.`, 503);
    if (status === 401 || status === 403) return serviceError("AUTH", `Không thể xác thực ${label}. Hãy kiểm tra cấu hình máy chủ.`, 503);
    return serviceError("REQUEST_FAILED", `${label} chưa xử lý được ảnh học bạ. Hệ thống sẽ thử bộ máy khác.`);
  }

  function parseTranscript(payload) {
    try {
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error();
      const transcript = JSON.parse(content);
      if (!transcript || typeof transcript !== "object" || !Array.isArray(transcript.scores)) throw new Error();
      return transcript.scores;
    } catch {
      throw serviceError("INVALID_RESPONSE", `${label} trả về dữ liệu học bạ không hợp lệ.`);
    }
  }

  const requestWithKeyPool = createProviderPool({
    keys,
    createService: (key) => async (options) => {
      let response;
      try {
        if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
        response = await fetchImpl(selectedEndpoint, { ...options, headers: { ...options.headers, Authorization: `Bearer ${key}` } });
      } catch (error) {
        if (options.signal.aborted || error?.name === "AbortError") throw serviceError("TIMEOUT", `${label} đọc ảnh học bạ quá lâu. Hệ thống sẽ thử bộ máy khác.`, 504);
        throw serviceError("REQUEST_FAILED", `Không thể kết nối ${label} OCR. Hệ thống sẽ thử bộ máy khác.`);
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw responseError(response.status);
      }
      return response;
    },
    retryCodes: new Set([`${code}_QUOTA`, `${code}_AUTH`]),
    cooldownMsByCode: { [`${code}_QUOTA`]: 5 * 60_000, [`${code}_AUTH`]: 60 * 60_000 },
    unavailableError: () => serviceError("UNAVAILABLE", `Máy chủ chưa được cấu hình ${label} OCR.`, 503)
  });

  return async function scanTranscriptWithCompatibleProvider(images) {
    if (!keys.length || !selectedEndpoint || !selectedModel || typeof fetchImpl !== "function") throw serviceError("UNAVAILABLE", `Máy chủ chưa được cấu hình ${label} OCR.`, 503);
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
              ...extraBody,
              model: selectedModel,
              messages: [{ role: "user", content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:${image.mimetype};base64,${image.buffer.toString("base64")}` } }
              ] }],
              response_format: { type: "json_object" },
              temperature: 0.2,
              [maxTokensProperty]: 2048,
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
          if (controller.signal.aborted || error?.name === "AbortError") throw serviceError("TIMEOUT", `${label} đọc ảnh học bạ quá lâu. Hệ thống sẽ thử bộ máy khác.`, 504);
          if (error instanceof AppError) throw error;
          throw serviceError("REQUEST_FAILED", `Không thể kết nối ${label} OCR. Hệ thống sẽ thử bộ máy khác.`);
        }
        scores.push(...parseTranscript(payload));
      }
      return validateTranscriptPayload({ student: { name: null }, scores }, catalog);
    } finally {
      clearTimeout(timeout);
    }
  };
}
