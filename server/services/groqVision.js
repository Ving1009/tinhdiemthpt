import { GROQ_CHAT_ENDPOINT } from "./groqAssistant.js";
import { createOpenAiCompatibleVisionService } from "./openAiCompatibleVision.js";

export const DEFAULT_GROQ_VISION_MODEL = "qwen/qwen3.8-27b";

export function createGroqVisionService({ model = DEFAULT_GROQ_VISION_MODEL, ...options } = {}) {
  return createOpenAiCompatibleVisionService({
    ...options,
    endpoint: GROQ_CHAT_ENDPOINT,
    model: String(model || "").trim() || DEFAULT_GROQ_VISION_MODEL,
    providerCode: "GROQ_VISION",
    providerLabel: "Groq",
    maxTokensProperty: "max_completion_tokens",
    extraBody: { reasoning_effort: "none" }
  });
}
