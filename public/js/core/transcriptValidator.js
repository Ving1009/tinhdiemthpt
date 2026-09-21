const SCORE_FIELDS = ["semester1", "semester2", "year"];

export class TranscriptPayloadError extends Error {
  constructor(message, { statusCode = 502, code = "INVALID_TRANSCRIPT_DATA" } = {}) {
    super(message);
    this.name = "TranscriptPayloadError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function normalizeTranscriptText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("vi")
    .trim();
}

function getSubjectMatch(value, catalog) {
  const normalized = normalizeTranscriptText(value);
  if (!normalized) return null;
  return catalog.subjects.find((item) => [item.canonical, ...(item.aliases || [])]
    .some((alias) => normalizeTranscriptText(alias) === normalized)) || null;
}

function asScore(value, label, warnings) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    warnings.push(`${label} không hợp lệ nên được để trống.`);
    return null;
  }
  return Number(value.toFixed(2));
}

function asConfidence(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return 0;
  return Number(value.toFixed(2));
}

function createCandidate(rawScore, index, catalog, warnings) {
  if (!rawScore || typeof rawScore !== "object") {
    warnings.push(`Dòng ${index + 1} không đúng cấu trúc nên được bỏ qua.`);
    return null;
  }
  const subject = getSubjectMatch(rawScore.subject, catalog);
  if (!subject) {
    warnings.push(`Dòng ${index + 1} không xác định được môn học nên được bỏ qua.`);
    return null;
  }
  const grade = Number(rawScore.grade);
  if (!Number.isInteger(grade) || ![10, 11, 12].includes(grade)) {
    warnings.push(`${subject.canonical} không xác định được lớp 10, 11 hoặc 12 nên được bỏ qua.`);
    return null;
  }
  const confidence = asConfidence(rawScore.confidence);
  const score = {
    subject: subject.canonical,
    grade,
    semester1: asScore(rawScore.semester1, `${subject.canonical} lớp ${grade} HK1`, warnings),
    semester2: asScore(rawScore.semester2, `${subject.canonical} lớp ${grade} HK2`, warnings),
    year: asScore(rawScore.year, `${subject.canonical} lớp ${grade} cả năm`, warnings),
    confidence
  };
  return { score, fieldConfidence: Object.fromEntries(SCORE_FIELDS.map((field) => [field, score[field] === null ? null : confidence])) };
}

function mergeCandidate(existing, candidate, warnings) {
  for (const field of SCORE_FIELDS) {
    const incoming = candidate.score[field];
    if (incoming === null) continue;
    const current = existing.score[field];
    if (current === null) {
      existing.score[field] = incoming;
      existing.fieldConfidence[field] = candidate.fieldConfidence[field];
      continue;
    }
    if (current === incoming) {
      existing.fieldConfidence[field] = Math.max(existing.fieldConfidence[field] || 0, candidate.fieldConfidence[field] || 0);
      continue;
    }
    const currentConfidence = existing.fieldConfidence[field] || 0;
    const incomingConfidence = candidate.fieldConfidence[field] || 0;
    const label = `${existing.score.subject} lớp ${existing.score.grade} ${field === "semester1" ? "HK1" : field === "semester2" ? "HK2" : "cả năm"}`;
    if (incomingConfidence > currentConfidence) {
      existing.score[field] = incoming;
      existing.fieldConfidence[field] = incomingConfidence;
      warnings.push(`${label} có dữ liệu trùng, đã chọn giá trị rõ hơn.`);
    } else if (incomingConfidence < currentConfidence) {
      warnings.push(`${label} có dữ liệu trùng, giữ giá trị rõ hơn.`);
    } else {
      warnings.push(`${label} có dữ liệu trùng. Hãy kiểm tra lại trước khi điền điểm.`);
    }
  }
}

function finalizeScore(entry) {
  const confidences = SCORE_FIELDS.map((field) => entry.fieldConfidence[field]).filter((value) => typeof value === "number");
  entry.score.confidence = confidences.length ? Number(Math.min(...confidences).toFixed(2)) : entry.score.confidence;
  return entry.score;
}

export function validateTranscriptPayload(payload, catalog) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.scores)) {
    throw new TranscriptPayloadError("Dữ liệu nhận diện không hợp lệ.", { code: "INVALID_AI_JSON" });
  }
  if (!catalog || !Array.isArray(catalog.subjects) || catalog.subjects.length === 0) {
    throw new TranscriptPayloadError("Không tải được danh mục môn học.", { statusCode: 500, code: "INVALID_SUBJECT_CATALOG" });
  }
  const warnings = [];
  const rows = new Map();
  payload.scores.forEach((rawScore, index) => {
    const candidate = createCandidate(rawScore, index, catalog, warnings);
    if (!candidate) return;
    const key = `${candidate.score.subject}|${candidate.score.grade}`;
    const existing = rows.get(key);
    if (existing) mergeCandidate(existing, candidate, warnings); else rows.set(key, candidate);
  });
  const scores = [...rows.values()].map(finalizeScore).sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject, "vi"));
  if (!scores.length) {
    throw new TranscriptPayloadError("Không tìm thấy bảng điểm có thể đọc được. Hãy chụp lại rõ hơn.", { statusCode: 422, code: "NO_TRANSCRIPT_DATA" });
  }
  const name = typeof payload.student?.name === "string" && payload.student.name.trim() ? payload.student.name.trim().slice(0, 120) : null;
  return { data: { student: { name }, scores }, warnings };
}
