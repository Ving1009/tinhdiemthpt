export function initAdConsent() {
  const link = document.querySelector("[data-ad-consent]");
  if (!link) return;
  link.hidden = true;
  link.addEventListener("click", event => {
    event.preventDefault();
    window.googlefc?.showRevocationMessage?.();
  });
  window.googlefc = window.googlefc || {};
  window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
  window.googlefc.callbackQueue.push({ CONSENT_API_READY: () => {
    if (typeof window.__tcfapi !== "function") return;
    try {
      window.__tcfapi("addEventListener", 0, (data, success) => {
        link.hidden = !(success && data?.gdprApplies && typeof window.googlefc?.showRevocationMessage === "function");
      });
    } catch { /* CMP chưa sẵn sàng: công cụ và nội dung vẫn dùng được. */ }
  } });
}
