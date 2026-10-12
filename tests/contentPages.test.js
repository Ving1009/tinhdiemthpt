import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { buildContentPages, renderContentPage, renderGuideIndex, renderRobots, renderSitemap, SITE_URL } from "../lib/contentPages.js";
import { CONTENT_SECURITY_POLICY } from "../lib/securityHeaders.js";
import { resolveAppView } from "../public/js/utils.js";
import { APP_ROUTES, parseAppRoute } from "../public/js/core/appRoutes.js";
import { createApp } from "../server/server.js";
import mainWorker from "../worker/index.js";

const pages = buildContentPages();
const articlePaths = [...pages.keys()].filter(path => path.startsWith("/cam-nang/") && path !== "/cam-nang/");
const adsEnabled = { ADSENSE_CLIENT: "ca-pub-5701300811077965", ADSENSE_ENABLED: "true", ADSENSE_CMP_READY: "true" };
let server;
let base;

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n");
}

function editorialContent(html) {
  // Remove only the publisher integration; article text and markup must survive unchanged.
  return normalizeLineEndings(html)
    .replace(/<script nonce="[a-f0-9]{32}" async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-5701300811077965" crossorigin="anonymous" data-privacy-treatments="disablePersonalization"><\/script>\n/, "")
    .replace(/<meta name="google-adsense-account" content="ca-pub-5701300811077965" \/>\n/, "")
    .replace(/ nonce="[a-f0-9]{32}"/g, "");
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "";
}

function canonical(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)].filter(([tag]) => attribute(tag, "rel") === "canonical").map(([tag]) => attribute(tag, "href"));
}

function metadata(html, name, key = "name") {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].filter(([tag]) => attribute(tag, key) === name).map(([tag]) => attribute(tag, "content"));
}

function schemas(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => attribute(attributes, "type") === "application/ld+json")
    .flatMap(([, , json]) => {
      const value = JSON.parse(json);
      return value["@graph"] || (Array.isArray(value) ? value : [value]);
    });
}

before(async () => {
  const app = createApp({
    environment: adsEnabled,
    dataStore: { publicInitialData: { universities: [], combinations: [], subjects: [] } },
    scanTranscript: async () => assert.fail("Static pages must not invoke OCR"),
    admissionsAssistant: async () => assert.fail("Static pages must not invoke the assistant"),
    reportStore: { submit: async () => assert.fail("Static pages must not submit reports") }
  });
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test("generated content is independently readable HTML with unique metadata and valid local assets", async () => {
  assert.equal(pages.size, 13);
  assert.equal(articlePaths.length, 8);
  assert.equal(pages.get("/cam-nang/"), renderGuideIndex());
  const titles = new Set();
  const descriptions = new Set();
  for (const [path, html] of pages) {
    assert.equal(normalizeLineEndings(await readFile(new URL(`../public${path}index.html`, import.meta.url), "utf8")), html, `${path} generated file is stale`);
    assert.match(html, /<!doctype html>/i, path);
    assert.match(html, /<html\b[^>]*lang="vi"/i, path);
    assert.equal([...html.matchAll(/<h1\b/gi)].length, 1, path);
    assert.ok((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "").replace(/<[^>]+>/g, "").trim(), path);
    assert.deepEqual(canonical(html), [`${SITE_URL}${path}`], path);
    assert.deepEqual(metadata(html, "og:url", "property"), [`${SITE_URL}${path}`], path);
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const description = metadata(html, "description");
    assert.ok(title && !titles.has(title), `${path} must have a unique title`);
    assert.equal(description.length, 1, path);
    assert.ok(description[0] && !descriptions.has(description[0]), `${path} must have a unique description`);
    titles.add(title);
    descriptions.add(description[0]);
    assert.doesNotMatch(html, /(?:src|href)=["'][^"']*(?:js\/(?:main|account|assistant)\.js|adsbygoogle|fundingchoicesmessages)/i, path);
    assert.doesNotMatch(html, /<script\b(?![^>]*type=["']application\/ld\+json["'])(?![^>]*src=)[^>]*>/i, `${path} must avoid inline executable scripts`);
    for (const [, target] of html.matchAll(/\b(?:href|src)="([^"#]+)"/g)) {
      if (!target.startsWith("/")) continue;
      const url = new URL(target.replace(/&amp;/g, "&"), SITE_URL);
      if (parseAppRoute(url.pathname) || url.pathname === "/privacy" || url.pathname === "/privacy.html" || pages.has(url.pathname)) continue;
      await access(new URL(`../public${url.pathname}`, import.meta.url));
    }
  }
});

test("the guide index links eight articles whose source and breadcrumb data are present before JavaScript", () => {
  const index = pages.get("/cam-nang/");
  for (const path of articlePaths) {
    assert.ok(index.includes(`href="${path}"`), path);
    const html = pages.get(path);
    assert.ok([...html.matchAll(/<h2\b/gi)].length >= 3, `${path} needs readable sections`);
    const sources = html.match(/<section\b[^>]*id="nguon-tham-khao"[^>]*>([\s\S]*?)<\/section>/i)?.[1] || "";
    assert.match(sources, /<a\b[^>]*href="https:\/\/(?!tinhdiemthpt\.id\.vn)[^"]+"/i, `${path} needs linked sources`);
    assert.match(html, /<aside class="content-notice">[^<]*2027 đang cập nhật/, `${path} must distinguish future admissions from the reference year`);
    assert.match(html, /href="\/cam-nang\/"/, `${path} needs a route back to the index`);
    const data = schemas(html);
    assert.ok(data.some(value => value["@type"] === "Article"), `${path} needs Article data`);
    assert.ok(data.some(value => value["@type"] === "BreadcrumbList"), `${path} needs breadcrumb data`);
    assert.ok(JSON.stringify(data).includes(`${SITE_URL}${path}`), `${path} structured data must identify this article`);
  }
});

test("renderer escapes metadata and JSON-LD without allowing invalid content paths", () => {
  const title = '</script><img src=x onerror="alert(1)">';
  const page = { slug: "kiem-tra", category: "Tính điểm", title, description: '<& "mô tả">', updated: "2026-10-12", sections: [{ id: "vi-du", title: "Ví dụ <&>", html: "<p>Ví dụ biên tập.</p>" }] };
  const html = renderContentPage(page);
  assert.match(html, /<h1>&lt;\/script&gt;&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;<\/h1>/);
  assert.doesNotMatch(html, /<img\b[^>]*onerror=/i);
  assert.equal(schemas(html).find(value => value["@type"] === "Article").headline, title);
  assert.deepEqual(canonical(html), [`${SITE_URL}/cam-nang/kiem-tra/`]);
  assert.throws(() => renderContentPage({ ...page, slug: "../private" }), /Invalid content slug/);
});

test("sitemap and robots expose canonical public documents without app fragments or private APIs", async () => {
  const sitemap = renderSitemap();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
  assert.match(sitemap, /<urlset\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.equal(urls.length, 23);
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(urls.sort(), [...Object.values(APP_ROUTES).map(({ path }) => `${SITE_URL}${path}`), `${SITE_URL}/privacy`, ...[...pages.keys()].map(path => `${SITE_URL}${path}`)].sort());
  for (const value of urls) {
    const url = new URL(value);
    assert.equal(url.origin, SITE_URL);
    assert.equal(url.hash, "");
    assert.equal(url.search, "");
    assert.doesNotMatch(url.pathname, /^\/(?:api|_worker-data|vendor)\//);
  }
  const robots = renderRobots();
  assert.match(robots, /^User-agent:\s*\*\s*$/m);
  assert.match(robots, /^Allow:\s*\/\s*$/m);
  assert.ok(robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
  assert.doesNotMatch(robots, /^Disallow:\s*\/(?:\s*$|cam-nang)/m);
  assert.equal(normalizeLineEndings(await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8")), sitemap);
  assert.equal(normalizeLineEndings(await readFile(new URL("../public/robots.txt", import.meta.url), "utf8")), robots);
});

test("Express serves content and crawler files, keeps aliases and security, and returns genuine missing-page 404s", async () => {
  for (const [path, html] of pages) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    const body = await response.text();
    assert.equal((body.match(/adsbygoogle\.js/g) || []).length, articlePaths.includes(path) ? 1 : 0, path);
    const nonce = body.match(/nonce="([a-f0-9]{32})"/)?.[1];
    assert.ok(nonce && response.headers.get("content-security-policy").includes(`'nonce-${nonce}'`), path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(body, /data-ad-consent hidden/, path);
    assert.equal(editorialContent(body), html, `${path} publisher integration must not alter content`);
  }
  for (const [path, expected, type] of [["/sitemap.xml", renderSitemap(), /xml/], ["/robots.txt", renderRobots(), /text\/plain/]]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), type);
    assert.equal(normalizeLineEndings(await response.text()), expected);
  }
  const articlePath = articlePaths[0];
  const directory = await fetch(`${base}${articlePath.slice(0, -1)}`, { redirect: "manual" });
  assert.ok([301, 307, 308].includes(directory.status));
  assert.equal(new URL(directory.headers.get("location"), base).pathname, articlePath);
  const alias = await fetch(`${base}${articlePath}index.html`);
  assert.equal(alias.status, 200);
  assert.deepEqual(canonical(await alias.text()), [`${SITE_URL}${articlePath}`]);
  for (const path of [articlePath, "/sitemap.xml", "/robots.txt", "/privacy", "/privacy.html"]) {
    const response = await fetch(`${base}${path}`, { method: "HEAD" });
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), "");
  }
  for (const path of ["/privacy", "/privacy.html"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    assert.deepEqual(canonical(await response.text()), [`${SITE_URL}/privacy`]);
  }
  for (const path of ["/cam-nang/khong-ton-tai/", "/assets/khong-ton-tai.css", "/content/admissionsGuides.js", "/lib/contentPages.js"]) {
    assert.equal((await fetch(`${base}${path}`)).status, 404, path);
  }
  const api = await fetch(`${base}/api/bootstrap`);
  assert.equal(api.status, 200);
  assert.equal((await api.json()).success, true);
  const unknownApi = await fetch(`${base}/api/khong-ton-tai`);
  assert.equal(unknownApi.status, 404);
  assert.equal((await unknownApi.json()).error.code, "API_NOT_FOUND");
});

test("Worker delegates static responses with their status intact and preserves API and legacy-host routing", async () => {
  // This tests Worker delegation. Real Cloudflare file resolution needs a Wrangler binding check.
  const requested = [];
  const fixtures = new Map([...pages, ["/sitemap.xml", renderSitemap()], ["/robots.txt", renderRobots()]]);
  const environment = { ...adsEnabled, ASSETS: { async fetch(request) {
    const url = new URL(request.url);
    requested.push(url.pathname + url.search);
    const body = fixtures.get(url.pathname);
    const type = url.pathname.endsWith(".xml") ? "application/xml" : url.pathname.endsWith(".txt") ? "text/plain" : "text/html";
    return new Response(request.method === "HEAD" ? null : body || "Không tìm thấy trang.", { status: body ? 200 : 404, headers: { "Content-Type": type } });
  } } };
  for (const path of ["/cam-nang/", articlePaths[0], "/sitemap.xml", "/robots.txt", "/cam-nang/khong-ton-tai/"]) {
    const response = await mainWorker.fetch(new Request(`${SITE_URL}${path}`), environment);
    assert.equal(response.status, fixtures.has(path) ? 200 : 404, path);
    const body = await response.text();
    if (pages.has(path)) {
      assert.equal((body.match(/adsbygoogle\.js/g) || []).length, articlePaths.includes(path) ? 1 : 0);
      const nonce = body.match(/nonce="([a-f0-9]{32})"/)?.[1];
      assert.ok(nonce && response.headers.get("content-security-policy").includes(`'nonce-${nonce}'`), path);
      assert.equal(editorialContent(body), fixtures.get(path), path);
    } else {
      assert.equal(response.headers.get("content-security-policy"), CONTENT_SECURITY_POLICY);
      assert.doesNotMatch(body, /adsbygoogle\.js|fundingchoicesmessages/);
    }
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  const queryResponse = await mainWorker.fetch(new Request(`${SITE_URL}${articlePaths[0]}?from=test`, { method: "HEAD" }), environment);
  assert.equal(queryResponse.status, 200);
  assert.equal(await queryResponse.text(), "");
  assert.equal(requested.at(-1), `${articlePaths[0]}?from=test`);
  const staticCalls = requested.length;
  const config = await mainWorker.fetch(new Request(`${SITE_URL}/api/auth-config`), environment);
  assert.equal(config.status, 200);
  assert.equal((await config.json()).success, true);
  assert.equal((await mainWorker.fetch(new Request(`${SITE_URL}/_worker-data/majors.json`), environment)).status, 404);
  for (const url of [`http://tinhdiemthpt.id.vn${articlePaths[0]}?from=http`, `https://tinhdiemthpt.tinh-diem-thpt.workers.dev${articlePaths[0]}?from=legacy`]) {
    const response = await mainWorker.fetch(new Request(url), environment);
    assert.equal(response.status, 308);
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, SITE_URL);
    assert.equal(location.pathname, articlePaths[0]);
    assert.equal(location.search, new URL(url).search);
  }
  assert.equal(requested.length, staticCalls, "API, private data and redirects must not fall through to static content");
});

test("old app hash bookmarks retain their tools and homepage links expose the new guide", async () => {
  for (const view of ["home", "calculator", "academic", "admission", "major-finder", "combinations", "universities", "practice-exams", "guide"]) {
    assert.equal(resolveAppView(`#${view}`), view);
    const response = await fetch(`${base}/#${view}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), new RegExp(`id="${view}"`));
  }
  for (const hash of ["#truong/BKA", "#nganh/BKA/7480201"]) assert.equal(resolveAppView(hash), "universities");
  const homepage = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(homepage, /<a\b[^>]*href="\/cam-nang\/"/);
});
