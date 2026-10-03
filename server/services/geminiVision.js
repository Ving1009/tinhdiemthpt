import { GoogleGenAI } from "@google/genai";
import { AppError } from "../errors.js";
import { buildTranscriptPrompt, transcriptResponseSchema } from "../prompts/transcriptPrompt.js";
import { loadTranscriptSubjectCatalog, validateTranscriptPayload } from "../validators/transcriptValidator.js";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const BATCH_SIZE = 4;
const REQUEST_TIMEOUT_MS = 45_000;

function withTimeout(promise) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new AppError("Dịch vụ AI phản hồi quá lâu. Hãy thử lại sau.", { statusCode: 504, code: "AI_TIMEOUT" })), REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("Dịch vụ AI trả về dữ liệu không hợp lệ. Bạn hãy dùng ảnh rõ hơn rồi quét lại.", { statusCode: 502, code: "INVALID_AI_JSON" });
  }
}

function classifyGeminiError(error) {
  if (error instanceof AppError) return error;
  const status = Number(error?.status || error?.statusCode || error?.code);
  if (status === 429) return new AppError("Dịch vụ AI đang quá tải hoặc đã hết hạn mức. Bạn hãy nhập điểm bằng tay và tránh quét lại liên tục.", { statusCode: 503, code: "AI_QUOTA" });
  if (status === 401 || status === 403) return new AppError("Không thể xác thực dịch vụ AI. Hãy kiểm tra cấu hình máy chủ.", { statusCode: 503, code: "AI_AUTH" });
  return new AppError("Chưa đọc được ảnh học bạ. Bạn hãy chụp rõ toàn bộ bảng điểm, tránh lóa sáng rồi thử lại.", { statusCode: 502, code: "AI_REQUEST_FAILED" });
}

function diagnosticGeminiError(error) {
  return {
    name: String(error?.name || "Error").slice(0, 80),
    status: Number(error?.status || error?.statusCode) || null,
    code: String(error?.code || "").slice(0, 80) || null
  };
}

function mergeBatchPayloads(payloads) {
  return {
    student: { name: null },
    scores: payloads.flatMap((item) => Array.isArray(item.scores) ? item.scores : [])
  };
}

export function createGeminiVisionService({ apiKey, model = DEFAULT_MODEL, onError = () => {} } = {}) {
  if (!apiKey) {
    return async () => {
      throw new AppError("Máy chủ chưa được cấu hình Gemini API key.", { statusCode: 503, code: "MISSING_API_KEY" });
    };
  }
  const ai = new GoogleGenAI({ apiKey });
  return async function scanTranscript(images) {
    const catalog = await loadTranscriptSubjectCatalog();
    const prompt = `${buildTranscriptPrompt(catalog)}\nKhông trích xuất tên học sinh; luôn trả student.name là null.`;
    const payloads = [];
    try {
      for (let index = 0; index < images.length; index += BATCH_SIZE) {
        const batch = images.slice(index, index + BATCH_SIZE);
        const response = await withTimeout(ai.models.generateContent({
          model,
          contents: [
            { text: prompt },
            ...batch.map((image) => ({ inlineData: { mimeType: image.mimetype, data: image.buffer.toString("base64") } }))
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: transcriptResponseSchema
          }
        }));
        payloads.push(parseModelJson(response.text));
      }
      return validateTranscriptPayload(mergeBatchPayloads(payloads), catalog);
    } catch (error) {
      onError(diagnosticGeminiError(error));
      throw classifyGeminiError(error);
    }
  };
}
