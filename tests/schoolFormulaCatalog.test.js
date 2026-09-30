import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createSchoolFormulaCatalogIndex, publicSchoolFormulas } from '../lib/schoolFormulaCatalog.js';
import { calculateSchoolFormula, validateSchoolFormulaValue } from '../public/js/core/schoolFormula.js';
import { describeScoring, formulaKind, scoreEquations } from '../scripts/lib/school-formulas.mjs';
import { defaultDataStore } from '../server/dataStore.js';
import { handleDataApi } from '../worker/dataApi.js';

const load = async (name) => JSON.parse(await fs.readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const [catalog, universities, majors] = await Promise.all([load('school-formula-catalog-2026'), load('universities'), load('majors')]);
const school = (code) => catalog.schools.find((s) => s.schoolCode === code);
const method = (code, id) => school(code).methods.find((m) => m.id === `school-${code.toLowerCase()}-${id}`);

test('catalog công thức rà soát mọi hồ sơ, không biến mô tả hay nguồn thiếu thành công thức tự tính', () => {
  const index = createSchoolFormulaCatalogIndex(catalog, { universities, majors });
  assert.equal(index.size, universities.length);
  assert.equal(catalog.summary.methods, catalog.schools.reduce((n, s) => n + s.methods.length, 0));
  assert.ok(catalog.schools.flatMap((s) => s.methods).every((m) => m.year === 2026));
  for (const s of catalog.schools) for (const m of s.methods) {
    if (m.autoCalculate) {
      assert.equal(m.status, 'official_verified');
      assert.equal(m.evidence.kind, 'official_primary');
      assert.equal(m.calculationRule.type, 'weighted_sum');
      assert.ok(m.programIndexes.length);
    }
    if (['requires_review', 'missing_evidence', 'source_description', 'conflicting', 'scope_incomplete'].includes(m.status)) assert.equal(m.autoCalculate, false);
  }
  assert.equal(method('HPS', '402HSA').status, 'requires_review');
  assert.equal(method('TCT', '8783').autoCalculate, false, 'chưa có bảng quy đổi không được cộng học bạ thô');
  assert.match(method('NTH', '8133').expression, /STEM[\s\S]*2 × Toán[\s\S]*thang 40/);
  assert.match(method('QSB', '8103').expression, /TNE không cộng/);
  assert.equal(method('DHP', '8960').status, 'source_reported', 'mã trường nguồn HPU phải ánh xạ vào hồ sơ Hải Phòng DHP');
});

test('ngành áp dụng giữ đúng phân hiệu, tổ hợp và ghi chú', () => {
  const publicHcs = publicSchoolFormulas(school('HCS'), catalog.checkedAt);
  assert.ok(publicHcs.methods.length && publicHcs.methods.every((m) => m.programs.every((p) => p.group.includes('Hồ Chi Minh'))));
  const publicIuq = publicSchoolFormulas(school('IUQ'), catalog.checkedAt);
  assert.ok(publicIuq.methods.every((m) => m.programs.length === 6 && m.programs.every((p) => p.group === 'Phân hiệu Quảng Ngãi')));
  const fpt = publicSchoolFormulas(school('FPT'), catalog.checkedAt);
  assert.ok(fpt.methods.every((m) => m.programCount === 39));
  assert.equal(fpt.methods[0].programs.find((p) => p.nationalMajorCode === '7480101').combination, 'Axx');
  assert.equal(new Set(fpt.methods[0].programs.map((p) => p.id)).size, 39);
  const bka = publicSchoolFormulas(school('BKA'), catalog.checkedAt).methods.find((m) => m.id === 'school-bka-7980');
  assert.equal(bka.programs.find((p) => p.code === 'IT1').verifiedRowId, 'dai-hoc-bach-khoa-ha-noi-it1-thpt-91');
  assert.equal(bka.programs.filter((p) => p.verifiedRowId).length, 3, 'Chỉ ba chương trình có bộ tính đã xác minh được nối lại');
  assert.ok(bka.programs.filter((p) => p.verifiedRowId).every((p) => p.mathIsMain === true && p.combination.includes('K01')));
  const qhi = publicSchoolFormulas(school('QHI'), catalog.checkedAt);
  assert.equal(qhi.methods.filter((m) => m.label === 'Điểm thi THPT').length, 1, 'Gộp hai mục nguồn trùng công thức và phạm vi');
  assert.ok(!publicSchoolFormulas(school('VJU'), catalog.checkedAt).methods.find((m) => m.id === 'school-vju-7877').programs.some((p) => p.code === 'VJU3'));
});

test('catalog từ chối nguồn thiếu, liên kết sang trường khác và cờ tự tính không có căn cứ', () => {
  const fixture = { ...catalog, schools: [structuredClone(school('FPT'))] };
  const options = { universities: universities.filter((s) => s.code === 'FPT'), majors };
  const valid = structuredClone(fixture);
  fixture.schools[0].methods[0].rowIds.push(majors.find((m) => m.universityId !== fixture.schools[0].universityId).id);
  assert.throws(() => createSchoolFormulaCatalogIndex(fixture, options), /liên kết sai trường/);
  const unofficial = structuredClone(valid);
  unofficial.schools[0].methods[0].evidence.kind = 'secondary';
  assert.throws(() => createSchoolFormulaCatalogIndex(unofficial, options), /chưa đủ căn cứ|chưa có nguồn chính thức/);
  const malformed = structuredClone(valid);
  malformed.schools[0].methods[0].programIndexes = [99999];
  assert.throws(() => createSchoolFormulaCatalogIndex(malformed, options), /sai ngành/);
  const unsafe = structuredClone(valid);
  unsafe.schools[0].methods[0].evidence.url = 'javascript:alert(1)';
  assert.throws(() => createSchoolFormulaCatalogIndex(unsafe, options), /Nguồn không hợp lệ/);
});

test('API public giữ nguồn thu thập nội bộ và chỉ đưa liên kết quy định chính thức', () => {
  for (const s of catalog.schools) {
    const value = publicSchoolFormulas(s, catalog.checkedAt);
    const text = JSON.stringify(value);
    assert.doesNotMatch(text, /tuyensinh247|diemthi\.vnexpress\.net/i, s.schoolCode);
    assert.doesNotMatch(text, /"(?:source\w*|reference\w*|evidence)":/i, s.schoolCode);
    for (const m of value.methods) if (m.officialLink) assert.match(m.officialLink.url, /^https:\/\//);
  }
});

test('FPT áp dụng trọng số, ưu tiên giảm sau điểm cộng và giới hạn 30', () => {
  const rule = method('FPT', '8011').calculationRule;
  const values = Object.fromEntries(rule.inputs.map((f, i) => [f.key, i ? '9' : '25']));
  const result = calculateSchoolFormula(rule, values, { area: 'KV1' });
  assert.equal(result.base, 26);
  assert.equal(result.priority.adjusted, 0.4);
  assert.equal(result.total, 26.4);
  const withBonus = calculateSchoolFormula(rule, { ...values, bonus: '1' }, { area: 'KV1' });
  assert.equal(withBonus.priority.adjusted, 0.3);
  assert.equal(withBonus.total, 27.3);
  const max = Object.fromEntries(rule.inputs.map((f) => [f.key, f.max]));
  const capped = calculateSchoolFormula(rule, { ...max, bonus: '3' }, { area: 'KV1', priorityGroup: 'UT1' });
  assert.equal(capped.total, 30);
  assert.equal(capped.priority.adjusted, 0);
});

test('công thức năng khiếu phân biệt trường không dùng ưu tiên với trường có ưu tiên', () => {
  const hmvRule = method('HMV', 'nk').calculationRule;
  const hmvValues = Object.fromEntries(hmvRule.inputs.map((f) => [f.key, '8']));
  const hmv = calculateSchoolFormula(hmvRule, hmvValues, { area: 'KV1', priorityGroup: 'UT1' });
  assert.equal(hmv.base, 24);
  assert.equal(hmv.priority.adjusted, 0);
  assert.equal(hmv.total, 24);
  const hvaRule = method('HVA', 'nk-hb').calculationRule;
  const hva = calculateSchoolFormula(hvaRule, { major: 8, aptitude: 8, literature: 8 }, { area: 'KV1' });
  assert.equal(hva.total, 24.6);
  assert.throws(() => calculateSchoolFormula(hvaRule, { major: 6.9, aptitude: 8, literature: 8 }), /7 đến 10/);
});

test('ưu tiên trên các thang điểm được quy đúng tỷ lệ, giảm đúng ngưỡng và làm tròn', () => {
  for (const scale of [30, 40, 100]) {
    const rule = { type: 'weighted_sum', inputs: [{ key: 'score', label: 'Điểm', min: 0, max: scale, weight: 1 }], divisor: 1, priority: true, maxScore: scale };
    assert.equal(calculateSchoolFormula(rule, { score: 0.75 * scale }, { area: 'KV1' }).priority.adjusted, Math.round(scale / 30 * 0.75 * 100) / 100);
    assert.equal(calculateSchoolFormula(rule, { score: scale }, { area: 'KV1', priorityGroup: 'UT1' }).priority.adjusted, 0);
  }
  const rule = { type: 'weighted_sum', inputs: [{ key: 'score', label: 'Điểm', min: 0, max: 30, weight: 1 }], divisor: 1, priority: true, maxScore: 30 };
  assert.equal(calculateSchoolFormula(rule, { score: 22.49 }, { area: 'KV1' }).total, 23.24);
  assert.equal(calculateSchoolFormula(rule, { score: 20 }, { area: 'KV1', priorityGroup: 'UT1' }).total, 22.75);
});

test('QHI và VJU dùng bảng HSA/SAT 2026, không nội suy bảng cũ hoặc điểm chưa được xác nhận', () => {
  const qhi = method('QHI', '8500').calculationRule;
  assert.equal(calculateSchoolFormula(qhi, { hsa: '100' }, { area: 'KV1' }).total, 26.4);
  assert.equal(calculateSchoolFormula(qhi, { hsa: '130' }, { area: 'KV1', priorityGroup: 'UT1' }).total, 30);
  assert.throws(() => calculateSchoolFormula(qhi, { hsa: '100.5' }), /bảng quy đổi/);
  assert.throws(() => calculateSchoolFormula(qhi, { hsa: '64' }), /từ 65 đến 130/);
  const vjuSat = method('VJU', '7875').calculationRule;
  assert.equal(calculateSchoolFormula(vjuSat, { sat: '1100' }).total, 20.63, 'Không dùng 22,98 của bảng 2025');
  assert.equal(calculateSchoolFormula(vjuSat, { sat: '1350' }, { area: 'KV1' }).total, 25.78);
  assert.throws(() => calculateSchoolFormula(vjuSat, { sat: '1355' }), /bảng quy đổi/);
  const sat = method('QHI', '8501').calculationRule;
  assert.equal(calculateSchoolFormula(sat, { sat: '1400' }, { area: 'KV1' }).total, 26.63);
  const malformed = structuredClone(qhi);
  malformed.inputs[0].lookup['100'] = '26';
  assert.throws(() => calculateSchoolFormula(malformed, { hsa: '100' }), /Bảng quy đổi/);
});

test('TSA Bách khoa tính ưu tiên theo thang 100 sau điểm thưởng; năng khiếu Xây dựng giữ thang Vẽ 20', () => {
  const rule = method('BKA', '7982').calculationRule;
  assert.equal(calculateSchoolFormula(rule, { tsa: '80', bonus: '5' }, { area: 'KV1' }).total, 86.5);
  assert.equal(calculateSchoolFormula(rule, { tsa: '100', bonus: '5' }, { area: 'KV1', priorityGroup: 'UT1' }).total, 100);
  assert.match(method('XDA', '8255').expression, /Vẽ MT\) \/ 5 × 3/);
  assert.ok(method('XDA', '8255').conditions.some((c) => c.includes('thang 20')));
});

test('ô nhập công thức báo lỗi đúng loại, nhận dấu phẩy và không thực thi biểu thức', () => {
  const field = { min: 0, max: 10 };
  assert.deepEqual(validateSchoolFormulaValue('8,5', field), { valid: true, value: 8.5 });
  for (const [value, message] of [['', /Vui lòng nhập điểm/], ['abc', /số hợp lệ/], ['-1', /từ 0 đến 10/], ['11', /từ 0 đến 10/], ['8.555', /2 chữ số/], ['2+2', /số hợp lệ/]]) {
    const result = validateSchoolFormulaValue(value, field);
    assert.equal(result.valid, false);
    assert.match(result.message, message);
  }
  assert.throws(() => calculateSchoolFormula({ type: 'eval', expression: 'alert(1)' }, {}), /chưa được hỗ trợ/);
});

test('trích công thức không lấy điều kiện tuyển sinh làm phép tính, giữ số liệu theo nguồn', () => {
  assert.deepEqual(scoreEquations('Chỉ tiêu = 200 + 100\nCó tổng điểm 3 môn (Toán + Lý + Hóa) từ 15.\nĐXT = M1 + M2 + M3 + ĐƯT'), ['ĐXT = M1 + M2 + M3 + ĐƯT']);
  assert.deepEqual(scoreEquations('Điểm xét tuyển là tổng điểm ba môn trong tổ hợp cộng điểm ưu tiên.'), ['Điểm xét tuyển là tổng điểm ba môn trong tổ hợp cộng điểm ưu tiên.']);
  assert.equal(formulaKind('Điểm ĐGNL V-SAT'), 'assessment+v-sat');
  assert.equal(formulaKind('Điểm ĐGNL V-ACT'), 'v-act');
  assert.equal(formulaKind('Kết quả học tập THPT'), 'transcript');
  assert.equal(formulaKind('ĐGNL HSA'), 'hsa');
  assert.equal(describeScoring('Thí sinh thi tốt nghiệp THPT phải có tổng điểm từ 15.', 'transcript'), '');
  assert.deepEqual(scoreEquations('Điểm thi THPT'), []);
  assert.deepEqual(scoreEquations('(4) Đối với thí sinh khuyết tật bị suy giảm khả năng học tập có nguyện vọng ngành phù hợp.\nĐXT = M1 + M2 + M3'), ['ĐXT = M1 + M2 + M3']);
});

test('Worker và Express trả cùng catalog theo trường, không đưa catalog lớn vào bootstrap', async () => {
  const requested = [];
  const assets = { async fetch(request) {
    const name = new URL(request.url).pathname.split('/').pop().replace('.json', '');
    requested.push(name);
    return Response.json(await load(name));
  } };
  const id = school('FPT').universityId;
  const response = await handleDataApi(new Request(`https://example.com/api/universities/${id}/admission-formulas`), { ASSETS: assets });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.data.catalog, defaultDataStore.listAdmissionFormulas(id).catalog);
  assert.ok(requested.includes('school-formula-catalog-2026'));
  assert.equal(Object.hasOwn(defaultDataStore.publicInitialData, 'schoolFormulaCatalog'), false);
});

test('chọn trường lần đầu và chuyển nhanh không bị NaN hoặc lấy kết quả request cũ', async () => {
  const source = await fs.readFile(new URL('../public/js/main.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  async populateMajorSelect() {'), source.indexOf('  populateMethodSelect() {'));
  const Fixture = vm.runInNewContext(`(class { ${body} })`, { escapeHTML: String });
  const pending = new Map();
  const deferred = (key) => new Promise((resolve) => pending.set(key, resolve));
  const app = new Fixture();
  app.elements = { universitySelect: { value: 'first' }, majorSelect: {}, methodSelect: {}, calculateAdmission: {}, selectionHint: {} };
  app.repository = { getMajors: (id) => deferred(`${id}-majors`), getAdmissionFormulas: (id) => deferred(`${id}-formulas`) };
  app.renderAdmissionCalculator = () => {};
  app.saveForm = () => {};
  const first = app.populateMajorSelect();
  assert.equal(app.admissionLoadVersion, 1);
  app.elements.universitySelect.value = 'second';
  const second = app.populateMajorSelect();
  pending.get('second-majors')([{ id: 'second-row' }]);
  pending.get('second-formulas')({ methods: [], catalog: { methods: [{ id: 'second-method', label: 'Phương thức mới', programCount: 1 }] } });
  await second;
  pending.get('first-majors')([{ id: 'first-row' }]);
  pending.get('first-formulas')({ methods: [], catalog: { methods: [{ id: 'first-method', label: 'Phương thức cũ', programCount: 1 }] } });
  await first;
  assert.match(app.elements.methodSelect.innerHTML, /second-method/);
  assert.doesNotMatch(app.elements.methodSelect.innerHTML, /first-method/);
  assert.equal(app.admissionMajorRows[0].id, 'second-row');
});

test('khôi phục lựa chọn không ghi đè thao tác mới trên cùng trường lúc đang khởi tạo', async () => {
  const source = await fs.readFile(new URL('../public/js/main.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  async restoreAdmissionSelections() {'), source.indexOf('  admissionFormulaForMethod('));
  const Fixture = vm.runInNewContext(`(class { ${body} })`);
  const app = new Fixture();
  let finish;
  app.state = { universityId: 'same-school', admissionMethod: 'old' };
  app.repository = { getUniversity: () => ({}), getMajor: () => null };
  app.elements = { universitySelect: {}, methodSelect: { value: 'new', options: [] }, majorSelect: {} };
  app.populateMajorSelect = () => { app.admissionLoadVersion = 1; return new Promise((resolve) => { finish = resolve; }); };
  app.populateMethodSelect = () => assert.fail('Không được khôi phục khi đã có thao tác mới');
  const restoring = app.restoreAdmissionSelections();
  app.admissionLoadVersion = 2;
  finish();
  await restoring;
  assert.equal(app.elements.methodSelect.value, 'new');
});

test('bảng ngành không gắn nhãn chính thức cho công thức chỉ lấy từ nguồn tham khảo', async () => {
  const source = await fs.readFile(new URL('../public/js/main.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  majorRow('), source.indexOf('  renderCombinations('));
  const Fixture = vm.runInNewContext(`(class { ${body} })`, { escapeHTML: String, publishableCutoff: () => false, cutoffLabel: () => 'Chưa công bố', safeWebsite: () => '' });
  const app = new Fixture();
  app.admissionFormulaForMajor = () => ({ status: 'source_reported', expression: 'ĐXT = M1 + M2 + M3' });
  app.referenceFormulaForMajor = () => null;
  const major = { id: 'test', name: 'Ngành thử', code: '123', universityId: 'test', method: 'THPT' };
  assert.doesNotMatch(app.majorRow(major, '', {}), /chính thức/);
  app.admissionFormulaForMajor = () => ({ status: 'official_verified', expression: 'ĐXT = M1 + M2 + M3' });
  assert.match(app.majorRow(major, '', {}), /chính thức/);
});
