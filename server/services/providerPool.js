import { AppError } from "../errors.js";

const PLACEHOLDER_VALUE = /^(?:your[_-].*|replace[_-].*|change[_-]?me.*|example.*|x{3,})$/i;

function normalizedKey(value) {
  const key = String(value || "").trim();
  return key && !PLACEHOLDER_VALUE.test(key) ? key : null;
}

export function collectApiKeys(environment, {
  primaryName,
  listName,
  numberedPrefix = primaryName,
  numberedStart = 1,
  numberedEnd = 5
}) {
  const candidates = [environment[primaryName]];
  for (let index = numberedStart; index <= numberedEnd; index += 1) candidates.push(environment[`${numberedPrefix}_${index}`]);
  if (environment[listName]) candidates.push(...String(environment[listName]).split(/[,;\r\n]+/));
  return [...new Set(candidates.map(normalizedKey).filter(Boolean))];
}

export function createProviderPool({
  keys,
  createService,
  retryCodes,
  cooldownMsByCode = {},
  now = Date.now,
  unavailableError = () => new AppError("Dịch vụ nhận diện tạm thời chưa sẵn sàng.", { statusCode: 503, code: "SCAN_PROVIDER_UNAVAILABLE" })
}) {
  const entries = keys.map((key, index) => ({
    scan: createService(key, index),
    cooldownUntil: 0,
    lastError: null
  }));
  let cursor = 0;

  return async function scanWithKeyPool(images) {
    if (!entries.length) throw unavailableError();
    const startedAt = now();
    const start = cursor % entries.length;
    cursor = (cursor + 1) % entries.length;
    const order = Array.from({ length: entries.length }, (_, offset) => (start + offset) % entries.length)
      .filter((index) => entries[index].cooldownUntil <= startedAt);

    if (!order.length) {
      const mostRecent = entries.map((entry) => entry.lastError).filter(Boolean).at(-1);
      throw mostRecent || unavailableError();
    }

    let lastError = null;
    for (const index of order) {
      const entry = entries[index];
      try {
        const result = await entry.scan(images);
        entry.cooldownUntil = 0;
        entry.lastError = null;
        return result;
      } catch (error) {
        lastError = error;
        if (!retryCodes.has(error?.code)) throw error;
        entry.lastError = error;
        entry.cooldownUntil = now() + Math.max(0, Number(cooldownMsByCode[error.code]) || 0);
      }
    }
    throw lastError || unavailableError();
  };
}
