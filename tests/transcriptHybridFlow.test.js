import assert from "node:assert/strict";
import test from "node:test";
import { TranscriptScanner } from "../public/js/transcriptScanner.js";
import { TranscriptPreview } from "../public/js/transcriptPreview.js";

class Element extends EventTarget {
  constructor() {
    super();
    this.value = "";
    this.checked = false;
    this.dataset = {};
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name)
    };
  }
  setAttribute(name, value) { this[name] = value; }
  querySelectorAll() { return []; }
  querySelector() { return this; }
  focus() {}
  scrollIntoView() { this.scrolled = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  click() { this.dispatchEvent(new Event("click")); }
}

const row = (subject = "Toán", values = {}) => ({ subject, grade: 12, semester1: null, semester2: null, year: null, ...values });
function payload(scores, expectedCells) {
  return {
    success: true, data: { student: { name: null }, scores }, warnings: [],
    evidence: { expectedCells, expectedCellsReliable: true, visibleScoreCells: expectedCells, geometryReliable: true }
  };
}
const complete = () => payload([
  row("Toán", { semester1: 8, semester2: 9, year: 8.7 }),
  row("Ngữ văn", { semester1: 7, semester2: 8, year: 7.7 }),
  row("Tiếng Anh", { semester1: 9, semester2: 10, year: 9.7 })
], 9);
const sparse = () => payload([row("Toán", { semester1: 8, semester2: 9, year: 8.7 })], 27);
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, { local = complete(), recognize, online, optimize } = {}) {
  const originals = new Map(["document", "window", "requestAnimationFrame"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  globalThis.document = { getElementById: element };
  globalThis.window = { location: { hostname: "127.0.0.1", port: "3000" } };
  globalThis.requestAnimationFrame = callback => callback();
  const state = { preview: null, previews: [], notices: [], localCalls: 0, optimized: 0, uploads: 0, starts: 0 };
  const file = { name: "bang-diem.jpg", type: "image/jpeg", size: 1000, lastModified: 1 };
  const scanner = new TranscriptScanner({
    onScanStart: () => { state.starts++; },
    onClearPreview: () => { state.preview = null; },
    onScanSuccess: value => { state.preview = structuredClone(value); state.previews.push(state.preview); },
    getPreviewPayload: () => state.preview,
    notify: message => state.notices.push(message),
    loadLocalOcr: async () => ({ recognizeTranscriptInBrowser: async (images, options) => {
      state.localCalls++;
      assert.equal(images.length, 1);
      assert.equal(options.sourceFiles[0], file);
      assert.ok(options.signal instanceof AbortSignal);
      return recognize ? recognize(options) : structuredClone(local);
    } }),
    optimizeImages: async (files, options) => {
      state.optimized++;
      assert.equal(files[0], file);
      assert.ok(options.signal instanceof AbortSignal);
      options.onProgress(0, files.length);
      if (optimize) return optimize(options);
      return [{ blob: new Blob(["optimized"], { type: "image/jpeg" }), uploadName: "bang-diem.jpg" }];
    },
    requestOnline: async (images, options) => {
      state.uploads++;
      assert.equal(images.length, 1);
      assert.ok(options.signal instanceof AbortSignal);
      return online ? online(options) : structuredClone(local);
    }
  });
  scanner.addFiles([file]);
  return { scanner, state, element, file };
}

function connectPreview(scanner, state) {
  const preview = new TranscriptPreview({ onConfirm: async () => ({ filled: 0, warnings: [] }) });
  scanner.getPreviewPayload = () => preview.getPayload();
  scanner.onClearPreview = () => { preview.clear(); state.preview = null; };
  scanner.onScanSuccess = value => {
    preview.show(value);
    state.preview = preview.getPayload();
    state.previews.push(state.preview);
  };
  return preview;
}
function editPreview(preview, field, value, index = 0) {
  const input = { value, dataset: { transcriptField: field, transcriptRow: String(index) },
    closest: selector => selector === "[data-transcript-field]" ? input : null };
  preview.updateField({ target: input });
}

test("quét đầy đủ trên thiết bị không cần đồng ý gửi ảnh và không gọi API", async t => {
  const { scanner, state, element, file } = fixture(t);
  assert.equal(element("transcript-consent").checked, false);
  assert.equal(element("transcript-scan").disabled, false);
  await scanner.scan();
  assert.equal(state.localCalls, 1);
  assert.equal(state.uploads, 0);
  assert.equal(state.optimized, 0);
  assert.equal(scanner.quality.state, "complete");
  assert.equal(scanner.quality.validCells, 9);
  assert.equal(element("transcript-fallback-dialog").open, undefined);
  assert.equal(scanner.files[0].file, file, "giữ ảnh trong bộ nhớ để có thể quét lại");
  assert.equal(state.preview.data.scores.find(score => score.subject === "Toán").year, 8.7);
  scanner.releaseImages();
  assert.equal(scanner.files.length, 0);
  assert.ok(state.preview, "giải phóng ảnh không xóa điểm đang xem");
});

test("bảng nhỏ đọc đủ một điểm 0 không bị đề nghị dùng API", async t => {
  const { scanner, state, element } = fixture(t, { local: payload([row("Toán", { year: 0 })], 1) });
  await scanner.scan();
  assert.equal(scanner.quality.state, "complete");
  assert.equal(scanner.quality.coverage, 1);
  assert.equal(scanner.quality.suggestOnline, false);
  assert.equal(state.preview.data.scores[0].year, 0);
  assert.equal(state.uploads, 0);
  assert.equal(element("transcript-fallback-dialog").open, undefined);
});

test("thiếu nhiều điểm chỉ mở lựa chọn; bỏ qua và nhập tay không gửi ảnh", async t => {
  const { scanner, state, element } = fixture(t, { local: sparse() });
  await scanner.scan();
  assert.equal(scanner.quality.suggestOnline, true);
  assert.equal(element("transcript-fallback-dialog").open, true);
  assert.equal(element("transcript-fallback-continue").disabled, true);
  await scanner.scanOnline();
  assert.equal(state.uploads, 0);
  assert.equal(state.optimized, 0);
  assert.match(state.notices[0], /đồng ý/);
  element("transcript-fallback-manual").click();
  assert.equal(element("transcript-fallback-dialog").open, false);
  assert.equal(element("academic-score-entry").scrolled, true);
  assert.equal(state.preview.data.scores[0].year, 8.7);
  assert.equal(state.uploads, 0);
});

test("đồng ý quét bổ sung chỉ bắt đầu một request dù bấm lặp khi đang quét", async t => {
  const reply = deferred();
  const { scanner, state, element } = fixture(t, { local: sparse(), online: () => reply.promise });
  await scanner.scan();
  element("transcript-consent").checked = true;
  const pending = scanner.scanOnline();
  await scanner.scanOnline();
  await nextTurn();
  assert.equal(state.optimized, 1);
  assert.equal(state.uploads, 1);
  assert.equal(element("transcript-consent").checked, false);
  assert.equal(element("transcript-fallback-dialog").open, false);
  reply.resolve(complete());
  await pending;
  assert.equal(state.previews.length, 2);
  assert.equal(state.preview.data.scores.find(score => score.subject === "Ngữ văn").year, 7.7);
  assert.equal(state.preview.provenance["Ngữ văn|12|year"].source, "remote");
  assert.equal(scanner.isScanning, false);
});

test("API hết quota, lỗi máy chủ hoặc timeout đều giữ bản xem trước local", async t => {
  for (const code of ["SCAN_QUOTA_EXHAUSTED", "AI_REQUEST_FAILED", "REMOTE_SCAN_TIMEOUT"]) {
    await t.test(code, async t => {
      const { scanner, state, element } = fixture(t, { local: sparse(), online: async () => {
        throw Object.assign(new Error("Không thể quét bổ sung."), { code });
      } });
      await scanner.scan();
      const previous = structuredClone(state.preview);
      element("transcript-consent").checked = true;
      await scanner.scanOnline();
      assert.equal(state.uploads, 1);
      assert.equal(state.previews.length, 1);
      assert.deepEqual(state.preview, previous);
      assert.match(element("transcript-scan-status").textContent, /vẫn được giữ lại/);
      assert.equal(scanner.isScanning, false);
      assert.equal(scanner.files.length, 1);
    });
  }
});

test("hủy local rồi quét lượt mới không để kết quả cũ tới muộn ghi đè", async t => {
  const oldReply = deferred();
  let calls = 0, oldSignal;
  const current = payload([row("Toán", { year: 9.2 })], 1);
  const { scanner, state } = fixture(t, { recognize: options => {
    if (++calls === 1) { oldSignal = options.signal; return oldReply.promise; }
    return structuredClone(current);
  } });
  const oldScan = scanner.scan();
  await nextTurn();
  assert.equal(calls, 1);
  scanner.cancel();
  assert.equal(oldSignal.aborted, true);
  await scanner.scan();
  oldReply.resolve(payload([row("Toán", { year: 1 })], 1));
  await oldScan;
  assert.equal(state.previews.length, 1);
  assert.equal(state.preview.data.scores[0].year, 9.2);
  assert.equal(scanner.isScanning, false);
  assert.equal(state.uploads, 0);
});

test("hủy API không để phản hồi tới muộn thay đổi kết quả local", async t => {
  const reply = deferred();
  let signal;
  const { scanner, state, element } = fixture(t, { online: options => { signal = options.signal; return reply.promise; } });
  await scanner.scan();
  const previous = structuredClone(state.preview);
  scanner.offerOnlineScan();
  element("transcript-consent").checked = true;
  const pending = scanner.scanOnline();
  await nextTurn();
  assert.equal(state.uploads, 1);
  scanner.cancel();
  assert.equal(signal.aborted, true);
  reply.resolve(payload([row("Toán", { year: 1 })], 1));
  await pending;
  assert.equal(state.previews.length, 1);
  assert.deepEqual(state.preview, previous);
  assert.equal(scanner.isScanning, false);
});

test("hủy trong bước chuẩn bị ảnh truyền signal và không gửi API khi optimizer trả muộn", async t => {
  const reply = deferred();
  let signal;
  const { scanner, state, element } = fixture(t, { optimize: options => { signal = options.signal; return reply.promise; } });
  await scanner.scan();
  const previous = structuredClone(state.preview);
  scanner.offerOnlineScan();
  element("transcript-consent").checked = true;
  const pending = scanner.scanOnline();
  await nextTurn();
  assert.equal(state.optimized, 1);
  scanner.cancel();
  assert.equal(signal.aborted, true);
  reply.resolve([{ blob: new Blob(["optimized"]), uploadName: "bang-diem.jpg" }]);
  await pending;
  assert.equal(state.uploads, 0);
  assert.deepEqual(state.preview, previous);
  assert.equal(scanner.isScanning, false);
});

test("AI bổ sung giữ điểm người dùng sửa và ô chủ động để trống trong preview", async t => {
  const { scanner, state, element } = fixture(t, { local: payload([row("Toán", { semester1: 8, year: 8.7 })], 2),
    online: async () => payload([row("Toán", { semester1: 8.4, semester2: 0, year: 9.8 })], 3) });
  await scanner.scan();
  state.preview.data.scores[0].semester1 = null;
  state.preview.data.scores[0].year = 9.1;
  state.preview.manualValues = { "Toán|12|semester1": null, "Toán|12|year": 9.1 };
  scanner.offerOnlineScan();
  element("transcript-consent").checked = true;
  await scanner.scanOnline();
  assert.equal(state.preview.data.scores[0].semester1, null);
  assert.equal(state.preview.data.scores[0].semester2, 0);
  assert.equal(state.preview.data.scores[0].year, 9.1);
  assert.equal(state.preview.provenance["Toán|12|semester1"].source, "manual");
  assert.equal(state.preview.provenance["Toán|12|year"].source, "manual");
  assert.deepEqual(state.preview.conflicts, []);
  assert.equal(state.uploads, 1);
});

test("điểm sửa trong lúc đang chờ API được lấy từ bản xem trước mới nhất", async t => {
  const reply = deferred();
  const { scanner, state, element } = fixture(t, { local: payload([row("Toán", { year: 8.7 })], 1),
    online: () => reply.promise });
  await scanner.scan();
  scanner.offerOnlineScan();
  element("transcript-consent").checked = true;
  const pending = scanner.scanOnline();
  await nextTurn();
  assert.equal(state.uploads, 1);
  state.preview = structuredClone(state.preview);
  state.preview.data.scores[0].year = 9.1;
  state.preview.manualValues = { "Toán|12|year": 9.1 };
  reply.resolve(payload([row("Toán", { year: 9.8 })], 1));
  await pending;
  assert.equal(state.preview.data.scores[0].year, 9.1);
  assert.equal(state.preview.provenance["Toán|12|year"].source, "manual");
  assert.deepEqual(state.preview.conflicts, []);
});

test("lớp nhập sai trong lúc chờ API vẫn hiển thị nguyên văn để người dùng sửa", async t => {
  const reply = deferred();
  const { scanner, state, element } = fixture(t, { local: payload([row("Toán", { year: 8.7 })], 1), online: () => reply.promise });
  await scanner.scan();
  scanner.offerOnlineScan();
  element("transcript-consent").checked = true;
  const pending = scanner.scanOnline();
  await nextTurn();
  const edited = row("Toán", { grade: "123", year: 8.7, _editedFields: ["grade"], _originalIdentity: { subject: "Toán", grade: 12 } });
  state.preview = {
    ...state.preview,
    data: { student: { name: null }, scores: [row("Toán", { grade: NaN, year: 8.7 })] },
    manualRows: [structuredClone(edited)],
    manualValues: { "Toán|123|grade": "123" }
  };
  reply.resolve(payload([row("Toán", { year: 9.8 })], 1));
  await pending;
  assert.equal(state.preview.data.scores.length, 1);
  assert.equal(state.preview.data.scores[0].grade, "123");
  assert.equal(state.preview.data.scores[0].year, 8.7);
  assert.deepEqual(state.preview.data.scores[0]._originalIdentity, { subject: "Toán", grade: 12 });
  assert.equal(state.preview.data.scores.some(score => score.grade === 12), false);
});

test("quét lại trên thiết bị cũng giữ ô người dùng đã sửa trong bản xem trước", async t => {
  const { scanner, state } = fixture(t);
  await scanner.scan();
  const math = state.preview.data.scores.find(score => score.subject === "Toán");
  math.year = 9.1;
  state.preview.manualValues = { "Toán|12|year": 9.1 };
  await scanner.scan();
  assert.equal(state.localCalls, 2);
  assert.equal(state.uploads, 0);
  assert.equal(state.preview.data.scores.find(score => score.subject === "Toán").year, 9.1);
  assert.equal(state.preview.provenance["Toán|12|year"].source, "manual");
});

test("quét lại local thiếu dòng đã sửa vẫn giữ dòng và giá trị chưa hợp lệ để đối chiếu", async t => {
  let calls = 0;
  const { scanner, state } = fixture(t, { recognize: () => ++calls === 1
    ? payload([row("Toán", { year: 8.7 })], 1)
    : payload([row("Ngữ văn", { year: 7.7 })], 1) });
  await scanner.scan();
  const edited = row("Toán", { year: "abc", _editedFields: ["year"], _originalIdentity: { subject: "Toán", grade: 12 } });
  state.preview.data.scores[0].year = null;
  state.preview.manualRows = [structuredClone(edited)];
  state.preview.manualValues = { "Toán|12|year": "abc" };
  await scanner.scan();
  assert.equal(state.preview.data.scores.length, 2);
  assert.equal(state.preview.data.scores.find(score => score.subject === "Toán").year, "abc");
  assert.equal(state.preview.data.scores.find(score => score.subject === "Ngữ văn").year, 7.7);
  assert.equal(state.preview.provenance["Toán|12|year"].source, "manual");
  assert.equal(state.uploads, 0);
});

test("hai bộ máy đọc khác nhau giữ ô trống và xung đột để người dùng chọn", async t => {
  const { scanner, state, element } = fixture(t, { local: payload([row("Toán", { year: 8.7 })], 1),
    online: async () => payload([row("Toán", { year: 9.8 })], 1) });
  await scanner.scan();
  scanner.offerOnlineScan();
  element("transcript-consent").checked = true;
  await scanner.scanOnline();
  assert.equal(state.preview.data.scores[0].year, null);
  assert.equal(state.preview.conflicts.length, 1);
  assert.equal(state.preview.conflicts[0].key, "Toán|12|year");
  assert.match(element("transcript-scan-status").textContent, /đọc khác nhau/);
});

test("sửa môn và lớp giữ nhận dạng gốc qua nhiều lượt API để dòng cũ không quay lại", async t => {
  const original = payload([row("Ngoại ngữ", { year: 8.7 })], 1);
  const { scanner, state, element } = fixture(t, { local: original, online: async () => structuredClone(original) });
  const preview = connectPreview(scanner, state);
  await scanner.scan();
  editPreview(preview, "subject", "Tiếng Anh");
  for (const grade of [12, 11, 10]) {
    editPreview(preview, "grade", String(grade));
    scanner.offerOnlineScan();
    element("transcript-consent").checked = true;
    await scanner.scanOnline();
    assert.equal(preview.data.scores.length, 1);
    assert.equal(preview.data.scores[0].subject, "Tiếng Anh");
    assert.equal(Number(preview.data.scores[0].grade), grade);
    assert.equal(preview.data.scores[0].year, 8.7);
    assert.deepEqual(preview.data.scores[0]._originalIdentity, { subject: "Ngoại ngữ", grade: 12 });
    assert.ok(preview.data.scores[0]._editedFields.includes("year"));
  }
  assert.equal(state.uploads, 3);
});

test("sửa nhận dạng A sang B rồi C không để API thêm lại B, nhưng cho phép người dùng chọn lại B", async t => {
  const original = payload([row("Ngoại ngữ", { year: 8.7 })], 1);
  const { scanner, state, element } = fixture(t, { local: original,
    online: async () => payload([row("Tiếng Anh", { year: 9.8 })], 1) });
  const preview = connectPreview(scanner, state);
  await scanner.scan();
  for (const subject of ["Tiếng Anh", "Tiếng Pháp", "Tiếng Anh"]) {
    editPreview(preview, "subject", subject);
    scanner.offerOnlineScan();
    element("transcript-consent").checked = true;
    await scanner.scanOnline();
    assert.equal(preview.data.scores.length, 1);
    assert.equal(preview.data.scores[0].subject, subject);
    assert.equal(preview.data.scores[0].year, 8.7);
    assert.deepEqual(preview.data.scores[0]._originalIdentity, { subject: "Ngoại ngữ", grade: 12 });
    assert.ok(preview.data.scores[0]._previousIdentities.includes("Ngoại ngữ|12"));
    assert.equal(Object.hasOwn(preview.getEditedData().data.scores[0], "_previousIdentities"), false);
  }
  assert.ok(preview.data.scores[0]._previousIdentities.includes("Tiếng Pháp|12"));
  assert.equal(state.uploads, 3);
});

test("chuẩn hóa tên môn không làm mất điểm người dùng sửa khi API trả về", async t => {
  const { scanner, state, element } = fixture(t);
  const preview = connectPreview(scanner, state);
  await scanner.scan();
  const index = preview.data.scores.findIndex(score => score.subject === "Ngữ văn");
  editPreview(preview, "subject", "  Ngữ  văn  ", index);
  editPreview(preview, "semester2", "abc", index);
  scanner.offerOnlineScan();
  element("transcript-consent").checked = true;
  await scanner.scanOnline();
  const literature = preview.data.scores.find(score => score.subject === "Ngữ văn");
  assert.equal(literature.semester2, "abc");
  assert.equal(preview.provenance["Ngữ văn|12|semester2"].source, "manual");
  assert.ok(preview.getEditedData().errors.length);
});

test("xóa dòng khi đang chờ API giữ cả lựa chọn xóa và các dòng sửa khác qua quét lại", async t => {
  const reply = deferred();
  const { scanner, state, element, file } = fixture(t, { online: () => reply.promise });
  const preview = connectPreview(scanner, state);
  await scanner.scan();
  const mathIndex = preview.data.scores.findIndex(score => score.subject === "Toán");
  editPreview(preview, "subject", "Vật lí", mathIndex);
  const literatureIndex = preview.data.scores.findIndex(score => score.subject === "Ngữ văn");
  editPreview(preview, "semester2", "abc", literatureIndex);
  scanner.offerOnlineScan();
  element("transcript-consent").checked = true;
  const pending = scanner.scanOnline();
  await nextTurn();
  preview.removeRow(preview.data.scores.findIndex(score => score.subject === "Vật lí"));
  const remote = complete();
  remote.data.scores.push(row("Vật lí", { year: 9 }));
  reply.resolve(remote);
  await pending;
  assert.equal(preview.data.scores.some(score => ["Toán", "Vật lí"].includes(score.subject)), false);
  assert.equal(preview.data.scores.find(score => score.subject === "Ngữ văn").semester2, "abc");
  assert.deepEqual(new Set(preview.getPayload().removedRowKeys), new Set(["Vật lí|12", "Toán|12"]));
  await scanner.scan();
  assert.equal(preview.data.scores.some(score => score.subject === "Toán"), false);
  assert.equal(preview.data.scores.find(score => score.subject === "Ngữ văn").semester2, "abc");
  scanner.clearFiles();
  assert.deepEqual(preview.removedRowKeys, []);
  scanner.addFiles([file]);
  await scanner.scan();
  assert.ok(preview.data.scores.some(score => score.subject === "Toán"), "lượt ảnh mới không kế thừa lựa chọn xóa của lượt trước");
  assert.deepEqual(preview.removedRowKeys, []);
  assert.equal(state.uploads, 1);
});
