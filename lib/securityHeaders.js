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

export function securityHeaders({ isHttps = false, pathname = "" } = {}) {
  // Tesseract runs WebAssembly inside this worker, never in the page's scripts.
  const csp = pathname === "/vendor/tesseract/worker.min.js"
    ? CONTENT_SECURITY_POLICY.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'")
    : CONTENT_SECURITY_POLICY;
  const headers = {
    "Content-Security-Policy": csp,
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
  if (isHttps) headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return headers;
}
