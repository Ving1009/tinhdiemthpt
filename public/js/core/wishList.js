export const MAX_WISH_ITEMS = 5000;
const TEXT_LIMITS = {
  id: 220, wishId: 220, sourceId: 220, universityId: 180, university: 180,
  name: 300, code: 80, nationalMajorCode: 80, programId: 180, programType: 120,
  campusId: 180, campus: 180, method: 180, methodCode: 100, methodDetails: 300,
  combination: 200, ruleId: 180, cutoffStatus: 40, comparisonStatus: 40,
  comparisonReason: 300, conditions: 500, tuitionUnit: 80, tuitionPeriod: 80,
  savedAt: 60, dataVersion: 80
};

function cleanText(value, limit) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeText(value) {
  return cleanText(value, 500).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi");
}

function normalizeCombination(value) {
  return [...new Set(cleanText(value, 200).toLocaleUpperCase("vi").split(/[;,/|]+/).map((item) => item.trim()).filter(Boolean))].sort().join(";");
}

function finiteOrNull(value) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Nhận diện một phương án xét tuyển, độc lập với mã mục cá nhân. */
export function wishIdentity(item) {
  const program = item.programId
    ? `program:${normalizeText(item.programId)}`
    : `described:${normalizeText(item.nationalMajorCode || item.code)}:${normalizeText(item.name)}:${normalizeText(item.programType)}`;
  const methodCodes = Array.isArray(item.admissionMethodCodes)
    ? [...new Set(item.admissionMethodCodes.map(normalizeText).filter(Boolean))].sort().join(",")
    : normalizeText(item.methodCode);
  return [
    normalizeText(item.universityId), program, normalizeText(item.campusId || item.campus),
    Number(item.year) || "", methodCodes, normalizeText(item.method), normalizeText(item.methodDetails),
    normalizeCombination(item.combination), normalizeText(item.ruleId), finiteOrNull(item.scale) ?? ""
  ].join("|");
}

export function createWishId(item) {
  return `wish-${stableHash(wishIdentity(item))}`;
}

export function normalizeWish(value) {
  if (!value || typeof value !== "object") return null;
  const item = Object.fromEntries(Object.entries(TEXT_LIMITS).map(([key, limit]) => [key, cleanText(value[key], limit)]));
  item.sourceId = item.sourceId || item.id;
  item.id = item.sourceId;
  if (!item.sourceId || !item.universityId || !item.name || !item.code) return null;
  item.year = Number.isInteger(Number(value.year)) && Number(value.year) >= 2000 && Number(value.year) <= 2100 ? Number(value.year) : 2026;
  item.scale = finiteOrNull(value.scale);
  item.cutoff = finiteOrNull(value.cutoff);
  item.userScore = finiteOrNull(value.userScore);
  item.currentUserScore = finiteOrNull(value.currentUserScore);
  item.tuitionMin = finiteOrNull(value.tuitionMin);
  item.tuitionMax = finiteOrNull(value.tuitionMax);
  item.scoreContextVersion = Number.isInteger(Number(value.scoreContextVersion)) && Number(value.scoreContextVersion) >= 0 ? Number(value.scoreContextVersion) : 0;
  item.admissionMethodCodes = Array.isArray(value.admissionMethodCodes)
    ? [...new Set(value.admissionMethodCodes.map((entry) => cleanText(entry, 100)).filter(Boolean))].slice(0, 30)
    : [];
  if (item.scale !== null && item.scale <= 0) item.scale = null;
  if (item.cutoff !== null && (item.cutoff < 0 || (item.scale !== null && item.cutoff > item.scale))) item.cutoff = null;
  if (item.userScore !== null && (item.userScore < 0 || (item.scale !== null && item.userScore > item.scale))) item.userScore = null;
  if (item.currentUserScore !== null && (item.currentUserScore < 0 || (item.scale !== null && item.currentUserScore > item.scale))) item.currentUserScore = null;
  item.wishId = item.wishId || createWishId(item);
  return item;
}

export function normalizeWishListWithReport(values, maxItems = MAX_WISH_ITEMS) {
  if (!Array.isArray(values)) return { items: [], report: { input: 0, valid: 0, duplicates: 0, invalid: 0, exceeded: 0 } };
  const safeLimit = Math.max(1, Number(maxItems) || MAX_WISH_ITEMS);
  const unique = new Map();
  const usedWishIds = new Set();
  let invalid = 0;
  let duplicates = 0;
  const exceeded = Math.max(0, values.length - safeLimit);
  for (const value of values.slice(0, safeLimit)) {
    const item = normalizeWish(value);
    if (!item) { invalid += 1; continue; }
    const identity = wishIdentity(item);
    if (unique.has(identity)) { duplicates += 1; continue; }
    let wishId = item.wishId || createWishId(item);
    if (usedWishIds.has(wishId)) wishId = `${createWishId(item)}-${stableHash(`${identity}|${unique.size}`)}`;
    item.wishId = wishId;
    usedWishIds.add(wishId);
    unique.set(identity, item);
  }
  const items = [...unique.values()];
  return { items, report: { input: values.length, valid: items.length, duplicates, invalid, exceeded } };
}

export function normalizeWishList(values, maxItems = MAX_WISH_ITEMS) {
  return normalizeWishListWithReport(values, maxItems).items;
}

export function removeWishById(items, wishId) {
  const normalized = normalizeWishList(items);
  const index = normalized.findIndex((item) => item.wishId === wishId);
  if (index < 0) return { items: normalized, removed: null, index: -1 };
  const [removed] = normalized.splice(index, 1);
  return { items: normalized, removed, index };
}

export function moveWishById(items, wishId, direction) {
  const normalized = normalizeWishList(items);
  const index = normalized.findIndex((item) => item.wishId === wishId);
  const next = index + Number(direction);
  if (index < 0 || next < 0 || next >= normalized.length) return normalized;
  [normalized[index], normalized[next]] = [normalized[next], normalized[index]];
  return normalized;
}
