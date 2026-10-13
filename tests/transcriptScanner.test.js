import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  requestProtectedTranscriptScan,
  requestRemoteTranscriptScan,
  resolveTranscriptApiUrl,
  shouldUseBrowserFallback,
  transcriptImageValidationMessage
} from "../public/js/transcriptScanner.js";

test("Live Server tại cổng khác gọi backend AI tại cổng 3000", () => {
  const url = resolveTranscriptApiUrl({ hostname: "127.0.0.1", port: "5500" });
  assert.equal(url, "http://127.0.0.1:3000/api/scan-transcript");
});

test("website được backend phục vụ vẫn sử dụng cùng origin", () => {
  const url = resolveTranscriptApiUrl({ hostname: "127.0.0.1", port: "3000" });
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

test("request quét từ xa dừng đúng hạn để giao diện có thể mở phương án dự phòng", async () => {
  const image = { blob: new Blob([Uint8Array.from([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), uploadName: "hoc-ba.jpg" };
  await assert.rejects(
    () => requestRemoteTranscriptScan([image], {
      apiUrl: "https://example.com/api/scan-transcript",
      timeoutMs: 5,
      fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      })
    }),
    (error) => error.code === "REMOTE_SCAN_TIMEOUT" && error.statusCode === 504
  );
});

test("kiểm tra ảnh phía trình duyệt dùng đúng giới hạn và thông báo tiếng Việt", () => {
  assert.equal(MAX_IMAGES, 6);
  assert.match(transcriptImageValidationMessage({ name: "hoc-ba.pdf", type: "application/pdf", size: 100 }), /chỉ nhận JPG, PNG hoặc WEBP/);
  assert.match(transcriptImageValidationMessage({ name: "hoc-ba.jpg", type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 }), /tối đa 7 MB/);
  assert.equal(transcriptImageValidationMessage({ name: "hoc-ba.webp", type: "image/webp", size: MAX_IMAGE_BYTES }), "");
});

test("cấu hình Turnstile cũ được làm mới và request quét được gửi lại một lần", async () => {
  const tokenCalls = [];
  const requestCalls = [];
  const gate = {
    async getToken(action, options) {
      tokenCalls.push({ action, options });
      return options?.forceConfiguration ? "fresh-token" : "";
    }
  };
  const requestImpl = async (_images, options) => {
    requestCalls.push(options);
    if (requestCalls.length === 1) {
      const error = new Error("Hãy xác minh.");
      error.code = "TURNSTILE_REQUIRED";
      throw error;
    }
    return { success: true, data: { scores: [] } };
  };

  const result = await requestProtectedTranscriptScan([], { gate, requestImpl });

  assert.equal(result.success, true);
  assert.deepEqual(tokenCalls.map(({ action, options }) => ({ action, force: options?.forceConfiguration === true })), [
    { action: "scan_transcript", force: false },
    { action: "scan_transcript", force: true }
  ]);
  assert.ok(tokenCalls.every(call => call.options.signal instanceof AbortSignal));
  assert.deepEqual(requestCalls, [
    { turnstileToken: "" },
    { turnstileToken: "fresh-token" }
  ]);
});

test("xác minh quá hạn không gửi ảnh khi token đến muộn", async () => {
  let resolveToken, requests = 0, tokenSignal;
  const token = new Promise(resolve => { resolveToken = resolve; });
  await assert.rejects(() => requestProtectedTranscriptScan([], {
    securityTimeoutMs: 5,
    gate: { getToken: (_action, options) => { tokenSignal = options.signal; return token; } },
    requestImpl: async () => { requests++; }
  }), error => error.code === "TURNSTILE_TIMEOUT");
  assert.equal(tokenSignal.aborted, true);
  resolveToken("late-token");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 0);
});

test("hủy xác minh không tải ảnh lên và hủy cả bước Turnstile", async () => {
  const controller = new AbortController();
  let tokenSignal, requests = 0;
  const request = requestProtectedTranscriptScan([], {
    signal: controller.signal,
    gate: { getToken: (_action, options) => { tokenSignal = options.signal; return new Promise(() => {}); } },
    requestImpl: async () => { requests++; }
  });
  controller.abort();
  await assert.rejects(request, error => error.code === "TRANSCRIPT_ABORTED");
  assert.equal(tokenSignal.aborted, true);
  assert.equal(requests, 0);
});

test("body OCR không trả về cũng có timeout và không treo spinner", async () => {
  await assert.rejects(() => requestRemoteTranscriptScan([], {
    apiUrl: "https://example.com/api/scan-transcript", timeoutMs: 5,
    fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) })
  }), error => error.code === "REMOTE_SCAN_TIMEOUT");
});

test("hủy request OCR đang chờ trả về lỗi hủy riêng", async () => {
  const controller = new AbortController();
  let requestSignal;
  const request = requestRemoteTranscriptScan([], {
    apiUrl: "https://example.com/api/scan-transcript", signal: controller.signal,
    fetchImpl: (_url, options) => { requestSignal = options.signal; return new Promise(() => {}); }
  });
  controller.abort();
  await assert.rejects(request, error => error.code === "TRANSCRIPT_ABORTED");
  assert.equal(requestSignal.aborted, true);
});

test("dùng Tesseract khi provider hết quota, timeout hoặc trả lỗi 5xx", () => {
  assert.equal(shouldUseBrowserFallback({ code: "RATE_LIMITED" }), false);
  assert.equal(shouldUseBrowserFallback({ code: "TURNSTILE_CLIENT_ERROR" }), true);
  assert.equal(shouldUseBrowserFallback({ code: "TURNSTILE_TIMEOUT" }), true);
  assert.equal(shouldUseBrowserFallback({ code: "AI_QUOTA" }), true);
  assert.equal(shouldUseBrowserFallback({ code: "OCR_SPACE_QUOTA" }), true);
  assert.equal(shouldUseBrowserFallback({ code: "SCAN_QUOTA_EXHAUSTED" }), true);
  assert.equal(shouldUseBrowserFallback({ code: "AI_REQUEST_FAILED" }), true);
  assert.equal(shouldUseBrowserFallback({ code: "TURNSTILE_MISCONFIGURED", statusCode: 503 }), true);
});

test("hiện trạng thái xác minh riêng và chỉ gọi API nhận diện sau khi có token", async () => {
  const statuses = [];
  let verified, requests = 0;
  const verification = new Promise((resolve) => { verified = resolve; });
  const response = requestProtectedTranscriptScan([], {
    gate: { getToken: () => verification },
    requestImpl: async (_images, options) => { requests++; assert.equal(options.turnstileToken, "verified-token"); return { success: true }; },
    onStatus: (message) => statuses.push(message)
  });
  assert.equal(requests, 0);
  assert.match(statuses[0], /xác minh bảo mật/);
  verified("verified-token");
  assert.equal((await response).success, true);
  assert.equal(requests, 1);
  assert.match(statuses[1], /dịch vụ trực tuyến/);
});
