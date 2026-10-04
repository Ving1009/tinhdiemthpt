import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createSchoolFormulaCatalogIndex, publicSchoolFormulas } from '../lib/schoolFormulaCatalog.js';
import { calculateSchoolFormula, schoolFormulaBranches, selectSchoolFormulaRule, validateSchoolFormulaValue, validSchoolFormulaRanges } from '../public/js/core/schoolFormula.js';
import { describeScoring, formulaKind, scoreEquations } from '../scripts/lib/school-formulas.mjs';
import { officialFormulaDocument, officialFormulaSections } from '../scripts/research-school-formulas-2026.mjs';
import { defaultDataStore } from '../server/dataStore.js';
import { handleDataApi } from '../worker/dataApi.js';

const load = async (name) => JSON.parse(await fs.readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const [catalog, universities, majors] = await Promise.all([load('school-formula-catalog-2026'), load('universities'), load('majors')]);
const school = (code) => catalog.schools.find((s) => s.schoolCode === code);
const method = (code, id) => school(code).methods.find((m) => m.id === `school-${code.toLowerCase()}-${id}`);

test('Y tế Công cộng áp dụng đính chính THPT, giữ khuyến khích riêng cho học bạ và dự bị', () => {
  const thpt = method('YTC', '8874');
  assert.equal(thpt.autoCalculate, true);
  assert.equal(thpt.calculationRule.bonus, undefined);
  assert.match(thpt.evidence.url, /dinh%20chinh/);
  assert.equal(calculateSchoolFormula(thpt.calculationRule, { m1: 9, m2: 9, m3: 8, bonus: 1.5 }, { area: 'KV1' }).total, 26.4);
  const hb = method('YTC', '8877');
  assert.deepEqual(hb.programIndexes.map(i => school('YTC').programs[i].code), ['7460108', '7720401', '7720701', '7760101']);
  const values = Object.fromEntries([1, 2, 3].flatMap(i => [[`m${i}_10`, 6], [`m${i}_11`, 8], [`m${i}_12`, 10]]));
  assert.equal(calculateSchoolFormula(hb.calculationRule, { ...values, bonus: 1.5 }, { area: 'KV1' }).total, 25.95);
  const preparatory = method('YTC', 'official2026-preparatory');
  assert.equal(preparatory.programIndexes.length, 6);
  assert.ok(preparatory.calculationRule.inputs.every(f => /thi cuối khóa dự bị/.test(f.label)));
  assert.equal(calculateSchoolFormula(preparatory.calculationRule, { m1: 8, m2: 8, m3: 8, bonus: 1.5 }, { area: 'KV1' }).total, 25.95);
});

test('Y tế Công cộng tính HSA trên thang 150, giảm ưu tiên sau khuyến khích và chặn đầu vào', () => {
  const formula = method('YTC', '8879');
  assert.deepEqual(formula.programIndexes.map(i => school('YTC').programs[i].code), ['7460108']);
  const rule = formula.calculationRule;
  const result = calculateSchoolFormula(rule, { hsa: 120, bonus: 7.5 }, { area: 'KV1' });
  assert.equal(result.maxScore, 150);
  assert.equal(result.priority.adjusted, 2.25);
  assert.equal(result.total, 129.75);
  assert.equal(calculateSchoolFormula(rule, { hsa: 112, bonus: 0.5 }, { area: 'KV1' }).total, 116.25);
  assert.equal(calculateSchoolFormula(rule, { hsa: 112 }, { area: 'KV1', priorityGroup: 'UT1' }).total, 125.75);
  assert.equal(calculateSchoolFormula(rule, { hsa: 150, bonus: 7.5 }, { area: 'KV1', priorityGroup: 'UT1' }).total, 150);
  assert.equal(calculateSchoolFormula(rule, { hsa: 150 }, { area: 'KV1' }).priority.adjusted, 0);
  assert.throws(() => calculateSchoolFormula(rule, { hsa: 69 }), /70 đến 150/);
  assert.throws(() => calculateSchoolFormula(rule, { hsa: 120.5 }), /số nguyên/);
  assert.throws(() => calculateSchoolFormula(rule, { hsa: 120, bonus: 7.51 }), /0 đến 7.5/);
});

test('Sư phạm TDTT TP.HCM giảm ưu tiên trên điểm tổ hợp, không gộp điểm cộng vào căn cứ', () => {
  const thpt = method('STS', '9046');
  assert.deepEqual(thpt.programIndexes.map(i => school('STS').programs[i].code), ['7140206', '7810301', '7810302']);
  const values = { m1: 8, m2: 8.5, aptitude: 9, bonus: 1.5 };
  const result = calculateSchoolFormula(thpt.calculationRule, values, { area: 'KV1' });
  assert.equal(result.base, 25.5);
  assert.equal(result.priority.adjusted, 0.45);
  assert.equal(result.total, 27.45);
  const hbValues = { ...Object.fromEntries([1, 2].flatMap(i => [10, 11, 12].map(y => [`m${i}_${y}`, i === 1 ? 8 : 8.5]))), aptitude: 9, bonus: 1.5 };
  assert.equal(calculateSchoolFormula(method('STS', '9047').calculationRule, hbValues, { area: 'KV1' }).total, 27.45);
  const combined = method('STS', '9044');
  assert.throws(() => selectSchoolFormulaRule(combined), /chọn đúng/);
  assert.equal(calculateSchoolFormula(selectSchoolFormulaRule(combined, 'thpt-aptitude'), values, { area: 'KV1' }).total, 27.45);
  assert.equal(calculateSchoolFormula(selectSchoolFormulaRule(combined, 'hb-aptitude'), hbValues, { area: 'KV1' }).total, 27.45);
  assert.equal(method('STS', 'official2026-301').status, 'non_numeric');
});

test('Tân Trào dùng đề án tháng 5 và không tự đảo định nghĩa PT405/PT406', () => {
  for (const id of ['7968', '7969', '7970']) {
    const formula = method('TQU', id);
    assert.equal(formula.autoCalculate, true);
    assert.equal(formula.programIndexes.length, 18);
    const codes = formula.programIndexes.map(i => school('TQU').programs[i].code);
    assert.ok(codes.includes('7140201'));
    assert.ok(codes.every(code => !['51140201', '7140213', '7140247', '7810302'].includes(code)));
    for (const code of ['7340301', '7310101', '7310104', '7620115']) {
      const program = formula.programIndexes.map(i => school('TQU').programs[i]).find(p => p.code === code);
      assert.deepEqual(program.combination.split('; '), ['A00', 'A01', 'C01', 'C02', 'C03', 'D01', 'D09', 'X01', 'X02', 'X25', 'X26'], 'không mất tổ hợp khi bảng nguồn sang trang kế tiếp');
    }
  }
  assert.match(method('TQU', '7969').label, /trước năm 2026/);
  assert.doesNotMatch(method('TQU', '7969').expression, /điểm xét tốt nghiệp/i);
  const values = Object.fromEntries([1, 2, 3].flatMap(i => [[`m${i}_10`, 6], [`m${i}_11`, 8], [`m${i}_12`, 10]]));
  assert.equal(calculateSchoolFormula(method('TQU', '7970').calculationRule, values, { area: 'KV1' }).total, 24.6);
  for (const id of ['official2026-405', 'official2026-406']) {
    const formula = method('TQU', id);
    assert.equal(formula.status, 'requires_review');
    assert.equal(formula.autoCalculate, false);
    assert.deepEqual(formula.programIndexes.map(i => school('TQU').programs[i].code), ['7810302']);
    assert.match(formula.conditions.join(' '), /mô tả ngay dưới/);
  }
});

test('Kỹ thuật Công nghệ Huế giữ bước quy đổi và Tokyo giữ bảng riêng thay vì phép chia suy đoán', () => {
  const thpt = method('DHE', '8379');
  assert.match(thpt.expression, /ĐC/);
  assert.throws(() => selectSchoolFormulaRule(thpt), /chọn đúng/);
  assert.equal(calculateSchoolFormula(selectSchoolFormulaRule(thpt, 'thpt-no-bonus'), { m1: 9, m2: 9, m3: 8 }, { area: 'KV1' }).total, 26.4);
  for (const id of ['8380', '8381', '8382']) {
    const formula = method('DHE', id);
    assert.equal(formula.autoCalculate, false);
    assert.match(formula.expression, /quy đổi tương đương/);
    assert.match(formula.conversion, /NGƯỠNG\/ĐIỂM TRÚNG TUYỂN/);
    assert.ok(formula.evidence.additionalUrls.some(url => /PHU_LUC_2/.test(url)));
  }
  assert.match(method('DHE', '8380').expression, /làm tròn 1 chữ số/);
  assert.equal(method('THU', '8929').status, 'requires_review');
  for (const id of ['8928', '8929', '8930', '8931']) assert.equal(method('THU', id).autoCalculate, false);
  assert.match(method('THU', '8930').expression, /Bảng 2/);
  assert.match(method('THU', '8931').expression, /cột tổ hợp tương ứng/);
});

test('Kỹ thuật Y tế Hải Dương nhân đôi Toán trước quy thang 30 và giảm ưu tiên', () => {
  const formula = method('DKY', '8306');
  assert.equal(formula.autoCalculate, true);
  assert.equal(formula.programIndexes.length, 5);
  const result = calculateSchoolFormula(formula.calculationRule, { math: 9, m2: 8, m3: 8 }, { area: 'KV1' });
  assert.equal(result.base, 25.5);
  assert.equal(result.priority.adjusted, 0.45);
  assert.equal(result.total, 25.95);
  assert.equal(calculateSchoolFormula(formula.calculationRule, { math: 10, m2: 0, m3: 0 }).base, 15);
  assert.equal(method('DKY', '8307').autoCalculate, false, 'học bạ cần quy đổi sau tổng có trọng số');
  assert.match(method('DKY', '8307').conditions.join(' '), /sáu học kỳ/);
});

test('Hải Dương quy đổi ba kỳ thi theo đúng mốc, rồi mới cộng điểm và ưu tiên', () => {
  for (const [id, xs, ys] of [
    ['8308', [591, 738, 840, 922, 966, 1200], [18, 22, 24, 26, 27, 30]],
    ['8309', [43, 51, 55, 62, 66, 100], [18, 22, 24, 26, 27, 30]],
    ['8310', [63, 77, 88, 100, 107, 150], [18, 22, 24, 26, 27, 30]],
  ]) {
    const formula = method('DKY', id);
    assert.equal(formula.autoCalculate, true);
    const rule = formula.calculationRule;
    xs.forEach((exam, i) => assert.equal(calculateSchoolFormula(rule, { exam }).base, ys[i]));
    assert.equal(calculateSchoolFormula(rule, { exam: xs[2] }, { area: 'KV1' }).total, 24.6);
    const withBonus = calculateSchoolFormula(rule, { exam: xs[2], bonus: 1.5 }, { area: 'KV1' });
    assert.equal(withBonus.total, 25.95, 'ưu tiên sau chuyển thang và sau điểm cộng');
    assert.equal(calculateSchoolFormula(rule, { exam: xs.at(-1) }, { area: 'KV1', priorityGroup: 'UT1' }).priority.adjusted, 0);
    assert.throws(() => calculateSchoolFormula(rule, { exam: xs[0] - 1 }), /ngoài các khoảng/);
  }
  assert.throws(() => calculateSchoolFormula(method('DKY', '8308').calculationRule, { exam: 600.5 }), /số nguyên/);
  assert.equal(calculateSchoolFormula(method('DKY', '8309').calculationRule, { exam: 43.5 }).base, 18.25);
});

test('Hà Tĩnh tách M00 với M01/M09, không cho ngành văn hóa dùng điểm năng khiếu', () => {
  const preschool = school('HHT').programs.find(p => p.code === '7140201');
  const it = school('HHT').programs.find(p => p.code === '7480201');
  const formula = method('HHT', '8829');
  assert.deepEqual(schoolFormulaBranches(formula, it).map(b => b.id), ['hb-cultural']);
  assert.deepEqual(schoolFormulaBranches(formula, preschool).map(b => b.id), ['hb-preschool', 'hb-preschool-two-aptitudes']);
  assert.throws(() => selectSchoolFormulaRule(formula, 'hb-preschool', it), /chọn đúng/);
  assert.throws(() => selectSchoolFormulaRule(formula, 'hb-cultural', preschool), /chọn đúng/);
  const m00 = selectSchoolFormulaRule(formula, 'hb-preschool', preschool);
  assert.equal(m00.inputs.length, 7);
  const values = { m1_10: 6, m1_11: 8, m1_12: 10, m2_10: 6, m2_11: 8, m2_12: 10, aptitude: 8, bonus: 1.5 };
  assert.equal(calculateSchoolFormula(m00, values, { area: 'KV1' }).total, 25.95);
  const m01 = selectSchoolFormulaRule(formula, 'hb-preschool-two-aptitudes', preschool);
  assert.equal(m01.inputs.length, 5);
  assert.equal(calculateSchoolFormula(m01, { m1_10: 6, m1_11: 8, m1_12: 10, aptitude1: 7, aptitude2: 9 }, { area: 'KV1' }).total, 24.6);
  const thpt = selectSchoolFormulaRule(method('HHT', '8828'), 'thpt-preschool-two-aptitudes', preschool);
  assert.equal(calculateSchoolFormula(thpt, { m1: 8, aptitude1: 7, aptitude2: 9 }, { area: 'KV1' }).total, 24.6);
});

test('Hòa Bình giới hạn bộ tính văn hóa, yêu cầu chọn nhánh học bạ đủ ba năm', () => {
  for (const id of ['8546', '8547']) {
    const formula = method('ETU', id);
    assert.equal(formula.autoCalculate, true);
    assert.equal(formula.programIndexes.length, 20);
    assert.ok(formula.programIndexes.every(i => !['7210403', '7580108'].includes(school('ETU').programs[i].code)));
  }
  const hb = method('ETU', '8547');
  assert.throws(() => selectSchoolFormulaRule(hb), /chọn đúng/);
  const rule = selectSchoolFormulaRule(hb, 'hb-three-subjects');
  const values = Object.fromEntries([1, 2, 3].flatMap(i => [[`m${i}_10`, 6], [`m${i}_11`, 8], [`m${i}_12`, 10]]));
  assert.equal(calculateSchoolFormula(rule, values, { area: 'KV1' }).total, 24.6);
  assert.equal(method('ETU', '8549').autoCalculate, false);
  assert.deepEqual(method('ETU', '8549').programIndexes.map(i => school('ETU').programs[i].code), ['7210403', '7580108']);
});

test('Không suy phép chia điểm hoặc xét độc lập từ mô tả phương thức kết hợp', () => {
  for (const [code, id] of [['MIT', '9168'], ['GDU', '8554'], ['DKC', '7906']]) {
    const formula = method(code, id);
    assert.equal(formula.autoCalculate, false);
    assert.match(formula.expression, /6 học kỳ|sáu học kỳ/);
  }
  assert.match(method('GDU', '8553').scale, /40/);
  assert.equal(method('GDU', '8553').autoCalculate, false);
  for (const id of ['9151', '9152', '9153', '9154', '9155']) {
    assert.match(method('DVL', id).expression, /kết hợp học bạ/);
    assert.equal(method('DVL', id).autoCalculate, false);
  }
  assert.equal(method('NLS', '9221').autoCalculate, false);
  assert.match(method('NLS', '9221').expression, /x là điểm trúng tuyển THPT/);
  assert.match(method('NLS', '9221').priority, /làm tròn số nguyên/);
  assert.equal(method('UMT', '9361').autoCalculate, false);
  assert.match(method('UMT', '9361').conversion, /ngưỡng thấp nhất/);
});

test('Văn bản còn mâu thuẫn hoặc chưa ban hành không được mở bộ tính cuối', () => {
  for (const [code, id] of [['BVU', '9373'], ['HVD', '8183'], ['HVD', '8184'], ['MTU', '8639'], ['DKC', '7908']]) {
    assert.equal(method(code, id).status, 'requires_review');
    assert.equal(method(code, id).autoCalculate, false);
  }
  assert.match(method('HVD', '8184').expression, /M1 cả năm lớp 10 \+ M2 cả năm lớp 11 \+ M3 cả năm lớp 12/);
  assert.equal(method('DPQ', '9095').autoCalculate, false);
  assert.deepEqual(method('DPQ', '9095').programIndexes.map(i => school('DPQ').programs[i].code), ['51140201']);
  assert.equal(method('BVU', '9372').autoCalculate, false);
  assert.match(method('BVU', '9372').conditions.join(' '), /trống số\/ngày/);
});

test('Mở TP.HCM dùng đúng bảng V-ACT đóng hai đầu, không ngoại suy hoặc gộp Đồng Nai', () => {
  const formula = method('MBS', '8982');
  assert.equal(formula.autoCalculate, true);
  assert.equal(formula.programIndexes.length, 67);
  assert.ok(formula.programIndexes.every(i => !school('MBS').programs[i].code.endsWith('D')));
  assert.match(formula.evidence.url, /quy-tac-quy-doi/);
  const rule = formula.calculationRule;
  assert.equal(rule.inputs[0].ranges.length, 13);
  for (const [x,y] of [[27,6.7],[475,15.2],[476,15.25],[817,21.67],[818,21.75],[884,23],[885,23.1],[1003,25.25],[1004,25.5],[1139,28.5]]) {
    assert.equal(calculateSchoolFormula(rule,{vact:x}).base,y, `mốc ${x}`);
  }
  assert.equal(calculateSchoolFormula(rule,{vact:1004},{area:'KV1'}).total,25.95);
  assert.equal(calculateSchoolFormula(rule,{vact:818},{area:'KV1'}).total,22.5);
  assert.throws(()=>calculateSchoolFormula(rule,{vact:26}),/ngoài các khoảng/);
  assert.throws(()=>calculateSchoolFormula(rule,{vact:1140}),/ngoài các khoảng/);
  assert.throws(()=>calculateSchoolFormula(rule,{vact:880.5}),/số nguyên/);
  assert.equal(calculateSchoolFormula(method('MBS','8980').calculationRule,{m1:9,m2:9,m3:8},{area:'KV1'}).total,26.4);
  assert.equal(method('MBS','8983').autoCalculate,false,'bảng SAT chưa bao phủ IB/A-Level và SAT=1100');
  assert.equal(method('MBS','8981').autoCalculate,false,'không tính từ tổng học bạ thô trước quy đổi từng môn');
  assert.match(method('MBS','8981').evidence.url,/hoc-ba-va-diem-sat/);
});

test('Tôn Đức Thắng giữ thang 1200 và mức ưu tiên, không dùng thang 100 của phương thức khác', () => {
  const formula = method('DTT','8023');
  assert.equal(formula.autoCalculate,true);
  assert.equal(formula.calculationRule.maxScore,1200);
  assert.equal(calculateSchoolFormula(formula.calculationRule,{vact:900},{area:'KV1'}).total,930);
  assert.equal(calculateSchoolFormula(formula.calculationRule,{vact:1050},{area:'KV1',priorityGroup:'UT1'}).total,1105);
  assert.equal(calculateSchoolFormula(formula.calculationRule,{vact:1200},{area:'KV1',priorityGroup:'UT1'}).priority.adjusted,0);
  assert.match(method('DTT','9455').expression,/0,75[\s\S]*1.5 LKQT[\s\S]*0,50/);
  assert.match(method('DTT','9457').conditions.join(' '),/Không có phương thức học bạ độc lập/);
  assert.equal(method('DTT','9457').autoCalculate,false);
});

test('UIT chọn điểm thành phần cao nhất và NTT không nhầm học lực với điểm xét tuyển cuối', () => {
  const uit = method('QSC','8079');
  assert.match(uit.expression,/0,475[\s\S]*0,475[\s\S]*0,05/);
  assert.match(uit.expression,/max\(THPT_ĐT, THPT_QĐ, THPT_QT\)/);
  assert.match(uit.expression,/max\(ĐGNL_ĐT, ĐGNL_QĐ, ĐGNL_QT\)/);
  assert.equal(uit.autoCalculate,false);
  assert.equal(method('NTT','7910').autoCalculate,false);
  assert.match(method('NTT','7910').conditions.join(' '),/chưa phải công thức điểm xét tuyển cuối/);
  assert.equal(method('NTT','7912').status,'source_description');
  assert.equal(method('NTT','7913').autoCalculate,false);
});

test('khoảng đóng không được chồng nhau hoặc dùng cờ biên sai kiểu; khoảng mở cũ giữ nguyên', () => {
  const field = {min:0,max:30,ranges:[{min:0,max:10,minOutput:0,maxOutput:10},{min:10,max:30,minOutput:10,maxOutput:30}]};
  assert.equal(validSchoolFormulaRanges(field,30),true);
  assert.equal(validateSchoolFormulaValue(10,field).valid,true);
  field.ranges[1].inclusiveMin = true;
  assert.equal(validSchoolFormulaRanges(field,30),false,'10 thuộc hai khoảng');
  field.ranges[1].min = 11;
  assert.equal(validSchoolFormulaRanges(field,30),true);
  assert.equal(validateSchoolFormulaValue(11,field).valid,true);
  assert.equal(validateSchoolFormulaValue(10.5,field).valid,false,'không nội suy khoảng trống');
  field.ranges[1].inclusiveMin = 'true';
  assert.equal(validSchoolFormulaRanges(field,30),false);
});

test('học bạ HUNRE/HUBT dùng ba năm; nhánh thiếu phép tính cuối CMC/PVU vẫn không tự tính', () => {
  const values = Object.fromEntries([1,2,3].flatMap(i=>[[`m${i}_10`,6],[`m${i}_11`,9],[`m${i}_12`,9]]));
  assert.equal(calculateSchoolFormula(method('DMT','8729').calculationRule,{...values,bonus:1.5},{area:'KV1'}).total,25.95);
  assert.equal(calculateSchoolFormula(method('DQK','8349').calculationRule,values,{area:'KV1'}).total,24.6);
  assert.equal(method('DQK','8350').programIndexes.length,3);
  assert.equal(method('DQK','8347').autoCalculate,false,'không tự thêm ưu tiên vào biểu thức còn thiếu bước xác nhận');
  assert.equal(method('CMC','8353').status,'requires_review');
  assert.equal(method('CMC','8352').autoCalculate,false);
  assert.match(method('CMC','8352').priority,/không cộng ưu tiên/);
  for (const id of ['9413','9414','9415','9416']) {
    assert.equal(method('PVU',id).autoCalculate,false);
    assert.match(method('PVU',id).priority,/chưa nêu đủ bước ưu tiên/);
  }
});

test('catalog công thức rà soát mọi hồ sơ, không biến mô tả hay nguồn thiếu thành công thức tự tính', () => {
  const index = createSchoolFormulaCatalogIndex(catalog, { universities, majors });
  assert.equal(index.size, universities.length);
  assert.equal(catalog.summary.methods, catalog.schools.reduce((n, s) => n + s.methods.length, 0));
  assert.ok(catalog.schools.flatMap((s) => s.methods).every((m) => m.year === 2026));
  for (const s of catalog.schools) for (const m of s.methods) {
    if (m.autoCalculate) {
      assert.equal(m.status, 'official_verified');
      assert.equal(m.evidence.kind, 'official_primary');
      const rules = [m.calculationRule, ...(m.calculationBranches || []).map((b) => b.rule)].filter(Boolean);
      assert.ok(rules.length);
      for (const rule of rules) assert.equal(rule.type, 'weighted_sum');
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

test('Tài chính bắt buộc chọn nhóm và dùng đúng thành phần của mỗi nhóm kết hợp', () => {
  const formula = method('HTC', '8321');
  assert.equal(formula.autoCalculate, true);
  assert.equal(formula.calculationRule, null);
  assert.equal(schoolFormulaBranches(formula).length, 3);
  assert.throws(() => selectSchoolFormulaRule(formula), /chọn đúng nhóm/);
  assert.throws(() => selectSchoolFormulaRule(formula, 'unverified'), /chọn đúng nhóm/);
  const group1 = selectSchoolFormulaRule(formula, 'group-1');
  assert.equal(calculateSchoolFormula(group1, { math: 8, best: 8.5, achievement: 9.5 }, { area: 'KV1' }).total, 26.4);
  const group2 = selectSchoolFormulaRule(formula, 'group-2');
  assert.match(group2.inputs.find((f) => f.key === 'best').label, /TBC tổ hợp 3 môn/);
  assert.equal(calculateSchoolFormula(group2, { math: 9, best: 8, achievement: 9.5 }).total, 26.5);
  assert.throws(() => calculateSchoolFormula(group2, { math: 9, best: 8, achievement: 9.6 }), /bảng quy đổi/);
  const group3 = selectSchoolFormulaRule(formula, 'group-3');
  assert.equal(calculateSchoolFormula(group3, { math: 9, best: 8, exam: 8.5 }).total, 25.5);
  assert.throws(() => calculateSchoolFormula(group3, { math: 9, best: 8, achievement: 9.5 }), /Vui lòng nhập điểm/);
});

test('nhánh giới hạn ngành chỉ được chọn trong đúng mã ngành hoặc mã chương trình', () => {
  const rule = method('HTC', '8320').calculationRule;
  const formula = { calculationBranches: [{ id: 'one', label: 'Ngành riêng', programCodes: ['IT1'], rule }] };
  assert.equal(schoolFormulaBranches(formula).length, 0);
  assert.equal(schoolFormulaBranches(formula, { code: 'IT1', nationalMajorCode: '7480201' }).length, 1);
  assert.throws(() => selectSchoolFormulaRule(formula, 'one', { code: 'OTHER', nationalMajorCode: '7480201' }), /chọn đúng nhóm/);
  assert.equal(selectSchoolFormulaRule(formula, 'one', { code: 'IT1', nationalMajorCode: '7480201' }), rule);
  const fixture = { ...catalog, schools: [structuredClone(school('HTC'))] };
  const options = { universities: universities.filter((s) => s.code === 'HTC'), majors };
  for (const branches of [false, [null], [{ id: 'empty', label: 'Thiếu quy tắc' }], [{ id: 'outside', label: 'Sai ngành', programCodes: ['9999999'], rule }], [formula.calculationBranches[0], formula.calculationBranches[0]]]) {
    fixture.schools[0].methods.find((m) => m.id === 'school-htc-8321').calculationBranches = branches;
    assert.throws(() => createSchoolFormulaCatalogIndex(fixture, options), /Nhánh công thức sai phạm vi/);
  }
});

test('học bạ đủ 3 năm, kết hợp có trọng số và trường không cộng ưu tiên được giữ riêng', () => {
  const hb = method('HPN', '8199').calculationRule;
  const values = Object.fromEntries(hb.inputs.map((f) => [f.key, f.key.endsWith('_10') ? 6 : f.key.endsWith('_11') ? 8 : 10]));
  assert.equal(calculateSchoolFormula(hb, values, { area: 'KV1' }).total, 24.6);
  assert.equal(calculateSchoolFormula(method('DDN', '8249').calculationRule, values, { area: 'KV1', priorityGroup: 'UT1' }).total, 24);
  const combined = method('DDM', '8853').calculationRule;
  const mixed = Object.fromEntries(combined.inputs.map((f) => [f.key, f.key === 'exam' ? 9 : 8]));
  assert.equal(calculateSchoolFormula(combined, mixed, { area: 'KV1' }).total, 25.5);
  assert.throws(() => calculateSchoolFormula(combined, { ...mixed, bonus: 1.51 }), /0 đến 1.5/);
  assert.equal(method('INU', '9349').autoCalculate, false, 'Không đoán ưu tiên học bạ từ biểu thức không ghi rõ');
  assert.equal(method('DHE', '8380').autoCalculate, false, 'Không bỏ bước làm tròn TBC từng môn');
  assert.equal(method('DPT', '9365').autoCalculate, false, 'Không mặc định V-ACT / 40');
});

test('CCM dùng nguồn của đúng trường và giữ bốn nhánh thi/học bạ kết hợp năng khiếu', () => {
  assert.equal(universities.find((s) => s.code === 'CCM').website, 'https://hict.edu.vn');
  const formula = method('CCM', '9238');
  assert.match(formula.evidence.url, /hict\.edu\.vn/);
  assert.equal(schoolFormulaBranches(formula).length, 4);
  assert.equal(formula.programIndexes.length, 2);
  assert.equal(calculateSchoolFormula(selectSchoolFormulaRule(formula, 'thpt-h00'), { literature: 8, drawing: 9, color: 9 }, { area: 'KV1' }).total, 26.4);
  const hb = selectSchoolFormulaRule(formula, 'transcript-one-aptitude');
  const values = Object.fromEntries(hb.inputs.map((f) => [f.key, f.key === 'drawing' ? 9 : 8]));
  assert.equal(calculateSchoolFormula(hb, values, { area: 'KV1' }).total, 25.5);
  const info = universities.find((s) => s.code === 'CCM').admissions.information2026;
  assert.ok(info.documents.every((d) => new URL(d.url).hostname.endsWith('hict.edu.vn')));
});

test('trích nguồn chính thức giữ biến X, không lấy phương thức khác, năm cũ hoặc tài liệu khác cơ sở', () => {
  assert.deepEqual(scoreEquations('ĐXT = ĐTHPT × X + ĐHB × Y'), ['ĐXT = ĐTHPT × X + ĐHB × Y']);
  const sections = officialFormulaSections('Phương thức 1: Xét tuyển dựa vào điểm thi THPT năm 2026\nĐXT = M1 + M2 + M3 + ĐƯT\nPhương thức 2: Xét tuyển kết hợp chứng chỉ\nĐXT = SAT + chứng chỉ\nPhương thức 3: Xét tuyển học bạ năm 2025\nĐXT = Điểm năm cũ');
  assert.deepEqual(sections.map(s => s.kind), ['thpt', 'certificate']);
  assert.equal(sections[0].kind, 'thpt');
  assert.deepEqual(sections[0].equations, ['ĐXT = M1 + M2 + M3 + ĐƯT']);
  assert.deepEqual(sections[1].equations, ['ĐXT = SAT + chứng chỉ']);
  assert.equal(officialFormulaSections('Phương thức 1: Xét tuyển học bạ năm 2026\nĐXT = TBC1 + TBC2 + đi ểm').length, 0);
  const profile = { code: 'HCP', name: 'Học viện Chính sách và Phát triển' };
  assert.equal(officialFormulaDocument({ url: 'https://apd.edu.vn/phan-hieu/2026', title: 'Phân hiệu Đà Nẵng 2026' }, profile), false);
  assert.equal(officialFormulaDocument({ url: 'http://example.edu.vn/2026', title: 'Thông tin tuyển sinh 2026' }, profile), false);
  assert.equal(officialFormulaDocument({ url: 'https://example.edu.vn/2026', title: 'Thông báo xét tuyển đợt 2 năm 2026' }, profile), false);
  assert.equal(officialFormulaDocument({ url: 'https://htu.edu.vn/2026', title: 'Tuyển sinh 2026' }, { code: 'CCM', name: 'Công nghiệp Dệt may Hà Nội' }), false);
  assert.equal(officialFormulaDocument({ url: 'https://hict.edu.vn/2026', title: 'Tuyển sinh 2026' }, { code: 'CCM', name: 'Công nghiệp Dệt may Hà Nội' }), true);
  assert.equal(officialFormulaDocument({ url: 'https://apd.edu.vn/Thong-tu-Quy-che-tuyen-sinh-dai-hoc-2026.pdf', title: 'Tài liệu tuyển sinh 2026' }, profile), false, 'Quy chế chung không phải công thức riêng của Học viện');
  const boundaries = officialFormulaSections('1. Xét tuyển kết quả thi THPT 2026\nĐXT = M1 + M2 + M3\n2. Xét tuyển học bạ\nĐXT = H1 + H2 + H3\n3. Xét tuyển tổng hợp\nĐXT = THPT + HSA\n4. Phương th ức 4: Xét tuyển kết hợp năng khi ếu và thi THPT\nĐXT = Toán + Văn + Vẽ');
  assert.deepEqual(boundaries.map(s => s.equations[0]), ['ĐXT = M1 + M2 + M3', 'ĐXT = H1 + H2 + H3', 'ĐXT = Toán + Văn + Vẽ']);
  assert.equal(boundaries[2].kind, 'aptitude+thpt');
  const wrapped = officialFormulaSections('2.4. Phương thức 4: Xét tuyển kết hợp điểm thi THPT\nvới năng khiếu hoặc học bạ năm 2026\nĐXT = M1 + M2 + Vẽ\n3. Nguyên tắc xét tuyển\nĐXT = HSA + ĐƯT');
  assert.equal(wrapped[0].kind, 'aptitude+thpt+transcript');
  assert.deepEqual(wrapped[0].equations, ['ĐXT = M1 + M2 + Vẽ']);
  assert.equal(officialFormulaSections('2.5. Phương thức 5: Xét tuyển TSA\nChưa có biểu thức.\n3. Nguyên tắc xét tuyển\nĐXT = M1 + M2 + M3').length, 0);
  assert.equal(officialFormulaSections('1. Phương thức 1: Xét tuyển THPT\nĐXT = M1 + M2 + Điểm thi').length, 0);
});

test('nguồn mới giữ xét điều kiện HVN, hệ số lớp 12 DTN và thang HSA SKV', () => {
  for (const id of ['8335', '9466', '9467']) {
    const entry = method('HVN', id);
    assert.equal(entry.status, 'non_numeric');
    assert.equal(entry.autoCalculate, false);
    assert.match(entry.expression, /xếp theo mức thành tích/);
    assert.match(entry.conversion, /trùng mốc 30/);
  }
  assert.match(method('DTN', '8385').expression, /2 × Mi cả năm lớp 12\) \/ 4/);
  assert.equal(method('DTN', '8385').autoCalculate, false, 'Điểm cuối còn cần nội suy, không dùng điểm học bạ gốc');
  assert.equal(calculateSchoolFormula(method('SKV', '9193').calculationRule, { hsa: 130 }, { area: 'KV1' }).total, 26.4);
  assert.match(method('SKV', '9192').expression, /làm tròn 1 chữ số thập phân trước khi nhân/);
  const ccm = publicSchoolFormulas(school('CCM'), catalog.checkedAt);
  for (const id of ['8186', '8187']) {
    const formula = ccm.methods.find(m => m.id === `school-ccm-${id}`);
    assert.ok(formula.programs.filter(p => ['7210403', '7210404'].includes(p.nationalMajorCode)).every(p => p.combination === 'D01'));
  }
  for (const id of ['8928', '8929']) assert.equal(method('THU', id).autoCalculate, false, 'Không tự quyết định bước ưu tiên khi thông báo chưa rõ');
  assert.equal(method('DTQ', '8946').status, 'requires_review');
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

test('UEH quy đổi đúng bảng 2026, làm tròn trước trọng số và ưu tiên theo thang 100', () => {
  const vact = method('KSA', '8818').calculationRule;
  assert.equal(calculateSchoolFormula(vact, { exam: 950, average: '8,6', bonus: 5 }).total, 90.5, '950 V-ACT → 25,55 trước khi nhân trọng số');
  assert.equal(calculateSchoolFormula(vact, { exam: 950, average: 8.6, bonus: 5 }, { area: 'KV1' }).total, 91.45);
  for (const [exam, expected] of [[945, 85], [980, 88.56], [1200, 94.4]]) assert.equal(calculateSchoolFormula(vact, { exam, average: 8.6 }).total, expected);
  assert.throws(() => calculateSchoolFormula(vact, { exam: 450, average: 8.6 }), /ngoài các khoảng/);
  assert.throws(() => calculateSchoolFormula(vact, { exam: 1201, average: 8.6 }), /450 đến 1200/);
  assert.equal(calculateSchoolFormula(vact, { exam: 1200, average: 10, bonus: 10 }, { area: 'KV1', priorityGroup: 'UT1' }).total, 100);
  const vsat = method('KSV', '9509').calculationRule;
  assert.equal(calculateSchoolFormula(vsat, { exam: 392.5, average: 8.6 }).total, 87.4);
  assert.throws(() => calculateSchoolFormula(vsat, { exam: 31.5, average: 8.6 }), /ngoài các khoảng/);
  assert.equal(calculateSchoolFormula(method('KSA', '9504').calculationRule, { exam: 26, average: 8.6 }).total, 86.4);
});

test('bảng nội suy sai hoặc chồng khoảng bị từ chối; khoảng trống không được ngoại suy', () => {
  const original = method('KSA', '8818').calculationRule;
  for (const ranges of [false, [], [null], [{ min: 0, max: 100, minOutput: 15, maxOutput: 30 }], [...original.inputs[0].ranges, original.inputs[0].ranges[0]]]) {
    const rule = structuredClone(original);
    rule.inputs[0].ranges = ranges;
    assert.throws(() => calculateSchoolFormula(rule, { exam: 950, average: 8 }), /Cấu hình ô nhập/);
    const fixture = { ...catalog, schools: [structuredClone(school('KSA'))] };
    fixture.schools[0].methods.find((m) => m.id === 'school-ksa-8818').calculationRule = rule;
    assert.throws(() => createSchoolFormulaCatalogIndex(fixture, { universities: universities.filter((s) => s.code === 'KSA'), majors }), /Cấu hình bộ tính/);
  }
  const rule = { type: 'weighted_sum', maxScore: 30, divisor: 1, inputs: [{ key: 'score', label: 'Điểm', min: 0, max: 30, weight: 1, ranges: [{ min: 0, max: 10, minOutput: 0, maxOutput: 10 }, { min: 20, max: 30, minOutput: 20, maxOutput: 30 }] }] };
  assert.throws(() => calculateSchoolFormula(rule, { score: 15 }), /ngoài các khoảng/);
  assert.equal(validateSchoolFormulaValue(8, { min: 0, max: 10, ranges: [null] }).valid, false);
});

test('Ngoại thương giữ sửa đổi tháng 7 và đúng phạm vi chương trình từng phương thức', () => {
  for (const [code, id] of [['NTH', '8134'], ['NTH', '8137'], ['NTS', '9405']]) {
    const m = method(code, id);
    assert.equal(m.status, 'official_verified');
    assert.ok(m.expression.split('\n').every((line) => line.endsWith('+ 1,00')));
    assert.doesNotMatch(m.expression, /\+ 1,00 \+ 1,00/);
  }
  assert.match(method('NTH', '9402').conversion, /1550–1570 → 19,90; 1580–1600 → 20/);
  const nts = publicSchoolFormulas(school('NTS'), catalog.checkedAt);
  const combined = nts.methods.find((m) => m.id === 'school-nts-9408');
  assert.match(combined.label, /HSA \/ V-ACT/);
  assert.equal(combined.programCount, 5);
  assert.ok(combined.programs.every((p) => ['NTSKT01_CLC', 'NTSKT02', 'NTSMT04', 'NTSQT03_CLC', 'NTSTC05_CLC'].includes(p.nationalMajorCode)));
  assert.ok(combined.programs.every((p) => /CT CLC|CT ĐHNNQT/.test(p.name)));
  assert.match(method('NTS', '9410').label, /Học bạ/);
  assert.equal(method('NTS', '9407').autoCalculate, false, 'Không mở TSA cho các chương trình không có phạm vi');
});

test('UEL phân biệt chương trình trong trường với liên kết quốc tế, xét thẳng không dùng tổng điểm', () => {
  assert.match(method('QSK', '8675').expression, /0,90 × Y \+ 0,10 × Z/);
  assert.doesNotMatch(method('QSK', '8675').expression, /0,50/);
  const direct = publicSchoolFormulas(school('QSK'), catalog.checkedAt).methods.find((m) => m.id === 'school-qsk-8676');
  assert.equal(direct.status, 'non_numeric');
  assert.equal(direct.programCount, 38, 'Không lấy 76 dòng của hai phương thức trộn chung');
  assert.equal(direct.autoCalculate, false);
  assert.match(direct.label, /Xét tuyển thẳng/);
  assert.doesNotMatch(method('HCP', '8723').expression, /TSA/);
  assert.doesNotMatch(method('HCP', '8725').expression, /HSA/);
  assert.doesNotMatch(method('SKV', '9193').expression, /Sư phạm/);
  assert.doesNotMatch(method('SKV', '9194').expression, /150/);
});

test('PTIT giữ bảng riêng Bắc/Nam; NHH nhân môn chính và tránh cộng chứng chỉ hai lần', () => {
  assert.equal(calculateSchoolFormula(method('BVH', '8771').calculationRule, { m1: 9, m2: 9, m3: 8 }, { area: 'KV1' }).total, 26.4);
  assert.match(method('BVH', '8774').conversion, /20\.23–26\.8 ↔ THPT 20–22\.5/);
  assert.match(method('BVS', '8057').conversion, /19\.03–26\.8 ↔ THPT 16\.5–22\.5/);
  assert.match(method('BVH', '8772').conversion, /56\.8–80\.5/);
  assert.match(method('BVS', '9118').conversion, /59\.53–80\.5/);
  assert.equal(calculateSchoolFormula(method('NHH', '8561').calculationRule, { m1: 9, m2: 9, m3: 8, bonus: 1 }, { area: 'KV1' }).total, 27.53);
  for (const id of ['8566', '8567', '8568']) {
    assert.equal(method('NHH', id).status, 'official_verified');
    assert.equal(method('NHH', id).autoCalculate, false, 'Chưa có đủ bảng tương đương để nhập điểm gốc');
  }
  assert.ok(method('NHH', '8566').conditions.some((c) => c.includes('không được cộng khuyến khích lần nữa')));
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
