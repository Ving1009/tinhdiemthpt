import { AppError } from "../errors.js";

const FALLBACK_CODES = new Set([
  "MISSING_API_KEY", "AI_QUOTA", "AI_TIMEOUT", "AI_AUTH", "AI_REQUEST_FAILED", "INVALID_AI_JSON", "NO_TRANSCRIPT_DATA",
  "MISSING_OCR_SPACE_API_KEY", "OCR_SPACE_QUOTA", "OCR_SPACE_TIMEOUT", "OCR_SPACE_AUTH", "OCR_SPACE_REQUEST_FAILED",
  "OCR_SPACE_INVALID_RESPONSE", "OCR_SPACE_UNSUPPORTED_IMAGE", "OCR_SPACE_FILE_TOO_LARGE", "OCR_SPACE_CONFIG",
  "SCAN_PROVIDER_UNAVAILABLE"
]);

export function shouldUseTranscriptFallback(error) {
  return FALLBACK_CODES.has(error?.code);
}

export function createTranscriptScanService(providers = [], { onProviderError = () => {} } = {}) {
  const available = providers.filter((provider) => provider && typeof provider.scan === "function");
  if (!available.length) {
    return async () => { throw new AppError("Máy chủ chưa có bộ máy nhận diện học bạ.", { statusCode: 503, code: "MISSING_SCAN_PROVIDER" }); };
  }
  return async function scanTranscript(images) {
    let previousError = null;
    for (let index = 0; index < available.length; index += 1) {
      const provider = available[index];
      try {
        const result = await provider.scan(images);
        const warnings = [...(result.warnings || [])];
        if (index > 0) warnings.unshift("Đã dùng phương án nhận diện dự phòng. Hãy kiểm tra kỹ kết quả trước khi điền.");
        return { ...result, warnings, engine: provider.name };
      } catch (error) {
        previousError = error;
        const hasNext = index < available.length - 1;
        onProviderError({ provider: provider.name, code: error?.code || "UNKNOWN", statusCode: error?.statusCode || 500, hasNext });
        if (!hasNext || !shouldUseTranscriptFallback(error)) throw error;
      }
    }
    throw previousError || new AppError("Không thể nhận diện học bạ.", { statusCode: 502, code: "SCAN_FAILED" });
  };
}
