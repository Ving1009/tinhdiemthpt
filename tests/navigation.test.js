import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolveAppView } from "../public/js/utils.js";
import { APP_ROUTES, parseAppRoute, routeFromLocation, updateAppMetadata } from "../public/js/core/appRoutes.js";

test("thứ tự và số mục 01–08 khớp điều hướng chính", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const sections = [...html.matchAll(/<section class="section [^"]+" id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
  const expected = ["calculator", "academic", "admission", "combinations", "universities", "major-finder", "practice-exams", "guide"];
  assert.deepEqual(sections.map((match) => match[1]), expected);
  assert.deepEqual(sections.map((match) => match[2].match(/class="eyebrow">(\d{2}) ·/)?.[1]), ["01", "02", "03", "04", "05", "06", "07", "08"]);
  const nav = html.split('id="site-nav"')[1].split('</nav>')[0];
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map((match) => parseAppRoute(match[1])?.view).filter((id) => id !== "home"), expected);
});

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

test("discovery is the default; tools have real paths and retain legacy bookmarks", () => {
  for (const hash of [undefined, "", "#home", "#unknown", "#privacy-policy"]) assert.equal(resolveAppView(hash), "home");
  for (const view of ["calculator", "academic", "admission", "major-finder", "combinations", "universities", "practice-exams", "guide"]) assert.equal(resolveAppView(`#${view}`), view);
  for (const hash of ["#truong/BKA", "#nganh/BKA/7480201"]) assert.equal(resolveAppView(hash), "universities");
  for (const [view, { path }] of Object.entries(APP_ROUTES)) {
    assert.equal(resolveAppView(path), view);
    assert.equal(parseAppRoute(`${path}index.html`).path, path);
    assert.equal(routeFromLocation({ pathname: "/", hash: `#${view}` }).path, path);
    assert.equal(routeFromLocation({ pathname: path, hash: "#main-content" }).view, view);
  }
  assert.equal(parseAppRoute("#nganh/BKA/7480201").path, "/nganh/BKA/7480201/");
  for (const path of ["/api/bootstrap", "/cam-nang/", "/tim-nganh/extra/", "/truong/x/y/", "/nganh/x/", "/truong/%2F/", "/truong/%zz/", "/truong/../", "#toString", "#__proto__"]) assert.equal(parseAppRoute(path), null, path);
});

test("routing shows one section and selects the correct mobile navigation group", async () => {
  const main = await readFile(new URL("../public/js/main.js", import.meta.url), "utf8");
  const body = main.split("  setView(hash) {")[1].split("  normalizeAppLocation()")[0].trim().replace(/}\s*$/, "");
  const sections = ["home", "calculator", "academic", "admission", "major-finder", "combinations", "universities", "practice-exams", "guide"].map((id) => ({ id, hidden: false }));
  const links = [
    { hash: "#home", dataset: {} },
    { hash: "#calculator", dataset: { views: "calculator academic admission" } },
    { hash: "#universities", dataset: { views: "universities major-finder combinations" } },
    { hash: "#practice-exams", dataset: {} }
  ].map((link) => ({ ...link, pathname: parseAppRoute(link.hash).path, classList: { toggle(_, active) { link.active = active; } }, setAttribute(_, value) { link.current = value; }, removeAttribute() { delete link.current; }, state: link }));
  const document = { body: { dataset: {} }, querySelector() { return null; }, querySelectorAll(selector) { return selector === "main > .section" ? sections : links; } };
  const setView = new Function("document", "resolveAppView", "parseAppRoute", "updateAppMetadata", "hash", body);
  for (const [hash, section, activeIndex] of [["", "home", 0], ["#academic", "academic", 1], ["#admission", "admission", 1], ["#major-finder", "major-finder", 2], ["#truong/BKA", "universities", 2], ["#practice-exams", "practice-exams", 3], ["#guide", "guide", -1]]) {
    setView(document, resolveAppView, parseAppRoute, updateAppMetadata, hash);
    assert.deepEqual(sections.filter((item) => !item.hidden).map((item) => item.id), [section]);
    assert.equal(document.body.dataset.view, section);
    assert.deepEqual(links.map((item) => item.state.active), links.map((_, index) => index === activeIndex));
    const path = parseAppRoute(hash || "/").path;
    setView(document, resolveAppView, parseAppRoute, updateAppMetadata, path);
    assert.deepEqual(sections.filter((item) => !item.hidden).map((item) => item.id), [section]);
  }
});
