import { getTurnstileConfigurationForHostname, turnstileTokenFromHeaders, verifyTurnstile } from "../server/services/turnstile.js";
import { applyRateLimit, errorResponse, failure, success, withSecurityHeaders } from "./http.js";
import { handleDataApi } from "./dataApi.js";
import { publicAuthConfig } from "../lib/publicAuthConfig.js";
import { handleAuthRequest } from "./auth.js";
import { handleAssistantApi } from "./assistantApi.js";

const PRIMARY_HOSTNAME = "tinhdiemthpt.id.vn";
const LEGACY_HOSTNAME = "tinhdiemthpt.tinh-diem-thpt.workers.dev";

async function requireTurnstile(request, environment, action) {
  try {
    await verifyTurnstile({
      environment,
      token: turnstileTokenFromHeaders(request.headers),
      action,
      remoteIp: request.headers.get("CF-Connecting-IP") || "",
      requestHostname: new URL(request.url).hostname,
      required: true
    });
    return null;
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default {
  async fetch(request, environment) {
    const url = new URL(request.url);
    if (url.hostname === LEGACY_HOSTNAME) {
      url.protocol = "https:";
      url.hostname = PRIMARY_HOSTNAME;
      return withSecurityHeaders(request, Response.redirect(url, 308));
    }
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return withSecurityHeaders(request, Response.redirect(url, 308));
    }
    if (url.pathname.startsWith("/_worker-data/")) {
      return withSecurityHeaders(request, new Response("Not found", { status: 404 }));
    }
    if (request.method === "GET" && url.pathname === "/api/security-config") {
      const turnstile = getTurnstileConfigurationForHostname(environment, url.hostname);
      return success(request, { turnstile: { enabled: turnstile.enabled, siteKey: turnstile.enabled ? turnstile.siteKey : "" } }, {
        headers: { "Cache-Control": "no-store, max-age=0" }
      });
    }
    if (request.method === "GET" && url.pathname === "/api/auth-config") {
      return success(request, publicAuthConfig(environment), { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    if (url.pathname.startsWith("/api/auth/")) {
      try {
        if (request.method === "POST" && ["/api/auth/register", "/api/auth/login"].includes(url.pathname)) {
          const limited = await applyRateLimit(environment.AUTH_RATE_LIMITER, request, "Bạn đã thử đăng nhập hoặc đăng ký quá nhiều lần. Hãy đợi một phút.");
          if (limited) return limited;
        }
        if (request.method === "POST" && url.pathname === "/api/auth/register") {
          const turnstile = getTurnstileConfigurationForHostname(environment, url.hostname);
          if (!turnstile.configured || !turnstile.credentialsReady) {
            return failure(request, "TURNSTILE_REQUIRED_FOR_REGISTRATION", "Hệ thống xác minh tạo tài khoản chưa sẵn sàng.", 503);
          }
          const rejected = await requireTurnstile(request, environment, "account_register");
          if (rejected) return rejected;
        }
        return withSecurityHeaders(request, await handleAuthRequest(request, environment));
      } catch (error) {
        return errorResponse(request, error);
      }
    }
    if (url.pathname === "/api/scan-transcript") {
      if (request.method === "POST") {
        const limited = await applyRateLimit(environment.OCR_RATE_LIMITER, request);
        if (limited) return limited;
        const rejected = await requireTurnstile(request, environment, "scan_transcript");
        if (rejected) return rejected;
      }
      if (!environment.OCR_SERVICE || typeof environment.OCR_SERVICE.fetch !== "function") {
        return failure(request, "SCAN_PROVIDER_UNAVAILABLE", "Dịch vụ quét học bạ chưa sẵn sàng.", 503);
      }
      try { return withSecurityHeaders(request, await environment.OCR_SERVICE.fetch(request)); }
      catch { return failure(request, "SCAN_PROVIDER_UNAVAILABLE", "Dịch vụ quét học bạ đang bận. Hãy thử lại hoặc nhập điểm bằng tay.", 503); }
    }
    if (url.pathname === "/api/assistant-chat") {
      if (request.method === "POST") {
        const limited = await applyRateLimit(environment.AI_RATE_LIMITER, request, "Bạn đã hỏi trợ lý quá nhiều lần. Hãy đợi một phút.");
        if (limited) return limited;
      }
      return handleAssistantApi(request, environment);
    }
    if (url.pathname === "/api/data-reports") {
      if (request.method === "POST") {
        const limited = await applyRateLimit(environment.REPORT_RATE_LIMITER, request);
        if (limited) return limited;
        const rejected = await requireTurnstile(request, environment, "data_report");
        if (rejected) return rejected;
      }
    }
    if (url.pathname.startsWith("/api/")) return handleDataApi(request, environment);
    return withSecurityHeaders(request, await environment.ASSETS.fetch(request));
  }
};
