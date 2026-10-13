import assert from "node:assert/strict";
import test from "node:test";
import { TranscriptPreview } from "../public/js/transcriptPreview.js";
import { mergeTranscriptResults } from "../public/js/core/transcriptHybrid.js";

const score = (year, subject = "Toán", grade = 12) => ({ subject, grade, semester1: 8, semester2: null, year, confidence: 0.9 });
const payload = (...scores) => ({ data: { student: { name: null }, scores }, warnings: [] });
function element() {
  const classes = new Set();
  return { textContent: "", innerHTML: "", dataset: {}, scrollIntoView() {}, classList: {
    add(value) { classes.add(value); }, remove(value) { classes.delete(value); },
    toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); }, contains(value) { return classes.has(value); }
  } };
}
function previewFor(data) {
  const preview = Object.create(TranscriptPreview.prototype);
  Object.assign(preview, {
    panel: element(), student: element(), warnings: element(), table: element(), message: element(), confirmButton: { disabled: false },
    onConfirm: async () => ({ filled: 1, method: "Cả năm lớp 12", warnings: [] })
  });
  preview.show(data);
  return preview;
}
function fieldInput(field, value, index = 0) {
  const removed = [];
  const cell = { querySelector(selector) { return { remove() { removed.push(selector); } }; } };
  const input = { value, dataset: { transcriptField: field, transcriptRow: String(index) },
    closest(selector) { return selector === "[data-transcript-field]" ? this : selector === "td" ? cell : null; } };
  return { input, cell, removed };
}
function selectChoice(preview, field, value, index = 0) {
  const { input, cell } = fieldInput(field, "", index);
  cell.querySelector = selector => selector === "[data-transcript-field]" ? input : { remove() {} };
  const choice = { value, dataset: { transcriptChoice: field, transcriptRow: String(index) },
    closest(selector) { return selector === "[data-transcript-choice]" ? this : selector === "td" ? cell : null; } };
  preview.chooseConflict({ target: choice });
}

test("preview xuất bản điểm giữ sửa tay, dấu phẩy, ô chủ động để trống và lỗi chưa sửa", () => {
  const preview = previewFor(payload(score(9)));
  for (const [field, value] of [["year", "8,5"], ["semester1", ""], ["semester2", "abc"]]) {
    preview.updateField({ target: fieldInput(field, value).input });
  }
  const snapshot = preview.getPayload();
  assert.equal(snapshot.data.scores[0].year, 8.5);
  assert.equal(snapshot.manualValues["Toán|12|year"], 8.5);
  assert.equal(snapshot.manualValues["Toán|12|semester1"], null);
  assert.equal(snapshot.manualValues["Toán|12|semester2"], "abc");
  assert.ok(preview.getEditedData().errors.length);
});

test("preview hiện lựa chọn cho đúng ô xung đột và chặn xác nhận khi chưa chọn", async () => {
  const preview = previewFor(mergeTranscriptResults(payload(score(8)), payload(score(9))));
  let confirmations = 0;
  preview.onConfirm = async () => { confirmations += 1; return { filled: 1, method: "Cả năm lớp 12", warnings: [] }; };
  assert.match(preview.table.innerHTML, /data-transcript-choice="year"/);
  assert.match(preview.table.innerHTML, /value="8">8 \(thiết bị\)/);
  assert.match(preview.table.innerHTML, /value="9">9 \(AI\)/);
  await preview.confirm();
  assert.equal(confirmations, 0);
  assert.equal(preview.message.dataset.state, "error");
  selectChoice(preview, "year", "8");
  assert.equal(preview.conflicts.length, 0);
  assert.equal(preview.data.scores[0].year, 8);
  assert.equal(preview.getPayload().manualValues["Toán|12|year"], 8);
  await preview.confirm();
  assert.equal(confirmations, 1);
});

test("chọn để trống giải quyết xung đột và phải được giữ khi quét bổ sung", () => {
  const preview = previewFor(mergeTranscriptResults(payload(score(8)), payload(score(9))));
  selectChoice(preview, "year", "skip");
  const snapshot = preview.getPayload();
  assert.equal(preview.conflicts.length, 0);
  assert.equal(snapshot.data.scores[0].year, null);
  assert.equal(Object.hasOwn(snapshot.manualValues, "Toán|12|year"), true);
  assert.equal(snapshot.manualValues["Toán|12|year"], null);
  assert.equal(preview.getEditedData().errors.length, 0);
});

test("nhập tay ngay ô xung đột bỏ các lựa chọn cũ và chờ xác nhận", () => {
  const preview = previewFor(mergeTranscriptResults(payload(score(8)), payload(score(9))));
  const { input, removed } = fieldInput("year", "8,75");
  preview.updateField({ target: input });
  assert.equal(preview.conflicts.length, 0);
  assert.equal(preview.getPayload().manualValues["Toán|12|year"], 8.75);
  assert.equal(input.dataset.transcriptSource, "manual");
  assert.deepEqual(removed, ["[data-transcript-choice]", "[data-transcript-source-label]"]);
});

test("sửa lớp hoặc môn không để xung đột thuộc nhận dạng cũ chặn xác nhận", () => {
  for (const [field, value, key] of [["grade", "11", "Toán|11|year"], ["subject", "Ngữ văn", "Ngữ văn|12|year"]]) {
    const preview = previewFor(mergeTranscriptResults(payload(score(8)), payload(score(9))));
    preview.updateField({ target: fieldInput(field, value).input });
    assert.equal(preview.conflicts.length, 0);
    assert.equal(Object.hasOwn(preview.getPayload().manualValues, key), true);
    assert.equal(preview.getEditedData().errors.length, 0);
  }
});

test("preview hỗ trợ nhiều điểm khác nhau trong cùng nguồn, không tự chọn số", () => {
  const preview = previewFor(mergeTranscriptResults(payload(score(8), score(9)), payload(score(8))));
  assert.match(preview.table.innerHTML, /<option value="8">/);
  assert.match(preview.table.innerHTML, /<option value="9">/);
  assert.equal(preview.data.scores[0].year, null);
  assert.ok(preview.getEditedData().errors.length);
});

test("sửa preview không sửa payload nguồn và clear xóa toàn bộ metadata tạm", () => {
  const original = mergeTranscriptResults(payload(score(8)), payload(score(9)));
  const preview = previewFor(original);
  preview.updateField({ target: fieldInput("year", "7").input });
  assert.equal(original.data.scores[0].year, null);
  assert.equal(original.conflicts.length, 1);
  preview.clear();
  assert.equal(preview.getPayload(), null);
  assert.deepEqual(preview.provenance, {});
  assert.deepEqual(preview.conflicts, []);
  assert.deepEqual(preview.removedRowKeys, []);
  assert.equal(preview.table.innerHTML, "");
  assert.equal(preview.panel.classList.contains("is-hidden"), true);
});

test("xóa dòng đã sửa môn/lớp ghi cả nhận dạng hiện tại và gốc, không đưa metadata vào điểm xác nhận", () => {
  const preview = previewFor(payload(score(8), score(7, "Ngữ văn")));
  preview.updateField({ target: fieldInput("subject", "Vật lí").input });
  preview.updateField({ target: fieldInput("grade", "11").input });
  preview.removeRow(0);
  const snapshot = preview.getPayload();
  assert.deepEqual(new Set(snapshot.removedRowKeys), new Set(["Vật lí|11", "Vật lí|12", "Toán|12"]));
  assert.equal(snapshot.data.scores.length, 1);
  assert.equal(snapshot.data.scores[0].subject, "Ngữ văn");
  assert.equal(Object.hasOwn(preview.getEditedData().data, "removedRowKeys"), false);
  preview.show(snapshot);
  assert.deepEqual(new Set(preview.removedRowKeys), new Set(["Vật lí|11", "Vật lí|12", "Toán|12"]));
  preview.clear();
  preview.show(payload(score(9)));
  assert.deepEqual(preview.removedRowKeys, []);
  assert.equal(preview.data.scores[0].subject, "Toán");
});

test("xóa dòng lỗi không ảnh hưởng dòng sửa khác và bỏ qua chỉ số không hợp lệ", () => {
  const preview = previewFor(payload(score(8), score(7, "Ngữ văn")));
  preview.updateField({ target: fieldInput("grade", "123").input });
  preview.updateField({ target: fieldInput("year", "abc", 1).input });
  for (const index of [-1, NaN, 5]) preview.removeRow(index);
  assert.equal(preview.data.scores.length, 2);
  preview.removeRow(0);
  assert.deepEqual(new Set(preview.getPayload().removedRowKeys), new Set(["Toán|123", "Toán|12"]));
  assert.equal(preview.data.scores[0].subject, "Ngữ văn");
  assert.equal(preview.data.scores[0].year, "abc");
  assert.ok(preview.getEditedData().errors.length);
});

test("xóa dòng sau nhiều lần đổi nhận dạng nhớ cả các môn và lớp trung gian", () => {
  const preview = previewFor(payload(score(8)));
  preview.updateField({ target: fieldInput("subject", "Vật lí").input });
  preview.updateField({ target: fieldInput("grade", "11").input });
  preview.updateField({ target: fieldInput("subject", "Hóa học").input });
  assert.equal(Object.hasOwn(preview.getEditedData().data.scores[0], "_previousIdentities"), false);
  preview.removeRow(0);
  assert.deepEqual(new Set(preview.getPayload().removedRowKeys), new Set(["Toán|12", "Vật lí|12", "Vật lí|11", "Hóa học|11"]));
  preview.clear();
  assert.deepEqual(preview.removedRowKeys, []);
});
