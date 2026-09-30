import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describeScoring, formulaKind, formulaScale, nonNumericExpression, scoreEquations, scoringDefinitions } from './lib/school-formulas.mjs';
import { createSchoolFormulaCatalogIndex } from '../lib/schoolFormulaCatalog.js';

const load = async (path) => JSON.parse(await fs.readFile(path, 'utf8'));
const [research, raw, universities, majors, verified] = await Promise.all([
  load('data/research/admission-methods-2026.json'), load('tmp/admissions-plans-2026/raw-plans.json'),
  load('data/universities.json'), load('data/majors.json'), load('data/admission-formulas-2026.json'),
]);
const overrides = await load('data/research/school-formulas-2026-overrides.json');
const universityByCode = new Map(universities.map((s) => [s.code, s]));
const pageByCode = new Map(raw.pages.map((p) => [p.code, p]));
const verifiedByCode = new Map(verified.schools.map((s) => [s.schoolCode, s.methods]));
const normalize = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
const schools = research.schools.map((school) => {
  const university = universityByCode.get(school.code);
  const rows = majors.filter((m) => m.universityId === university.id);
  const page = pageByCode.get(school.sourceSchoolCode);
  const equivalentMethods = new Map();
  const methods = school.methods.map((method) => {
    const original = page?.methods.find((m) => m.id === method.id);
    const override = overrides.methods[`${school.code}:${method.id}`] || {};
    const label = override.label || method.label;
    const text = [original?.details?.object, original?.details?.regulations, original?.details?.condition, original?.details?.quality, original?.details?.other_infomation, ...method.requirements].filter(Boolean).join('\n');
    const equations = override.equations || scoreEquations(text);
    const nonNumeric = formulaKind(label) === 'eligibility' || !equations.length ? nonNumericExpression(label) : '';
    const kind = formulaKind(label);
    const description = describeScoring(text, kind);
    const primary = school.sources.find((s) => s.url === method.sourceUrl && ['primary', 'official'].includes(s.type));
    const programSources = method.programs.filter((p) => (!override.programCodes || override.programCodes.includes(p.code)) && (!override.programVariants || override.programVariants.includes(p.methodVariant)));
    const programs = [...new Map(programSources.map((p) => [`${p.displayCode || p.code}|${p.name}|${p.group}|${p.combinations}|${p.note}`, p])).values()].map((p, i) => ({
      id: `catalog:${school.code}:${method.id}:${i}`, code: p.displayCode || p.code || '', nationalMajorCode: p.code || '',
      name: p.name, group: p.group || '', combination: p.combinations || '', note: p.note || '', method: label,
    }));
    for (const program of programs) {
      const rowId = override.verifiedProgramRows?.[program.code];
      if (!rowId) continue;
      const row = rows.find((m) => m.id === rowId && m.calculationVerified === true);
      const covered = (verifiedByCode.get(school.code) || []).some((m) => m.repositoryMethods.includes(row?.method) && m.applicability?.majorIds?.includes(rowId));
      if (!row || !covered) throw new Error(`Ánh xạ bộ tính chưa xác minh ${school.code}:${program.code}.`);
      program.verifiedRowId = rowId;
      if (override.verifiedMathMainPrograms?.includes(program.code)) program.mathIsMain = true;
      if (override.verifiedProgramCombinations?.[program.code]) program.combination = override.verifiedProgramCombinations[program.code];
    }
    // A shared national code alone does not identify a campus or specialization.
    const candidates = rows.filter((row) => formulaKind(row.method) === kind && programs.some((p) =>
      p.verifiedRowId === row.id || normalize(p.code) === normalize(row.code) && normalize(p.name) === normalize(row.name) ||
      normalize(p.nationalMajorCode) === normalize(row.nationalMajorCode || row.code) && normalize(p.name) === normalize(row.name)));
    const oldOfficial = (verifiedByCode.get(school.code) || []).find((m) =>
      m.repositoryMethods.some((label) => candidates.some((row) => row.method === label)) &&
      (school.methods.filter((x) => formulaKind(x.label) === kind).length === 1));
    const status = method.disputed ? 'conflicting' : !programs.length || /candidate_catalog/.test(method.scopeStatus) ? 'scope_incomplete' :
      override.status || (oldOfficial ? 'official_verified' : nonNumeric ? 'non_numeric' : equations.length ? 'source_reported' : description ? 'source_description' : 'requires_review');
    const expression = override.expression || oldOfficial?.expression || nonNumeric || (equations.length ? equations.join('\n') : description ? `${description}\nNguồn chưa thể hiện đủ phép tính, hệ số hoặc bảng quy đổi để tự tính điểm cuối cùng.` : 'Chưa thu được biểu thức tính điểm đầy đủ năm 2026 từ nguồn; không dùng công thức chung để thay thế.');
    const evidence = override.evidence || (oldOfficial ? { kind: oldOfficial.source.kind, url: oldOfficial.source.url, checkedAt: research.checkedAt, note: oldOfficial.source.evidence } : null) || {
      kind: primary ? 'official_primary' : 'secondary', url: method.sourceUrl,
      checkedAt: research.checkedAt, sectionId: method.sourceSectionId,
      note: equations.length ? 'Biểu thức lấy từ mục cách xét / cách tính điểm của phương thức năm 2026.' : 'Điều kiện và phạm vi áp dụng đã được tra cứu; biểu thức điểm số cần kiểm tra thêm.',
    };
    return {
      id: `school-${school.code.toLowerCase()}-${method.id}`, label, year: 2026, status, kind,
      expression, equations, scale: override.scale || oldOfficial?.scale || (nonNumeric ? 'Không có thang điểm chung' : formulaScale(text)),
      conditions: [...new Set([...(override.conditions || oldOfficial?.conditions || method.requirements), ...(!override.conditions && !nonNumeric ? scoringDefinitions(text) : [])])],
      priority: override.priority || oldOfficial?.priority || 'Ưu tiên, điểm cộng và việc giảm mức cộng phải theo đúng thang điểm, quy chế và đề án của trường; không tự cộng mức đầy đủ.',
      conversion: override.conversion || oldOfficial?.conversion || (/quy đổi/i.test(text) ? 'Phương thức có quy đổi; phải dùng đúng bảng và năm trong đề án, không mặc định quy đổi tuyến tính.' : ''),
      programs, rowIds: candidates.map((m) => m.id),
      repositoryMethods: [...new Set(candidates.map((m) => m.method))],
      calculationRule: override.calculationRule || null, autoCalculate: Boolean(override.calculationRule) && status === 'official_verified',
      existingFormulaId: oldOfficial?.id || '', scopeStatus: method.scopeStatus,
      issues: [...method.issues, ...(method.disputed ? ['Có mâu thuẫn giữa các nguồn; chưa xác nhận biểu thức và phạm vi.'] : []), ...(override.issues || [])],
      evidence,
    };
  });
  for (let i = 0; i < methods.length; i++) {
    const method = methods[i];
    const signature = JSON.stringify([method.label, method.kind, method.status, method.expression, method.conditions, method.scale, method.priority, method.conversion, method.calculationRule, method.existingFormulaId, method.rowIds, method.programs.map(({ id, ...p }) => p)]);
    const previous = equivalentMethods.get(signature);
    if (!previous) { equivalentMethods.set(signature, method); continue; }
    previous.mergedMethodIds = [...(previous.mergedMethodIds || [previous.id]), method.id];
    previous.issues = [...new Set([...previous.issues, ...method.issues])];
    methods.splice(i--, 1);
  }
  const status = school.status;
  // Keep an explicit pending state for schools with no 2026 evidence instead of
  // promoting old repository formulas as if they had just been researched.
  if (!methods.length && !['university_system', 'specialized_or_postgraduate'].includes(status)) {
    for (const label of [...new Set(rows.map((m) => m.method))]) {
      methods.push({ id: `pending-${school.code.toLowerCase()}-${normalize(label)}`, label, year: 2026, status: 'missing_evidence', kind: formulaKind(label),
        expression: 'Chưa xác minh được công thức và phạm vi tuyển sinh năm 2026 của phương thức này.',
        equations: [], scale: '', conditions: [], priority: '', conversion: '', programs: [], rowIds: [], repositoryMethods: [],
        calculationRule: null, autoCalculate: false, existingFormulaId: '', scopeStatus: 'program_scope_missing', issues: school.issues, evidence: null });
    }
  }
  const programMap = new Map();
  const programs = [];
  for (const method of methods) {
    method.programIndexes = method.programs.map((program) => {
      const key = `${program.code}|${program.name}|${program.group}|${program.combination}|${program.note}|${program.verifiedRowId || ''}${program.mathIsMain ? '|math-main' : ''}`;
      if (!programMap.has(key)) {
        programMap.set(key, programs.length);
        const { method: ignoredMethod, ...value } = program;
        programs.push({ ...value, id: `catalog:${school.code}:${createHash('sha256').update(key).digest('hex').slice(0, 20)}` });
      }
      return programMap.get(key);
    });
    delete method.programs;
  }
  return { universityId: university.id, schoolCode: school.code, year: 2026, status, issues: school.issues, programs, methods };
});
const counts = {};
for (const school of schools) for (const method of school.methods) counts[method.status] = (counts[method.status] || 0) + 1;
const dataset = { schemaVersion: 1, year: 2026, checkedAt: research.checkedAt, policy: 'Biểu thức theo nguồn 2026; không suy luận từ tên phương thức. Chỉ bật tự tính cho quy tắc số đã đối chiếu trực tiếp.',
  summary: { schools: schools.length, methods: schools.reduce((n, s) => n + s.methods.length, 0), statuses: counts }, schools };
createSchoolFormulaCatalogIndex(dataset, { universities, majors });
await fs.writeFile('data/school-formula-catalog-2026.json', JSON.stringify(dataset, null, 2) + '\n');
const labels = { official_verified: 'Đã đối chiếu nguồn chính thức', source_reported: 'Có biểu thức / mô tả phép tính theo nguồn; chưa xác minh đủ để tự tính', non_numeric: 'Xét điều kiện / hồ sơ, không có phép cộng chung', source_description: 'Có thông tin phương thức, thiếu biểu thức đầy đủ', requires_review: 'Chưa có đủ công thức', scope_incomplete: 'Phạm vi ngành chưa đủ', missing_evidence: 'Chưa có nguồn 2026', conflicting: 'Nguồn mâu thuẫn' };
const automaticSchools = schools.filter((s) => s.methods.some((m) => m.autoCalculate));
const automaticMethods = automaticSchools.reduce((n, s) => n + s.methods.filter((m) => m.autoCalculate).length, 0);
const lines = ['# Rà soát công thức xét tuyển 2026', '', `Ngày đối chiếu: ${dataset.checkedAt}. Tổng ${schools.length} hồ sơ, ${dataset.summary.methods} mục phương thức.`, '',
  'Một công thức theo từng phương thức; các nhóm ngành, tổ hợp hoặc nhóm thí sinh có hệ số khác nhau được giữ thành nhánh trong cùng phương thức. Danh sách ngành áp dụng được lưu riêng trong catalog.', '',
  `Bổ sung ${automaticMethods} bộ tính ở ${automaticSchools.length} trường: ${automaticSchools.map((s) => s.schoolCode).join(', ')}. Bộ tính THPT Bách khoa đã có vẫn giới hạn ba chương trình IT1, EE2, ET1; đã đối chiếu lại hệ số Toán và tổ hợp K01. Hai mục nguồn trùng hệt biểu thức, điều kiện và phạm vi được gộp, giữ ID đối chiếu nội bộ.`, '',
  '**Đây không phải xác nhận rằng mọi phương thức đã có đủ công thức số.** Biểu thức lấy từ nguồn có thể chỉ là một thành phần hoặc còn cần bảng quy đổi. Không tự suy ra tổng ba môn hoặc điểm gốc / điểm tối đa × 30. Chỉ bật tự tính cho quy tắc đã đối chiếu trực tiếp và có đầu vào an toàn.', '',
  '| Trạng thái | Số phương thức |', '| --- | ---: |', ...Object.entries(counts).map(([status, count]) => `| ${labels[status]} | ${count} |`), '',
  '## Những phần còn cần bổ sung', '', 'Các mục “thiếu biểu thức”, “phạm vi chưa đủ”, “chưa có nguồn” và “mâu thuẫn” bên dưới vẫn chưa hoàn tất. Mục có biểu thức nhưng cần bảng / hệ số cũng chỉ dùng tra cứu. Hồ sơ hệ thống đại học hoặc cơ sở chuyên biệt không tự tạo công thức tuyển sinh đại học.', ''];
for (const school of schools) {
  lines.push(`## ${school.schoolCode} — ${universityByCode.get(school.schoolCode).name}`, '', ...(school.issues || []).map((issue) => `- ${issue}`), '');
  if (!school.methods.length) lines.push('Không có phương thức đại học 2026 được xác nhận cho hồ sơ này.', '');
  for (const method of school.methods) {
    lines.push(`### ${method.label}`, '', `${labels[method.status]}. Ngành / chương trình trong phạm vi: ${method.programIndexes.length}. Tự tính mới: ${method.autoCalculate ? 'có' : 'không'}.`, '', method.expression, '', `Thang: ${method.scale || 'Chưa xác minh'}.`, '',
      ...method.conditions.map((condition) => `- ${condition.replace(/\n/g, ' ')}`), '', `Ưu tiên: ${method.priority || 'Chưa xác minh'}.`, ...(method.conversion ? ['', `Quy đổi: ${method.conversion}`] : []), '',
      ...(method.evidence?.url ? [`[Nguồn đối chiếu](${method.evidence.url}) · ${method.evidence.checkedAt}`, ''] : []), ...(method.issues || []).map((issue) => `- ${issue}`), '');
  }
}
await fs.writeFile('docs/research/ra-soat-cong-thuc-2026.md', lines.join('\n').replace(/[ \t]+$/gm, '').trimEnd() + '\n');
console.log(JSON.stringify(dataset.summary, null, 2));
