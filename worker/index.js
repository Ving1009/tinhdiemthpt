import { applyRateLimit, failure } from "./http.js";
import { handleDataApi } from "./dataApi.js";

export default {
  async fetch(request, environment) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/_worker-data/")) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/api/scan-transcript") {
      const limited = await applyRateLimit(environment.OCR_RATE_LIMITER, request);
      if (limited) return limited;
      if (!environment.OCR_SERVICE || typeof environment.OCR_SERVICE.fetch !== "function") {
        return failure(request, "SCAN_PROVIDER_UNAVAILABLE", "Dịch vụ quét học bạ chưa sẵn sàng.", 503);
      }
      return environment.OCR_SERVICE.fetch(request);
    }
    if (url.pathname === "/api/data-reports") {
      const limited = await applyRateLimit(environment.REPORT_RATE_LIMITER, request);
      if (limited) return limited;
    }
    if (url.pathname.startsWith("/api/")) return handleDataApi(request, environment);
    return environment.ASSETS.fetch(request);
  }
};
