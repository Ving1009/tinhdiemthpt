import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { UniversityRepository } from "../public/js/university.js";
import { escapeHTML } from "../public/js/utils.js";

const abortable = (signal) => new Promise((_, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});

test("tìm ngành hết thời gian chờ thì hủy request và có thể thử lại", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let networkSignal;
  const fetch = t.mock.method(globalThis, "fetch", (_, { signal }) => {
    networkSignal = signal;
    return abortable(signal);
  });
  const repository = new UniversityRepository();
  const failed = assert.rejects(repository.listMajors({ q: "điện điện tử" }), /mất quá nhiều thời gian/);
  t.mock.timers.tick(12000);
  await failed;
  assert.equal(networkSignal.aborted, true);
  fetch.mock.mockImplementation(async () => Response.json({ success: true, data: { items: [], pagination: { total: 0 } } }));
  assert.equal((await repository.listMajors({ q: "y khoa" })).pagination.total, 0);
});

test("thời gian chờ tìm ngành bao gồm cả đọc nội dung phản hồi", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let entered;
  const reading = new Promise((resolve) => { entered = resolve; });
  t.mock.method(globalThis, "fetch", async (_, { signal }) => ({ ok: true, json() { entered(); return abortable(signal); } }));
  const failed = assert.rejects(new UniversityRepository().listMajors({ q: "kế toán" }), /mất quá nhiều thời gian/);
  await reading;
  t.mock.timers.tick(12000);
  await failed;
});

test("đổi bộ lọc vẫn hủy tìm ngành bằng AbortError thay vì báo timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(globalThis, "fetch", (_, { signal }) => abortable(signal));
  const controller = new AbortController();
  const failed = assert.rejects(new UniversityRepository().listMajors({ q: "luật" }, { signal: controller.signal }), { name: "AbortError" });
  controller.abort();
  await failed;
  t.mock.timers.tick(12000);
});

async function searchFixture() {
  const source = await readFile(new URL("../public/js/main.js", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("  async loadMajorResults() {"), source.indexOf("  renderMajorResults("));
  const nodes = new Map(["#major-result-summary", "#major-result-grid"].map((id) => [id, { textContent: "", innerHTML: "" }]));
  const Fixture = vm.runInNewContext(`(class { ${body} })`, { $: (id) => nodes.get(id), escapeHTML, AbortController });
  const app = new Fixture();
  app.majorRequestVersion = 0;
  app.validateMajorFilterContext = () => ({ valid: true, query: {} });
  app.renderMajorResults = () => { nodes.get("#major-result-summary").textContent = "Kết quả mới"; };
  return { app, nodes };
}

test("tìm ngành timeout bỏ spinner và hiện lỗi ngay trong bảng kết quả", async () => {
  const { app, nodes } = await searchFixture();
  app.repository = { async listMajors() { throw new Error("Kết nối dữ liệu mất quá nhiều thời gian. Bạn hãy thử lại."); } };
  await app.loadMajorResults();
  assert.match(nodes.get("#major-result-summary").textContent, /mất quá nhiều thời gian/);
  assert.match(nodes.get("#major-result-grid").innerHTML, /mất quá nhiều thời gian/);
  assert.doesNotMatch(nodes.get("#major-result-grid").innerHTML, /loading-spinner/);
});

test("lỗi của request tìm ngành cũ không ghi đè kết quả của request mới", async () => {
  const { app, nodes } = await searchFixture();
  let failOld;
  app.repository = { listMajors() { return new Promise((_, reject) => { failOld = reject; }); } };
  const old = app.loadMajorResults();
  app.repository.listMajors = async () => ({ items: [], pagination: { page: 1 } });
  await app.loadMajorResults();
  failOld(new Error("Lỗi cũ"));
  await old;
  assert.equal(nodes.get("#major-result-summary").textContent, "Kết quả mới");
});
