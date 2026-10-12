import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createApp } from '../server/server.js';
import worker from '../worker/index.js';
import { ADSENSE_PAGE_PATHS, PUBLIC_HTML_PATHS, isAdSenseContentPage } from '../lib/adsense.js';
import { PRACTICE_EXAMS_2026 } from '../public/js/data/practiceExams2026.js';
import { OFFICIAL_PRACTICE_EXAMS_2026 } from '../public/js/data/officialPracticeExams2026.js';
import { createPracticeAttempt, gradePracticeExam } from '../public/js/core/practiceExam.js';
import { PracticeExamApp } from '../public/js/practiceExam.js';
import { escapeHTML, storage } from '../public/js/utils.js';
import { APP_ROUTES, parseAppRoute } from '../public/js/core/appRoutes.js';
import { renderAppPage } from '../lib/appPages.js';
import { securityHeaders } from '../lib/securityHeaders.js';

test('all 17 full papers are restored alongside literature practice, with complete scoring', async () => {
  assert.equal(PRACTICE_EXAMS_2026.length, 18);
  assert.equal(new Set(PRACTICE_EXAMS_2026.map(exam => exam.id)).size, 18);
  for (const exam of PRACTICE_EXAMS_2026) {
    assert.ok(exam.questions.length >= 5 && exam.durationMinutes > 0);
    const branches = exam.answerBranches?.length ? exam.answerBranches : [''];
    for (const branch of branches) {
      const questions = exam.questions.filter(question => !question.branch || question.branch === branch);
      const answers = Object.fromEntries(questions.map(question => [question.id, question.type === 'short' ? question.answerText : question.answer]));
      assert.equal(gradePracticeExam({ ...exam, questions }, answers).score, 10, exam.subject);
    }
    for (const question of exam.questions) assert.ok(question.prompt);
    if (exam.sourceKind === 'official-paper') {
      assert.ok(OFFICIAL_PRACTICE_EXAMS_2026.includes(exam), exam.subject);
      assert.equal(exam.hasFullText, true);
      assert.equal(exam.durationMinutes, exam.officialMinutes);
      assert.ok(exam.pageImages.length);
    } else {
      assert.equal(exam.subject, 'Ngữ văn');
      assert.match(exam.sourceLabel, /tự biên soạn.*không phải đề chính thức/);
    }
  }
  const source = await readFile(new URL('../public/js/data/practiceExams2026.js', import.meta.url), 'utf8');
  assert.match(source, /import.*OFFICIAL_PRACTICE_EXAMS_2026/);
  assert.equal(PRACTICE_EXAMS_2026.filter(exam => exam.sourceKind === 'official-paper').length, 17);
});

test('all restored papers, images, answers and transcripts are served while private data stays blocked', async t => {
  const app = createApp({ environment: {} }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => app.close(resolve)));
  await new Promise(resolve => app.once('listening', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  const paths = new Set(OFFICIAL_PRACTICE_EXAMS_2026.flatMap(exam => [...exam.pageImages, ...exam.answerImages, ...exam.solutionImages].map(path => `/${path}`)));
  assert.equal(OFFICIAL_PRACTICE_EXAMS_2026.length, 17);
  for (const name of ['officialPracticeExams2026', 'officialQuestionContent2026', 'officialSolutions2026']) paths.add(`/js/data/${name}.js`);
  paths.add('/assets/practice-2026/math/pages/%31.webp');
  paths.add('/js/data/%6FfficialQuestionContent2026.js');
  for (const path of paths) {
    for (const method of ['GET', 'HEAD']) {
      const local = await fetch(base + path, { method });
      let assetCalled = false;
      const edge = await worker.fetch(new Request(`https://tinhdiemthpt.id.vn${path}`, { method }), { ASSETS: { fetch: request => {
        assetCalled = true;
        assert.equal(new URL(request.url).pathname, path);
        return new Response(method === 'HEAD' ? null : 'paper asset', { headers: { 'Content-Type': 'application/octet-stream' } });
      } } });
      assert.equal(local.status, 200, path);
      assert.equal(edge.status, 200, path);
      assert.equal(assetCalled, true, path);
      if (method === 'HEAD') for (const response of [local, edge]) assert.equal(await response.text(), '');
    }
  }
  const privateResponse = await worker.fetch(new Request('https://tinhdiemthpt.id.vn/_worker-data/majors.json'), { ASSETS: { fetch: () => assert.fail('private data must not reach Static Assets') } });
  assert.equal(privateResponse.status, 404);
  const script = await readFile(new URL('../scripts/build-cloudflare.mjs', import.meta.url), 'utf8');
  assert.match(script, /await cp\(join\(root, "public"\), output, \{ recursive: true \}\)/);
});

test('drafts for unlisted exams remain until the user explicitly confirms replacement', () => {
  const old = { examId: 'unlisted-paper', answers: { old: 2 } };
  let saved = structuredClone(old);
  const originalGet = storage.get, originalRemove = storage.remove;
  storage.get = (key, fallback) => key === 'thpt-practice-active-v1' ? saved : fallback;
  storage.remove = () => assert.fail('a suspended draft must not be cleared at startup');
  try {
    const root = { innerHTML: '', addEventListener() {}, querySelector: () => null, scrollIntoView() {} };
    const app = new PracticeExamApp(root);
    app.init();
    assert.deepEqual(saved, old);
    assert.match(root.innerHTML, /Bản nháp được giữ/);
    app.renderExam = () => {};
    app.persistActive = () => { saved = structuredClone(app.active); };
    app.startExam('math-official-2026-01');
    assert.deepEqual(saved, old);
    assert.match(root.innerHTML, /data-confirm-start="math-official-2026-01"/);
    app.pendingStartExamId = null;
    app.renderDashboard();
    assert.deepEqual(saved, old);
    app.startExam('math-official-2026-01', true);
    assert.equal(saved.examId, 'math-official-2026-01');
    assert.deepEqual(old.answers, { old: 2 });
  } finally { storage.get = originalGet; storage.remove = originalRemove; }
});

test('old results for unlisted exams remain visible without losing their score', () => {
  const root = { innerHTML: '' };
  const app = new PracticeExamApp(root);
  const old = { examId: 'unlisted-paper', result: { score: 8.5 }, submittedAt: 1 };
  app.renderResult(old);
  assert.match(root.innerHTML, /8\.50\/10/);
  assert.match(root.innerHTML, /không còn trong danh sách/);
  assert.match(root.innerHTML, /data-back-practice/);
  assert.doesNotMatch(root.innerHTML, /practice-2026|Câu 1|<img/);
  assert.equal(old.result.score, 8.5);
});

test('existing full-paper attempts resume with their original answers and result details', () => {
  const exam = PRACTICE_EXAMS_2026.find(item => item.id === 'math-official-2026-01');
  const draft = createPracticeAttempt(exam);
  draft.answers[exam.questions[0].id] = exam.questions[0].answer;
  const originalGet = storage.get, originalRemove = storage.remove;
  storage.get = (key, fallback) => key === 'thpt-practice-active-v1' ? draft : fallback;
  storage.remove = () => assert.fail('restored full-paper attempts must not be cleared');
  try {
    const root = { innerHTML: '', addEventListener() {}, scrollIntoView() {} };
    const app = new PracticeExamApp(root);
    let resumed = false;
    app.renderExam = () => { resumed = true; };
    app.init();
    assert.equal(resumed, true);
    assert.equal(app.active, draft);
    assert.equal(app.active.answers[exam.questions[0].id], exam.questions[0].answer);
    const old = { ...draft, result: gradePracticeExam(exam, draft.answers), submittedAt: Date.now() };
    app.renderResult(old);
    assert.match(root.innerHTML, /Kết quả · Toán/);
    assert.match(root.innerHTML, /0\.25<span>\/10/);
    assert.match(root.innerHTML, /practice-review-list/);
    assert.ok(root.innerHTML.includes(escapeHTML(exam.questions[0].prompt)));
  } finally { storage.get = originalGet; storage.remove = originalRemove; }
});

test('every app response has exactly one H1 for its selected tool and no-JS instructions', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const [view, { path }] of Object.entries(APP_ROUTES)) {
    const page = renderAppPage(html, parseAppRoute(path));
    assert.equal((page.match(/<h1\b/g) || []).length, 1, path);
    assert.ok(page.includes(`<h1 id="${view}-title">`), path);
    assert.match(page, /<noscript>.*bật JavaScript.*cẩm nang tuyển sinh/s);
  }
  const profile = renderAppPage(html, parseAppRoute('/nganh/a/b/'), { university: { name: 'Trường thử', code: 'A', year: 2026, methods: ['THPT'], website: 'javascript:bad()', description: '$& <img onerror=alert(1)>', admissions: { sources: [{ url: 'https://example.edu.vn/tuyen-sinh', title: 'Nguồn thật' }] } }, major: { name: 'Ngành thử', code: '123', method: 'THPT', combination: 'A00', cutoff: { score: 23, scale: 30, year: 2026, status: 'reference' } } });
  assert.match(profile, /data-server-profile/);
  for (const text of ['Trường thử','Ngành thử','123','A00','23 / 30','2026','2027','Nguồn thật']) assert.ok(profile.includes(text), text);
  assert.doesNotMatch(profile, /href="javascript:|<img onerror=/);
  assert.ok(profile.includes('$&amp; &lt;img'));
});

test('ad scope is 8 guides / 16 aliases, independent of 23 canonical pages / 46 HTML aliases', () => {
  assert.equal(ADSENSE_PAGE_PATHS.size, 16);
  assert.equal(PUBLIC_HTML_PATHS.size, 46);
  for (const path of ['/','/tim-nganh/','/phong-thi/','/ho-so-truong/','/privacy','/dieu-khoan-su-dung/','/truong/a/','/nganh/a/b/']) assert.equal(isAdSenseContentPage(path), false, path);
  const csp = securityHeaders({ scriptNonce: 'a'.repeat(32) })['Content-Security-Policy'];
  assert.match(csp, /script-src 'self' 'nonce-[a-f0-9]+' https:\/\/static\.cloudflareinsights\.com/);
  assert.match(csp, /connect-src 'self' https:\/\/cloudflareinsights\.com/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|strict-dynamic|connect-src 'self' https:;/);
});

test('privacy page and dialog describe all supported remote transcript processors', async () => {
  const [page, main] = await Promise.all([
    readFile(new URL('../public/privacy.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/main.js', import.meta.url), 'utf8')
  ]);
  const paragraph = html => html.match(/<p>Ảnh có thể được chuyển tới[\s\S]*?<\/p>/)?.[0];
  assert.ok(paragraph(page));
  assert.equal(paragraph(page), paragraph(main));
  for (const provider of ['Google Gemini', 'Groq', 'OCR.space', 'Hugging Face', 'Requesty']) assert.ok(paragraph(page).includes(provider), provider);
  assert.match(paragraph(page), /khi bên vận hành bật mô hình nhận diện tương ứng/);
  assert.match(paragraph(page), /có thể chuyển ảnh tới nhà cung cấp mô hình/);
});

test('loading lists reserve space and the article filter is present but disabled before JavaScript', async () => {
  const [html, css, content, renderer, main] = await Promise.all(['public/index.html','public/css/redesign.css','public/js/content.js','lib/contentPages.js','public/js/main.js'].map(path => readFile(new URL(`../${path}`, import.meta.url),'utf8')));
  for (const id of ['combination-grid','university-grid']) assert.match(html, new RegExp(`id="${id}"[^>]*aria-busy="true"`));
  assert.match(css, /#combination-grid\[aria-busy="true"\].*min-height:420px/);
  assert.match(main, /universityGrid\.setAttribute\("aria-busy", "false"\)/);
  assert.match(main, /combinationGrid\.setAttribute\("aria-busy", "false"\)/);
  assert.match(renderer, /id="guide-filter" role="search"/);
  assert.match(renderer, /id="guide-search" type="search" disabled/);
  assert.match(renderer, /id="guide-category" disabled/);
  assert.match(content, /control\.disabled = false/);
});
