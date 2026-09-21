const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let configurationPromise;
let scriptPromise;

class TurnstileClientError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "TurnstileClientError";
    this.code = code;
  }
}

function resolveApiUrl(path, location = window.location) {
  const isLiveServer = ["localhost", "127.0.0.1"].includes(location.hostname) && /^55\d\d$/.test(location.port);
  return isLiveServer ? `http://127.0.0.1:3000${path}` : path;
}

async function loadConfiguration(fetchImpl = globalThis.fetch) {
  if (!configurationPromise) {
    configurationPromise = fetchImpl(resolveApiUrl("/api/security-config"))
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) throw new Error("Không tải được cấu hình xác minh bảo mật.");
        return payload.data?.turnstile || { enabled: false, siteKey: "" };
      })
      .catch((error) => {
        configurationPromise = undefined;
        throw error;
      });
  }
  return configurationPromise;
}

function loadScript(documentRef = document) {
  if (globalThis.turnstile) return Promise.resolve(globalThis.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = documentRef.querySelector(`script[src="${SCRIPT_URL}"]`);
    const script = existing || documentRef.createElement("script");
    const onReady = () => globalThis.turnstile ? resolve(globalThis.turnstile) : reject(new Error("Không khởi tạo được Cloudflare Turnstile."));
    script.addEventListener("load", onReady, { once: true });
    script.addEventListener("error", () => reject(new Error("Không tải được Cloudflare Turnstile.")), { once: true });
    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      documentRef.head.append(script);
    }
  }).catch((error) => {
    scriptPromise = undefined;
    throw error;
  });
  return scriptPromise;
}

function challengeCopy(action) {
  return action === "scan_transcript"
    ? { title: "Xác minh trước khi quét", description: "Bước này giúp bảo vệ lượt quét ảnh và các khóa AI của hệ thống." }
    : { title: "Xác minh trước khi gửi", description: "Bước này giúp ngăn báo cáo rác tự động." };
}

export class TurnstileGate {
  async getToken(action) {
    const configuration = await loadConfiguration();
    if (!configuration.enabled) return "";
    if (!configuration.siteKey) throw new Error("Turnstile chưa có site key.");
    const api = await loadScript();
    return this.openChallenge(api, configuration.siteKey, action);
  }

  openChallenge(api, siteKey, action) {
    const copy = challengeCopy(action);
    return new Promise((resolve, reject) => {
      const returnFocus = document.activeElement;
      const overlay = document.createElement("div");
      overlay.className = "turnstile-overlay";
      overlay.innerHTML = `<div class="turnstile-backdrop"></div><section class="turnstile-dialog" role="dialog" aria-modal="true" aria-labelledby="turnstile-title"><button class="turnstile-close" type="button" aria-label="Đóng xác minh">×</button><span class="turnstile-shield" aria-hidden="true">✓</span><h2 id="turnstile-title">${copy.title}</h2><p>${copy.description}</p><div class="turnstile-widget"></div><small>Được bảo vệ bởi Cloudflare Turnstile</small></section>`;
      document.body.append(overlay);
      document.body.classList.add("turnstile-open");
      const closeButton = overlay.querySelector(".turnstile-close");
      const widget = overlay.querySelector(".turnstile-widget");
      let settled = false;
      let widgetId;

      const finish = (error, token) => {
        if (settled) return;
        settled = true;
        if (widgetId !== undefined) api.remove(widgetId);
        overlay.remove();
        document.body.classList.remove("turnstile-open");
        returnFocus?.focus?.();
        if (error) reject(error);
        else resolve(token);
      };
      const cancel = () => finish(new TurnstileClientError("Bạn đã đóng bước xác minh bảo mật.", "TURNSTILE_CANCELLED"));
      closeButton.addEventListener("click", cancel);
      overlay.querySelector(".turnstile-backdrop").addEventListener("click", cancel);
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") cancel();
      });
      closeButton.focus();

      try {
        widgetId = api.render(widget, {
          sitekey: siteKey,
          action,
          theme: "auto",
          language: "vi",
          size: "normal",
          callback: (token) => {
            overlay.querySelector(".turnstile-dialog").classList.add("is-verified");
            window.setTimeout(() => finish(null, token), 350);
          },
          "error-callback": () => finish(new Error("Cloudflare chưa thể xác minh. Hãy thử lại.")),
          "expired-callback": () => api.reset(widgetId),
          "timeout-callback": () => api.reset(widgetId)
        });
      } catch {
        finish(new Error("Không khởi tạo được bước xác minh bảo mật."));
      }
    });
  }
}

export const turnstileGate = new TurnstileGate();
