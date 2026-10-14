import { escapeHTML } from "./utils.js";
import { optimizeTranscriptImagesSequentially } from "./transcriptImageOptimizer.js?v=20261013-3";
import { turnstileGate } from "./turnstile.js";
import { assessTranscriptQuality, mergeTranscriptResults } from "./core/transcriptHybrid.js?v=20261013-1";

export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const REMOTE_SCAN_TIMEOUT_MS = 60_000;
export const SECURITY_TIMEOUT_MS = 45_000;
export const LOCAL_SCAN_TIMEOUT_MS = 45_000;

function cancelled() { return new RemoteTranscriptScanError("Đã hủy quét. Điểm đang có vẫn được giữ lại.", { code: "TRANSCRIPT_ABORTED" }); }
function checkSignal(signal) { if (signal?.aborted) throw cancelled(); }
function rowIdentity(row) { return `${String(row.subject ?? "").normalize("NFC").trim().replace(/\s+/g, " ")}|${Number(row.grade)}`; }

function preservePreviewEdits(merged, previous) {
  const removed = new Set(previous?.removedRowKeys || []);
  merged.removedRowKeys = [...removed];
  merged.data.scores = merged.data.scores.filter(row => !removed.has(rowIdentity(row)));
  merged.conflicts = merged.conflicts.filter(row => !removed.has(rowIdentity(row)));
  for (const row of previous?.manualRows || []) {
    const identity = rowIdentity(row);
    if (removed.has(identity)) continue;
    const retained = merged.data.scores.find(item => rowIdentity(item) === identity);
    if (!retained) merged.data.scores.push(structuredClone(row));
    else {
      if (row._originalIdentity) retained._originalIdentity = structuredClone(row._originalIdentity);
      retained._editedFields = [...new Set([...(retained._editedFields || []), ...(row._editedFields || [])])];
      retained._previousIdentities = [...new Set([...(retained._previousIdentities || []), ...(row._previousIdentities || [])])];
    }
    const original = row._originalIdentity;
    const previousIdentities = new Set([...(row._previousIdentities || []), ...(original ? [rowIdentity(original)] : [])]);
    previousIdentities.delete(identity);
    merged.data.scores = merged.data.scores.filter(item => !previousIdentities.has(rowIdentity(item)));
    merged.conflicts = merged.conflicts.filter(item => !previousIdentities.has(rowIdentity(item)));
  }
  for (const row of merged.data.scores) for (const field of ["semester1", "semester2", "year"]) {
    const key = `${rowIdentity(row)}|${field}`;
    if (!Object.hasOwn(previous?.manualValues || {}, key)) continue;
    row[field] = previous.manualValues[key];
    row._editedFields = [...new Set([...(row._editedFields || []), field])];
    merged.provenance[key] = { source: "manual" };
    merged.conflicts = merged.conflicts.filter(conflict => conflict.key !== key);
  }
  return merged;
}

export async function waitForTranscriptTask(promise, { signal, timeoutMs, onTimeout } = {}) {
  checkSignal(signal);
  let timer, abortHandler;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      abortHandler = () => reject(cancelled());
      signal?.addEventListener("abort", abortHandler, { once: true });
      timer = setTimeout(() => reject(onTimeout()), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortHandler);
  }
}

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
  timeoutMs = REMOTE_SCAN_TIMEOUT_MS,
  signal
} = {}) {
  checkSignal(signal);
  const formData = new FormData();
  images.forEach((image) => formData.append("images[]", image.blob, image.uploadName));
  const headers = turnstileToken ? { "X-Turnstile-Token": turnstileToken } : undefined;
  const controller = new AbortController();
  const requestTimeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : REMOTE_SCAN_TIMEOUT_MS;
  const abortHandler = () => controller.abort();
  signal?.addEventListener("abort", abortHandler, { once: true });
  try {
    return await waitForTranscriptTask((async () => {
      const response = await fetchImpl(apiUrl, { method: "POST", headers, body: formData, signal: controller.signal });
      const payload = await response.json().catch(() => null);
      checkSignal(signal);
      if (!response.ok || !payload?.success) {
        throw new RemoteTranscriptScanError(payload?.error?.message || "Chưa quét bổ sung được. Bạn có thể thử lại hoặc nhập các ô còn thiếu.", {
          code: payload?.error?.code, statusCode: response.status
        });
      }
      return payload;
    })(), { signal, timeoutMs: requestTimeout, onTimeout: () => {
      controller.abort();
      return new RemoteTranscriptScanError("Quét bổ sung mất quá nhiều thời gian. Điểm đã đọc trên thiết bị vẫn được giữ lại.", { code: "REMOTE_SCAN_TIMEOUT", statusCode: 504 });
    } });
  } catch (error) {
    if (signal?.aborted) throw cancelled();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortHandler);
  }
}

export async function requestProtectedTranscriptScan(images, {
  gate = turnstileGate,
  requestImpl = requestRemoteTranscriptScan,
  onStatus = () => {},
  signal,
  securityTimeoutMs = SECURITY_TIMEOUT_MS
} = {}) {
  const action = "scan_transcript";
  const getToken = async (forceConfiguration = false) => {
    checkSignal(signal);
    const securityController = new AbortController();
    const abortHandler = () => securityController.abort();
    signal?.addEventListener("abort", abortHandler, { once: true });
    try {
      return await waitForTranscriptTask(gate.getToken(action, { ...(forceConfiguration ? { forceConfiguration: true } : {}), signal: securityController.signal }), {
        signal, timeoutMs: securityTimeoutMs, onTimeout: () => {
          securityController.abort();
          return new RemoteTranscriptScanError("Chưa hoàn tất xác minh bảo mật. Bạn có thể thử lại hoặc dùng điểm đã đọc trên thiết bị.", { code: "TURNSTILE_TIMEOUT" });
        }
      });
    } finally { signal?.removeEventListener("abort", abortHandler); }
  };
  onStatus("Đang xác minh bảo mật trước khi gửi ảnh...");
  const firstToken = await getToken();
  checkSignal(signal);
  onStatus("Đang nhận diện điểm bằng dịch vụ trực tuyến...");
  try {
    return await requestImpl(images, { turnstileToken: firstToken, ...(signal ? { signal } : {}) });
  } catch (error) {
    if (!RETRYABLE_TURNSTILE_CODES.has(error?.code)) throw error;
    onStatus("Đang xác minh lại bảo mật trước khi gửi ảnh...");
    const refreshedToken = await getToken(true);
    checkSignal(signal);
    onStatus("Đang nhận diện điểm bằng dịch vụ trực tuyến...");
    return requestImpl(images, { turnstileToken: refreshedToken, ...(signal ? { signal } : {}) });
  }
}

export class TranscriptScanner {
  constructor({ onScanStart, onScanSuccess, onClearPreview, getPreviewPayload, notify,
    loadLocalOcr = () => import("./clientTranscriptOcr.js?v=20261013-4"),
    optimizeImages = optimizeTranscriptImagesSequentially, requestOnline = requestProtectedTranscriptScan,
    localTimeoutMs = LOCAL_SCAN_TIMEOUT_MS }) {
    this.input = document.getElementById("transcript-images");
    this.dropzone = document.getElementById("transcript-dropzone");
    this.chooseButton = document.getElementById("transcript-choose-images");
    this.fileList = document.getElementById("transcript-file-list");
    this.scanButton = document.getElementById("transcript-scan");
    this.clearButton = document.getElementById("transcript-clear-images");
    this.consent = document.getElementById("transcript-consent");
    this.autoConsent = document.getElementById("transcript-auto-ai-consent");
    this.localMode = document.getElementById("transcript-mode-local");
    this.aiMode = document.getElementById("transcript-mode-ai");
    this.status = document.getElementById("transcript-scan-status");
    this.fallbackDialog = document.getElementById("transcript-fallback-dialog");
    this.fallbackContinue = document.getElementById("transcript-fallback-continue");
    this.fallbackManual = document.getElementById("transcript-fallback-manual");
    this.fallbackRetry = document.getElementById("transcript-fallback-retry");
    this.onlineButton = document.getElementById("transcript-online");
    this.cancelButton = document.getElementById("transcript-cancel");
    this.supplementActions = document.getElementById("transcript-supplement-actions");
    this.onScanStart = onScanStart || (() => {});
    this.onScanSuccess = onScanSuccess;
    this.notify = notify || (() => {});
    this.onClearPreview = onClearPreview || (() => {});
    this.getPreviewPayload = getPreviewPayload || (() => this.localPayload);
    this.loadLocalOcr = loadLocalOcr;
    this.optimizeImages = optimizeImages;
    this.requestOnline = requestOnline;
    this.localTimeoutMs = localTimeoutMs;
    this.files = [];
    this.isScanning = false;
    this.operation = 0;
    this.hasLocalAttempt = false;
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
    this.autoConsent?.addEventListener("change", () => this.render());
    [this.localMode, this.aiMode].forEach(input => input?.addEventListener("change", () => this.render()));
    this.cancelButton?.addEventListener("click", () => this.cancel());
    this.onlineButton?.addEventListener("click", () => this.offerOnlineScan());
    document.getElementById("transcript-enter-manually")?.addEventListener("click", () => this.scrollToManualEntry());
    this.fallbackContinue?.addEventListener("click", () => this.scanOnline());
    this.fallbackRetry?.addEventListener("click", () => { this.closeOffer(); if (this.localMode) this.localMode.checked = true; if (this.aiMode) this.aiMode.checked = false; this.scan(); });
    this.fallbackManual?.addEventListener("click", () => { this.closeOffer(); this.scrollToManualEntry(); });
    this.fallbackDialog?.addEventListener("cancel", () => { if (this.consent) this.consent.checked = false; });
  }

  addFiles(list) {
    if (this.isScanning) return;
    const next = [...this.files];
    const errors = [];
    for (const file of [...list]) {
      const validationMessage = transcriptImageValidationMessage(file);
      if (validationMessage) { errors.push(validationMessage); continue; }
      if (next.some((item) => fileKey(item.file) === fileKey(file))) continue;
      if (next.length >= MAX_IMAGES) { errors.push(`Bạn có thể chọn tối đa ${MAX_IMAGES} ảnh.`); break; }
      next.push({ file });
    }
    if (next.length !== this.files.length) { this.localPayload = null; this.hasLocalAttempt = false; if (this.autoConsent) this.autoConsent.checked = false; this.onClearPreview(); }
    this.files = next;
    this.render();
    if (errors.length) this.notify(errors[0]);
  }

  removeFile(index) {
    if (this.isScanning) return;
    this.files.splice(index, 1);
    this.localPayload = null;
    this.hasLocalAttempt = false;
    if (this.autoConsent) this.autoConsent.checked = false;
    this.onClearPreview();
    this.render();
  }

  clearFiles() {
    this.cancel();
    this.files = [];
    this.localPayload = null;
    this.hasLocalAttempt = false;
    this.onClearPreview();
    if (this.consent) this.consent.checked = false;
    if (this.autoConsent) this.autoConsent.checked = false;
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
    this.scanButton.disabled = !hasFiles || this.isScanning;
    this.scanButton.textContent = this.aiMode?.checked ? "Quét bằng AI" : "Quét trên thiết bị";
    [this.localMode, this.aiMode, this.autoConsent].forEach(input => { if (input) input.disabled = this.isScanning; });
    this.clearButton.disabled = !hasFiles || this.isScanning;
    this.chooseButton.disabled = this.isScanning;
    this.fileList.querySelectorAll("button").forEach(button => { button.disabled = this.isScanning; });
    if (this.cancelButton) this.cancelButton.hidden = !this.isScanning;
    if (this.onlineButton) this.onlineButton.disabled = !hasFiles || this.isScanning;
    if (this.fallbackContinue) this.fallbackContinue.disabled = !hasFiles || this.consent?.checked !== true || this.isScanning;
    this.supplementActions?.classList.toggle("is-hidden", !this.hasLocalAttempt || !hasFiles);
    this.dropzone.setAttribute("aria-disabled", String(this.isScanning));
    this.dropzone.classList.toggle("has-files", hasFiles);
  }

  closeOffer() {
    if (this.fallbackDialog?.open) this.fallbackDialog.close();
    if (this.consent) this.consent.checked = false;
  }

  offerOnlineScan() {
    const dialog = this.fallbackDialog;
    if (this.isScanning || !this.files.length || !dialog?.showModal || dialog.open) return;
    if (this.consent) this.consent.checked = false;
    this.render();
    dialog.showModal();
    this.consent?.focus();
  }

  requestAiScan() {
    if (this.autoConsent?.checked) {
      if (this.aiMode) this.aiMode.checked = true;
      if (this.localMode) this.localMode.checked = false;
      return this.scanOnline();
    }
    this.offerOnlineScan();
  }

  scrollToManualEntry() {
    const entry = document.getElementById("academic-score-entry");
    entry?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => entry?.querySelector("[data-academic-score]")?.focus({ preventScroll: true }));
  }

  cancel() {
    if (!this.isScanning) return;
    this.operation += 1;
    this.controller?.abort();
    this.isScanning = false;
    this.setStatus("Đã hủy quét. Điểm đang có vẫn được giữ lại.");
    this.render();
  }

  releaseImages() {
    this.cancel();
    this.closeOffer();
    this.files = [];
    this.localPayload = null;
    this.hasLocalAttempt = false;
    if (this.autoConsent) this.autoConsent.checked = false;
    this.render();
  }

  beginScan() {
    this.isScanning = true;
    this.controller = new AbortController();
    const operation = ++this.operation;
    const signal = this.controller.signal;
    this.render();
    return { operation, signal, current: () => operation === this.operation && !signal.aborted };
  }

  async scan() {
    if (this.isScanning) return;
    if (!this.files.length) { this.notify("Hãy chọn ít nhất một ảnh học bạ."); return; }
    if (this.aiMode?.checked) return this.requestAiScan();
    this.closeOffer();
    const run = this.beginScan();
    const sourceFiles = this.files.map((item) => item.file);
    this.onScanStart();
    let offerOnline = false;
    const localController = new AbortController();
    const abortLocal = () => localController.abort();
    run.signal.addEventListener("abort", abortLocal, { once: true });
    try {
      this.setStatus("Đang chuẩn bị quét trên thiết bị...", "working");
      const payload = await waitForTranscriptTask((async () => {
        const { recognizeTranscriptInBrowser } = await this.loadLocalOcr();
        checkSignal(localController.signal);
        return recognizeTranscriptInBrowser(sourceFiles.map(() => ({ blob: null })), {
          assetBaseUrl: resolveTranscriptAssetBaseUrl(), sourceFiles, signal: localController.signal,
          gradeHint: document.getElementById("transcript-local-grade")?.value || null,
          periodHint: document.getElementById("transcript-local-period")?.value || null,
          onStatus: (message) => { if (run.current() && !localController.signal.aborted) this.setStatus(message, "working"); }
        });
      })(), {
        signal: run.signal, timeoutMs: this.localTimeoutMs,
        onTimeout: () => { abortLocal(); return new Error("Quét trên thiết bị mất quá lâu. Chuyển sang AI để tiếp tục, hoặc nhập điểm bằng tay."); }
      });
      if (!run.current()) return;
      this.setStatus("Đang kiểm tra điểm đã đọc...", "working");
      const latest = this.getPreviewPayload();
      this.localPayload = preservePreviewEdits({ ...mergeTranscriptResults(latest || payload, latest ? payload : null), timings: payload.timings, evidence: payload.evidence }, latest);
      for (const detail of Object.values(this.localPayload.provenance)) if (detail.source === "remote") detail.source = "local";
      this.quality = assessTranscriptQuality(payload, payload.evidence);
      this.hasLocalAttempt = true;
      this.onScanSuccess(this.localPayload);
      offerOnline = this.quality.suggestOnline;
      this.setStatus(offerOnline
        ? "Một số ô chưa đọc được. Bạn có thể quét bổ sung bằng AI hoặc sửa điểm trong bảng bên dưới."
        : "Đã đọc xong ảnh trên thiết bị. Đối chiếu từng điểm với ảnh gốc trước khi xác nhận.", "success");
    } catch (error) {
      if (!run.current()) return;
      this.hasLocalAttempt = true;
      this.quality = assessTranscriptQuality(this.localPayload, error?.evidence);
      offerOnline = true;
      this.setStatus(error?.message || "Chưa đọc được ảnh. Bạn có thể quét lại, dùng AI bổ sung hoặc nhập điểm bằng tay.", "error");
    } finally {
      abortLocal();
      run.signal.removeEventListener("abort", abortLocal);
      sourceFiles.length = 0;
      if (run.current()) { this.isScanning = false; this.render(); if (offerOnline) await this.requestAiScan(); }
    }
  }

  async scanOnline() {
    if (this.isScanning || !this.files.length) return;
    if (this.consent?.checked !== true && this.autoConsent?.checked !== true) { this.notify("Chọn ô đồng ý trước khi gửi ảnh để quét bằng AI."); return; }
    const previous = this.getPreviewPayload() || this.localPayload;
    this.closeOffer();
    const run = this.beginScan();
    this.onScanStart();
    let images = [];
    try {
      images = await this.optimizeImages(this.files.map(item => item.file), {
        signal: run.signal,
        onProgress: (index, total) => { if (run.current()) this.setStatus(`Đang chuẩn bị ảnh ${index + 1}/${total} để gửi...`, "working"); }
      });
      if (!run.current()) return;
      if (images.reduce((total, image) => total + image.blob.size, 0) > MAX_UPLOAD_BYTES) {
        throw new Error("Ảnh sau khi xử lý vẫn vượt 10 MB. Bạn hãy chọn ít ảnh hơn cho lượt quét này.");
      }
      const remote = await this.requestOnline(images, { signal: run.signal,
        onStatus: message => { if (run.current()) this.setStatus(message, "working"); }
      });
      if (!run.current()) return;
      const latest = this.getPreviewPayload() || previous;
      const merged = mergeTranscriptResults(latest, remote);
      // Edits in the preview belong to the user, including an explicit choice to leave a cell blank.
      preservePreviewEdits(merged, latest);
      this.localPayload = merged;
      this.onScanSuccess(merged);
      this.setStatus(merged.conflicts.length
        ? "Hai lần quét đọc khác nhau ở một số ô. Đối chiếu ảnh gốc rồi chọn điểm đúng."
        : "Đã quét ảnh bằng AI. Bạn hãy đối chiếu điểm với ảnh gốc rồi xác nhận.", "success");
    } catch (error) {
      if (run.current()) {
        const quota = ["AI_QUOTA", "OCR_SPACE_QUOTA", "SCAN_QUOTA_EXHAUSTED", "RATE_LIMITED"].includes(error?.code);
        const detail = quota ? "Lượt quét trực tuyến hiện chưa khả dụng. Bạn có thể sửa các ô còn thiếu trong bảng."
          : error?.code === "REMOTE_SCAN_TIMEOUT" ? "Dịch vụ nhận diện phản hồi quá chậm. Bạn có thể thử lại hoặc nhập các ô còn thiếu."
          : error?.message || "Bạn có thể thử lại hoặc nhập các ô còn thiếu.";
        this.setStatus(`Điểm đang có vẫn được giữ lại. ${detail}`, "error");
      }
    } finally {
      images.length = 0;
      if (run.current()) { this.isScanning = false; this.render(); }
    }
  }
}
