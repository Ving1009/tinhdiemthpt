import assert from 'node:assert/strict';
import test from 'node:test';
import { ADSENSE_PAGE_PATHS, adsenseAdsTxt, adsenseClient, isAdSenseContentPage, nonceHtmlScripts, prepareAdSenseHtml } from '../lib/adsense.js';
import { admissionsGuides } from '../content/admissionsGuides.js';
import { buildContentPages } from '../lib/contentPages.js';
import { APP_ROUTES, parseAppRoute } from '../public/js/core/appRoutes.js';
import { CONTENT_SECURITY_POLICY, securityHeaders } from '../lib/securityHeaders.js';
import mainWorker from '../worker/index.js';
import { createApp } from '../server/server.js';

const client = 'ca-pub-5701300811077965';
const enabled = { ADSENSE_CLIENT: client, ADSENSE_ENABLED: 'true', ADSENSE_CMP_READY: 'false' };
const html = '<!doctype html><html><head><title>THPT</title></head><body><script type="module" src="js/main.js"></script></body></html>';
const record = 'google.com, pub-5701300811077965, DIRECT, f08c47fec0942fa0\n';
const articlePath = `/cam-nang/${admissionsGuides[0].slug}/`;

test('AdSense chỉ nhận publisher đúng định dạng; cấu hình thiếu/sai không tải quảng cáo', () => {
  for (const value of ['', 'pub-5701300811077965', 'ca-pub-123', `${client}" onload="alert(1)`, `${client}\n<script>`]) {
    const environment = { ...enabled, ADSENSE_CLIENT: value, ADSENSE_CMP_READY: 'true' };
    assert.equal(adsenseClient(environment), '');
    assert.equal(adsenseAdsTxt(environment), '');
    assert.deepEqual(prepareAdSenseHtml(html, environment, 'VN'), { html, nonce: '', adsEnabled: false });
  }
  assert.equal(adsenseClient({ ADSENSE_CLIENT: ` ${client} ` }), client);
  assert.equal(adsenseAdsTxt(enabled), record);
});

test('chưa có CMP: EEA, Anh, Thụy Sĩ và vị trí không rõ chỉ nhận meta xác minh', () => {
  for (const country of ['FR', 'DE', 'GB', 'CH', 'NO', 'IS', 'LI', 'AX', '', 'XX', 'invalid']) {
    const prepared = prepareAdSenseHtml(html, enabled, country, articlePath);
    assert.equal(prepared.adsEnabled, false, country);
    assert.equal(prepared.nonce, '');
    assert.match(prepared.html, /google-adsense-account/);
    assert.doesNotMatch(prepared.html, /adsbygoogle\.js/);
    assert.equal(securityHeaders({ adsenseNonce: prepared.nonce })['Content-Security-Policy'], CONTENT_SECURITY_POLICY);
  }
  assert.equal(prepareAdSenseHtml(html, { ...enabled, ADSENSE_ENABLED: 'false', ADSENSE_CMP_READY: 'true' }, 'VN', articlePath).adsEnabled, false);
  assert.equal(prepareAdSenseHtml(html, { ...enabled, ADSENSE_CMP_READY: 'true' }, 'GB', articlePath).adsEnabled, true);
});

test('quảng cáo dùng nonce mới cho từng HTML, khớp mọi script và strict CSP', () => {
  const first = prepareAdSenseHtml(html, enabled, 'VN', articlePath);
  const next = prepareAdSenseHtml(html, enabled, 'VN', articlePath);
  assert.equal(first.adsEnabled, true);
  assert.match(first.nonce, /^[a-f0-9]{32}$/);
  assert.notEqual(first.nonce, next.nonce);
  const scripts = first.html.match(/<script\b[^>]*>/g);
  assert.equal(scripts.length, 2);
  for (const script of scripts) assert.ok(script.includes(`nonce="${first.nonce}"`));
  assert.match(first.html, /async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-5701300811077965" crossorigin="anonymous"/);
  const csp = securityHeaders({ isHttps: true, adsenseNonce: first.nonce })['Content-Security-Policy'];
  const scriptPolicy = csp.split('; ').find(value => value.startsWith('script-src '));
  assert.ok(scriptPolicy.includes(`'nonce-${first.nonce}'`));
  assert.match(scriptPolicy, /strict-dynamic/);
  assert.doesNotMatch(scriptPolicy, /unsafe-inline/);
  assert.match(csp, /object-src 'none'; frame-ancestors 'none'/);
  assert.equal(securityHeaders({ adsenseNonce: first.nonce })['Referrer-Policy'], 'strict-origin');
  assert.equal(securityHeaders()['Referrer-Policy'], 'no-referrer');
  assert.equal(securityHeaders({ adsenseNonce: "'unsafe-inline'" })['Content-Security-Policy'], CONTENT_SECURITY_POLICY);
  assert.equal(securityHeaders({ pathname: '/vendor/tesseract/worker.min.js', adsenseNonce: first.nonce })['Content-Security-Policy'].includes('strict-dynamic'), false);
});

test('nonce HTML riêng hỗ trợ Cloudflare mà không mở quyền CSP dành cho quảng cáo', () => {
  const source = '<html><script nonce="old" src="/js/main.js"></script><script nonce=stale>void 0;</script></html>';
  const first = nonceHtmlScripts(source);
  const next = nonceHtmlScripts(source);
  assert.match(first.nonce, /^[a-f0-9]{32}$/);
  assert.notEqual(first.nonce, next.nonce);
  for (const script of first.html.match(/<script\b[^>]*>/g)) {
    assert.equal((script.match(/\bnonce=/g) || []).length, 1);
    assert.ok(script.includes(`nonce="${first.nonce}"`));
  }
  const headers = securityHeaders({ isHttps: true, scriptNonce: first.nonce });
  assert.equal(headers['Content-Security-Policy'], CONTENT_SECURITY_POLICY.replace("script-src 'self'", `script-src 'self' 'nonce-${first.nonce}'`));
  assert.doesNotMatch(headers['Content-Security-Policy'], /strict-dynamic|unsafe-eval|unsafe-inline/);
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  for (const invalid of ['', "'unsafe-inline'", 'f'.repeat(31), 'f'.repeat(33)]) {
    assert.equal(securityHeaders({ scriptNonce: invalid })['Content-Security-Policy'], CONTENT_SECURITY_POLICY);
  }
  assert.equal(securityHeaders({ pathname: '/vendor/tesseract/worker.min.js', scriptNonce: first.nonce })['Content-Security-Policy'].includes('nonce-'), false);
});

test('AdSense yêu cầu không cá nhân hóa ở mọi vùng được phép, không cần thu thập tuổi', () => {
  for (const country of ['VN', 'US', 'GB', 'FR', '']) {
    const prepared = prepareAdSenseHtml(html, { ...enabled, ADSENSE_CMP_READY: 'true' }, country, articlePath);
    const loader = prepared.html.match(/<script\b[^>]*src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^>]*>/)?.[0];
    assert.equal(prepared.adsEnabled, true, country);
    assert.ok(loader, country);
    assert.match(loader, /data-privacy-treatments="disablePersonalization"/);
    assert.ok(loader.includes(`nonce="${prepared.nonce}"`));
  }
});

test('Worker phục vụ ads.txt đúng publisher cho GET/HEAD, không trả HTML thay cho cấu hình thiếu', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await mainWorker.fetch(new Request('https://tinhdiemthpt.id.vn/ads.txt', { method }), {
      ...enabled, ASSETS: { fetch() { assert.fail('ads.txt phải đi qua Worker'); } }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/plain/);
    assert.equal(await response.text(), method === 'HEAD' ? '' : record);
  }
  const missing = await mainWorker.fetch(new Request('https://tinhdiemthpt.id.vn/ads.txt'), {});
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), '');
});

test('mọi trang HTML công khai và alias có thể tải AdSense; API, tài sản và đường dẫn lạ không tải', () => {
  const paths = ['/', '/index.html', '/privacy', '/privacy.html', ...[...Object.values(APP_ROUTES).map(route => route.path).filter(path => path !== '/'), ...buildContentPages().keys()].flatMap(path => [path, `${path}index.html`])];
  assert.deepEqual([...ADSENSE_PAGE_PATHS].sort(), paths.sort());
  for (const path of paths) {
    assert.equal(isAdSenseContentPage(path), true, path);
    const prepared = prepareAdSenseHtml(html, { ...enabled, ADSENSE_CMP_READY: 'true' }, 'VN', path);
    assert.equal(prepared.adsEnabled, true, path);
    assert.equal((prepared.html.match(/adsbygoogle\.js/g) || []).length, 1, path);
    assert.equal((prepared.html.match(/name="google-adsense-account"/g) || []).length, 1, path);
  }
  for (const path of ['', '/cam-nang/khong-ton-tai/', articlePath.slice(0, -1), '/api/auth/me', '/assets/practice-2026/math/pages/1.webp', '/js/content.js', '/vendor/tesseract/worker.min.js', '/_worker-data/majors.json', '/robots.txt', '/sitemap.xml', '/.env', '/gioi-thieu/../../.env']) {
    const prepared = prepareAdSenseHtml(html, { ...enabled, ADSENSE_CMP_READY: 'true' }, 'VN', path);
    assert.equal(isAdSenseContentPage(path), false, path);
    assert.equal(prepared.adsEnabled, false, path);
    assert.equal(prepared.nonce, '', path);
    assert.match(prepared.html, /google-adsense-account/, path);
    assert.doesNotMatch(prepared.html, /adsbygoogle\.js|data-privacy-treatments/, path);
  }
});

test('Worker dùng geography tin cậy cho bài gốc, nonce/header nhất quán và không chia sẻ cache HTML', async () => {
  const environment = { ...enabled, ASSETS: { fetch: async () => new Response(html, {
    headers: { 'Content-Type': 'text/html', ETag: 'old', 'Content-Length': '999', 'Last-Modified': 'old' }
  }) } };
  for (const method of ['GET', 'HEAD']) {
    const request = new Request(`https://tinhdiemthpt.id.vn${articlePath}`, { method });
    Object.defineProperty(request, 'cf', { value: { country: 'VN' } });
    const response = await mainWorker.fetch(request, environment);
    const body = await response.text();
    if (method === 'HEAD') assert.equal(body, '');
    else assert.match(body, /data-privacy-treatments="disablePersonalization"/);
    const nonce = response.headers.get('content-security-policy').match(/'nonce-([a-f0-9]{32})'/)[1];
    assert.ok(response.headers.get('content-security-policy').includes(`'nonce-${nonce}'`));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('content-length'), null);
  }
  const unknown = await mainWorker.fetch(new Request(`https://tinhdiemthpt.id.vn${articlePath}`, { headers: { 'CF-IPCountry': 'VN' } }), environment);
  assert.doesNotMatch(await unknown.text(), /adsbygoogle\.js/);
  assert.equal(unknown.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
  const api = await mainWorker.fetch(new Request('https://tinhdiemthpt.id.vn/api/auth-config'), environment);
  assert.equal(api.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
});

test('Worker tải đúng một mã quảng cáo cho toàn bộ trang và công cụ hash, giữ nguyên lỗi/redirect/tài sản', async () => {
  const environment = { ...enabled, ADSENSE_CMP_READY: 'true', ASSETS: { fetch: async request => {
    return new Response(request.method === 'HEAD' ? null : html, { headers: { 'Content-Type': 'text/html' } });
  } } };
  for (const path of [...ADSENSE_PAGE_PATHS, '/#calculator', '/#academic', '/#practice-exams', '/#major-finder', '/#universities', '/?from=test#guide']) {
    for (const method of ['GET', 'HEAD']) {
      let response = await mainWorker.fetch(new Request(`https://tinhdiemthpt.id.vn${path}`, { method }), environment);
      const route = parseAppRoute(new URL(path, 'https://tinhdiemthpt.id.vn').pathname);
      if (route && new URL(path, 'https://tinhdiemthpt.id.vn').pathname !== route.path && path !== '/index.html') {
        assert.equal(response.status, 308);
        assert.doesNotMatch(await response.text(), /adsbygoogle\.js/);
        response = await mainWorker.fetch(new Request(response.headers.get('location'), { method }), environment);
      }
      assert.equal(response.status, 200, path);
      const body = await response.text();
      const csp = response.headers.get('content-security-policy');
      const nonce = csp.match(/'nonce-([a-f0-9]{32})'/)?.[1];
      assert.ok(nonce, path);
      assert.match(csp, /strict-dynamic/, path);
      assert.equal(response.headers.get('cache-control'), 'no-store', path);
      assert.equal(response.headers.get('referrer-policy'), 'strict-origin', path);
      if (method === 'HEAD') assert.equal(body, '', path);
      else {
        assert.equal((body.match(/adsbygoogle\.js/g) || []).length, 1, path);
        assert.match(body, /data-privacy-treatments="disablePersonalization"/, path);
        for (const script of body.match(/<script\b[^>]*>/g)) assert.ok(script.includes(`nonce="${nonce}"`), path);
      }
    }
  }
  for (const path of ['/assets/practice-2026/math/pages/1.webp', '/cam-nang/khong-ton-tai/']) {
    const response = await mainWorker.fetch(new Request(`https://tinhdiemthpt.id.vn${path}`), environment);
    assert.equal(await response.text(), html, 'non-page assets must not be transformed even if their content-type is wrong');
    assert.equal(response.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
  }
  for (const status of [404, 500]) {
    environment.ASSETS.fetch = async () => new Response(html, { status, headers: { 'Content-Type': 'text/html' } });
    const response = await mainWorker.fetch(new Request(`https://tinhdiemthpt.id.vn${articlePath}`), environment);
    assert.equal(response.status, status);
    assert.equal(await response.text(), html);
    assert.equal(response.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
  }
  environment.ASSETS.fetch = async () => new Response(html, { status: 307, headers: { Location: articlePath } });
  const redirect = await mainWorker.fetch(new Request(`https://tinhdiemthpt.id.vn${articlePath}`, { method: 'HEAD' }), environment);
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get('location'), articlePath);
  assert.equal(await redirect.text(), '');
  assert.equal(redirect.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
});

test('Worker tạo nonce mới cho root/index GET/HEAD ngay cả khi chưa cấu hình AdSense', async () => {
  const nonces = new Set();
  const environment = { ASSETS: { fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html', ETag: 'stale', 'Content-Length': '999' } }) } };
  for (const path of ['/', '/index.html']) {
    for (const method of ['GET', 'GET', 'HEAD']) {
      const response = await mainWorker.fetch(new Request(`https://tinhdiemthpt.id.vn${path}`, { method }), environment);
      const csp = response.headers.get('content-security-policy');
      const nonce = csp.match(/'nonce-([a-f0-9]{32})'/)?.[1];
      assert.ok(nonce);
      assert.equal(nonces.has(nonce), false);
      nonces.add(nonce);
      assert.doesNotMatch(csp, /strict-dynamic|unsafe-eval|unsafe-inline/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('etag'), null);
      assert.equal(response.headers.get('content-length'), null);
      const body = await response.text();
      assert.doesNotMatch(body, /adsbygoogle\.js|google-adsense-account/);
      if (method === 'HEAD') assert.equal(body, '');
      else assert.ok(body.includes(`nonce="${nonce}"`));
    }
  }
});

test('Express phục vụ cùng ads.txt và HTML; API giữ CSP cũ và cấu hình CMP không bị giả qua header', async t => {
  const app = createApp({ environment: enabled });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ads = await fetch(base + '/ads.txt');
  assert.equal(await ads.text(), record);
  const page = await fetch(base + '/', { headers: { 'CF-IPCountry': 'VN' } });
  const body = await page.text();
  assert.match(body, /google-adsense-account/);
  assert.doesNotMatch(body, /adsbygoogle\.js/);
  const nonce = page.headers.get('content-security-policy').match(/'nonce-([a-f0-9]{32})'/)?.[1];
  assert.ok(nonce);
  assert.ok(body.includes(`nonce="${nonce}"`));
  assert.equal(page.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`));
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const api = await fetch(base + '/api/bootstrap');
  assert.equal(api.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
  assert.equal((await api.json()).success, true);
});

test('Express tải AdSense ở mọi HTML và alias; giữ đồng ý, nonce mới, HEAD và redirect đúng', async t => {
  const server = createApp({ environment: { ...enabled, ADSENSE_CMP_READY: 'true' } }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base + '/');
  const homeHtml = await home.text();
  assert.match(homeHtml, /google-adsense-account/);
  assert.equal((homeHtml.match(/adsbygoogle\.js/g) || []).length, 1);
  assert.equal(home.headers.get('referrer-policy'), 'strict-origin');
  assert.equal(home.headers.get('cache-control'), 'no-store');
  const rootNonce = home.headers.get('content-security-policy').match(/'nonce-([a-f0-9]{32})'/)?.[1];
  assert.ok(rootNonce);
  assert.match(home.headers.get('content-security-policy'), /strict-dynamic/);
  for (const script of homeHtml.match(/<script\b[^>]*>/g)) assert.ok(script.includes(`nonce="${rootNonce}"`));
  const rootHead = await fetch(base + '/index.html', { method: 'HEAD' });
  assert.equal(rootHead.status, 200);
  assert.equal(await rootHead.text(), '');
  const nextRootNonce = rootHead.headers.get('content-security-policy').match(/'nonce-([a-f0-9]{32})'/)?.[1];
  assert.ok(nextRootNonce);
  assert.notEqual(nextRootNonce, rootNonce);
  assert.equal(rootHead.headers.get('referrer-policy'), 'strict-origin');
  assert.equal(rootHead.headers.get('cache-control'), 'no-store');
  const article = await fetch(base + articlePath);
  const articleHtml = await article.text();
  assert.match(articleHtml, /adsbygoogle\.js/);
  assert.match(articleHtml, /data-privacy-treatments="disablePersonalization"/);
  assert.equal(article.headers.get('referrer-policy'), 'strict-origin');
  assert.equal(article.headers.get('cache-control'), 'no-store');
  const head = await fetch(base + articlePath, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.match(head.headers.get('content-security-policy'), /'nonce-[a-f0-9]{32}'/);
  assert.equal(head.headers.get('cache-control'), 'no-store');
  const alias = await fetch(base + articlePath.slice(0, -1), { redirect: 'manual' });
  assert.equal(alias.status, 301);
  assert.doesNotMatch(await alias.text(), /adsbygoogle\.js/);
  for (const path of ADSENSE_PAGE_PATHS) {
    const page = await fetch(base + path);
    assert.equal(page.status, 200, path);
    const body = await page.text();
    assert.equal((body.match(/adsbygoogle\.js/g) || []).length, 1, path);
    assert.match(body, /data-ad-consent hidden/, path);
    const nonce = page.headers.get('content-security-policy').match(/'nonce-([a-f0-9]{32})'/)?.[1];
    assert.ok(nonce, path);
    for (const script of body.match(/<script\b[^>]*>/g)) assert.ok(script.includes(`nonce="${nonce}"`), path);
    assert.equal(page.headers.get('cache-control'), 'no-store', path);
    if (path.startsWith('/privacy')) {
      assert.match(body, /<script\b[^>]*type="module"[^>]*src="\/js\/content\.js/);
      assert.doesNotMatch(body, /src="[^\"]*js\/(?:main|account)\.js/);
    }
    const head = await fetch(base + path, { method: 'HEAD' });
    assert.equal(head.status, 200, path);
    assert.equal(await head.text(), '', path);
    assert.match(head.headers.get('content-security-policy'), /'nonce-[a-f0-9]{32}'/);
    assert.equal(head.headers.get('cache-control'), 'no-store');
  }
  for (const path of ['/cam-nang/khong-ton-tai/', '/.env']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(await response.text(), /adsbygoogle\.js/);
  }
});
