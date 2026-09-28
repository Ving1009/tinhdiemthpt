export const SUBJECT_LABELS = {
  math: "Toán",
  literature: "Ngữ văn",
  foreignLanguage: "Ngoại ngữ",
  physics: "Vật lý",
  chemistry: "Hóa học",
  biology: "Sinh học",
  history: "Lịch sử",
  geography: "Địa lý",
  civicEducation: "Giáo dục kinh tế và pháp luật",
  nationalDefense: "Giáo dục quốc phòng và an ninh",
  informatics: "Tin học",
  technology: "Công nghệ",
  industrialTechnology: "Công nghệ công nghiệp",
  agriculturalTechnology: "Công nghệ nông nghiệp"
};

export const $ = (selector, parent = document) => parent.querySelector(selector);
export const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
export const rounded = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};
export const subjectLabel = (key) => SUBJECT_LABELS[key] || key;
export const formatScore = (value, digits = 2) => Number(value || 0).toFixed(digits);
export const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));

/** Converts 8,5 to 8.5 and keeps the input safe for a decimal score. */
export function sanitizeScoreInput(value) {
  return String(value ?? "").replace(/,/g, ".").replace(/\s+/g, "");
}

export function validateScore(raw, required = true) {
  const text = String(raw ?? "").trim().replace(/,/g, ".");
  if (!text) return required ? { valid: false, message: "Vui lòng nhập điểm." } : { valid: true, value: null };
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return { valid: false, message: "Dùng tối đa 2 chữ số thập phân." };
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 10) return { valid: false, message: "Điểm phải nằm trong khoảng 0 đến 10." };
  return { valid: true, value };
}

/**
 * Khung ưu tiên tuyển sinh 2025-2026. Quy chế công bố công thức trên thang 30;
 * với thang điểm khác, cả điểm xét tuyển và điểm ưu tiên được quy đổi tuyến tính
 * tương đương trước và sau khi áp dụng mốc 22,5.
 */
export function calculateAdmissionPriority(examScore, context = {}, scoreScale = 30) {
  const areaPoints = { KV1: 0.75, "KV2-NT": 0.5, KV2: 0.25, KV3: 0 };
  const groupPoints = { UT1: 2, UT2: 1, none: 0 };
  const area = Number(areaPoints[context.area] ?? 0);
  const group = Number(groupPoints[context.priorityGroup] ?? 0);
  const base = rounded(area + group);
  const scale = Number(scoreScale);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 30;
  const normalizedScore = rounded((Number(examScore) / safeScale) * 30, 6);
  const shouldAdjust = normalizedScore >= 22.5 && base > 0;
  const adjustedOn30 = shouldAdjust ? rounded(Math.max(0, ((30 - normalizedScore) / 7.5) * base), 6) : base;
  const adjusted = rounded(adjustedOn30 * (safeScale / 30));
  return {
    area,
    group,
    base,
    adjusted,
    adjustedOn30: rounded(adjustedOn30),
    normalizedScore: rounded(normalizedScore),
    scale: safeScale,
    shouldAdjust
  };
}

export function debounce(callback, wait = 180) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = window.setTimeout(() => callback(...args), wait); };
}

export const storage = {
  get(key, fallback = null) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      window.dispatchEvent(new CustomEvent("thpt-storage-change", { detail: { key, action: "set" } }));
    } catch { /* Private mode or full storage: app remains usable. */ }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
      window.dispatchEvent(new CustomEvent("thpt-storage-change", { detail: { key, action: "remove" } }));
    } catch { /* no-op */ }
  }
};
