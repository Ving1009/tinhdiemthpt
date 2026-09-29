import { AppError } from "./errors.js";
import { collectApiKeys, createProviderPool } from "./services/providerPool.js";
import { createGroqAssistantService, DEFAULT_GROQ_MODEL } from "./services/groqAssistant.js";

export function createConfiguredAdmissionsAssistant(environment = process.env, { fetchImpl = globalThis.fetch } = {}) {
  const keys = collectApiKeys(environment, {
    primaryName: "GROQ_API_KEY",
    listName: "GROQ_API_KEYS",
    numberedStart: 1,
    numberedEnd: 5
  });
  return createProviderPool({
    keys,
    createService: (apiKey) => createGroqAssistantService({
      apiKey,
      model: environment.GROQ_MODEL || DEFAULT_GROQ_MODEL,
      timeoutMs: environment.GROQ_TIMEOUT_MS,
      fetchImpl
    }),
    retryCodes: new Set(["GROQ_RATE_LIMITED", "GROQ_TIMEOUT", "GROQ_AUTH", "GROQ_REQUEST_FAILED", "GROQ_INVALID_RESPONSE"]),
    cooldownMsByCode: {
      GROQ_RATE_LIMITED: 60_000,
      GROQ_TIMEOUT: 15_000,
      GROQ_AUTH: 60 * 60_000,
      GROQ_REQUEST_FAILED: 15_000,
      GROQ_INVALID_RESPONSE: 15_000
    },
    unavailableError: () => new AppError("Trợ lý AI chưa được cấu hình.", { statusCode: 503, code: "GROQ_UNAVAILABLE" })
  });
}
