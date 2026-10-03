import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {extractOfficialFacts, inspectOfficialPage, officialHost} from '../scripts/research-official-profiles-2026.mjs';
import {ADMISSIONS_2026_NOTICE} from '../public/js/admissions.js';
import {sanitizeUniversity} from '../lib/dataValidation.js';

test('nguồn trường phải đúng hostname, không nhận tên miền giả hoặc trang tổng hợp', () => {
  assert.equal(officialHost('https://tuyensinh.school.edu.vn/2026', 'https://www.school.edu.vn'), true);
  assert.equal(officialHost('https://school.edu.vn.attacker.example/2026', 'https://school.edu.vn'), false);
  assert.equal(officialHost('javascript:alert(1)', 'https://school.edu.vn'), false);
  assert.equal(officialHost('https://diemthi.tuyensinh247.com/2026', 'https://school.edu.vn', ['diemthi.tuyensinh247.com']), false);
  assert.equal(officialHost('https://official-authority.gov.vn/2026.pdf', 'https://school.edu.vn', ['official-authority.gov.vn']), true);
});

test('năm ở footer hoặc tin liên quan không biến đề án cũ thành tuyển sinh 2026', () => {
  const page=inspectOfficialPage('<title>Thông tin tuyển sinh năm 2025</title><article>Đề án 2025</article><footer>© 2026 <a href="/2026">Tuyển sinh 2026</a></footer>', 'https://school.edu.vn');
  assert.equal(page.yearConfirmed, false);
  assert.equal(inspectOfficialPage('<title>Trang chủ</title><h1>Thông tin tuyển sinh đại học chính quy năm 2026</h1>', 'https://school.edu.vn').yearConfirmed, true);
  assert.equal(inspectOfficialPage('<title>Nhạc viện</title><h2>Thông tin tuyển sinh năm 2026</h2><h3>Các tin khác</h3>', 'https://school.edu.vn').yearConfirmed, true);
  assert.equal(inspectOfficialPage('<title>Cổng thông tin</title><h1>CỔNG THÔNG TIN ĐIỆN TỬ</h1><div class="tt_Detail">Thông tin tuyển sinh đại học năm 2026</div>', 'https://school.edu.vn').yearConfirmed, true);
  assert.equal(inspectOfficialPage('<title>Thông tin tuyển sinh 2025</title><h1>Thông tin tuyển sinh 2025</h1><h2>Thông tin tuyển sinh năm 2026</h2>', 'https://school.edu.vn').yearConfirmed, false);
  for(const mode of ['thạc sĩ', 'tiến sĩ', 'liên thông', 'văn bằng 2', 'vào lớp 10']) {
    assert.equal(inspectOfficialPage(`<title>Thông tin tuyển sinh ${mode} năm 2026</title>`, 'https://school.edu.vn').yearConfirmed, false, mode);
  }
});

test('bảng ngành giữ mã xét tuyển, tổ hợp và rowspan, không ghép theo mã ngành riêng lẻ', () => {
  const facts=extractOfficialFacts('<article><table><tr><th>Mã ngành</th><th>Tên ngành</th><th>Mã xét tuyển</th><th>Tổ hợp</th><th>Chỉ tiêu</th></tr><tr><td rowspan="2">7480201</td><td>Công nghệ thông tin</td><td>CNTT-A</td><td>A00; A01</td><td>100</td></tr><tr><td>Công nghệ thông tin (CLC)</td><td>CNTT-B</td><td>D01</td><td>40</td></tr></table></article>');
  assert.deepEqual(facts.programs, [
    {code:'7480201',name:'Công nghệ thông tin',admissionCode:'CNTT-A',combination:'A00, A01',quota:100},
    {code:'7480201',name:'Công nghệ thông tin (CLC)',admissionCode:'CNTT-B',combination:'D01',quota:40}
  ]);
});

test('PDF nhúng trong đề án có năm của bài; viewer Google chỉ được dùng để tìm URL tài liệu', () => {
  const page=inspectOfficialPage('<h1>Thông tin tuyển sinh năm 2026</h1><a href="/files/plan.pdf">Tải đề án</a><iframe src="https://docs.google.com/gview?embedded=true&amp;url=https%3A%2F%2Fschool.edu.vn%2Ffiles%2Fembedded.pdf"></iframe><iframe src="https://video.example/embed"></iframe>', 'https://school.edu.vn');
  assert.deepEqual(page.links.map(l=>l.url),['https://school.edu.vn/files/plan.pdf','https://school.edu.vn/files/embedded.pdf']);
  assert.ok(page.links.every(l=>l.title.includes('2026')));
});

test('chỉ đọc nội dung bài, không lấy phương thức từ menu, footer hoặc bảng so sánh năm cũ', () => {
  const table='<table><tr><th>Mã ngành</th><th>Tên ngành</th></tr><tr><td>7480201</td><td>Ngành cũ</td></tr></table>';
  const facts=extractOfficialFacts(`<nav><p>Phương thức 2: Xét tuyển học bạ</p></nav><article><p>Phương thức 301: Xét tuyển thẳng theo quy định</p><p>Thông tin 2 năm gần nhất</p>${table}</article><footer><p>Phương thức 3: Xét tuyển kết quả thi</p></footer>`);
  assert.deepEqual(facts.methods,[{code:'301',label:'Phương thức 301: Xét tuyển thẳng theo quy định'}]);
  assert.deepEqual(facts.programs,[]);
  assert.equal(extractOfficialFacts('<p>+ Phương thức 1: Xét tuyển học bạ</p>').methods.length,1);
  assert.equal(extractOfficialFacts('<p>Phương thức 1: Xét tuyển học bạ năm 2025</p>').methods.length,0);
});

test('mọi hồ sơ có lưu ý 2026, trạng thái và báo cáo khớp dữ liệu; nguồn thiếu không được nâng thành đã xác minh', async () => {
  const schools=JSON.parse(await readFile(new URL('../data/universities.json',import.meta.url),'utf8'));
  const report=JSON.parse(await readFile(new URL('../data/research/official-profiles-2026.json',import.meta.url),'utf8'));
  assert.deepEqual(report.schools.map(s=>s.code).sort(),schools.map(s=>s.code).sort());
  assert.equal(report.summary.schools,schools.length);
  assert.equal(report.summary.withOfficialDocuments,schools.filter(s=>s.admissions.information2026.documents.length).length);
  assert.equal(report.summary.withMethodTables,schools.filter(s=>s.admissions.information2026.methods.length).length);
  assert.equal(report.summary.withProgramTables,schools.filter(s=>s.admissions.information2026.programs.length).length);
  for(const school of schools) {
    const info=school.admissions.information2026;
    assert.equal(info.year,2026,school.code);
    assert.equal(info.notice,ADMISSIONS_2026_NOTICE,school.code);
    assert.match(info.checkedAt,/^\d{4}-\d{2}-\d{2}$/);
    assert.equal(info.status,info.documents.length?'official_documents_available':'official_evidence_pending');
    assert.ok(info.documents.every(d=>/^https?:\/\//.test(d.url)&&!/tuyensinh247/.test(d.url)),school.code);
    const clean=sanitizeUniversity(school).admissions.information2026;
    assert.deepEqual(clean,info,'Tài liệu chính thức và cảnh báo phải đến được frontend');
  }
  const handbook=schools.find(s=>s.code==='NQH').admissions.information2026;
  assert.ok(handbook.documents.some(d=>d.title.startsWith('Bộ Quốc phòng')));
  assert.ok(handbook.scopeNote);
  assert.deepEqual(handbook.programs,[],'Không gán bảng ngành chung 18 trường cho một trường');
  const stale=schools.find(s=>s.code==='DBH');
  assert.equal(stale.websiteStatus,'needs_review');
  assert.equal(stale.website,'');
  assert.match(stale.admissions.information2026.note,/chưa xác nhận được đúng cơ sở/);
});
