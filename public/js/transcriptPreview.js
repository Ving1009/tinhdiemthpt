import { escapeHTML } from "./utils.js";

const SCORE_FIELDS = ["semester1", "semester2", "year"];
const SCORE_FIELD_LABELS = { semester1: "Điểm học kỳ I", semester2: "Điểm học kỳ II", year: "Điểm cả năm" };

function inputValue(value) { return value === null || value === undefined ? "" : String(value); }
function normalized(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLocaleLowerCase("vi").trim(); }
function rowIdentity(row) { return `${String(row.subject ?? "").normalize("NFC").trim().replace(/\s+/g, " ")}|${Number(row.grade)}`; }
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
    this.removedRowKeys = [];
    if (!this.panel) return;
    this.table.addEventListener("input", (event) => this.updateField(event));
    this.table.addEventListener("change", (event) => this.chooseConflict(event));
    this.table.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-transcript-row]");
      if (button) this.removeRow(Number(button.dataset.removeTranscriptRow));
    });
    this.confirmButton.addEventListener("click", () => this.confirm());
  }

  show(payload) {
    this.data = structuredClone(payload.data);
    this.data.scores.forEach(row => { row._originalIdentity ||= { subject: row.subject, grade: row.grade }; });
    this.backendWarnings = payload.warnings || [];
    this.provenance = structuredClone(payload.provenance || {});
    this.conflicts = structuredClone(payload.conflicts || []);
    this.removedRowKeys = [...(payload.removedRowKeys || [])];
    this.panel.classList.remove("is-hidden");
    this.setMessage("Bạn hãy kiểm tra và sửa các ô cần thiết trước khi điền vào bảng học bạ.");
    this.render();
    this.panel.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  clear() {
    this.data = null;
    this.backendWarnings = [];
    this.provenance = {};
    this.conflicts = [];
    this.removedRowKeys = [];
    this.panel.classList.add("is-hidden");
    this.student.textContent = "Đối chiếu từng điểm với ảnh gốc trước khi xác nhận.";
    this.warnings.innerHTML = "";
    this.warnings.classList.add("is-hidden");
    this.table.innerHTML = "";
    this.setMessage("");
  }

  removeRow(index) {
    if (!Number.isInteger(index) || index < 0 || !this.data?.scores?.[index]) return;
    const removed = this.data.scores.splice(index, 1)[0];
    this.removedRowKeys = [...new Set([...(this.removedRowKeys || []), ...[removed, removed._originalIdentity].filter(Boolean).map(rowIdentity), ...(removed._previousIdentities || [])])];
    this.conflicts = (this.conflicts || []).filter(row => !this.removedRowKeys.includes(rowIdentity(row)));
    this.render();
    this.setMessage("Đã bỏ dòng điểm này khỏi lượt quét. Các lượt quét bổ sung sẽ giữ lựa chọn của bạn.");
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
    const oldSubject = row.subject, oldGrade = Number(row.grade), oldIdentity = rowIdentity(row);
    row[input.dataset.transcriptField] = input.value;
    if (!SCORE_FIELDS.includes(input.dataset.transcriptField) && rowIdentity(row) !== oldIdentity) {
      row._previousIdentities = [...new Set([...(row._previousIdentities || []), oldIdentity])];
    }
    const fields = SCORE_FIELDS.includes(input.dataset.transcriptField) ? [input.dataset.transcriptField] : SCORE_FIELDS;
    row._editedFields = [...new Set([...(row._editedFields || []), ...fields])];
    for (const field of fields) {
      const key = `${row.subject}|${Number(row.grade)}|${field}`;
      this.provenance[key] = { source: "manual" };
      this.conflicts = (this.conflicts || []).filter(item => item.key !== key);
    }
    if (!SCORE_FIELDS.includes(input.dataset.transcriptField)) {
      this.conflicts = (this.conflicts || []).filter(item => item.subject !== oldSubject || item.grade !== oldGrade);
      const tr = input.closest("tr");
      tr?.querySelectorAll("[data-transcript-choice], [data-transcript-source-label]").forEach(control => control.remove());
      tr?.querySelectorAll("[data-transcript-source]").forEach(control => { control.dataset.transcriptSource = "manual"; });
    }
    const cell = input.closest("td");
    cell?.querySelector("[data-transcript-choice]")?.remove();
    cell?.querySelector("[data-transcript-source-label]")?.remove();
    input.dataset.transcriptSource = "manual";
    this.setMessage("Bạn đã sửa dữ liệu nhưng chưa xác nhận.");
  }

  getPayload() {
    if (!this.data) return null;
    const data = this.getEditedData().data;
    const manualValues = {};
    this.data.scores.forEach((row, index) => {
      for (const field of row._editedFields || []) {
        manualValues[`${rowIdentity(row)}|${field}`] = row[field];
        // Normalized valid numbers are used for matching; raw edits stay visible until corrected.
        if (SCORE_FIELDS.includes(field) && !Number.isNaN(readNumber(row[field], { min: 0, max: 10 }))) {
          manualValues[`${rowIdentity(row)}|${field}`] = data.scores[index][field];
        }
      }
    });
    const manualRows = this.data.scores.filter(row => row._editedFields?.length).map(row => structuredClone(row));
    return { data, warnings: this.backendWarnings, provenance: this.provenance, conflicts: this.conflicts, manualValues, manualRows, removedRowKeys: [...this.removedRowKeys] };
  }

  chooseConflict(event) {
    const choice = event.target.closest("[data-transcript-choice]");
    if (!choice || !choice.value || !this.data) return;
    const row = this.data.scores[Number(choice.dataset.transcriptRow)];
    const field = choice.dataset.transcriptChoice;
    const input = choice.closest("td").querySelector("[data-transcript-field]");
    input.value = choice.value === "skip" ? "" : choice.value;
    this.updateField({ target: input });
    row[field] = choice.value === "skip" ? null : Number(choice.value);
  }

  getEditedData() {
    const errors = [];
    if (this.conflicts?.length) errors.push("Một số ô có hai cách đọc khác nhau. Chọn điểm theo ảnh gốc hoặc để trống để nhập sau.");
    const scores = this.data.scores.map((row, index) => {
      const subject = String(row.subject ?? "").trim();
      const grade = readNumber(row.grade, { integer: true, min: 10, max: 12 });
      if (!subject) errors.push(`Dòng ${index + 1}: cần chọn môn học hoặc định hướng Công nghệ.`);
      if (Number.isNaN(grade) || grade === null) errors.push(`Dòng ${index + 1}: lớp phải là 10, 11 hoặc 12.`);
      const values = Object.fromEntries(SCORE_FIELDS.map((field) => {
        const value = readNumber(row[field], { min: 0, max: 10 });
        if (Number.isNaN(value)) errors.push(`Dòng ${index + 1}: ${SCORE_FIELD_LABELS[field]} phải nằm trong khoảng 0 đến 10.`);
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
    this.student.textContent = this.data.student?.name ? `Học sinh: ${this.data.student.name}` : "Đối chiếu từng điểm với ảnh gốc trước khi xác nhận.";
    const warnings = this.backendWarnings || [];
    this.warnings.innerHTML = warnings.length ? `<ul>${warnings.map((warning) => `<li>${escapeHTML(warning)}</li>`).join("")}</ul>` : "";
    this.warnings.classList.toggle("is-hidden", !warnings.length);
    this.table.innerHTML = this.data.scores.map((row, index) => {
      const subjectControl = normalized(row.subject) === "cong nghe"
        ? `<select data-transcript-row="${index}" data-transcript-field="subject" aria-label="Chọn định hướng Công nghệ dòng ${index + 1}"><option value="">Chọn định hướng</option><option value="Công nghệ công nghiệp">Công nghệ công nghiệp</option><option value="Công nghệ nông nghiệp">Công nghệ nông nghiệp</option></select><small>Chọn định hướng trước khi điền điểm</small>`
        : normalized(row.subject) === "ngoai ngu"
          ? `<select data-transcript-row="${index}" data-transcript-field="subject" aria-label="Chọn ngoại ngữ dòng ${index + 1}"><option value="">Chọn ngoại ngữ</option>${["Tiếng Anh", "Tiếng Pháp", "Tiếng Trung", "Tiếng Nhật", "Tiếng Nga", "Tiếng Đức", "Tiếng Hàn"].map(subject => `<option value="${subject}">${subject}</option>`).join("")}</select><small>Chọn môn theo bảng điểm gốc</small>`
        : `<input list="transcript-subject-options" data-transcript-row="${index}" data-transcript-field="subject" value="${escapeHTML(inputValue(row.subject))}" aria-label="Môn dòng ${index + 1}" />`;
      const cells = SCORE_FIELDS.map(field => {
        const key = `${row.subject}|${Number(row.grade)}|${field}`;
        const provenance = this.provenance[key] || {};
        const conflict = (this.conflicts || []).find(item => item.key === key);
        const options = conflict ? [...new Set([...(conflict.localValues || [conflict.local]), ...(conflict.remoteValues || [conflict.remote])])].filter(value => value !== null && value !== undefined) : [];
        const detail = conflict
          ? `<small data-transcript-source-label>Hai cách đọc khác nhau</small><select data-transcript-row="${index}" data-transcript-choice="${field}" aria-label="Chọn ${SCORE_FIELD_LABELS[field]} dòng ${index + 1}"><option value="">Chọn theo ảnh gốc</option>${options.map(value => `<option value="${value}">${value}${value === conflict.local ? " (thiết bị)" : value === conflict.remote ? " (AI)" : ""}</option>`).join("")}<option value="skip">Để trống, nhập sau</option></select>`
          : provenance.source === "remote" ? '<small data-transcript-source-label>AI bổ sung</small>' : "";
        return `<td><input data-transcript-row="${index}" data-transcript-field="${field}" data-transcript-source="${escapeHTML(provenance.source || "local")}" inputmode="decimal" value="${escapeHTML(inputValue(row[field]))}" aria-label="${SCORE_FIELD_LABELS[field]} dòng ${index + 1}" />${detail}</td>`;
      }).join("");
      return `<tr><td>${subjectControl}</td><td><input data-transcript-row="${index}" data-transcript-field="grade" inputmode="numeric" value="${escapeHTML(inputValue(row.grade))}" aria-label="Lớp dòng ${index + 1}" /></td>${cells}<td><button class="icon-button transcript-remove" type="button" data-remove-transcript-row="${index}" aria-label="Xóa dòng ${index + 1}" title="Xóa dòng">×</button></td></tr>`;
    }).join("");
  }
}
