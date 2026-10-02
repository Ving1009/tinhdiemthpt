import { createOpenAiCompatibleAssistantService } from "./openAiCompatibleAssistant.js";

export const HUGGINGFACE_CHAT_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";
export const REQUESTY_CHAT_ENDPOINT = "https://router.requesty.ai/v1/chat/completions";

// HF routes this live multilingual model to the cheapest available provider.
export const DEFAULT_HUGGINGFACE_MODEL = "Qwen/Qwen3-4B-Instruct-2507:cheapest";
// https://docs.requesty.ai/features/free-models lists this model without token charges.
export const DEFAULT_REQUESTY_MODEL = "google/gemma-4-31b-it";

export function createHuggingFaceAssistantService({
  apiKey,
  model = DEFAULT_HUGGINGFACE_MODEL,
  timeoutMs,
  fetchImpl = globalThis.fetch
} = {}) {
  return createOpenAiCompatibleAssistantService({
    apiKey,
    endpoint: HUGGINGFACE_CHAT_ENDPOINT,
    model,
    provider: "huggingface",
    providerCode: "HUGGINGFACE",
    providerLabel: "Hugging Face",
    timeoutMs,
    fetchImpl
  });
}

export function createRequestyAssistantService({
  apiKey,
  model = DEFAULT_REQUESTY_MODEL,
  timeoutMs,
  fetchImpl = globalThis.fetch
} = {}) {
  return createOpenAiCompatibleAssistantService({
    apiKey,
    endpoint: REQUESTY_CHAT_ENDPOINT,
    model,
    provider: "requesty",
    providerCode: "REQUESTY",
    providerLabel: "Requesty",
    timeoutMs,
    extraBody: { reasoning_effort: "none" },
    extraHeaders: { "HTTP-Referer": "https://tinhdiemthpt.id.vn", "X-Title": "Tinh Diem THPT" },
    fetchImpl
  });
}
