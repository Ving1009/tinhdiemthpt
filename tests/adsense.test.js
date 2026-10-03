import assert from 'node:assert/strict';
import test from 'node:test';
import { adsenseAdsTxt, adsenseClient, prepareAdSenseHtml } from '../lib/adsense.js';
import { CONTENT_SECURITY_POLICY, securityHeaders } from '../lib/securityHeaders.js';
import mainWorker from '../worker/index.js';
import { createApp } from '../server/server.js';

const client = 'ca-pub-5701300811077965';
const enabled = { ADSENSE_CLIENT: client, ADSENSE_ENABLED: 'true', ADSENSE_CMP_READY: 'false' };
const html = '<!doctype html><html><head><title>THPT</title></head><body><script type="module" src="js/main.js"></script></body></html>';
const record = 'google.com, pub-5701300811077965, DIRECT, f08c47fec0942fa0\n';

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
    const prepared = prepareAdSenseHtml(html, enabled, country);
    assert.equal(prepared.adsEnabled, false, country);
    assert.equal(prepared.nonce, '');
    assert.match(prepared.html, /google-adsense-account/);
    assert.doesNotMatch(prepared.html, /adsbygoogle\.js/);
    assert.equal(securityHeaders({ adsenseNonce: prepared.nonce })['Content-Security-Policy'], CONTENT_SECURITY_POLICY);
  }
  assert.equal(prepareAdSenseHtml(html, { ...enabled, ADSENSE_ENABLED: 'false', ADSENSE_CMP_READY: 'true' }, 'VN').adsEnabled, false);
  assert.equal(prepareAdSenseHtml(html, { ...enabled, ADSENSE_CMP_READY: 'true' }, 'GB').adsEnabled, true);
});

test('quảng cáo dùng nonce mới cho từng HTML, khớp mọi script và strict CSP', () => {
  const first = prepareAdSenseHtml(html, enabled, 'VN');
  const next = prepareAdSenseHtml(html, enabled, 'VN');
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

test('Worker dùng geography tin cậy, nonce/header nhất quán và không chia sẻ cache HTML', async () => {
  const environment = { ...enabled, ASSETS: { fetch: async () => new Response(html, {
    headers: { 'Content-Type': 'text/html', ETag: 'old', 'Content-Length': '999', 'Last-Modified': 'old' }
  }) } };
  for (const path of ['/', '/index.html']) {
    const request = new Request(`https://tinhdiemthpt.id.vn${path}`);
    Object.defineProperty(request, 'cf', { value: { country: 'VN' } });
    const response = await mainWorker.fetch(request, environment);
    const body = await response.text();
    const nonce = body.match(/nonce="([a-f0-9]{32})"/)[1];
    assert.ok(response.headers.get('content-security-policy').includes(`'nonce-${nonce}'`));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('content-length'), null);
  }
  const unknown = await mainWorker.fetch(new Request('https://tinhdiemthpt.id.vn/', { headers: { 'CF-IPCountry': 'VN' } }), environment);
  assert.doesNotMatch(await unknown.text(), /adsbygoogle\.js/);
  assert.equal(unknown.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
  const api = await mainWorker.fetch(new Request('https://tinhdiemthpt.id.vn/api/auth-config'), environment);
  assert.equal(api.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
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
  assert.equal(page.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
  const api = await fetch(base + '/api/bootstrap');
  assert.equal(api.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
  assert.equal((await api.json()).success, true);
});

test('trang chính sách riêng không tải quảng cáo hoặc CMP dù quảng cáo đã bật', async t => {
  const server = createApp({ environment: { ...enabled, ADSENSE_CMP_READY: 'true' } }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base + '/');
  assert.match(await home.text(), /adsbygoogle\.js/);
  assert.equal(home.headers.get('referrer-policy'), 'strict-origin');
  assert.equal(home.headers.get('cache-control'), 'no-store');
  const privacy = await fetch(base + '/privacy.html');
  assert.equal(privacy.status, 200);
  assert.doesNotMatch(await privacy.text(), /<script\b|<iframe\b|adsbygoogle\.js|fundingchoicesmessages/i);
  assert.equal(privacy.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
  assert.equal(privacy.headers.get('referrer-policy'), 'no-referrer');
});
