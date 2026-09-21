import assert from "node:assert/strict";
import test from "node:test";
import { requestRemoteTranscriptScan, resolveTranscriptApiUrl } from "../public/js/transcriptScanner.js";

const noConfiguration = { querySelector: () => null };

test("Live Server tại cổng khác gọi backend AI tại cổng 3000", () => {
  const url = resolveTranscriptApiUrl({ hostname: "127.0.0.1", port: "5500" }, noConfiguration);
  assert.equal(url, "http://127.0.0.1:3000/api/scan-transcript");
});

test("website được backend phục vụ vẫn sử dụng cùng origin", () => {
  const url = resolveTranscriptApiUrl({ hostname: "127.0.0.1", port: "3000" }, noConfiguration);
  assert.equal(url, "/api/scan-transcript");
});

test("request quét từ xa gửi token Turnstile bằng header, không nhét vào ảnh", async () => {
  let request;
  const image = { blob: new Blob([Uint8Array.from([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), uploadName: "hoc-ba.jpg" };
  await requestRemoteTranscriptScan([image], {
    apiUrl: "https://example.com/api/scan-transcript",
    turnstileToken: "verified-token",
    fetchImpl: async (_url, options) => {
      request = options;
      return new Response(JSON.stringify({ success: true, data: { scores: [] } }), { headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(request.headers["X-Turnstile-Token"], "verified-token");
  assert.equal(request.body.get("images[]").name, "hoc-ba.jpg");
});
