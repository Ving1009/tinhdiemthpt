import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { APP_ROUTES, appPageMetadata, parseAppRoute, profilePath } from "../public/js/core/appRoutes.js";
import { createApp } from "../server/server.js";
import { createDataStore, createMajorSearchIndex } from "../server/dataStoreCore.js";
import { appRouteProfile, renderAppPage } from "../lib/appPages.js";
import mainWorker from "../worker/index.js";
import { escapeHTML } from "../public/js/utils.js";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const universities = [{ id: "school-a", name: "Trường A", code: "A" }, { id: "school-b", name: "Trường B", code: "B" }];
const majors = [{ id: "major-a", name: "Ngành A", universityId: "school-a" }];
const admissionFormulas = { schemaVersion: 1, year: 2026, verifiedAt: null, schools: [] };
const store = createDataStore({ universities, majors, combinations: [], subjects: [], admissionFormulas });
const config = { ADSENSE_CLIENT: "ca-pub-5701300811077965", ADSENSE_ENABLED: "true", ADSENSE_CMP_READY: "true" };
const privateData = { universities, majors, combinations: [], subjects: [], "admission-formulas-2026": admissionFormulas, "major-search-index": createMajorSearchIndex(majors, []) };
const requested = [];
const environment = { ...config, ASSETS: { async fetch(request) {
  const path = new URL(request.url).pathname;
  requested.push(path);
  if (path === "/") return new Response(request.method === "HEAD" ? null : html, { headers: { "Content-Type": "text/html" } });
  const name = path.match(/^\/_worker-data\/(.+)\.json$/)?.[1];
  if (Object.hasOwn(privateData, name || "")) return Response.json(privateData[name]);
  return new Response("Not found", { status: 404 });
} } };
let server, base;
before(async () => {
  server = createApp({ dataStore: store, environment: config, scanTranscript: async () => assert.fail("no OCR"), admissionsAssistant: async () => assert.fail("no AI") }).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });

function checkPage(body, route, profile) {
  const metadata = appPageMetadata(route, profile);
  assert.ok(body.includes(`<title>${metadata.title}</title>`));
  assert.ok(body.includes(`rel="canonical" href="${metadata.url}"`));
  assert.ok(body.includes(`property="og:url" content="${metadata.url}"`));
  const selected = [...body.matchAll(/<section\b[^>]*\bid="([^"]+)"[^>]*>/g)].filter(([tag, id]) => Object.hasOwn(APP_ROUTES, id) && !/\shidden(?:\s|>)/.test(tag)).map(([, id]) => id);
  assert.deepEqual(selected, [route.view]);
  assert.match(body, /href="\/css\/style\.css/);
  assert.match(body, /src="\/js\/main\.js/);
  assert.doesNotMatch(body, /href="\/?#(?:home|calculator|academic|admission|combinations|universities|major-finder|practice-exams|guide)"/);
}

test("every tool is directly readable at a real canonical URL in Express and Worker, including HEAD", async () => {
  for (const { path } of Object.values(APP_ROUTES)) {
    const route = parseAppRoute(path);
    checkPage(renderAppPage(html, route), route);
    for (const method of ["GET", "HEAD"]) {
      const responses = await Promise.all([fetch(base + path, { method }), mainWorker.fetch(new Request(`https://tinhdiemthpt.id.vn${path}`, { method }), environment)]);
      for (const response of responses) {
        assert.equal(response.status, 200, `${method} ${path}`);
        const body = await response.text();
        if (method === "HEAD") assert.equal(body, "");
        else {
          checkPage(body, route);
          assert.equal((body.match(/adsbygoogle\.js/g) || []).length, 0);
        }
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
    }
  }
  assert.ok(requested.every(path => path === "/" || path.startsWith("/_worker-data/")));
});

test("tool aliases redirect to canonical paths and preserve query parameters", async () => {
  for (const { path } of Object.values(APP_ROUTES).filter(route => route.path !== "/")) {
    for (const alias of [path.slice(0, -1), `${path}index.html`]) {
      for (const response of [await fetch(`${base}${alias}?from=test`, { redirect: "manual" }), await mainWorker.fetch(new Request(`https://tinhdiemthpt.id.vn${alias}?from=test`), environment)]) {
        assert.equal(response.status, 308);
        const location = new URL(response.headers.get("location"), base);
        assert.equal(location.pathname, path);
        assert.equal(location.search, "?from=test");
      }
    }
  }
});

test("school and major URLs reopen their actual profile; nonexistent or mismatched profiles return 404", async () => {
  for (const path of [profilePath("school-a"), profilePath("school-a", "major-a")]) {
    const route = parseAppRoute(path), profile = appRouteProfile(store, route);
    for (const method of ["GET", "HEAD"]) {
      for (const response of [await fetch(base + path, { method }), await mainWorker.fetch(new Request(`https://tinhdiemthpt.id.vn${path}`, { method }), environment)]) {
        assert.equal(response.status, 200);
        const body = await response.text();
        if (method === "GET") checkPage(body, route, profile);
        else assert.equal(body, "");
      }
    }
  }
  for (const path of ["/truong/unknown/", "/nganh/school-a/unknown/", "/nganh/school-b/major-a/", "/tim-nganh/unknown/", "/truong/%ZZ/", "/.env", "/_worker-data/universities.json"]) {
    for (const response of [await fetch(base + path), await mainWorker.fetch(new Request(`https://tinhdiemthpt.id.vn${path}`), environment)]) {
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(await response.text(), /adsbygoogle\.js/);
    }
  }
});

test("profile names are escaped in server-rendered metadata", () => {
  const route = parseAppRoute("/truong/school-a/");
  const page = renderAppPage(html, route, { university: { name: '<script>alert("x")</script>' } });
  assert.doesNotMatch(page, /<script>alert/);
  assert.match(page, /&lt;script&gt;/);
});

test("Wrangler routes every tool and profile through the Worker before looking for static files", async () => {
  const { assets } = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  for (const { path } of Object.values(APP_ROUTES).filter(route => route.path !== "/")) {
    assert.ok(assets.run_worker_first.includes(path.slice(0, -1)));
    assert.ok(assets.run_worker_first.includes(`${path}*`));
  }
  for (const path of ["/truong/*", "/nganh/*"]) assert.ok(assets.run_worker_first.includes(path));
});

test("logo rendering resolves the same asset from root, tools and deeply nested profiles", async () => {
  const main = await readFile(new URL("../public/js/main.js", import.meta.url), "utf8");
  const body = main.split("  logoMarkup(university) {")[1].split("  universityCard(")[0].trim().replace(/}\s*$/, "");
  const render = new Function("university", "escapeHTML", body);
  const university = { name: "Trường A", logo: "assets/logos/school-a.png", code: "A" };
  const markup = render(university, escapeHTML);
  const src = markup.match(/src="([^"]+)"/)[1];
  for (const path of ["/", "/ho-so-truong/", "/truong/school-a/", "/nganh/school-a/major-a/"]) assert.equal(new URL(src, `https://tinhdiemthpt.id.vn${path}`).pathname, "/assets/logos/school-a.png");
  assert.equal(university.logo, "assets/logos/school-a.png", "stored admissions data stays unchanged");
  assert.match(render({ ...university, logo: "/assets/logos/school-a.png" }, escapeHTML), /src="\/assets\/logos\/school-a.png"/);
  assert.match(render({ ...university, logo: "./assets/logos/school-a.png" }, escapeHTML), /src="\/assets\/logos\/school-a.png"/);
  const schools = JSON.parse(await readFile(new URL("../data/universities.json", import.meta.url), "utf8"));
  for (const school of schools.filter(item => item.logoStatus !== "updating")) {
    assert.match(render(school, escapeHTML), /src="\/assets\/logos\//, school.id);
  }
  assert.match(render({ ...university, logoStatus: "updating" }, escapeHTML), /logo-fallback/);
});
