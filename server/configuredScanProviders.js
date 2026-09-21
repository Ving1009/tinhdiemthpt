import { createGeminiVisionService } from "./services/geminiVision.js";
import { createOcrSpaceVisionService } from "./services/ocrSpaceVision.js";
import { collectApiKeys, createProviderPool } from "./services/providerPool.js";

export function createConfiguredScanProviders(environment = process.env) {
  const configuredProviders = [];
  const geminiKeys = collectApiKeys(environment, {
    primaryName: "GEMINI_API_KEY", listName: "GEMINI_API_KEYS", numberedStart: 1, numberedEnd: 5
  });
  if (geminiKeys.length) configuredProviders.push({
    name: "gemini",
    label: "Gemini",
    scan: createProviderPool({
      keys: geminiKeys,
      createService: (apiKey) => createGeminiVisionService({ apiKey, model: environment.GEMINI_MODEL }),
      retryCodes: new Set(["AI_QUOTA", "AI_TIMEOUT", "AI_AUTH", "AI_REQUEST_FAILED"]),
      cooldownMsByCode: { AI_QUOTA: 5 * 60_000, AI_TIMEOUT: 30_000, AI_AUTH: 60 * 60_000, AI_REQUEST_FAILED: 30_000 }
    })
  });
  const ocrSpaceKeys = collectApiKeys(environment, {
    primaryName: "OCR_SPACE_API_KEY", listName: "OCR_SPACE_API_KEYS", numberedStart: 1, numberedEnd: 5
  });
  if (ocrSpaceKeys.length) configuredProviders.push({
    name: "ocr-space",
    label: "OCR.space",
    scan: createProviderPool({
      keys: ocrSpaceKeys,
      createService: (apiKey) => createOcrSpaceVisionService({
        apiKey,
        endpoint: environment.OCR_SPACE_ENDPOINT,
        engine: environment.OCR_SPACE_ENGINE,
        maxImageBytes: environment.OCR_SPACE_MAX_IMAGE_BYTES,
        totalTimeoutMs: environment.OCR_SPACE_TIMEOUT_MS
      }),
      retryCodes: new Set(["OCR_SPACE_QUOTA", "OCR_SPACE_TIMEOUT", "OCR_SPACE_AUTH", "OCR_SPACE_REQUEST_FAILED"]),
      cooldownMsByCode: { OCR_SPACE_QUOTA: 5 * 60_000, OCR_SPACE_TIMEOUT: 30_000, OCR_SPACE_AUTH: 60 * 60_000, OCR_SPACE_REQUEST_FAILED: 30_000 }
    })
  });
  if (!configuredProviders.length) configuredProviders.push({
    name: "gemini", label: "Gemini", scan: createGeminiVisionService()
  });
  return configuredProviders;
}
