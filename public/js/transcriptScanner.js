import { escapeHTML } from "./utils.js";
import { optimizeTranscriptImagesSequentially } from "./transcriptImageOptimizer.js";
import { turnstileGate } from "./turnstile.js";

export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const REMOTE_SCAN_TIMEOUT_MS = 60_000;

function fileKey(file) { return `${file.name}-${file.size}-${file.lastModified}`; }
function fileSize(bytes) { return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 1 : 0)} MB`; }

export function resolveTranscriptApiUrl(location = window.location) {
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (isLoopback && location.port !== "3000") return `http://${location.hostname}:3000/api/scan-transcript`;
  return "/api/scan-transcript";
}

export function resolveTranscriptAssetBaseUrl(location = window.location) {
  const apiUrl = resolveTranscriptApiUrl(location);
  if (/^https?:\/\//i.test(apiUrl)) return new URL("/vendor/", apiUrl).toString();
  return "/vendor/";
}

class RemoteTranscriptScanError extends Error {
  constructor(message, { code = "REMOTE_SCAN_FAILED", statusCode = 0 } = {}) {
    super(message);
    this.name = "RemoteTranscriptScanError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const NON_FALLBACK_CODES = new Set([
  "INVALID_IMAGE",
  "UNSUPPORTED_IMAGE",
  "MISSING_IMAGES",
  "IMAGES_TOO_LARGE",
  "LIMIT_FILE_COUNT",
  "LIMIT_FILE_SIZE",
  "RATE_LIMITED",
  "TURNSTILE_CANCELLED"
]);
const RETRYABLE_TURNSTILE_CODES = new Set([
  "TURNSTILE_REQUIRED",
  "TURNSTILE_FAILED",
  "TURNSTILE_INVALID"
]);
const MANUAL_ENTRY_CODES = new Set(["AI_QUOTA", "OCR_SPACE_QUOTA", "SCAN_QUOTA_EXHAUSTED"]);

export function shouldUseBrowserFallback(error) {
  if (Number(error?.statusCode) >= 500) return true;
  return error instanceof TypeError || !NON_FALLBACK_CODES.has(error?.code);
}

export function transcriptImageValidationMessage(file) {
  if (!ACCEPTED_TYPES.has(file?.type)) return `${file?.name || "Tệp đã chọn"}: chỉ nhận JPG, PNG hoặc WEBP.`;
  if (Number(file?.size) > MAX_IMAGE_BYTES) return `${file.name}: tối đa 7 MB.`;
  return "";
}

export async function requestRemoteTranscriptScan(images, {
  apiUrl = resolveTranscriptApiUrl(),
  fetchImpl = globalThis.fetch,
  turnstileToken = "",
  timeoutMs = REMOTE_SCAN_TIMEOUT_MS
} = {}) {
  const formData = new FormData();
  images.forEach((image) => formData.append("images[]", image.blob, image.uploadName));
  const headers = turnstileToken ? { "X-Turnstile-Token": turnstileToken } : undefined;
  const controller = new AbortController();
  const requestTimeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : REMOTE_SCAN_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), requestTimeout);
  try {
    const response = await fetchImpl(apiUrl, { method: "POST", headers, body: formData, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new RemoteTranscriptScanError(payload?.error?.message || "Dịch vụ nhận diện tạm thời chưa sẵn sàng.", {
        code: payload?.error?.code,
        statusCode: response.status
      });
    }
    return payload;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new RemoteTranscriptScanError("Dịch vụ nhận diện phản hồi quá lâu. Bạn có thể quét trực tiếp trên thiết bị.", {
        code: "REMOTE_SCAN_TIMEOUT",
        statusCode: 504
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function requestProtectedTranscriptScan(images, {
  gate = turnstileGate,
  requestImpl = requestRemoteTranscriptScan
} = {}) {
  const action = "scan_transcript";
  const firstToken = await gate.getToken(action);
  try {
    return await requestImpl(images, { turnstileToken: firstToken });
  } catch (error) {
    if (!RETRYABLE_TURNSTILE_CODES.has(error?.code)) throw error;
    const refreshedToken = await gate.getToken(action, { forceConfiguration: true });
    return requestImpl(images, { turnstileToken: refreshedToken });
  }
}

export class TranscriptScanner {
  constructor({ onScanStart, onScanSuccess, notify }) {
    this.input = document.getElementById("transcript-images");
    this.dropzone = document.getElementById("transcript-dropzone");
    this.chooseButton = document.getElementById("transcript-choose-images");
    this.fileList = document.getElementById("transcript-file-list");
    this.scanButton = document.getElementById("transcript-scan");
    this.clearButton = document.getElementById("transcript-clear-images");
    this.consent = document.getElementById("transcript-consent");
    this.status = document.getElementById("transcript-scan-status");
    this.fallbackDialog = document.getElementById("transcript-fallback-dialog");
    this.fallbackContinue = document.getElementById("transcript-fallback-continue");
    this.fallbackManual = document.getElementById("transcript-fallback-manual");
    this.onScanStart = onScanStart || (() => {});
    this.onScanSuccess = onScanSuccess;
    this.notify = notify || (() => {});
    this.files = [];
    this.isScanning = false;
    if (!this.input || !this.dropzone) return;
    this.bindEvents();
    this.render();
  }

  bindEvents() {
    this.input.addEventListener("change", () => { this.addFiles(this.input.files); this.input.value = ""; });
    this.chooseButton.addEventListener("click", () => this.input.click());
    this.dropzone.addEventListener("click", (event) => { if (!event.target.closest("button")) this.input.click(); });
    this.dropzone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.input.click(); }
    });
    ["dragenter", "dragover"].forEach((name) => this.dropzone.addEventListener(name, (event) => { event.preventDefault(); this.dropzone.classList.add("is-dragging"); }));
    ["dragleave", "drop"].forEach((name) => this.dropzone.addEventListener(name, (event) => { event.preventDefault(); this.dropzone.classList.remove("is-dragging"); }));
    this.dropzone.addEventListener("drop", (event) => this.addFiles(event.dataTransfer?.files || []));
    this.fileList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-transcript-file-index]");
      if (button) this.removeFile(Number(button.dataset.transcriptFileIndex));
    });
    this.scanButton.addEventListener("click", () => this.scan());
    this.clearButton.addEventListener("click", () => this.clearFiles());
    this.consent?.addEventListener("change", () => this.render());
  }

  addFiles(list) {
    const next = [...this.files];
    const errors = [];
    for (const file of [...list]) {
      const validationMessage = transcriptImageValidationMessage(file);
      if (validationMessage) { errors.push(validationMessage); continue; }
      if (next.some((item) => fileKey(item.file) === fileKey(file))) continue;
      if (next.length >= MAX_IMAGES) { errors.push(`Chỉ có thể chọn tối đa ${MAX_IMAGES} ảnh.`); break; }
      next.push({ file });
    }
    this.files = next;
    this.render();
    if (errors.length) this.notify(errors[0]);
  }

  removeFile(index) {
    this.files.splice(index, 1);
    this.render();
  }

  clearFiles() {
    this.files = [];
    if (this.consent) this.consent.checked = false;
    this.setStatus("Chọn ảnh học bạ để bắt đầu quét.");
    this.render();
  }

  setStatus(message, state = "idle") {
    this.status.textContent = message;
    this.status.dataset.state = state;
  }

  render() {
    this.fileList.innerHTML = this.files.map((item, index) => `<li class="transcript-file-item"><span class="transcript-file-icon" aria-hidden="true">Ảnh</span><span><b>${escapeHTML(item.file.name)}</b><small>${fileSize(item.file.size)}</small></span><button class="icon-button transcript-remove" type="button" data-transcript-file-index="${index}" aria-label="Xóa ${escapeHTML(item.file.name)}" title="Xóa ảnh">×</button></li>`).join("");
    const hasFiles = this.files.length > 0;
    const hasConsent = this.consent?.checked === true;
    this.scanButton.disabled = !hasFiles || !hasConsent || this.isScanning;
    this.clearButton.disabled = !hasFiles || this.isScanning;
    this.dropzone.classList.toggle("has-files", hasFiles);
  }

  requestBrowserFallbackConsent() {
    const dialog = this.fallbackDialog;
    if (!dialog || typeof dialog.showModal !== "function" || !this.fallbackContinue || !this.fallbackManual) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (continueOnDevice) => {
        if (settled) return;
        settled = true;
        this.fallbackContinue.removeEventListener("click", continueHandler);
        this.fallbackManual.removeEventListener("click", manualHandler);
        dialog.removeEventListener("cancel", cancelHandler);
        if (dialog.open) dialog.close();
        resolve(continueOnDevice);
      };
      const continueHandler = () => finish(true);
      const manualHandler = () => finish(false);
      const cancelHandler = (event) => { event.preventDefault(); finish(false); };
      this.fallbackContinue.addEventListener("click", continueHandler);
      this.fallbackManual.addEventListener("click", manualHandler);
      dialog.addEventListener("cancel", cancelHandler);
      dialog.showModal();
      this.fallbackContinue.focus();
    });
  }

  scrollToManualEntry() {
    const entry = document.getElementById("academic-score-entry");
    entry?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => entry?.querySelector("[data-academic-score]")?.focus({ preventScroll: true }));
  }

  async scan() {
    if (this.isScanning) return;
    if (!this.files.length) { this.notify("Hãy chọn ít nhất một ảnh học bạ."); return; }
    if (this.consent?.checked !== true) { this.notify("Vui lòng tick ô đồng ý trước khi tải ảnh lên dịch vụ nhận diện."); return; }
    this.isScanning = true;
    const sourceFiles = this.files.map((item) => item.file);
    this.onScanStart();
    this.render();
    let optimizedImages = [];
    try {
      optimizedImages = await optimizeTranscriptImagesSequentially(sourceFiles, {
        onProgress: (index, total) => this.setStatus(`Đang xử lý ảnh ${index + 1}/${total}...`, "working")
      });
      if (optimizedImages.reduce((total, image) => total + image.blob.size, 0) > MAX_UPLOAD_BYTES) {
        throw new RemoteTranscriptScanError("Ảnh sau tối ưu vẫn vượt giới hạn 10 MB. Hãy giảm số ảnh hoặc chụp lại ở độ phân giải thấp hơn.", {
          code: "IMAGES_TOO_LARGE",
          statusCode: 413
        });
      }
      this.setStatus("Đang nhận diện...", "working");
      let payload;
      try {
        payload = await requestProtectedTranscriptScan(optimizedImages);
      } catch (error) {
        if (!shouldUseBrowserFallback(error)) throw error;
        const continueOnDevice = await this.requestBrowserFallbackConsent();
        if (!continueOnDevice) {
          this.setStatus("Đã chuyển sang bảng nhập điểm thủ công.");
          this.scrollToManualEntry();
          return;
        }
        const { recognizeTranscriptInBrowser } = await import("./clientTranscriptOcr.js?v=20261001-1");
        payload = await recognizeTranscriptInBrowser(optimizedImages, {
          assetBaseUrl: resolveTranscriptAssetBaseUrl(),
          onStatus: (message) => this.setStatus(message, "working")
        });
      }
      this.setStatus("Đang kiểm tra...", "working");
      this.onScanSuccess(payload);
      this.files = [];
      if (this.consent) this.consent.checked = false;
      this.setStatus("Hoàn tất. Hãy kiểm tra bảng điểm trước khi xác nhận.", "success");
    } catch (error) {
      const message = error?.message || "Không thể nhận diện ảnh. Hãy dùng ảnh rõ hơn hoặc nhập điểm thủ công.";
      this.setStatus(message, "error");
      if (MANUAL_ENTRY_CODES.has(error?.code)) this.scrollToManualEntry();
    } finally {
      optimizedImages.length = 0;
      this.isScanning = false;
      this.render();
    }
  }
}
