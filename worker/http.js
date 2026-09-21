import { AppError } from "../server/errors.js";

export const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

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
  const origin = developmentOrigin(request);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Turnstile-Token");
  headers.set("Access-Control-Max-Age", "600");
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
  console.error(error);
  return failure(request, "INTERNAL_ERROR", "Không thể xử lý yêu cầu. Hãy thử lại sau.", 500);
}

export async function applyRateLimit(binding, request, message = "Bạn đã gửi nhiều yêu cầu. Hãy thử lại sau ít phút.") {
  if (!binding || typeof binding.limit !== "function") return null;
  const key = request.headers.get("CF-Connecting-IP") || "unknown";
  const result = await binding.limit({ key });
  if (result.success) return null;
  return failure(request, "RATE_LIMITED", message, 429, { "Retry-After": "60" });
}
