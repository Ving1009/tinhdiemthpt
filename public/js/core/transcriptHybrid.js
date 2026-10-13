const SCORE_FIELDS = ["semester1", "semester2", "year"];

export const TRANSCRIPT_QUALITY_THRESHOLDS = Object.freeze({
  minimumCoverage: 0.6,
  sparseValidCells: 4,
  manyVisibleCells: 8
});

function scoreValue(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10 ? value : null;
}

function rowsOf(payload) {
  const scores = payload?.data?.scores || payload?.scores;
  return Array.isArray(scores) ? scores : [];
}
function subjectName(value) { return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : ""; }
function nonnegativeInteger(value) { return Number.isInteger(value) && value >= 0 ? value : null; }

function collectRows(payload, catalog) {
  const allowed = catalog?.subjects ? new Set(catalog.subjects.map(row => subjectName(row.canonical))) : null;
  const rows = new Map();
  for (const candidate of rowsOf(payload)) {
    const subject = subjectName(candidate?.subject);
    const grade = candidate?.grade;
    if (!subject || ![10, 11, 12].includes(grade) || (allowed && !allowed.has(subject))) continue;
    const key = `${subject}|${grade}`;
    let row = rows.get(key);
    if (!row) {
      row = { subject, grade, values: Object.fromEntries(SCORE_FIELDS.map(field => [field, new Set()])) };
      rows.set(key, row);
    }
    for (const field of SCORE_FIELDS) {
      const value = scoreValue(candidate[field]);
      if (value !== null) row.values[field].add(value);
    }
  }
  for (const conflict of Array.isArray(payload?.conflicts) ? payload.conflicts : []) {
    const subject = subjectName(conflict?.subject), grade = conflict?.grade, field = conflict?.field;
    if (!subject || ![10, 11, 12].includes(grade) || !SCORE_FIELDS.includes(field)
      || conflict.key !== `${subject}|${grade}|${field}`) continue;
    const row = rows.get(`${subject}|${grade}`);
    if (!row) continue;
    const values = new Set([conflict.local, conflict.remote,
      ...(Array.isArray(conflict.localValues) ? conflict.localValues : []),
      ...(Array.isArray(conflict.remoteValues) ? conflict.remoteValues : [])].map(scoreValue).filter(value => value !== null));
    // A new reading cannot resolve a previous disagreement without the user's choice.
    if (values.size > 1) for (const value of values) row.values[field].add(value);
  }
  return rows;
}

export function assessTranscriptQuality(payload, evidence = {}, thresholds = TRANSCRIPT_QUALITY_THRESHOLDS) {
  const cells = new Set();
  for (const [rowKey, row] of collectRows(payload)) {
    for (const field of SCORE_FIELDS) if (row.values[field].size === 1) cells.add(`${rowKey}|${field}`);
  }
  const validCells = cells.size;
  const keys = Array.isArray(evidence.expectedCellKeys) ? [...new Set(evidence.expectedCellKeys.filter(key => {
    if (typeof key !== "string") return false;
    const [subject, grade, field, extra] = key.split("|");
    return subject && ["10", "11", "12"].includes(grade) && SCORE_FIELDS.includes(field) && extra === undefined;
  }))] : null;
  // The count may also include visible scores whose damaged subject label has no canonical key.
  const expectedCount = Math.max(keys?.length || 0, nonnegativeInteger(evidence.expectedCells) || 0);
  const expectedCells = evidence.expectedCellsReliable === true && expectedCount > 0 ? expectedCount : null;
  const matchedCells = keys?.length ? keys.filter(key => cells.has(key)).length : validCells;
  const coverage = expectedCells === null ? null : Math.min(1, matchedCells / expectedCells);
  const visibleScoreCells = nonnegativeInteger(evidence.visibleScoreCells);
  const minimumCoverage = typeof thresholds.minimumCoverage === "number" && thresholds.minimumCoverage > 0 && thresholds.minimumCoverage <= 1
    ? thresholds.minimumCoverage : TRANSCRIPT_QUALITY_THRESHOLDS.minimumCoverage;
  const sparseValidCells = nonnegativeInteger(thresholds.sparseValidCells) ?? TRANSCRIPT_QUALITY_THRESHOLDS.sparseValidCells;
  const manyVisibleCells = nonnegativeInteger(thresholds.manyVisibleCells) || TRANSCRIPT_QUALITY_THRESHOLDS.manyVisibleCells;
  const lowCoverage = coverage !== null && coverage < minimumCoverage;
  const manyMissing = evidence.geometryReliable === true && visibleScoreCells >= manyVisibleCells && validCells <= sparseValidCells;
  const reasons = [];
  if (lowCoverage) reasons.push("coverage_below_threshold");
  else if (coverage !== null && coverage < 1) reasons.push("some_cells_unread");
  if (manyMissing) reasons.push("many_visible_cells_missing");
  for (const [field, reason] of [["unresolvedSubjects", "unresolved_subjects"], ["unresolvedColumns", "unresolved_columns"],
    ["conflicts", "conflicting_scores"], ["invalidScores", "invalid_scores"]]) {
    if (nonnegativeInteger(evidence[field]) > 0) reasons.push(reason);
  }
  if (coverage === null) reasons.push("unknown_completeness");
  const state = lowCoverage || manyMissing || (coverage !== null && (coverage < 1 || reasons.length))
    ? "incomplete" : coverage === null ? "unknown" : "complete";
  return { state, suggestOnline: lowCoverage || manyMissing, validCells, expectedCells, coverage, reasons };
}

export function mergeTranscriptResults(localPayload, remotePayload, catalog) {
  const localRows = collectRows(localPayload, catalog);
  const remoteRows = collectRows(remotePayload, catalog);
  const scores = [];
  const provenance = {};
  const conflicts = [];
  for (const rowKey of new Set([...localRows.keys(), ...remoteRows.keys()])) {
    const localRow = localRows.get(rowKey);
    const remoteRow = remoteRows.get(rowKey);
    const row = { subject: (localRow || remoteRow).subject, grade: (localRow || remoteRow).grade, confidence: 0 };
    for (const field of SCORE_FIELDS) {
      const localValues = [...(localRow?.values[field] || [])];
      const remoteValues = [...(remoteRow?.values[field] || [])];
      const local = localValues.length === 1 ? localValues[0] : null;
      const remote = remoteValues.length === 1 ? remoteValues[0] : null;
      const key = `${rowKey}|${field}`;
      const conflict = localValues.length > 1 || remoteValues.length > 1 || (local !== null && remote !== null && local !== remote);
      const source = conflict ? "conflict" : local !== null && remote !== null ? "agreement" : local !== null ? "local" : remote !== null ? "remote" : "empty";
      row[field] = conflict ? null : local ?? remote;
      provenance[key] = { source, local, remote };
      if (localValues.length > 1 || remoteValues.length > 1) Object.assign(provenance[key], { localValues, remoteValues });
      if (conflict) conflicts.push({ key, subject: row.subject, grade: row.grade, field, ...provenance[key] });
    }
    scores.push(row);
  }
  scores.sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject, "vi"));
  const warnings = [...new Set([localPayload, remotePayload].flatMap(payload => Array.isArray(payload?.warnings) ? payload.warnings : []))];
  if (conflicts.length) warnings.push(`${conflicts.length} ô có điểm khác nhau giữa các lần đọc. Bạn hãy đối chiếu ảnh gốc và chọn điểm.`);
  return { success: true, data: { student: { name: null }, scores }, warnings, provenance, conflicts };
}
