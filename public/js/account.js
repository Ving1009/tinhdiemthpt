import { escapeHTML, storage } from "./utils.js";
import { clearGuestSessionMarker } from "./core/personalDataRetention.js";
import { turnstileGate } from "./turnstile.js";

export const AUTH_SESSION_KEY = "thpt-auth-session-v2";

export function hasStoredAuthSession() {
  return storage.get(AUTH_SESSION_KEY, null)?.authenticated === true;
}

function messageFromPayload(payload, fallback) {
  return payload?.error?.message || fallback;
}

export class AccountApp {
  constructor({ personalKeys = [] } = {}) {
    this.personalKeys = [...new Set(personalKeys)];
    this.config = null;
    this.user = null;
    this.mode = "login";
    this.root = document.getElementById("account-panel");
    this.button = document.getElementById("account-button");
    this.syncTimer = null;
  }

  isAuthenticated() { return Boolean(this.user?.id); }

  async init() {
    if (!this.root || !this.button) return;
    this.button.addEventListener("click", () => this.toggle(true));
    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("submit", (event) => this.handleSubmit(event));
    window.addEventListener("thpt-storage-change", (event) => {
      if (!this.isAuthenticated() || !this.personalKeys.includes(event.detail?.key)) return;
      clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(() => this.backup(false), 1800);
    });
    await this.loadConfig();
    if (this.config?.enabled) await this.refreshUser();
    this.render();
  }

  async loadConfig() {
    try {
      const response = await fetch("/api/auth-config", { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json();
      this.config = payload.success ? payload.data : { enabled: false };
    } catch { this.config = { enabled: false }; }
  }

  async request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      const error = new Error(messageFromPayload(payload, "Không thể xử lý yêu cầu tài khoản."));
      error.code = payload?.error?.code || "AUTH_REQUEST_FAILED";
      throw error;
    }
    return payload.data;
  }

  async refreshUser() {
    try {
      const data = await this.request("/api/auth/me");
      this.user = data.user;
      storage.set(AUTH_SESSION_KEY, { authenticated: true });
      clearGuestSessionMarker(storage);
    } catch {
      this.user = null;
      storage.remove(AUTH_SESSION_KEY);
    }
  }

  async register(form) {
    const values = new FormData(form);
    const username = String(values.get("username") || "").trim().toLocaleLowerCase("en");
    const password = String(values.get("password") || "");
    if (password !== String(values.get("passwordConfirmation") || "")) {
      this.setStatus("Hai lần nhập mật khẩu chưa giống nhau.", true);
      return;
    }
    this.setFormBusy(form, true, "Đang xác minh…");
    try {
      const token = await turnstileGate.getToken("account_register");
      const data = await this.request("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Turnstile-Token": token },
        body: JSON.stringify({ username, password })
      });
      this.user = data.user;
      storage.set(AUTH_SESSION_KEY, { authenticated: true });
      clearGuestSessionMarker(storage);
      this.render();
      this.setStatus("Tạo tài khoản thành công. Dữ liệu của bạn có thể được sao lưu ngay.");
    } catch (error) {
      this.setFormBusy(form, false);
      this.setStatus(error.message, true);
    }
  }

  async login(form) {
    const values = new FormData(form);
    this.setFormBusy(form, true, "Đang đăng nhập…");
    try {
      const data = await this.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: values.get("username"), password: values.get("password") })
      });
      this.user = data.user;
      storage.set(AUTH_SESSION_KEY, { authenticated: true });
      clearGuestSessionMarker(storage);
      this.render();
      this.setStatus("Đăng nhập thành công.");
    } catch (error) {
      this.setFormBusy(form, false);
      this.setStatus(error.message, true);
    }
  }

  async logout() {
    try { await this.request("/api/auth/logout", { method: "POST" }); }
    catch { /* Cookie cục bộ vẫn được coi là hết phiên ở giao diện. */ }
    storage.remove(AUTH_SESSION_KEY);
    this.user = null;
    this.mode = "login";
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
      const result = await this.request("/api/auth/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: this.snapshot() })
      });
      const time = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(result.updatedAt));
      this.setStatus(`Đã sao lưu lúc ${time}.`);
    } catch (error) { if (showStatus) this.setStatus(error.message, true); }
  }

  async restore() {
    if (!this.isAuthenticated()) return;
    this.setStatus("Đang tải bản sao…");
    try {
      const result = await this.request("/api/auth/data");
      if (!result.data) throw new Error("Tài khoản chưa có bản sao dữ liệu.");
      for (const key of this.personalKeys) result.data[key] === undefined ? storage.remove(key) : storage.set(key, result.data[key]);
      location.reload();
    } catch (error) { this.setStatus(error.message, true); }
  }

  toggle(open) {
    this.root.classList.toggle("is-hidden", !open);
    this.button.setAttribute("aria-expanded", String(open));
    if (open) this.root.querySelector("button, input")?.focus();
  }

  handleClick(event) {
    if (event.target.closest("[data-account-close]")) return this.toggle(false);
    const modeButton = event.target.closest("[data-account-mode]");
    if (modeButton) {
      this.mode = modeButton.dataset.accountMode === "register" ? "register" : "login";
      this.render();
      return;
    }
    if (event.target.closest("[data-account-logout]")) return this.logout();
    if (event.target.closest("[data-account-backup]")) return this.backup();
    if (event.target.closest("[data-account-restore]")) return this.restore();
    if (event.target === this.root) this.toggle(false);
  }

  handleSubmit(event) {
    if (!event.target.matches("[data-account-login], [data-account-register]")) return;
    event.preventDefault();
    if (event.target.matches("[data-account-register]")) this.register(event.target);
    else this.login(event.target);
  }

  setFormBusy(form, busy, label = "") {
    for (const element of form.elements) element.disabled = busy;
    const submit = form.querySelector('[type="submit"]');
    if (submit) {
      if (!submit.dataset.defaultLabel) submit.dataset.defaultLabel = submit.textContent;
      submit.textContent = busy ? label : submit.dataset.defaultLabel;
    }
  }

  setStatus(message, error = false) {
    const target = this.root.querySelector("[data-account-status]");
    if (!target) return;
    target.textContent = message;
    target.classList.toggle("is-error", error);
  }

  renderAuthenticated() {
    const username = this.user.username || "Tài khoản";
    const initial = username.slice(0, 1).toLocaleUpperCase("vi");
    this.button.classList.add("is-signed-in");
    this.button.textContent = initial;
    this.button.setAttribute("aria-label", `Tài khoản ${username}`);
    this.root.querySelector("[data-account-content]").innerHTML = `<div class="account-profile"><span aria-hidden="true">${escapeHTML(initial)}</span><div><strong>${escapeHTML(username)}</strong><small>Tài khoản Tính Điểm THPT</small></div></div><p>Dữ liệu tính điểm, nguyện vọng và lịch sử thi thử có thể tự sao lưu khi bạn thay đổi.</p><div class="account-actions"><button class="button button-primary" type="button" data-account-backup>Sao lưu ngay</button><button class="button button-light" type="button" data-account-restore>Khôi phục bản sao</button></div><p class="account-status" data-account-status aria-live="polite">Đã đăng nhập bằng phiên bảo mật.</p><button class="account-logout" type="button" data-account-logout>Đăng xuất</button>`;
  }

  renderGuest() {
    if (!this.config?.enabled) {
      this.root.querySelector("[data-account-content]").innerHTML = `<h2 id="account-title">Tài khoản đang được cấu hình</h2><p>Bạn vẫn dùng đầy đủ mọi công cụ mà không cần đăng nhập.</p>`;
      return;
    }
    const register = this.mode === "register";
    this.root.querySelector("[data-account-content]").innerHTML = `<div class="account-intro-icon" aria-hidden="true">♙</div><h2 id="account-title">Tài khoản Tính Điểm THPT</h2><div class="account-auth-tabs" role="tablist" aria-label="Đăng nhập hoặc tạo tài khoản"><button type="button" role="tab" aria-selected="${!register}" class="${!register ? "is-active" : ""}" data-account-mode="login">Đăng nhập</button><button type="button" role="tab" aria-selected="${register}" class="${register ? "is-active" : ""}" data-account-mode="register">Tạo tài khoản</button></div>${register ? `<form class="account-auth-form" data-account-register><label>Tên đăng nhập<input name="username" required minlength="4" maxlength="24" pattern="[a-z0-9][a-z0-9._-]{2,22}[a-z0-9]" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ví dụ: quangvinh26"></label><label>Mật khẩu<input name="password" type="password" required minlength="10" maxlength="72" autocomplete="new-password" placeholder="Ít nhất 10 ký tự"></label><label>Nhập lại mật khẩu<input name="passwordConfirmation" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></label><p class="account-form-note">Mật khẩu cần có chữ và số. Cloudflare Turnstile sẽ xác minh trước khi tạo tài khoản.</p><button class="button button-primary" type="submit">Xác minh và tạo tài khoản</button><p class="account-status" data-account-status aria-live="polite"></p></form>` : `<form class="account-auth-form" data-account-login><label>Tên đăng nhập<input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></label><label>Mật khẩu<input name="password" type="password" required autocomplete="current-password"></label><button class="button button-primary" type="submit">Đăng nhập</button><p class="account-status" data-account-status aria-live="polite"></p></form>`}<ul><li>Sao lưu điểm, nguyện vọng và lịch sử thi thử.</li><li>Khôi phục dữ liệu trên thiết bị khác.</li><li>Không đăng nhập vẫn dùng đầy đủ công cụ.</li></ul>`;
  }

  render() {
    if (this.isAuthenticated()) return this.renderAuthenticated();
    this.button.classList.remove("is-signed-in");
    this.button.textContent = "♙";
    this.button.setAttribute("aria-label", "Đăng nhập hoặc tạo tài khoản");
    this.renderGuest();
  }
}
