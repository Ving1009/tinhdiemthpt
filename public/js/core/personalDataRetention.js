export const PERSONAL_DATA_RETENTION_DAYS = 30;
export const PERSONAL_DATA_RETENTION_MS = PERSONAL_DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const PERSONAL_DATA_LAST_VISIT_KEY = "thpt-personal-data-last-visit-v1";

/**
 * Xóa dữ liệu người dùng ở lần truy cập kế tiếp nếu thiết bị đã không mở
 * website trong thời hạn lưu giữ. Tùy chọn giao diện không nằm trong danh sách này.
 */
export function refreshPersonalDataRetention(storage, personalKeys, now = Date.now()) {
  const timestamp = Number(storage.get(PERSONAL_DATA_LAST_VISIT_KEY, null));
  const hasValidTimestamp = Number.isFinite(timestamp) && timestamp > 0;
  const expired = hasValidTimestamp && now - timestamp >= PERSONAL_DATA_RETENTION_MS;
  if (expired) personalKeys.forEach((key) => storage.remove(key));
  storage.set(PERSONAL_DATA_LAST_VISIT_KEY, now);
  return { expired, lastVisit: hasValidTimestamp ? timestamp : null, refreshedAt: now };
}
