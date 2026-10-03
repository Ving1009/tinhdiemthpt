import { getTurnstileConfigurationForHostname, turnstileTokenFromHeaders, verifyTurnstile } from "../server/services/turnstile.js";
import { applyRateLimit, errorResponse, failure, success, withSecurityHeaders } from "./http.js";
import { handleDataApi } from "./dataApi.js";
import { publicAuthConfig } from "../lib/publicAuthConfig.js";
import { handleAuthRequest } from "./auth.js";
import { handleAssistantApi } from "./assistantApi.js";
import { adsenseAdsTxt, prepareAdSenseHtml } from "../lib/adsense.js";
import { securityHeaders } from "../lib/securityHeaders.js";

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
      return withSecurityHeaders(request, new Response("Không tìm thấy trang.", { status: 404 }));
    }
    if (["GET", "HEAD"].includes(request.method) && url.pathname === "/ads.txt") {
      const text = adsenseAdsTxt(environment);
      return withSecurityHeaders(request, new Response(request.method === "HEAD" ? null : text, {
        status: text ? 200 : 404,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }
      }));
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
    const asset = await environment.ASSETS.fetch(request);
    if (request.method === "GET" && ["/", "/index.html"].includes(url.pathname) && asset.ok && /text\/html/i.test(asset.headers.get("Content-Type") || "")) {
      const prepared = prepareAdSenseHtml(await asset.text(), environment, request.cf?.country);
      const headers = new Headers(asset.headers);
      for (const name of ["Content-Length", "Content-Encoding", "ETag", "Last-Modified"]) headers.delete(name);
      for (const [name, value] of Object.entries(securityHeaders({ isHttps: true, pathname: url.pathname, adsenseNonce: prepared.nonce }))) headers.set(name, value);
      // A fresh nonce and country-specific consent decision must not be shared via cache.
      headers.set("Cache-Control", "no-store");
      return new Response(prepared.html, { status: asset.status, headers });
    }
    return withSecurityHeaders(request, asset);
  }
};
