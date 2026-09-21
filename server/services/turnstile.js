import { AppError } from "../errors.js";

const VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;

function value(environment, key) {
  return String(environment?.[key] || "").trim();
}

export function getTurnstileConfiguration(environment = {}) {
  const siteKey = value(environment, "TURNSTILE_SITE_KEY");
  const secretKey = value(environment, "TURNSTILE_SECRET_KEY");
  const configured = Boolean(siteKey || secretKey);
  return {
    enabled: Boolean(siteKey && secretKey),
    configured,
    credentialsReady: Boolean(siteKey && secretKey),
    siteKey
  };
}

function configuredHostnames(environment) {
  return value(environment, "TURNSTILE_ALLOWED_HOSTNAMES")
    .split(",")
    .map((hostname) => hostname.trim().toLocaleLowerCase("en"))
    .filter(Boolean);
}

function allowedHostnames(environment, requestHostname) {
  const configured = configuredHostnames(environment);
  return configured.length ? configured : [String(requestHostname || "").toLocaleLowerCase("en")].filter(Boolean);
}

export function getTurnstileConfigurationForHostname(environment = {}, requestHostname = "") {
  const configuration = getTurnstileConfiguration(environment);
  const configured = configuredHostnames(environment);
  const hostname = String(requestHostname || "").toLocaleLowerCase("en");
  const hostnameAllowed = !configured.length || configured.includes(hostname);
  return { ...configuration, enabled: configuration.credentialsReady && hostnameAllowed, hostnameAllowed };
}

export async function verifyTurnstile({
  environment = {},
  token,
  action,
  remoteIp = "",
  requestHostname = "",
  fetchImpl = globalThis.fetch
} = {}) {
  const configuration = getTurnstileConfigurationForHostname(environment, requestHostname);
  if (!configuration.configured) return { skipped: true };
  if (!configuration.credentialsReady) {
    throw new AppError("Turnstile chưa được cấu hình đầy đủ.", { statusCode: 503, code: "TURNSTILE_MISCONFIGURED" });
  }
  if (!configuration.hostnameAllowed) return { skipped: true };

  const responseToken = String(token || "").trim();
  if (!responseToken) {
    throw new AppError("Hãy hoàn tất bước xác minh bảo mật rồi thử lại.", { statusCode: 403, code: "TURNSTILE_REQUIRED" });
  }
  if (responseToken.length > MAX_TOKEN_LENGTH) {
    throw new AppError("Mã xác minh bảo mật không hợp lệ.", { statusCode: 403, code: "TURNSTILE_INVALID" });
  }

  const body = new FormData();
  body.set("secret", value(environment, "TURNSTILE_SECRET_KEY"));
  body.set("response", responseToken);
  if (remoteIp) body.set("remoteip", remoteIp);
  body.set("idempotency_key", crypto.randomUUID());

  let response;
  try {
    response = await fetchImpl(VERIFY_ENDPOINT, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new AppError("Dịch vụ xác minh bảo mật đang bận. Hãy thử lại.", { statusCode: 503, code: "TURNSTILE_UNAVAILABLE" });
  }
  if (!response.ok) {
    throw new AppError("Dịch vụ xác minh bảo mật đang bận. Hãy thử lại.", { statusCode: 503, code: "TURNSTILE_UNAVAILABLE" });
  }

  const result = await response.json().catch(() => null);
  if (!result?.success) {
    throw new AppError("Phiên xác minh đã hết hạn hoặc không hợp lệ. Hãy thử lại.", { statusCode: 403, code: "TURNSTILE_FAILED" });
  }
  if (action && result.action !== action) {
    throw new AppError("Phiên xác minh không khớp thao tác đang thực hiện.", { statusCode: 403, code: "TURNSTILE_ACTION_MISMATCH" });
  }
  const hostnames = allowedHostnames(environment, requestHostname);
  if (hostnames.length && !hostnames.includes(String(result.hostname || "").toLocaleLowerCase("en"))) {
    throw new AppError("Phiên xác minh không thuộc website này.", { statusCode: 403, code: "TURNSTILE_HOSTNAME_MISMATCH" });
  }
  return result;
}

export function turnstileTokenFromHeaders(headers) {
  return String(headers?.get?.("X-Turnstile-Token") || headers?.["x-turnstile-token"] || "").trim();
}
