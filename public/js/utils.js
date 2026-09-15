export const SUBJECT_LABELS = {
  math: "Toán",
  literature: "Ngữ văn",
  foreignLanguage: "Ngoại ngữ",
  physics: "Vật lý",
  chemistry: "Hóa học",
  biology: "Sinh học",
  history: "Lịch sử",
  geography: "Địa lý",
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
 * Khung ưu tiên tuyển sinh theo thang 30: KV1/KV2-NT/KV2/KV3 và UT1/UT2.
 * Mốc 22.5 áp dụng phép giảm điểm ưu tiên; giữ hàm riêng để dễ cập nhật theo năm.
 */
export function calculateAdmissionPriority(examScore, context = {}) {
  const areaPoints = { KV1: 0.75, "KV2-NT": 0.5, KV2: 0.25, KV3: 0 };
  const groupPoints = { UT1: 2, UT2: 1, none: 0 };
  const area = Number(areaPoints[context.area] ?? 0);
  const group = Number(groupPoints[context.priorityGroup] ?? 0);
  const base = rounded(area + group);
  const shouldAdjust = Number(examScore) >= 22.5 && base > 0;
  const adjusted = shouldAdjust ? rounded(Math.max(0, ((30 - Number(examScore)) / 7.5) * base)) : base;
  return { area, group, base, adjusted, shouldAdjust };
}

export function debounce(callback, wait = 180) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = window.setTimeout(() => callback(...args), wait); };
}

export const storage = {
  get(key, fallback = null) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode or full storage: app remains usable. */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* no-op */ } }
};
