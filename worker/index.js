import { getTurnstileConfigurationForHostname, turnstileTokenFromHeaders, verifyTurnstile } from "../server/services/turnstile.js";
import { applyRateLimit, errorResponse, failure, success } from "./http.js";
import { handleDataApi } from "./dataApi.js";

async function requireTurnstile(request, environment, action) {
  try {
    await verifyTurnstile({
      environment,
      token: turnstileTokenFromHeaders(request.headers),
      action,
      remoteIp: request.headers.get("CF-Connecting-IP") || "",
      requestHostname: new URL(request.url).hostname
    });
    return null;
  } catch (error) {
    return errorResponse(request, error);
  }
}

export default {
  async fetch(request, environment) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/_worker-data/")) {
      return new Response("Not found", { status: 404 });
    }
    if (request.method === "GET" && url.pathname === "/api/security-config") {
      const turnstile = getTurnstileConfigurationForHostname(environment, url.hostname);
      return success(request, { turnstile: { enabled: turnstile.enabled, siteKey: turnstile.enabled ? turnstile.siteKey : "" } }, {
        headers: { "Cache-Control": "public, max-age=300" }
      });
    }
    if (url.pathname === "/api/scan-transcript") {
      const limited = await applyRateLimit(environment.OCR_RATE_LIMITER, request);
      if (limited) return limited;
      if (request.method === "POST") {
        const rejected = await requireTurnstile(request, environment, "scan_transcript");
        if (rejected) return rejected;
      }
      if (!environment.OCR_SERVICE || typeof environment.OCR_SERVICE.fetch !== "function") {
        return failure(request, "SCAN_PROVIDER_UNAVAILABLE", "Dịch vụ quét học bạ chưa sẵn sàng.", 503);
      }
      return environment.OCR_SERVICE.fetch(request);
    }
    if (url.pathname === "/api/data-reports") {
      const limited = await applyRateLimit(environment.REPORT_RATE_LIMITER, request);
      if (limited) return limited;
      if (request.method === "POST") {
        const rejected = await requireTurnstile(request, environment, "data_report");
        if (rejected) return rejected;
      }
    }
    if (url.pathname.startsWith("/api/")) return handleDataApi(request, environment);
    return environment.ASSETS.fetch(request);
  }
};
