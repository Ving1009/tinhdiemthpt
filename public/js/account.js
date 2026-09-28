import { escapeHTML, storage } from "./utils.js";
import { clearGuestSessionMarker } from "./core/personalDataRetention.js";

export const AUTH_SESSION_KEY = "thpt-auth-session-v1";
const AUTH_RETURN_ROUTE_KEY = "thpt-auth-return-route-v1";

function safeAvatar(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "lh3.googleusercontent.com" ? url.href : "";
  } catch { return ""; }
}

export function captureOAuthCallback() {
  if (typeof location === "undefined" || !location.hash.includes("access_token=")) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  const accessToken = params.get("access_token");
  if (!accessToken) return false;
  const expiresIn = Number(params.get("expires_in") || 3600);
  storage.set(AUTH_SESSION_KEY, {
    accessToken,
    refreshToken: params.get("refresh_token") || "",
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
    tokenType: params.get("token_type") || "bearer"
  });
  const returnRoute = sessionStorage.getItem(AUTH_RETURN_ROUTE_KEY) || "#home";
  sessionStorage.removeItem(AUTH_RETURN_ROUTE_KEY);
  history.replaceState(null, "", `${location.pathname}${location.search.replace(/([?&])auth=google(&|$)/, "$1").replace(/[?&]$/, "")}${returnRoute}`);
  return true;
}

export function hasStoredAuthSession() {
  const session = storage.get(AUTH_SESSION_KEY, null);
  return Boolean(session?.accessToken || session?.refreshToken);
}

export class AccountApp {
  constructor({ personalKeys = [] } = {}) {
    this.personalKeys = [...new Set(personalKeys)];
    this.config = null;
    this.session = storage.get(AUTH_SESSION_KEY, null);
    this.user = null;
    this.root = document.getElementById("account-panel");
    this.button = document.getElementById("account-button");
    this.syncTimer = null;
  }

  isAuthenticated() { return Boolean(this.user && this.session?.accessToken); }

  async init() {
    if (!this.root || !this.button) return;
    this.button.addEventListener("click", () => this.toggle(true));
    this.root.addEventListener("click", (event) => this.handleClick(event));
    window.addEventListener("thpt-storage-change", (event) => {
      if (!this.isAuthenticated() || !this.personalKeys.includes(event.detail?.key)) return;
      clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(() => this.backup(false), 1800);
    });
    await this.loadConfig();
    if (this.config?.enabled && this.session) {
      try {
        await this.ensureSession();
        this.user = await this.fetchUser();
        clearGuestSessionMarker(storage);
      } catch {
        storage.remove(AUTH_SESSION_KEY);
        this.session = null;
      }
    }
    this.render();
  }

  async loadConfig() {
    try {
      const response = await fetch("/api/auth-config", { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json();
      this.config = payload.success ? payload.data : { enabled: false };
    } catch { this.config = { enabled: false }; }
  }

  async ensureSession() {
    if (!this.session) throw new Error("Không có phiên đăng nhập.");
    if (Number(this.session.expiresAt) > Date.now() + 60_000) return;
    if (!this.session.refreshToken) throw new Error("Phiên đã hết hạn.");
    const response = await fetch(`${this.config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: this.config.publicKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: this.session.refreshToken })
    });
    if (!response.ok) throw new Error("Không thể làm mới phiên đăng nhập.");
    const data = await response.json();
    this.session = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.session.refreshToken,
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
      tokenType: data.token_type || "bearer"
    };
    storage.set(AUTH_SESSION_KEY, this.session);
  }

  async fetchUser() {
    const response = await fetch(`${this.config.url}/auth/v1/user`, { headers: this.authHeaders() });
    if (!response.ok) throw new Error("Không thể đọc tài khoản.");
    return response.json();
  }

  authHeaders(extra = {}) {
    return { apikey: this.config.publicKey, Authorization: `Bearer ${this.session.accessToken}`, ...extra };
  }

  startGoogleLogin() {
    if (!this.config?.enabled) return;
    sessionStorage.setItem(AUTH_RETURN_ROUTE_KEY, location.hash || "#home");
    const redirectTo = `${location.origin}${location.pathname}?auth=google`;
    location.assign(`${this.config.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`);
  }

  async logout() {
    try {
      if (this.session?.accessToken) await fetch(`${this.config.url}/auth/v1/logout`, { method: "POST", headers: this.authHeaders() });
    } catch { /* Xóa phiên cục bộ ngay cả khi mạng lỗi. */ }
    storage.remove(AUTH_SESSION_KEY);
    this.session = null;
    this.user = null;
    this.render();
  }

  snapshot() {
    return Object.fromEntries(this.personalKeys.flatMap((key) => {
      const value = storage.get(key, undefined);
      return value === undefined ? [] : [[key, value]];
    }));
  }

  async backup(showStatus = true) {
    if (!this.isAuthenticated()) return;
    if (showStatus) this.setStatus("Đang sao lưu…");
    try {
      await this.ensureSession();
      const response = await fetch(`${this.config.url}/rest/v1/${encodeURIComponent(this.config.userDataTable)}?on_conflict=user_id`, {
        method: "POST",
        headers: this.authHeaders({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({ user_id: this.user.id, data: this.snapshot(), updated_at: new Date().toISOString() })
      });
      if (!response.ok) throw new Error("Chưa tạo bảng lưu dữ liệu hoặc chính sách RLS chưa đúng.");
      this.setStatus(`Đã sao lưu lúc ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date())}.`);
    } catch (error) { if (showStatus) this.setStatus(error.message); }
  }

  async restore() {
    if (!this.isAuthenticated()) return;
    this.setStatus("Đang tải bản sao…");
    try {
      await this.ensureSession();
      const query = `user_id=eq.${encodeURIComponent(this.user.id)}&select=data,updated_at&limit=1`;
      const response = await fetch(`${this.config.url}/rest/v1/${encodeURIComponent(this.config.userDataTable)}?${query}`, { headers: this.authHeaders() });
      if (!response.ok) throw new Error("Không đọc được bản sao trên đám mây.");
      const row = (await response.json())[0];
      if (!row?.data) throw new Error("Tài khoản chưa có bản sao dữ liệu.");
      for (const key of this.personalKeys) row.data[key] === undefined ? storage.remove(key) : storage.set(key, row.data[key]);
      location.reload();
    } catch (error) { this.setStatus(error.message); }
  }

  toggle(open) {
    this.root.classList.toggle("is-hidden", !open);
    this.button.setAttribute("aria-expanded", String(open));
    if (open) this.root.querySelector("button, a")?.focus();
  }

  handleClick(event) {
    if (event.target.closest("[data-account-close]")) return this.toggle(false);
    if (event.target.closest("[data-google-login]")) return this.startGoogleLogin();
    if (event.target.closest("[data-account-logout]")) return this.logout();
    if (event.target.closest("[data-account-backup]")) return this.backup();
    if (event.target.closest("[data-account-restore]")) return this.restore();
    if (event.target === this.root) this.toggle(false);
  }

  setStatus(message) {
    const target = this.root.querySelector("[data-account-status]");
    if (target) target.textContent = message;
  }

  render() {
    if (this.isAuthenticated()) {
      const metadata = this.user.user_metadata || {};
      const name = metadata.full_name || metadata.name || this.user.email || "Tài khoản";
      const avatar = safeAvatar(metadata.avatar_url || metadata.picture || "");
      this.button.classList.add("is-signed-in");
      this.button.innerHTML = avatar ? `<img src="${escapeHTML(avatar)}" alt="">` : "●";
      this.button.setAttribute("aria-label", `Tài khoản ${name}`);
      this.root.querySelector("[data-account-content]").innerHTML = `<div class="account-profile">${avatar ? `<img src="${escapeHTML(avatar)}" alt="">` : '<span aria-hidden="true">●</span>'}<div><strong>${escapeHTML(name)}</strong><small>${escapeHTML(this.user.email || "")}</small></div></div><p>Dữ liệu tính điểm, nguyện vọng và lịch sử thi thử có thể tự sao lưu khi bạn thay đổi.</p><div class="account-actions"><button class="button button-primary" type="button" data-account-backup>Sao lưu ngay</button><button class="button button-light" type="button" data-account-restore>Khôi phục bản sao</button></div><p class="account-status" data-account-status aria-live="polite">Đã đăng nhập an toàn bằng Google.</p><button class="account-logout" type="button" data-account-logout>Đăng xuất</button>`;
      return;
    }
    this.button.classList.remove("is-signed-in");
    this.button.textContent = "♙";
    this.button.setAttribute("aria-label", "Đăng nhập hoặc tạo tài khoản");
    this.root.querySelector("[data-account-content]").innerHTML = this.config?.enabled
      ? `<div class="account-intro-icon" aria-hidden="true">G</div><h2 id="account-title">Tài khoản Tính Điểm THPT</h2><p>Dùng tài khoản Google đang có trong trình duyệt. Lần đăng nhập đầu tiên cũng đồng thời tạo tài khoản.</p><button class="button button-primary account-google" type="button" data-google-login>Tiếp tục với Google</button><ul><li>Sao lưu điểm, nguyện vọng và lịch sử thi thử.</li><li>Khôi phục dữ liệu trên thiết bị khác.</li><li>Không đăng nhập vẫn dùng đầy đủ công cụ.</li></ul>`
      : `<h2 id="account-title">Tài khoản đang được cấu hình</h2><p>Bạn vẫn dùng đầy đủ mọi công cụ mà không cần đăng nhập. Quản trị viên cần thêm khóa công khai Supabase để bật đăng nhập Google.</p>`;
  }
}
