import { AppError } from "../errors.js";
import { cleanAssistantAnswer, createGroundedAssistantMessages } from "./groqAssistant.js";

function providerError(providerCode, providerLabel, status) {
  if (status === 429) return new AppError(`${providerLabel} đang hết hạn mức hoặc nhận quá nhiều yêu cầu.`, { statusCode: 503, code: `${providerCode}_RATE_LIMITED` });
  if (status === 401 || status === 403) return new AppError(`${providerLabel} chưa được cấu hình hợp lệ.`, { statusCode: 503, code: `${providerCode}_AUTH` });
  return new AppError(`${providerLabel} tạm thời chưa phản hồi.`, { statusCode: 502, code: `${providerCode}_REQUEST_FAILED` });
}

export function createOpenAiCompatibleAssistantService({
  apiKey,
  endpoint,
  model,
  provider,
  providerCode,
  providerLabel,
  timeoutMs = 20_000,
  maxTokensProperty = "max_tokens",
  extraHeaders = {},
  fetchImpl = globalThis.fetch
} = {}) {
  const key = String(apiKey || "").trim();
  const selectedModel = String(model || "").trim();
  const selectedEndpoint = String(endpoint || "").trim();
  const code = String(providerCode || "AI_PROVIDER").replace(/[^A-Z0-9_]/g, "_");
  const label = String(providerLabel || provider || "Nhà cung cấp AI");
  const requestTimeout = Math.max(3_000, Math.min(45_000, Number(timeoutMs) || 20_000));

  return async function askCompatibleProvider(rawInput) {
    if (!key || !selectedEndpoint || !selectedModel || typeof fetchImpl !== "function") {
      throw new AppError(`${label} chưa được cấu hình.`, { statusCode: 503, code: `${code}_UNAVAILABLE` });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeout);
    let response;
    try {
      response = await fetchImpl(selectedEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extraHeaders },
        body: JSON.stringify({
          model: selectedModel,
          messages: createGroundedAssistantMessages(rawInput),
          temperature: 0.2,
          [maxTokensProperty]: 500,
          stream: false
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new AppError(`${label} phản hồi quá chậm.`, { statusCode: 504, code: `${code}_TIMEOUT` });
      }
      throw new AppError(`Không thể kết nối ${label}.`, { statusCode: 502, code: `${code}_REQUEST_FAILED` });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw providerError(code, label, response.status);
    const payload = await response.json().catch(() => null);
    const answer = cleanAssistantAnswer(payload?.choices?.[0]?.message?.content);
    if (!answer) throw new AppError(`${label} trả về dữ liệu không hợp lệ.`, { statusCode: 502, code: `${code}_INVALID_RESPONSE` });
    return { answer, model: selectedModel, provider };
  };
}
