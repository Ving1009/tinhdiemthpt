import { initAdConsent } from "./adConsent.js";

(() => {
  initAdConsent();
  const toggle = document.getElementById("content-theme-toggle");
  function applyTheme(dark) {
    document.body.classList.toggle("dark", dark);
    toggle?.setAttribute("aria-label", dark ? "Bật giao diện sáng" : "Bật giao diện tối");
    if (toggle) toggle.querySelector("span").textContent = dark ? "☀" : "☾";
  }
  try { applyTheme(JSON.parse(localStorage.getItem("thpt-calculator-theme-v1")) === "dark"); } catch { applyTheme(false); }
  toggle?.addEventListener("click", () => {
    const dark = !document.body.classList.contains("dark");
    applyTheme(dark);
    try { localStorage.setItem("thpt-calculator-theme-v1", JSON.stringify(dark ? "dark" : "light")); } catch { /* Nội dung vẫn đọc được khi bộ nhớ bị chặn. */ }
  });
  const form = document.getElementById("guide-filter");
  if (!form) return;
  form.querySelectorAll("input, select, button").forEach(control => { control.disabled = false; });
  const cards = [...document.querySelectorAll("[data-guide-card]")];
  const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
  function filter() {
    const terms = normalize(document.getElementById("guide-search").value.trim()).split(/\s+/).filter(Boolean);
    const category = document.getElementById("guide-category").value;
    for (const card of cards) card.hidden = Boolean(category && category !== card.dataset.category) || !terms.every(term => normalize(card.textContent).includes(term));
    const count = cards.filter(card => !card.hidden).length;
    document.getElementById("guide-count").textContent = `${count} bài hướng dẫn phù hợp`;
    document.getElementById("guide-no-results").hidden = count !== 0;
  }
  form.addEventListener("input", filter);
  form.addEventListener("change", filter);
  form.addEventListener("submit", event => { event.preventDefault(); filter(); });
  form.addEventListener("reset", () => setTimeout(filter, 0));
})();
