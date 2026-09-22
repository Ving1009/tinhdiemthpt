import { escapeHTML } from "./utils.js";

const SCORE_FIELDS = ["semester1", "semester2", "year"];

function inputValue(value) { return value === null || value === undefined ? "" : String(value); }
function normalized(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLocaleLowerCase("vi").trim(); }
function readNumber(value, { integer = false, min, max }) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return Number.NaN;
  const number = Number(text);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) return Number.NaN;
  return number;
}

export class TranscriptPreview {
  constructor({ onConfirm, notify }) {
    this.panel = document.getElementById("transcript-preview");
    this.student = document.getElementById("transcript-student");
    this.warnings = document.getElementById("transcript-warnings");
    this.table = document.getElementById("transcript-preview-body");
    this.message = document.getElementById("transcript-preview-message");
    this.confirmButton = document.getElementById("transcript-confirm-autofill");
    this.onConfirm = onConfirm;
    this.notify = notify || (() => {});
    this.data = null;
    if (!this.panel) return;
    this.table.addEventListener("input", (event) => this.updateField(event));
    this.table.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-transcript-row]");
      if (button) { this.data.scores.splice(Number(button.dataset.removeTranscriptRow), 1); this.render(); }
    });
    this.confirmButton.addEventListener("click", () => this.confirm());
  }

  show(payload) {
    this.data = structuredClone(payload.data);
    this.backendWarnings = payload.warnings || [];
    this.panel.classList.remove("is-hidden");
    this.setMessage("Bạn có thể sửa các ô trước khi điền vào bảng học bạ.");
    this.render();
    this.panel.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  clear() {
    this.data = null;
    this.backendWarnings = [];
    this.panel.classList.add("is-hidden");
    this.student.textContent = "Không đọc được tên học sinh.";
    this.warnings.innerHTML = "";
    this.warnings.classList.add("is-hidden");
    this.table.innerHTML = "";
    this.setMessage("");
  }

  setMessage(message, state = "") {
    this.message.textContent = message;
    this.message.dataset.state = state;
  }

  updateField(event) {
    const input = event.target.closest("[data-transcript-field]");
    if (!input || !this.data) return;
    const row = this.data.scores[Number(input.dataset.transcriptRow)];
    if (!row) return;
    row[input.dataset.transcriptField] = input.value;
    this.setMessage("Có thay đổi chưa được xác nhận.");
  }

  getEditedData() {
    const errors = [];
    const scores = this.data.scores.map((row, index) => {
      const subject = String(row.subject ?? "").trim();
      const grade = readNumber(row.grade, { integer: true, min: 10, max: 12 });
      if (!subject) errors.push(`Dòng ${index + 1}: cần chọn môn học hoặc định hướng Công nghệ.`);
      if (Number.isNaN(grade) || grade === null) errors.push(`Dòng ${index + 1}: lớp phải là 10, 11 hoặc 12.`);
      const values = Object.fromEntries(SCORE_FIELDS.map((field) => {
        const value = readNumber(row[field], { min: 0, max: 10 });
        if (Number.isNaN(value)) errors.push(`Dòng ${index + 1}: ${field} phải nằm trong khoảng 0 đến 10.`);
        return [field, Number.isNaN(value) ? null : value];
      }));
      const confidence = Number(row.confidence);
      return { subject, grade, ...values, confidence: Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : 0 };
    });
    return { errors, data: { student: this.data.student, scores } };
  }

  async confirm() {
    if (!this.data?.scores?.length) { this.setMessage("Chưa có dòng điểm để điền.", "error"); return; }
    const edited = this.getEditedData();
    if (edited.errors.length) { this.setMessage(edited.errors[0], "error"); return; }
    try {
      this.confirmButton.disabled = true;
      const result = await this.onConfirm(edited.data);
      const detail = result.warnings.length ? ` ${result.warnings[0]}` : "";
      this.setMessage(`Đã điền ${result.filled} ô theo ${result.method}.${detail}`, "success");
    } catch (error) {
      this.setMessage(error.message || "Không thể điền điểm. Hãy kiểm tra lại dữ liệu.", "error");
    } finally {
      this.confirmButton.disabled = false;
    }
  }

  render() {
    if (!this.data) return;
    this.student.textContent = this.data.student?.name ? `Học sinh: ${this.data.student.name}` : "Không đọc được tên học sinh.";
    const warnings = this.backendWarnings || [];
    this.warnings.innerHTML = warnings.length ? `<ul>${warnings.map((warning) => `<li>${escapeHTML(warning)}</li>`).join("")}</ul>` : "";
    this.warnings.classList.toggle("is-hidden", !warnings.length);
    this.table.innerHTML = this.data.scores.map((row, index) => {
      const subjectControl = normalized(row.subject) === "cong nghe"
        ? `<select data-transcript-row="${index}" data-transcript-field="subject" aria-label="Chọn định hướng Công nghệ dòng ${index + 1}"><option value="">Chọn định hướng</option><option value="Công nghệ công nghiệp">Công nghệ công nghiệp</option><option value="Công nghệ nông nghiệp">Công nghệ nông nghiệp</option></select><small>Cần xác định trước khi điền</small>`
        : `<input list="transcript-subject-options" data-transcript-row="${index}" data-transcript-field="subject" value="${escapeHTML(inputValue(row.subject))}" aria-label="Môn dòng ${index + 1}" />`;
      return `<tr><td>${subjectControl}</td><td><input data-transcript-row="${index}" data-transcript-field="grade" inputmode="numeric" value="${escapeHTML(inputValue(row.grade))}" aria-label="Lớp dòng ${index + 1}" /></td>${SCORE_FIELDS.map((field) => `<td><input data-transcript-row="${index}" data-transcript-field="${field}" inputmode="decimal" value="${escapeHTML(inputValue(row[field]))}" aria-label="${field} dòng ${index + 1}" /></td>`).join("")}<td><button class="icon-button transcript-remove" type="button" data-remove-transcript-row="${index}" aria-label="Xóa dòng ${index + 1}" title="Xóa dòng">×</button></td></tr>`;
    }).join("");
  }
}
