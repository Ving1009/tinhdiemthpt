function normalizedUserId(value) {
  return String(value || "").trim();
}

export class AccountDataIsolation {
  constructor({ storage, personalKeys = [], authSessionKey }) {
    this.storage = storage;
    this.personalKeys = [...new Set(personalKeys)];
    this.authSessionKey = authSessionKey;
  }

  marker() {
    const marker = this.storage.get(this.authSessionKey, null);
    if (!marker?.authenticated) return { authenticated: false, userId: "", hydrated: false };
    return {
      authenticated: true,
      userId: normalizedUserId(marker.userId),
      hydrated: marker.hydrated === true
    };
  }

  clearPersonalData() {
    for (const key of this.personalKeys) this.storage.remove(key);
  }

  beginUser(userId) {
    const normalized = normalizedUserId(userId);
    if (!normalized) throw new Error("Tài khoản không có định danh hợp lệ.");
    this.clearPersonalData();
    this.storage.set(this.authSessionKey, { authenticated: true, userId: normalized, hydrated: false });
  }

  completeUser(userId, remoteData) {
    const normalized = normalizedUserId(userId);
    if (this.marker().userId !== normalized) return false;
    this.clearPersonalData();
    const safeData = remoteData && typeof remoteData === "object" && !Array.isArray(remoteData) ? remoteData : {};
    for (const key of this.personalKeys) {
      if (safeData[key] !== undefined) this.storage.set(key, safeData[key]);
    }
    this.storage.set(this.authSessionKey, { authenticated: true, userId: normalized, hydrated: true });
    return true;
  }

  keepUser(userId) {
    const normalized = normalizedUserId(userId);
    const marker = this.marker();
    if (!normalized || marker.userId !== normalized || !marker.hydrated) return false;
    this.storage.set(this.authSessionKey, { authenticated: true, userId: normalized, hydrated: true });
    return true;
  }

  snapshotFor(userId) {
    const normalized = normalizedUserId(userId);
    const marker = this.marker();
    if (!normalized || marker.userId !== normalized || !marker.hydrated) return null;
    const missing = {};
    return Object.fromEntries(this.personalKeys.flatMap((key) => {
      const value = this.storage.get(key, missing);
      return value === missing ? [] : [[key, value]];
    }));
  }

  clearSession() {
    this.clearPersonalData();
    this.storage.remove(this.authSessionKey);
  }
}
