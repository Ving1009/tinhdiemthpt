import { escapeHTML } from "./utils.js";

const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function fileKey(file) { return `${file.name}-${file.size}-${file.lastModified}`; }
function fileSize(bytes) { return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 1 : 0)} MB`; }

export function resolveTranscriptApiUrl(location = window.location, documentRef = document) {
  const configuredBase = documentRef.querySelector('meta[name="transcript-api-base"]')?.content.trim();
  if (configuredBase) return new URL("/api/scan-transcript", configuredBase).toString();
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (isLoopback && location.port !== "3000") return `http://${location.hostname}:3000/api/scan-transcript`;
  return "/api/scan-transcript";
}

export class TranscriptScanner {
  constructor({ onScanSuccess, notify }) {
    this.input = document.getElementById("transcript-images");
    this.dropzone = document.getElementById("transcript-dropzone");
    this.chooseButton = document.getElementById("transcript-choose-images");
    this.fileList = document.getElementById("transcript-file-list");
    this.scanButton = document.getElementById("transcript-scan");
    this.clearButton = document.getElementById("transcript-clear-images");
    this.status = document.getElementById("transcript-scan-status");
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
  }

  addFiles(list) {
    const next = [...this.files];
    const errors = [];
    for (const file of [...list]) {
      if (!ACCEPTED_TYPES.has(file.type)) { errors.push(`${file.name}: chỉ nhận JPG, PNG hoặc WEBP.`); continue; }
      if (file.size > MAX_IMAGE_BYTES) { errors.push(`${file.name}: tối đa 7 MB.`); continue; }
      if (next.some((item) => fileKey(item.file) === fileKey(file))) continue;
      if (next.length >= MAX_IMAGES) { errors.push(`Chỉ có thể chọn tối đa ${MAX_IMAGES} ảnh.`); break; }
      if (next.reduce((sum, item) => sum + item.file.size, file.size) > MAX_TOTAL_BYTES) { errors.push("Tổng dung lượng ảnh tối đa là 24 MB."); break; }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    this.files = next;
    this.render();
    if (errors.length) this.notify(errors[0]);
  }

  removeFile(index) {
    const [removed] = this.files.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.url);
    this.render();
  }

  clearFiles() {
    this.files.forEach((item) => URL.revokeObjectURL(item.url));
    this.files = [];
    this.setStatus("Chọn ảnh học bạ để bắt đầu quét.");
    this.render();
  }

  setStatus(message, state = "idle") {
    this.status.textContent = message;
    this.status.dataset.state = state;
  }

  render() {
    this.fileList.innerHTML = this.files.map((item, index) => `<li class="transcript-file-item"><img src="${escapeHTML(item.url)}" alt="Xem trước ${escapeHTML(item.file.name)}" /><span><b>${escapeHTML(item.file.name)}</b><small>${fileSize(item.file.size)}</small></span><button class="icon-button transcript-remove" type="button" data-transcript-file-index="${index}" aria-label="Xóa ${escapeHTML(item.file.name)}" title="Xóa ảnh">×</button></li>`).join("");
    const hasFiles = this.files.length > 0;
    this.scanButton.disabled = !hasFiles || this.isScanning;
    this.clearButton.disabled = !hasFiles || this.isScanning;
    this.dropzone.classList.toggle("has-files", hasFiles);
  }

  async scan() {
    if (!this.files.length || this.isScanning) return;
    this.isScanning = true;
    this.render();
    try {
      this.setStatus("Đang tải ảnh...", "working");
      const formData = new FormData();
      this.files.forEach(({ file }) => formData.append("images[]", file, file.name));
      this.setStatus("Đang đọc học bạ...", "working");
      const response = await fetch(resolveTranscriptApiUrl(), { method: "POST", body: formData });
      this.setStatus("Đang xử lý dữ liệu...", "working");
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || payload?.error || "Không thể đọc ảnh học bạ. Hãy thử lại sau.");
      this.setStatus("Đang kiểm tra...", "working");
      this.onScanSuccess(payload);
      this.setStatus("Hoàn tất! Kiểm tra lại bảng điểm trước khi xác nhận.", "success");
    } catch (error) {
      const message = error instanceof TypeError ? "Không kết nối được backend nhận diện. Trong VS Code, hãy chạy npm start ở terminal rồi thử lại." : error.message || "Không thể đọc ảnh học bạ. Hãy thử lại sau.";
      this.setStatus(message, "error");
    } finally {
      this.isScanning = false;
      this.render();
    }
  }
}
