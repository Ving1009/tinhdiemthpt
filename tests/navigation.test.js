import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolveAppView } from "../public/js/utils.js";

test("account and tools share the same storage module and its account write guard", async () => {
  const urls = await Promise.all(["main.js", "account.js", "practiceExam.js"].map(async (name) => {
    const file = new URL(`../public/js/${name}`, import.meta.url);
    const source = await readFile(file, "utf8");
    const specifier = source.match(/import \{[^;\n]*\bstorage\b[^;\n]*\} from "([^"]+)"/)?.[1];
    assert.ok(specifier, `${name} must import shared storage`);
    return new URL(specifier, file).href;
  }));
  assert.equal(new Set(urls).size, 1, "query suffixes must not create separate storage instances");
});

test("discovery is the default and every tool keeps its hash route", () => {
  for (const hash of [undefined, "", "#home", "#unknown", "#privacy-policy"]) assert.equal(resolveAppView(hash), "home");
  for (const view of ["calculator", "academic", "admission", "major-finder", "combinations", "universities", "practice-exams", "guide"]) assert.equal(resolveAppView(`#${view}`), view);
  for (const hash of ["#truong/BKA", "#nganh/BKA/7480201"]) assert.equal(resolveAppView(hash), "universities");
});

test("routing shows one section and selects the correct mobile navigation group", async () => {
  const main = await readFile(new URL("../public/js/main.js", import.meta.url), "utf8");
  const body = main.split("  setView(hash) {")[1].split("  async handleLocationChange()")[0].trim().replace(/}\s*$/, "");
  const sections = ["home", "calculator", "academic", "admission", "major-finder", "combinations", "universities", "practice-exams", "guide"].map((id) => ({ id, hidden: false }));
  const links = [
    { hash: "#home", dataset: {} },
    { hash: "#calculator", dataset: { views: "calculator academic admission" } },
    { hash: "#universities", dataset: { views: "universities major-finder combinations" } },
    { hash: "#practice-exams", dataset: {} }
  ].map((link) => ({ ...link, classList: { toggle(_, active) { link.active = active; } }, setAttribute(_, value) { link.current = value; }, removeAttribute() { delete link.current; }, state: link }));
  const document = { body: { dataset: {} }, querySelectorAll(selector) { return selector === "main > .section" ? sections : links; } };
  const setView = new Function("document", "resolveAppView", "hash", body);
  for (const [hash, section, activeIndex] of [["", "home", 0], ["#academic", "academic", 1], ["#admission", "admission", 1], ["#major-finder", "major-finder", 2], ["#truong/BKA", "universities", 2], ["#practice-exams", "practice-exams", 3], ["#guide", "guide", -1]]) {
    setView(document, resolveAppView, hash);
    assert.deepEqual(sections.filter((item) => !item.hidden).map((item) => item.id), [section]);
    assert.equal(document.body.dataset.view, section);
    assert.deepEqual(links.map((item) => item.state.active), links.map((_, index) => index === activeIndex));
  }
});
