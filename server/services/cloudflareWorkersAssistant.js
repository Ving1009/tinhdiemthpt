import { AppError } from "../errors.js";
import { cleanAssistantAnswer, createGroundedAssistantMessages } from "./groqAssistant.js";

export const DEFAULT_CLOUDFLARE_AI_MODEL = "@cf/openai/gpt-oss-20b";

function cloudflareError(status) {
  if (status === 429) return new AppError("Cloudflare Workers AI đang hết hạn mức hoặc nhận quá nhiều yêu cầu.", { statusCode: 503, code: "CLOUDFLARE_AI_RATE_LIMITED" });
  if (status === 401 || status === 403) return new AppError("Cloudflare Workers AI chưa được cấu hình hợp lệ.", { statusCode: 503, code: "CLOUDFLARE_AI_AUTH" });
  return new AppError("Cloudflare Workers AI tạm thời chưa phản hồi.", { statusCode: 502, code: "CLOUDFLARE_AI_REQUEST_FAILED" });
}

export function createCloudflareWorkersAssistantService({
  apiToken,
  accountId,
  model = DEFAULT_CLOUDFLARE_AI_MODEL,
  timeoutMs = 20_000,
  fetchImpl = globalThis.fetch
} = {}) {
  const token = String(apiToken || "").trim();
  const account = String(accountId || "").trim();
  const selectedModel = String(model || "").trim() || DEFAULT_CLOUDFLARE_AI_MODEL;
  const requestTimeout = Math.max(3_000, Math.min(45_000, Number(timeoutMs) || 20_000));

  return async function askCloudflare(rawInput) {
    if (!token || !/^[a-f0-9]{32}$/i.test(account) || typeof fetchImpl !== "function") {
      throw new AppError("Cloudflare Workers AI chưa được cấu hình.", { statusCode: 503, code: "CLOUDFLARE_AI_UNAVAILABLE" });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeout);
    let response;
    try {
      response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${selectedModel}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: createGroundedAssistantMessages(rawInput), temperature: 0.2, max_tokens: 500, stream: false }),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new AppError("Cloudflare Workers AI phản hồi quá chậm.", { statusCode: 504, code: "CLOUDFLARE_AI_TIMEOUT" });
      throw new AppError("Không thể kết nối Cloudflare Workers AI.", { statusCode: 502, code: "CLOUDFLARE_AI_REQUEST_FAILED" });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw cloudflareError(response.status);
    const payload = await response.json().catch(() => null);
    const answer = cleanAssistantAnswer(payload?.result?.response || payload?.result?.choices?.[0]?.message?.content);
    if (!payload?.success || !answer) throw new AppError("Cloudflare Workers AI trả về dữ liệu không hợp lệ.", { statusCode: 502, code: "CLOUDFLARE_AI_INVALID_RESPONSE" });
    return { answer, model: selectedModel, provider: "cloudflare-workers-ai" };
  };
}
