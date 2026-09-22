const PUBLIC_CUTOFF_STATUSES = new Set(["verified", "reference"]);
const NON_NUMERIC_CUTOFF_STATUSES = new Set(["unverified", "not_published"]);
const INTERNAL_ONLY_KEYS = new Set([
  "sourceUrl",
  "sourceTitle",
  "sourceName",
  "formulaSourceUrl",
  "formulaEvidenceAvailable",
  "methodsSourceUrl",
  "referenceSources",
  "referenceNote",
  "logoSourceUrl",
  "nameSourceUrl",
  "sources",
  "sourceCodes",
  "raw",
  "importTag",
  "admissionMethodCodes"
]);

export function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateCutoff(cutoff) {
  const errors = [];
  if (!cutoff || typeof cutoff !== "object") return { valid: false, publishable: false, errors: ["missing cutoff"] };
  const { status, year, score, scale, sourceUrl } = cutoff;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.push("invalid year");
  if (!PUBLIC_CUTOFF_STATUSES.has(status) && !NON_NUMERIC_CUTOFF_STATUSES.has(status)) errors.push("invalid status");
  if (PUBLIC_CUTOFF_STATUSES.has(status)) {
    if (!Number.isFinite(score) || score < 0) errors.push("invalid score");
    if (!Number.isFinite(scale) || scale <= 0) errors.push("invalid scale");
    if (Number.isFinite(score) && Number.isFinite(scale) && score > scale) errors.push("score exceeds scale");
    if (!validHttpUrl(sourceUrl)) errors.push("missing sourceUrl");
  }
  if (NON_NUMERIC_CUTOFF_STATUSES.has(status) && score !== null && score !== undefined) errors.push("non-public status has numeric score");
  return { valid: errors.length === 0, publishable: errors.length === 0 && PUBLIC_CUTOFF_STATUSES.has(status), errors };
}

export function sanitizePublicValue(value) {
  if (Array.isArray(value)) return value.map(sanitizePublicValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !INTERNAL_ONLY_KEYS.has(key) && !/(?:source|reference)/i.test(key))
    .map(([key, child]) => [key, sanitizePublicValue(child)]));
}

export function sanitizeMajor(major) {
  const clean = sanitizePublicValue(major);
  const checked = validateCutoff(major.cutoff);
  if (!checked.publishable && clean.cutoff) clean.cutoff = { ...clean.cutoff, score: null };
  return clean;
}

export function sanitizeUniversity(university) {
  return sanitizePublicValue(university);
}

export function validateDataset({ universities, majors, combinations }) {
  const errors = [];
  const warnings = [];
  const universityIds = new Set(universities.map((item) => item.id));
  const combinationIds = new Set();
  const majorIds = new Set();
  const counts = { verified: 0, reference: 0, unverified: 0, not_published: 0, other: 0 };
  const majorsByUniversity = new Map();

  for (const combination of combinations) {
    if (!combination.id || combinationIds.has(combination.id)) errors.push(`Combination id không hợp lệ hoặc bị trùng: ${combination.id || "(trống)"}`);
    combinationIds.add(combination.id);
    if (!combination.code || !Array.isArray(combination.subjects) || !Array.isArray(combination.subjectIds)) errors.push(`Combination ${combination.id || "(trống)"} thiếu mã hoặc môn.`);
  }

  for (const major of majors) {
    if (!major.id || majorIds.has(major.id)) errors.push(`Major id không hợp lệ hoặc bị trùng: ${major.id || "(trống)"}`);
    majorIds.add(major.id);
    if (!universityIds.has(major.universityId)) errors.push(`${major.id}: universityId không tồn tại.`);
    majorsByUniversity.set(major.universityId, (majorsByUniversity.get(major.universityId) || 0) + 1);
    const status = major.cutoff?.status;
    if (Object.hasOwn(counts, status)) counts[status] += 1;
    else counts.other += 1;
    const cutoff = validateCutoff(major.cutoff);
    if (!cutoff.valid) errors.push(`${major.id}: ${cutoff.errors.join(", ")}.`);
  }

  const withoutMajors = universities.filter((item) => !majorsByUniversity.has(item.id));
  for (const university of withoutMajors) {
    if (university.admissions?.status && university.admissions?.note) {
      warnings.push(`${university.code}: chưa có dòng ngành riêng (${university.admissions.status}).`);
    } else {
      errors.push(`${university.code}: chưa có ngành và chưa được phân loại.`);
    }
  }

  return {
    errors,
    warnings,
    stats: {
      universities: universities.length,
      majors: majors.length,
      combinations: combinations.length,
      cutoffs: counts,
      universitiesWithoutMajors: withoutMajors.length
    }
  };
}
