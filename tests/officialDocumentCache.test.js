import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { officialDocumentCache } from '../scripts/research-school-formulas-2026.mjs';

test('tài liệu chính thức sau chuyển hướng vẫn tìm được file nguồn đã lưu bằng URL yêu cầu', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'thpt-official-cache-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const requestedUrl = 'https://school.example/admissions-2026';
  const url = 'https://school.example/admissions-2026/';
  const id = createHash('sha256').update(requestedUrl).digest('hex');
  await fs.writeFile(path.join(directory, `${id}.json`), JSON.stringify({ requestedUrl, url, kind: 'html', checkedAt: '2026-10-14' }));
  await fs.writeFile(path.join(directory, 'school-TEST.json'), JSON.stringify({ url: 'https://wrong.example', kind: 'html' }));
  const index = await officialDocumentCache(directory);
  assert.equal(index.get(url).base.replaceAll('\\', '/'), `${directory.replaceAll('\\', '/')}/${id}`);
  assert.equal(index.get(requestedUrl), index.get(url));
  assert.equal(index.has('https://wrong.example'), false);
});

test('không lấy lỗi HTTP và ưu tiên bản tài liệu mới hơn khi URL trùng', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'thpt-official-cache-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const url = 'https://school.example/plan-2026.pdf';
  for (const [id, page] of [
    ['a', { url, kind: 'pdf', checkedAt: '2026-10-03' }],
    ['b', { url, kind: 'pdf', checkedAt: '2026-10-14' }],
    ['c', { url: 'https://school.example/error', kind: 'html', error: 'HTTP 403' }]
  ]) await fs.writeFile(path.join(directory, `${id.repeat(64)}.json`), JSON.stringify(page));
  const index = await officialDocumentCache(directory);
  assert.match(index.get(url).base, /b{64}$/);
  assert.equal(index.has('https://school.example/error'), false);
});
