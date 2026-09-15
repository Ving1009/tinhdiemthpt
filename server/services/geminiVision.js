import { GoogleGenAI } from "@google/genai";
import { AppError } from "../errors.js";
import { buildTranscriptPrompt, transcriptResponseSchema } from "../prompts/transcriptPrompt.js";
import { loadTranscriptSubjectCatalog, validateTranscriptPayload } from "../validators/transcriptValidator.js";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
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
    throw new AppError("Dịch vụ AI trả về dữ liệu không hợp lệ. Hãy thử quét lại ảnh rõ hơn.", { statusCode: 502, code: "INVALID_AI_JSON" });
  }
}

function classifyGeminiError(error) {
  if (error instanceof AppError) return error;
  const status = Number(error?.status || error?.statusCode || error?.code);
  if (status === 429) return new AppError("Dịch vụ AI đang quá tải hoặc đã hết hạn mức. Hãy thử lại sau.", { statusCode: 503, code: "AI_QUOTA" });
  if (status === 401 || status === 403) return new AppError("Không thể xác thực dịch vụ AI. Hãy kiểm tra cấu hình máy chủ.", { statusCode: 503, code: "AI_AUTH" });
  return new AppError("Không thể đọc ảnh học bạ. Hãy chụp lại rõ hơn, tránh lóa sáng và đảm bảo đủ bảng điểm.", { statusCode: 502, code: "AI_REQUEST_FAILED" });
}

function mergeBatchPayloads(payloads) {
  const firstStudent = payloads.map((item) => item.student?.name).find((name) => typeof name === "string" && name.trim());
  return {
    student: { name: firstStudent || null },
    scores: payloads.flatMap((item) => Array.isArray(item.scores) ? item.scores : [])
  };
}

export function createGeminiVisionService({ apiKey, model = DEFAULT_MODEL } = {}) {
  if (!apiKey) {
    return async () => {
      throw new AppError("Máy chủ chưa được cấu hình Gemini API key.", { statusCode: 503, code: "MISSING_API_KEY" });
    };
  }
  const ai = new GoogleGenAI({ apiKey });
  return async function scanTranscript(images) {
    const catalog = await loadTranscriptSubjectCatalog();
    const prompt = buildTranscriptPrompt(catalog);
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
      throw classifyGeminiError(error);
    }
  };
}
