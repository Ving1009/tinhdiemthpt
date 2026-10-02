import { createOpenAiCompatibleAssistantService } from "./openAiCompatibleAssistant.js";

export const GEMINI_CHAT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
export const DEFAULT_GEMINI_CHAT_MODEL = "gemini-3.5-flash-lite";

export function createGeminiAssistantService({
  apiKey,
  model = DEFAULT_GEMINI_CHAT_MODEL,
  timeoutMs = 20_000,
  fetchImpl = globalThis.fetch
} = {}) {
  return createOpenAiCompatibleAssistantService({
    apiKey,
    endpoint: GEMINI_CHAT_ENDPOINT,
    model: String(model || "").trim() || DEFAULT_GEMINI_CHAT_MODEL,
    provider: "gemini",
    providerCode: "GEMINI_CHAT",
    providerLabel: "Trợ lý AI",
    maxTokensProperty: "max_completion_tokens",
    timeoutMs,
    fetchImpl
  });
}
