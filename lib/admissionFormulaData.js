import { normalizeAdmissionMethodCode } from "./admissionMethod.js";

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function applicableRows(method, rows) {
  if (method.applicability?.mode === "explicit_major_ids") {
    const ids = new Set(method.applicability.majorIds || []);
    return rows.filter((major) => ids.has(major.id));
  }
  const labels = new Set(method.repositoryMethods || []);
  return rows.filter((major) => labels.has(major.method));
}

export function validateAdmissionFormulaData(dataset, { universities = [], majors = [] } = {}) {
  const errors = [];
  const warnings = [];
  const universityById = new Map(universities.map((item) => [item.id, item]));
  const universityByCode = new Map(universities.map((item) => [item.code, item]));
  const majorsByUniversity = new Map();
  const schoolIds = new Set();
  const methodIds = new Set();
  const fingerprints = new Map();
  let methodCount = 0;

  if (dataset?.schemaVersion !== 1) errors.push("schemaVersion phải là 1.");
  if (dataset?.year !== 2026) errors.push("Bộ công thức phải dành cho năm 2026.");
  if (!Array.isArray(dataset?.schools)) errors.push("Thiếu danh sách schools.");

  for (const major of majors) {
    const rows = majorsByUniversity.get(major.universityId) || [];
    rows.push(major);
    majorsByUniversity.set(major.universityId, rows);
  }

  for (const school of dataset?.schools || []) {
    if (!school.universityId || schoolIds.has(school.universityId)) errors.push(`Trường bị trùng hoặc thiếu universityId: ${school.universityId || "(trống)"}.`);
    schoolIds.add(school.universityId);
    const university = universityById.get(school.universityId);
    if (!university) errors.push(`${school.schoolCode || school.universityId}: universityId không tồn tại.`);
    if (!universityByCode.has(school.schoolCode) || universityByCode.get(school.schoolCode)?.id !== school.universityId) {
      errors.push(`${school.schoolCode || "(trống)"}: mã trường không ánh xạ chính xác tới ${school.universityId}.`);
    }
    if (!Array.isArray(school.methods) || !school.methods.length) errors.push(`${school.schoolCode}: thiếu phương thức đã xác minh.`);

    const rows = majorsByUniversity.get(school.universityId) || [];
    for (const method of school.methods || []) {
      methodCount += 1;
      if (!method.id || methodIds.has(method.id)) errors.push(`Mã công thức bị trùng hoặc thiếu: ${method.id || "(trống)"}.`);
      methodIds.add(method.id);
      if (method.status !== "official_verified") errors.push(`${method.id}: chỉ được tích hợp trạng thái official_verified.`);
      if (!method.expression?.trim()) errors.push(`${method.id}: thiếu biểu thức.`);
      if (!Array.isArray(method.repositoryMethods) || !method.repositoryMethods.length) errors.push(`${method.id}: thiếu nhãn phương thức repository.`);
      if (method.source?.kind !== "official_primary" || !isHttpUrl(method.source?.url)) errors.push(`${method.id}: thiếu nguồn chính thức trực tiếp.`);
      if (!/^2026-\d{2}-\d{2}$/.test(method.source?.verifiedAt || "")) errors.push(`${method.id}: thiếu ngày kiểm tra nguồn.`);
      if (!method.source?.evidence?.trim()) errors.push(`${method.id}: thiếu mô tả bằng chứng nguồn.`);

      const matchedRows = applicableRows(method, rows);
      if (!matchedRows.length) errors.push(`${method.id}: không ánh xạ được dòng ngành nào bằng mã/nhãn chính xác.`);
      if (method.applicability?.mode === "explicit_major_ids") {
        const expected = new Set(method.applicability.majorIds || []);
        const actual = new Set(matchedRows.map((major) => major.id));
        for (const id of expected) if (!actual.has(id)) errors.push(`${method.id}: majorId ${id} không tồn tại hoặc sai trường.`);
      }
      for (const label of method.repositoryMethods || []) {
        if (!rows.some((major) => major.method === label)) warnings.push(`${method.id}: repository không có nhãn phương thức chính xác “${label}”.`);
      }
      const normalizedCode = normalizeAdmissionMethodCode(method.label);
      if (!normalizedCode) errors.push(`${method.id}: không chuẩn hóa được phương thức.`);

      const fingerprint = method.expression.replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
      const existing = fingerprints.get(fingerprint);
      if (existing && existing.schoolCode !== school.schoolCode) {
        errors.push(`${method.id}: biểu thức trùng bất thường với ${existing.methodId} của trường ${existing.schoolCode}.`);
      } else {
        fingerprints.set(fingerprint, { schoolCode: school.schoolCode, methodId: method.id });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      mappedSchools: schoolIds.size,
      verifiedSchoolMethods: methodCount,
      applicableMajorRows: [...(dataset?.schools || [])].reduce((total, school) => {
        const rows = majorsByUniversity.get(school.universityId) || [];
        return total + (school.methods || []).reduce((sum, method) => sum + applicableRows(method, rows).length, 0);
      }, 0)
    }
  };
}

export function createAdmissionFormulaIndex(dataset, { universities = [], majors = [] } = {}) {
  const validation = validateAdmissionFormulaData(dataset, { universities, majors });
  if (!validation.valid) throw new Error(`Dữ liệu công thức tuyển sinh không hợp lệ: ${validation.errors.join(" ")}`);
  const majorsByUniversity = new Map();
  for (const major of majors) {
    const rows = majorsByUniversity.get(major.universityId) || [];
    rows.push(major);
    majorsByUniversity.set(major.universityId, rows);
  }
  return new Map((dataset.schools || []).map((school) => {
    const rows = majorsByUniversity.get(school.universityId) || [];
    return [school.universityId, {
      ...school,
      methods: school.methods.map((method) => ({ ...method, applicableRows: applicableRows(method, rows) }))
    }];
  }));
}
