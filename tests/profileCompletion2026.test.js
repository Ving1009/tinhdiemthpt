import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {schoolFormulaCombinationLabels} from '../public/js/core/schoolFormula.js';

const load = async path => JSON.parse(await fs.readFile(new URL(`../data/${path}.json`, import.meta.url), 'utf8'));
const [catalog, research, universities, overrides] = await Promise.all(['school-formula-catalog-2026','research/admission-methods-2026','universities','research/school-formulas-2026-overrides'].map(load));
const school = code => catalog.schools.find(s => s.schoolCode === code);
const method = (code, id) => school(code).methods.find(m => m.id === `school-${code.toLowerCase()}-${id}` || m.mergedMethodIds?.includes(`school-${code.toLowerCase()}-${id}`));
const programs = (code, id) => method(code, id).programIndexes.map(index => school(code).programs[index]);

test('tổ hợp ghi tên môn giữ trọn nhóm ba môn và không tự suy mã cho Công nghệ', () => {
  assert.deepEqual(schoolFormulaCombinationLabels('A00; A01/D01|X25'), ['A00','A01','D01','X25']);
  assert.deepEqual(schoolFormulaCombinationLabels('(Văn, Sử, Địa); (Toán, Anh, Công nghệ)'), ['(Văn, Sử, Địa)','(Toán, Anh, Công nghệ)']);
  assert.deepEqual(schoolFormulaCombinationLabels('(Toán, Lý, Hóa), (Toán, Văn, Anh)'), ['(Toán, Lý, Hóa)','(Toán, Văn, Anh)']);
  assert.deepEqual(schoolFormulaCombinationLabels(''), []);
});

test('IUH giữ một phương thức kết hợp, mẫu số là điểm thủ khoa và phạm vi phân hiệu riêng', () => {
  const combined = method('IUH','8313');
  assert.equal(combined, method('IUH','9445'));
  assert.equal(combined.autoCalculate, false);
  assert.match(combined.expression, /max\(XT1; XT2; XT3\)/);
  assert.match(combined.expression, /0,7 × ĐK \+ 0,3 × ĐHB/);
  assert.match(combined.expression, /30 \/ ĐTK/);
  assert.match(combined.conditions.join(' '), /không phải điểm tối đa lý thuyết 1200/);
  assert.equal(programs('IUH','8313').length, 62);
  assert.equal(programs('IUQ','combined').length, 6);
  assert.ok(programs('IUQ','combined').every(p => p.group === 'Phân hiệu Quảng Ngãi'));
  assert.match(combined.evidence.url, /^https:\/\/pdt\.iuh\.edu\.vn\//);
});

test('Đồng Tháp loại trừ ngành giáo viên khỏi học bạ kết hợp năng khiếu', () => {
  assert.deepEqual(programs('SPD','9487').map(p => p.code), ['7810302']);
  assert.match(method('SPD','9487').conditions.join(' '), /không áp dụng Giáo dục thể chất|không áp dụng.*Sư phạm/);
  assert.match(method('SPD','7945').priority, /900/);
  assert.match(method('SPD','7944').priority, /337,5/);
  assert.equal(method('SPD','7945').autoCalculate, false);
  for (const id of ['9484','9488']) assert.ok(programs('SPD',id).some(p => p.code === '51140201'), 'giữ ngành cao đẳng Mầm non của bảng chính thức');
});

test('Trà Vinh không gán học bạ cho ba ngành sức khỏe bị trường loại trừ', () => {
  const hb = programs('DVT','9368');
  assert.equal(hb.length, 46);
  assert.ok(hb.every(p => !['7720101','7720201','7720501'].includes(p.code)));
  assert.match(method('DVT','9368').conditions.join(' '), /Không xét học bạ/);
});

test('Mở Hà Nội giữ ngành dự bị riêng và chín ngành tuyển thẳng theo ma trận 2026', () => {
  assert.equal(programs('MHN','8436').length, 9);
  assert.equal(programs('MHN','prep').length, 18);
  assert.ok(programs('MHN','prep').every(p => !/Thiết kế|Kiến trúc/.test(p.name)));
});

test('Quy Nhơn dùng đúng ma trận THPT, học bạ, V-ACT và SPT; không loại nhầm Quản lý giáo dục', () => {
  for (const id of ['8532','8534','9492']) {
    const scope = programs('DQN',id);
    assert.equal(scope.length, 38);
    assert.ok(scope.every(p => !/^71402/.test(p.nationalMajorCode)));
    assert.ok(scope.some(p => p.nationalMajorCode === '7140114'));
    assert.ok(scope.some(p => p.nationalMajorCode === '7620109'));
  }
  for (const id of ['8531','8533','9491']) assert.equal(programs('DQN',id).length, 51);
  assert.ok(programs('DQN','8533').some(p => /^71402/.test(p.nationalMajorCode)), 'SPT nhận ngành giáo viên theo cột PT4');
  assert.ok(programs('DQN','8532').some(p => p.code === '7340301AC' && p.nationalMajorCode === '7340301'));
});

test('Đông Á giới hạn hồ sơ nước ngoài cho Y khoa bằng tiếng Anh, không suy mã ngành từ ID nội bộ', () => {
  const scope = programs('DAD','7607');
  assert.equal(scope.length, 1);
  assert.match(scope[0].name, /Y khoa.*tiếng Anh/);
  assert.equal(scope[0].code, '');
  assert.equal(scope[0].nationalMajorCode, '');
  assert.equal(method('DAD','7607').autoCalculate, false);
});

test('nhánh thay IELTS của Y Dược Đà Nẵng không phủ lên công thức THPT thông thường', () => {
  const formula = method('DDY','8825');
  assert.match(formula.expression, /THPT.*thông thường/i);
  assert.match(formula.expression, /chưa.*(?:biểu thức|công thức)/i);
  assert.match(formula.conditions.join(' '), /B00.*A00|A00.*B00/);
  assert.equal(formula.autoCalculate, false);
});

test('dự bị Lao động Xã hội giữ đúng ngành của hai cơ sở', () => {
  assert.equal(programs('DLS','500').length, 14);
  assert.equal(programs('DLX','prep').length, 28);
  assert.match(method('DLS','500').evidence.url, /tuyensinh\.ldxh\.edu\.vn/);
  assert.ok(programs('DLS','500').every(p => !/Hà Nội/.test(p.group)));
});

test('Ngoại ngữ Đà Nẵng dùng hệ số theo nhóm ngành, không hiển thị ví dụ số như công thức chung', () => {
  const formula = method('DDF','6629');
  assert.equal(formula.autoCalculate, false);
  assert.match(formula.expression, /T × a \+ H × b/);
  assert.doesNotMatch(formula.expression, /23,3|23,6|22\.5/);
  assert.match(formula.conditions.join(' '), /a=0,8; b=0,2/);
  assert.match(formula.conditions.join(' '), /a=0,6; b=0,4/);
});

test('hồ sơ và catalog giữ năm tham khảo, không đổi ngày đối chiếu của nguồn chưa cập nhật', () => {
  assert.ok(catalog.schools.every(s => s.year === 2026 && s.methods.every(m => m.year === 2026)));
  const dates = new Map(research.schools.flatMap(s => s.methods.map(m => [`school-${s.code.toLowerCase()}-${m.id}`,m.checkedAt])));
  const older = catalog.schools.flatMap(s => s.methods.filter(m => m.evidence?.kind === 'secondary' && !overrides.methods[`${s.schoolCode}:${m.id.replace(`school-${s.schoolCode.toLowerCase()}-`,'')}`]).map(m => ({code:s.schoolCode,method:m})));
  assert.ok(older.length > 100);
  for (const {method:entry} of older) assert.equal(entry.evidence.checkedAt, dates.get(entry.id), entry.id);
  for (const code of ['DLS','DLX','DDF','SPD','IUH','IUQ']) {
    const information = universities.find(s => s.code === code).admissions.information2026;
    assert.equal(information.year, 2026);
    assert.ok(information.documents.some(d => d.checkedAt === '2026-10-14'));
    assert.match(information.notice, /tham khảo/);
  }
  assert.equal(universities.find(s => s.code === 'TTD').website, 'https://dsu.edu.vn');
});
