import { AppError } from "../server/errors.js";
import { securityHeaders } from "../lib/securityHeaders.js";

export const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export function withSecurityHeaders(request, response) {
  const headers = new Headers(response.headers);
  const url = new URL(request.url);
  const isHttps = url.protocol === "https:";
  for (const [name, value] of Object.entries(securityHeaders({ isHttps, pathname: url.pathname }))) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function developmentOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return "";
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ? origin : "";
  } catch {
    return "";
  }
}

export function withCors(request, response) {
  const securedResponse = withSecurityHeaders(request, response);
  const origin = developmentOrigin(request);
  if (!origin) return securedResponse;
  const headers = new Headers(securedResponse.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Turnstile-Token");
  headers.set("Access-Control-Max-Age", "600");
  headers.append("Vary", "Origin");
  return new Response(securedResponse.body, { status: securedResponse.status, statusText: securedResponse.statusText, headers });
}

export function json(request, payload, { status = 200, headers = {} } = {}) {
  return withCors(request, new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  }));
}

export function success(request, data, options) {
  return json(request, { success: true, data }, options);
}

export function failure(request, code, message, status = 500, headers) {
  return json(request, { success: false, error: { code, message } }, { status, headers });
}

export function optionsResponse(request) {
  return withCors(request, new Response(null, { status: 204 }));
}

export function errorResponse(request, error) {
  if (error instanceof AppError) return failure(request, error.code, error.message, error.statusCode);
  if (/định dạng|mô tả|liên kết/i.test(error?.message || "")) {
    return failure(request, "INVALID_DATA_REPORT", error.message, 400);
  }
  console.error(JSON.stringify({
    event: "unhandled_request_error",
    name: String(error?.name || "Error").slice(0, 80),
    code: String(error?.code || "INTERNAL_ERROR").slice(0, 80)
  }));
  return failure(request, "INTERNAL_ERROR", "Không thể xử lý yêu cầu. Hãy thử lại sau.", 500);
}

export async function applyRateLimit(binding, request, message = "Bạn đã gửi nhiều yêu cầu. Hãy thử lại sau ít phút.") {
  if (!binding || typeof binding.limit !== "function") return failure(request, "RATE_LIMIT_UNAVAILABLE", "Hệ thống bảo vệ đang bận. Hãy thử lại sau.", 503);
  const key = request.headers.get("CF-Connecting-IP") || "unknown";
  let result;
  try { result = await binding.limit({ key }); }
  catch { return failure(request, "RATE_LIMIT_UNAVAILABLE", "Hệ thống bảo vệ đang bận. Hãy thử lại sau.", 503); }
  if (result?.success === true) return null;
  return failure(request, "RATE_LIMITED", message, 429, { "Retry-After": "60" });
}
