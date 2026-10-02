import { createOpenAiCompatibleVisionService } from "./openAiCompatibleVision.js";

export const HUGGINGFACE_VISION_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";
export const REQUESTY_VISION_ENDPOINT = "https://router.requesty.ai/v1/chat/completions";
export const DEFAULT_HUGGINGFACE_VISION_MODEL = "Qwen/Qwen3.8-27B:deepinfra";
export const DEFAULT_REQUESTY_VISION_MODEL = "google/gemma-4-31b-it";

export function createHuggingFaceVisionService({ model = DEFAULT_HUGGINGFACE_VISION_MODEL, ...options } = {}) {
  return createOpenAiCompatibleVisionService({
    ...options,
    endpoint: HUGGINGFACE_VISION_ENDPOINT,
    model: String(model || "").trim() || DEFAULT_HUGGINGFACE_VISION_MODEL,
    providerCode: "HUGGINGFACE_VISION",
    providerLabel: "Hugging Face",
    maxTokensProperty: "max_tokens",
    extraBody: {}
  });
}

export function createRequestyVisionService({ model = DEFAULT_REQUESTY_VISION_MODEL, ...options } = {}) {
  return createOpenAiCompatibleVisionService({
    ...options,
    endpoint: REQUESTY_VISION_ENDPOINT,
    model: String(model || "").trim() || DEFAULT_REQUESTY_VISION_MODEL,
    providerCode: "REQUESTY_VISION",
    providerLabel: "Requesty",
    maxTokensProperty: "max_completion_tokens",
    extraBody: { reasoning_effort: "none" }
  });
}
