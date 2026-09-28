export const GUEST_SESSION_RETENTION_MINUTES = 15;
export const GUEST_SESSION_RETENTION_MS = GUEST_SESSION_RETENTION_MINUTES * 60 * 1000;
export const PERSONAL_DATA_LAST_VISIT_KEY = "thpt-personal-data-last-visit-v2";
export const GUEST_SESSION_LEFT_AT_KEY = "thpt-guest-session-left-at-v1";

export function markGuestSessionLeft(storage, now = Date.now(), authenticated = false) {
  if (authenticated) {
    storage.remove(GUEST_SESSION_LEFT_AT_KEY);
    return;
  }
  storage.set(GUEST_SESSION_LEFT_AT_KEY, now);
}

export function clearGuestSessionMarker(storage) {
  storage.remove(GUEST_SESSION_LEFT_AT_KEY);
}

/**
 * Xóa dữ liệu người dùng ở lần truy cập kế tiếp nếu thiết bị đã không mở
 * website trong thời hạn lưu giữ. Tùy chọn giao diện không nằm trong danh sách này.
 */
export function refreshPersonalDataRetention(storage, personalKeys, now = Date.now(), { authenticated = false } = {}) {
  if (authenticated) {
    clearGuestSessionMarker(storage);
    storage.set(PERSONAL_DATA_LAST_VISIT_KEY, now);
    return { expired: false, authenticated: true, leftAt: null, refreshedAt: now };
  }
  const leftAt = Number(storage.get(GUEST_SESSION_LEFT_AT_KEY, null));
  const hasValidTimestamp = Number.isFinite(leftAt) && leftAt > 0;
  const expired = hasValidTimestamp && now - leftAt >= GUEST_SESSION_RETENTION_MS;
  if (expired) personalKeys.forEach((key) => storage.remove(key));
  clearGuestSessionMarker(storage);
  storage.set(PERSONAL_DATA_LAST_VISIT_KEY, now);
  return { expired, authenticated: false, leftAt: hasValidTimestamp ? leftAt : null, refreshedAt: now };
}
