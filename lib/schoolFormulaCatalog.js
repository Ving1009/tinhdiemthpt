export function createSchoolFormulaCatalogIndex(dataset, { universities = [], majors = [] } = {}) {
  if (!dataset) return new Map();
  if (dataset.schemaVersion !== 1 || dataset.year !== 2026 || !Array.isArray(dataset.schools)) throw new Error('Catalog công thức 2026 không hợp lệ.');
  const universitiesById = new Map(universities.map((s) => [s.id, s]));
  const majorsById = new Map(majors.map((m) => [m.id, m]));
  const index = new Map();
  const ids = new Set();
  const statuses = new Set(['official_verified', 'source_reported', 'source_description', 'non_numeric', 'requires_review', 'scope_incomplete', 'missing_evidence', 'conflicting']);
  for (const school of dataset.schools) {
    if (universitiesById.get(school.universityId)?.code !== school.schoolCode || index.has(school.universityId) || !Array.isArray(school.methods) || !Array.isArray(school.programs)) throw new Error(`Catalog sai mã trường ${school.schoolCode}.`);
    if (school.programs.some((program) => !program.id?.startsWith(`catalog:${school.schoolCode}:`) || !program.name?.trim()) || new Set(school.programs.map((p) => p.id)).size !== school.programs.length) throw new Error(`Catalog sai chương trình ${school.schoolCode}.`);
    for (const method of school.methods) {
      if (!method.id || ids.has(method.id) || !statuses.has(method.status) || !method.expression?.trim()) throw new Error(`Catalog sai công thức ${method.id}.`);
      ids.add(method.id);
      if (!Array.isArray(method.programIndexes) || method.programIndexes.some((i) => !Number.isInteger(i) || !school.programs[i])) throw new Error(`Catalog sai ngành ${method.id}.`);
      if (method.rowIds.some((id) => majorsById.get(id)?.universityId !== school.universityId)) throw new Error(`Catalog liên kết sai trường ${method.id}.`);
      if (method.programIndexes.some((i) => school.programs[i].verifiedRowId && (!method.rowIds.includes(school.programs[i].verifiedRowId) || !majorsById.get(school.programs[i].verifiedRowId)?.calculationVerified))) throw new Error(`Catalog sai phạm vi tự tính ${method.id}.`);
      if (method.autoCalculate && (method.status !== 'official_verified' || method.evidence?.kind !== 'official_primary' || method.calculationRule?.type !== 'weighted_sum')) throw new Error(`Công thức chưa đủ căn cứ để tự tính ${method.id}.`);
      if (method.autoCalculate) {
        const rule = method.calculationRule;
        if (!Array.isArray(rule.inputs) || !rule.inputs.length || !Number.isFinite(rule.maxScore) || rule.maxScore <= 0 || !Number.isFinite(rule.divisor) || rule.divisor <= 0 ||
          rule.inputs.some((f) => !f.key || !f.label || ![f.min, f.max, f.weight].every(Number.isFinite) || f.min > f.max || f.weight < 0 || f.lookup && Object.entries(f.lookup).some(([x, y]) => !/^\d+(?:\.\d+)?$/.test(x) || Number(x) < f.min || Number(x) > f.max || !Number.isFinite(y) || y < 0 || y > rule.maxScore)) || new Set(rule.inputs.map((f) => f.key)).size !== rule.inputs.length) throw new Error(`Cấu hình bộ tính không hợp lệ ${method.id}.`);
      }
      if (method.status === 'official_verified' && method.evidence?.kind !== 'official_primary') throw new Error(`Công thức chưa có nguồn chính thức ${method.id}.`);
      if (method.status !== 'missing_evidence') {
        let url;
        try { url = new URL(method.evidence?.url); } catch { throw new Error(`Thiếu nguồn ${method.id}.`); }
        if (url.protocol !== 'https:' || !/^2026-\d{2}-\d{2}$/.test(method.evidence?.checkedAt || '')) throw new Error(`Nguồn không hợp lệ ${method.id}.`);
      }
    }
    index.set(school.universityId, school);
  }
  if (index.size !== universities.length) throw new Error('Catalog chưa rà soát đủ trường.');
  return index;
}

export function publicSchoolFormulas(school, checkedAt) {
  if (!school) return null;
  return {
    status: school.status, checkedAt, issues: school.issues,
    methods: school.methods.map((method) => ({
      id: method.id, label: method.label, status: method.status, expression: method.expression,
      scale: method.scale, conditions: method.conditions, priority: method.priority, conversion: method.conversion,
      rowIds: method.rowIds, existingFormulaId: method.existingFormulaId,
      autoCalculate: method.autoCalculate, calculationRule: method.calculationRule,
      scopeStatus: method.scopeStatus, issues: method.issues, checkedAt: method.evidence?.checkedAt || checkedAt,
      programs: method.programIndexes.map((i) => ({ ...school.programs[i], method: method.label })),
      programCount: method.programIndexes.length,
      // Preserve the existing policy: collection metadata stays internal. Links
      // to a school's own published regulation may be shown in its formula card.
      ...(method.evidence?.kind === 'official_primary' && !/tuyensinh247/i.test(method.evidence.url) ? {
        officialLink: { label: 'Quy định tuyển sinh của trường', url: method.evidence.url, checkedAt: method.evidence.checkedAt },
      } : {}),
    })),
  };
}
