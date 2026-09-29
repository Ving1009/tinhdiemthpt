import { AppError } from "./errors.js";
import { collectApiKeys, createProviderPool } from "./services/providerPool.js";
import { createGroqAssistantService, DEFAULT_GROQ_MODEL } from "./services/groqAssistant.js";
import { createOpenAiCompatibleAssistantService } from "./services/openAiCompatibleAssistant.js";
import { createCloudflareWorkersAssistantService, DEFAULT_CLOUDFLARE_AI_MODEL } from "./services/cloudflareWorkersAssistant.js";

const MISTRAL_ENDPOINT = "https://api.mistral.ai/v1/chat/completions";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const RETRY_SUFFIXES = ["RATE_LIMITED", "TIMEOUT", "AUTH", "REQUEST_FAILED", "INVALID_RESPONSE", "UNAVAILABLE"];

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function keysFromAliases(environment, { primaryName, listName, numberedPrefixes }) {
  const keys = collectApiKeys(environment, { primaryName, listName, numberedStart: 1, numberedEnd: 5 });
  for (const prefix of numberedPrefixes) {
    for (let index = 1; index <= 5; index += 1) keys.push(environment[`${prefix}_${index}`]);
  }
  return unique(keys);
}

function retryCodes(prefix) {
  return new Set(RETRY_SUFFIXES.map((suffix) => `${prefix}_${suffix}`));
}

function keyPool({ keys, createService, codePrefix, label }) {
  return createProviderPool({
    keys,
    createService,
    retryCodes: retryCodes(codePrefix),
    cooldownMsByCode: {
      [`${codePrefix}_RATE_LIMITED`]: 5 * 60_000,
      [`${codePrefix}_TIMEOUT`]: 30_000,
      [`${codePrefix}_AUTH`]: 60 * 60_000,
      [`${codePrefix}_REQUEST_FAILED`]: 30_000,
      [`${codePrefix}_INVALID_RESPONSE`]: 30_000,
      [`${codePrefix}_UNAVAILABLE`]: 60 * 60_000
    },
    unavailableError: () => new AppError(`${label} chưa được cấu hình.`, { statusCode: 503, code: `${codePrefix}_UNAVAILABLE` })
  });
}

function cloudflareCredentials(environment) {
  const fallbackAccount = String(environment.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const credentials = [];
  const seen = new Set();
  for (let index = 1; index <= 5; index += 1) {
    const token = String(environment[`CLOUDFLARE_WORKERS_AI_API_KEY_${index}`] || environment[`CloudFlare_Workers_Ai_API_${index}`] || "").trim();
    const accountId = String(environment[`CLOUDFLARE_ACCOUNT_ID_${index}`] || fallbackAccount).trim();
    if (token && accountId && !seen.has(token)) {
      credentials.push({ token, accountId });
      seen.add(token);
    }
  }
  const extraTokens = keysFromAliases(environment, {
    primaryName: "CLOUDFLARE_WORKERS_AI_API_KEY",
    listName: "CLOUDFLARE_WORKERS_AI_API_KEYS",
    numberedPrefixes: []
  });
  for (const token of extraTokens) {
    if (fallbackAccount && !seen.has(token)) credentials.push({ token, accountId: fallbackAccount });
  }
  return credentials;
}

export function createConfiguredAdmissionsAssistant(environment = process.env, { fetchImpl = globalThis.fetch } = {}) {
  const providers = [];
  const groqKeys = keysFromAliases(environment, {
    primaryName: "GROQ_API_KEY",
    listName: "GROQ_API_KEYS",
    numberedPrefixes: ["GROQ_API_KEY"]
  });
  if (groqKeys.length) providers.push({
    name: "groq",
    ask: keyPool({
      keys: groqKeys,
      codePrefix: "GROQ",
      label: "Groq",
      createService: (apiKey) => createGroqAssistantService({
        apiKey,
        model: environment.GROQ_MODEL || DEFAULT_GROQ_MODEL,
        timeoutMs: environment.GROQ_TIMEOUT_MS,
        fetchImpl
      })
    })
  });

  const cloudflareKeys = cloudflareCredentials(environment);
  if (cloudflareKeys.length) providers.push({
    name: "cloudflare-workers-ai",
    ask: keyPool({
      keys: cloudflareKeys,
      codePrefix: "CLOUDFLARE_AI",
      label: "Cloudflare Workers AI",
      createService: ({ token, accountId }) => createCloudflareWorkersAssistantService({
        apiToken: token,
        accountId,
        model: environment.CLOUDFLARE_AI_MODEL || DEFAULT_CLOUDFLARE_AI_MODEL,
        timeoutMs: environment.CLOUDFLARE_AI_TIMEOUT_MS,
        fetchImpl
      })
    })
  });

  const mistralKeys = keysFromAliases(environment, {
    primaryName: "MISTRAL_API_KEY",
    listName: "MISTRAL_API_KEYS",
    numberedPrefixes: ["MISTRAL_API_KEY", "Mistral_API"]
  });
  if (mistralKeys.length) providers.push({
    name: "mistral",
    ask: keyPool({
      keys: mistralKeys,
      codePrefix: "MISTRAL",
      label: "Mistral",
      createService: (apiKey) => createOpenAiCompatibleAssistantService({
        apiKey,
        endpoint: MISTRAL_ENDPOINT,
        model: environment.MISTRAL_MODEL || "mistral-small-latest",
        provider: "mistral",
        providerCode: "MISTRAL",
        providerLabel: "Mistral",
        timeoutMs: environment.MISTRAL_TIMEOUT_MS,
        fetchImpl
      })
    })
  });

  const openRouterKeys = keysFromAliases(environment, {
    primaryName: "OPENROUTER_API_KEY",
    listName: "OPENROUTER_API_KEYS",
    numberedPrefixes: ["OPENROUTER_API_KEY", "OpenRouter_Free_API"]
  });
  if (openRouterKeys.length) providers.push({
    name: "openrouter",
    ask: keyPool({
      keys: openRouterKeys,
      codePrefix: "OPENROUTER",
      label: "OpenRouter",
      createService: (apiKey) => createOpenAiCompatibleAssistantService({
        apiKey,
        endpoint: OPENROUTER_ENDPOINT,
        model: environment.OPENROUTER_MODEL || "openrouter/free",
        provider: "openrouter",
        providerCode: "OPENROUTER",
        providerLabel: "OpenRouter",
        timeoutMs: environment.OPENROUTER_TIMEOUT_MS,
        extraHeaders: { "HTTP-Referer": "https://tinhdiemthpt.id.vn", "X-OpenRouter-Title": "Tinh Diem THPT" },
        fetchImpl
      })
    })
  });

  return createProviderPool({
    keys: providers,
    createService: (provider) => provider.ask,
    retryCodes: new Set([
      ...retryCodes("GROQ"),
      ...retryCodes("CLOUDFLARE_AI"),
      ...retryCodes("MISTRAL"),
      ...retryCodes("OPENROUTER")
    ]),
    cooldownMsByCode: Object.fromEntries(
      ["GROQ", "CLOUDFLARE_AI", "MISTRAL", "OPENROUTER"].flatMap((prefix) =>
        RETRY_SUFFIXES.map((suffix) => [`${prefix}_${suffix}`, suffix === "AUTH" || suffix === "UNAVAILABLE" ? 60 * 60_000 : suffix === "RATE_LIMITED" ? 5 * 60_000 : 30_000]))
    ),
    unavailableError: () => new AppError("Trợ lý AI chưa có nhà cung cấp khả dụng.", { statusCode: 503, code: "AI_ASSISTANT_UNAVAILABLE" })
  });
}
