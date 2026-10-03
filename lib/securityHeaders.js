export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "connect-src 'self' https://challenges.cloudflare.com https://*.supabase.co",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'"
].join("; ");

export function securityHeaders({ isHttps = false, pathname = "", adsenseNonce = "" } = {}) {
  // Tesseract runs WebAssembly inside this worker, never in the page's scripts.
  let csp = pathname === "/vendor/tesseract/worker.min.js"
    ? CONTENT_SECURITY_POLICY.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'")
    : CONTENT_SECURITY_POLICY;
  const hasAdSense = /^[a-f0-9]{32}$/.test(adsenseNonce) && pathname !== "/vendor/tesseract/worker.min.js";
  if (hasAdSense) {
    // AdSense's supported strict CSP needs eval and trusted dynamic scripts.
    // Only HTML serving enabled ads uses this policy; API and OCR keep the default.
    csp = csp
      .replace("base-uri 'self'", "base-uri 'none'")
      .replace("script-src 'self' https://challenges.cloudflare.com", `script-src 'nonce-${adsenseNonce}' 'strict-dynamic' 'unsafe-eval' https:`)
      .replace("style-src 'self' https://fonts.googleapis.com", "style-src 'self' 'unsafe-inline' https:")
      .replace("img-src 'self' data: blob: https://lh3.googleusercontent.com", "img-src 'self' data: blob: https:")
      .replace("connect-src 'self' https://challenges.cloudflare.com https://*.supabase.co", "connect-src 'self' https:")
      .replace("frame-src https://challenges.cloudflare.com", "frame-src https:");
  }
  const headers = {
    "Content-Security-Policy": csp,
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    // Google's CMP requires the referring origin; never disclose paths or queries.
    "Referrer-Policy": hasAdSense ? "strict-origin" : "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
  if (isHttps) headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return headers;
}
