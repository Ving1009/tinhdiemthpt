import { canCalculateMajor, cutoffLabel, cutoffStatusLabel, paginate, publicProfileNote, publishableCutoff, verifiedCutoff } from "./admissions.js?v=20260914-3";
import { Calculator } from "./calculator.js";
import { UniversityRepository } from "./university.js?v=20260914-2";
import { $, $$, debounce, escapeHTML, formatScore, sanitizeScoreInput, storage, validateScore } from "./utils.js";
import { formulaList } from "../formulas/index.js";
import { ACADEMIC_METHODS } from "../formulas/hocba.js";
import { calculateAcademicCombinations } from "./core/academicCalculator.js";
import { applyCertificateToEntries } from "./core/certificateApplication.js";
import { STANDARD_SUBJECTS, combinationSubjectKeys, isStandardCombination, subjectLabelForKey } from "./core/subjectMatching.js";
import { calculateAutomaticCombinations, calculateCombination, validateSubjectEntries } from "./core/thptCombinations.js";
import { createDataReport } from "./core/dataReport.js";
import { simulateScoreChange } from "./core/scoreSimulation.js";
import { createFinderScoreContext, createScoreProfile, finderContextIsFresh, formatFinderScoreContext } from "./core/scoreState.js";
import { createWishBackup, mergeWishListsDetailed, moveWishById, normalizeWish, normalizeWishList, parseWishBackup, removeWishById, wishIdentity, wishesToXlsxBytes } from "./core/wishList.js";
import { autoFillTranscript } from "./autoFillTranscript.js";
import { TranscriptPreview } from "./transcriptPreview.js";
import { TranscriptScanner } from "./transcriptScanner.js";

const FORM_STORAGE_KEY = "thpt-calculator-form-v2";
const THEME_STORAGE_KEY = "thpt-calculator-theme-v1";
const WISH_STORAGE_KEY = "thpt-saved-wishes-v3";
const LEGACY_WISH_STORAGE_KEYS = ["thpt-saved-wishes-v2", "thpt-saved-wishes-v1"];
const WISH_MIGRATION_BACKUP_KEY = "thpt-saved-wishes-migration-backup";
const COMPARE_STORAGE_KEY = "thpt-major-comparison-v2";
const LEGACY_COMPARE_STORAGE_KEY = "thpt-major-comparison-v1";
const SCORE_CONTEXTS = {
  THPT: [{ value: 30, label: "Thang 30 · điểm xét tuyển" }],
  "Học bạ": [{ value: 30, label: "Thang 30" }, { value: 40, label: "Thang 40 · có hệ số" }],
  "ĐGNL V-ACT": [{ value: 1200, label: "V-ACT gốc · thang 1.200" }],
  "ĐGNL HSA": [{ value: 150, label: "HSA gốc · thang 150" }],
  "ĐGTD TSA": [{ value: 100, label: "TSA gốc · thang 100" }],
  "ĐGNL SPT": [{ value: 150, label: "SPT gốc · thang 150" }],
  "V-SAT": [{ value: 450, label: "V-SAT gốc · thang 450" }]
};
const ACADEMIC_SUBJECTS = [
  { id: "math", label: "Toán" }, { id: "literature", label: "Văn" }, { id: "foreignLanguage", label: "Ngoại ngữ" },
  { id: "history", label: "Sử" }, { id: "geography", label: "Địa" }, { id: "civicEducation", label: "GDKTPL" },
  { id: "physics", label: "Lí" }, { id: "chemistry", label: "Hóa" }, { id: "biology", label: "Sinh" },
  { id: "informatics", label: "Tin học" }, { id: "industrialTechnology", label: "Công nghệ công nghiệp" },
  { id: "agriculturalTechnology", label: "Công nghệ nông nghiệp" }
];
const UNIVERSITY_REGIONS = [
  { id: "north", label: "Miền Bắc" }, { id: "central", label: "Miền Trung" }, { id: "south", label: "Miền Nam" }
];
const UNIVERSITY_PROFILE_STATUS = {
  member_units: { full: "Xem hồ sơ tại các trường thành viên", compact: "Theo trường thành viên" },
  parent_linked: { full: "Hồ sơ theo trường hoặc đơn vị chủ quản", compact: "Theo trường chủ quản" },
  special_admissions: { full: "Tuyển sinh theo điều kiện và quy định đặc thù", compact: "Tuyển sinh đặc thù" },
  graduate_only: { full: "Không tuyển sinh cử nhân từ kết quả THPT", compact: "Chỉ đào tạo sau đại học" },
  not_general_undergraduate: { full: "Không áp dụng tuyển sinh đại học phổ thông", compact: "Không tuyển sinh từ THPT" }
};

function safeWebsite(value) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}

function downloadBlob(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseDeepLink(hash = location.hash) {
  try {
    const parts = String(hash || "").replace(/^#/, "").split("/").map((item) => decodeURIComponent(item));
    if (parts[0] === "truong" && parts[1]) return { universityId: parts[1], majorId: "" };
    if (parts[0] === "nganh" && parts[1] && parts[2]) return { universityId: parts[1], majorId: parts[2] };
  } catch { return null; }
  return null;
}

function loadPersonalList(currentKey, legacyKeys, maxItems, backupKey = WISH_MIGRATION_BACKUP_KEY) {
  const current = storage.get(currentKey, null);
  if (Array.isArray(current)) return normalizeWishList(current, maxItems);
  for (const key of legacyKeys) {
    const legacy = storage.get(key, null);
    if (!Array.isArray(legacy) || !legacy.length) continue;
    storage.set(backupKey, { sourceKey: key, createdAt: new Date().toISOString(), items: legacy });
    const migrated = normalizeWishList(legacy, maxItems);
    storage.set(currentKey, migrated);
    return migrated;
  }
  return [];
}

class THPTApp {
  constructor() {
    this.repository = new UniversityRepository();
    this.state = storage.get(FORM_STORAGE_KEY, {});
    this.thptMode = this.state.thptMode === "manual" ? "manual" : "auto";
    this.activeUniversityRegion = "all";
    this.universityPage = 1;
    this.combinationPage = 1;
    this.majorPage = 1;
    this.majorSearchMode = "filters";
    this.lastResult = null;
    this.lastTrigger = null;
    this.lastAcademicResult = null;
    this.lastAcademicTrigger = null;
    this.lastThptResults = [];
    this.certificateRules = [];
    this.appliedCertificate = null;
    this.savedWishes = loadPersonalList(WISH_STORAGE_KEY, LEGACY_WISH_STORAGE_KEYS);
    this.comparisonItems = loadPersonalList(COMPARE_STORAGE_KEY, [LEGACY_COMPARE_STORAGE_KEY], 4, "thpt-major-comparison-migration-backup");
    this.scoreRevision = 0;
    this.scoreProfile = null;
    this.activeFinderContext = null;
    this.majorRequestVersion = 0;
    this.modalReturnFocus = null;
    this.elements = {
      form: $("#score-form"), resultEmpty: $("#result-empty"), resultContent: $("#result-content"), resultLabel: $("#result-label"), resultContext: $("#result-context"), resultTotal: $("#result-total"), resultMax: $("#result-max"), resultDetails: $("#result-details"), resultList: $("#thpt-result-list"),
      combinationSelect: $("#combination-select"), scoreGrid: $("#score-grid"), autoSubjectGrid: $("#auto-subject-grid"),
      academicForm: $("#academic-form"), academicMethod: $("#academic-method"), academicLanguage: $("#academic-language"), academicHead: $("#academic-head"), academicBody: $("#academic-body"), academicResultEmpty: $("#academic-result-empty"), academicResultContent: $("#academic-result-content"), academicResultLabel: $("#academic-result-label"), academicResultContext: $("#academic-result-context"), academicResultTotal: $("#academic-result-total"), academicResultMax: $("#academic-result-max"), academicResultDetails: $("#academic-result-details"), academicResultList: $("#academic-result-list"),
      universitySelect: $("#university-select"), majorSelect: $("#major-select"), methodSelect: $("#method-select"), calculateAdmission: $("#calculate-admission"), selectionHint: $("#selection-hint"),
      combinationGrid: $("#combination-grid"), combinationEmpty: $("#combination-empty"), combinationCount: $("#combination-count"), universityGrid: $("#university-grid"), universityEmpty: $("#university-empty"), universityRegionFilters: $("#university-region-filters"), formulaGrid: $("#formula-grid"),
      modal: $("#modal"), modalBody: $("#modal-body"), toast: $("#toast")
    };
  }

  async init() {
    this.applyTheme(storage.get(THEME_STORAGE_KEY, "light"));
    this.bindGlobalEvents();
    this.setView(location.hash);
    this.setupTranscriptTools();
    this.renderFormulas();
    this.renderSavedWishes();
    this.renderComparison();
    try {
      await this.repository.load();
      this.populateCombinationSelects();
      this.populateUniversitySelects();
      this.restoreCommonControls();
      this.renderAutoSubjectRows();
      this.renderManualScoreFields();
      this.renderAcademicFields();
      this.populateAcademicMultiplierSubjects();
      this.syncMajorScoreContext();
      this.setThptMode(this.thptMode, false);
      this.renderCombinations();
      this.renderUniversities();
      await this.restoreAdmissionSelections();
      await this.openDeepLinkFromHash();
    } catch (error) {
      this.elements.universityGrid.innerHTML = '<p class="empty-state error-state">Không thể tải dữ liệu. <button class="button button-text" type="button" data-retry-load>Thử lại</button></p>';
      this.showToast(error.message);
    }
  }

  bindGlobalEvents() {
    window.addEventListener("hashchange", () => this.handleLocationChange());
    window.addEventListener("popstate", () => this.handleLocationChange());
    $("#theme-toggle").addEventListener("click", () => this.toggleTheme());
    $("#menu-toggle").addEventListener("click", () => this.toggleMenu());
    $$(".site-nav a").forEach((link) => link.addEventListener("click", () => this.closeMenu()));
    $("#mobile-search-toggle").addEventListener("click", () => this.toggleMobileSearch());
    window.addEventListener("scroll", () => $("#site-header").classList.toggle("scrolled", window.scrollY > 4), { passive: true });

    document.addEventListener("error", (event) => {
      if (!(event.target instanceof HTMLImageElement) || !event.target.classList.contains("school-logo")) return;
      const fallback = document.createElement("span");
      fallback.className = "school-logo logo-fallback";
      fallback.textContent = event.target.dataset.code || "ĐH";
      fallback.setAttribute("role", "img");
      fallback.setAttribute("aria-label", `${event.target.alt} — đang cập nhật`);
      event.target.replaceWith(fallback);
    }, true);

    document.addEventListener("keydown", (event) => this.handleDocumentKeydown(event));
    document.addEventListener("click", (event) => this.handleDocumentClick(event));
    document.addEventListener("submit", (event) => {
      if (!event.target.matches("#data-report-form")) return;
      event.preventDefault();
      this.submitDataReport(event.target.querySelector("[data-submit-report]"));
    });

    const autoCalculate = debounce(() => this.calculateTHPT(false), 250);
    this.elements.form.addEventListener("input", (event) => {
      if (event.target.matches("[data-auto-score], [data-manual-score]")) event.target.value = sanitizeScoreInput(event.target.value);
      if (event.target.matches("[data-auto-score]") && Number(event.target.dataset.autoScore) === this.appliedCertificate?.rowIndex) this.clearAppliedCertificate();
      if (event.target.matches("[data-auto-score], [data-manual-score]")) this.invalidateScoreDerived("Điểm môn đã thay đổi.");
      this.saveForm();
      if (this.thptMode === "auto") autoCalculate();
    });
    this.elements.form.addEventListener("change", (event) => {
      if (event.target.matches("[data-auto-subject]")) {
        if (Number(event.target.dataset.autoSubject) === this.appliedCertificate?.rowIndex) this.clearAppliedCertificate();
        this.syncAutoSubjectOptions();
      }
      if (event.target.matches("[data-auto-subject], #admission-year")) this.invalidateScoreDerived("Môn hoặc năm tuyển sinh đã thay đổi.");
      if (event.target.matches("#area, #priority-group")) this.syncPriorityControls("thpt");
      this.saveForm();
      if (this.thptMode === "auto") autoCalculate();
    });
    this.elements.form.addEventListener("submit", (event) => { event.preventDefault(); this.calculateTHPT(true); });
    $$("[data-thpt-mode]").forEach((button) => button.addEventListener("click", () => this.setThptMode(button.dataset.thptMode)));
    this.elements.combinationSelect.addEventListener("change", () => { this.invalidateScoreDerived("Tổ hợp đã thay đổi."); this.renderManualScoreFields(); this.saveForm(); });
    $("#clear-score-data").addEventListener("click", () => this.clearFormData());
    $("#recalculate").addEventListener("click", () => this.goTo("#calculator"));
    $("#show-calculation").addEventListener("click", () => this.openCalculationModal());
    $("#find-all-combinations").addEventListener("click", () => this.findMajorsForAllCombinations());
    $("#simulate-score").addEventListener("click", () => this.openScoreSimulation());

    this.elements.academicForm.addEventListener("input", (event) => {
      if (event.target.matches("[data-academic-score]")) event.target.value = sanitizeScoreInput(event.target.value);
      if (event.target.matches("[data-academic-score]")) this.markAcademicResultStale("Điểm học bạ đã thay đổi, cần tính lại.");
      this.saveForm();
    });
    this.elements.academicForm.addEventListener("submit", (event) => { event.preventDefault(); this.calculateAcademic(); });
    this.elements.academicMethod.addEventListener("change", () => { this.markAcademicResultStale("Phương thức học bạ đã thay đổi, cần tính lại."); this.renderAcademicFields(); this.saveForm(); });
    this.elements.academicLanguage.addEventListener("change", () => { this.markAcademicResultStale("Môn ngoại ngữ đã thay đổi, cần tính lại."); this.populateAcademicMultiplierSubjects(); this.saveForm(); });
    $("#academic-area").addEventListener("change", () => this.syncPriorityControls("academic"));
    $("#academic-priority-group").addEventListener("change", () => this.syncPriorityControls("academic"));
    $("#academic-multiplier-enabled").addEventListener("change", () => { this.markAcademicResultStale("Hệ số học bạ đã thay đổi, cần tính lại."); this.syncAcademicMultiplier(); this.saveForm(); });
    $("#academic-multiplier-subject").addEventListener("change", () => { this.markAcademicResultStale("Môn hệ số đã thay đổi, cần tính lại."); this.saveForm(); });
    $("#clear-academic-data").addEventListener("click", () => this.clearAcademicData());
    $("#show-academic-calculation").addEventListener("click", () => this.openAcademicCalculationModal());

    this.elements.universitySelect.addEventListener("change", () => { this.admissionLoadVersion = (this.admissionLoadVersion || 0) + 1; this.populateMajorSelect(); });
    this.elements.majorSelect.addEventListener("change", () => { this.clearAdmissionResult(); this.populateMethodSelect(); this.saveForm(); });
    this.elements.calculateAdmission.addEventListener("click", () => this.focusAdmissionCalculator());
    this.elements.methodSelect.addEventListener("change", () => { this.clearAdmissionResult(); this.renderAdmissionCalculator(); this.saveForm(); });
    $("#combination-query").addEventListener("input", debounce((event) => this.renderCombinations(event.target.value), 180));
    $("#university-query").addEventListener("input", debounce((event) => this.renderUniversities(event.target.value), 180));
    this.elements.universityRegionFilters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-university-region]");
      if (!button) return;
      this.activeUniversityRegion = button.dataset.universityRegion;
      this.renderUniversities($("#university-query").value);
    });

    this.bindSearchInput($("#global-search"), $("#search-results"));
    this.bindSearchInput($("#mobile-search"), $("#mobile-search-results"));

    $("#certificate-university").addEventListener("change", () => { this.clearAppliedCertificate(); this.loadCertificateRules(); });
    $("#certificate-type").addEventListener("change", () => { this.clearAppliedCertificate(); this.syncCertificateControls(); });
    $("#certificate-method").addEventListener("change", () => { this.clearAppliedCertificate(); this.syncCertificatePurpose(); });
    $("#certificate-form").addEventListener("submit", (event) => { event.preventDefault(); this.calculateCertificate(); });

    $("#major-filter-form").addEventListener("submit", (event) => { event.preventDefault(); this.majorPage = 1; this.majorSearchMode === "combinations" && this.allCombinationSearch?.length ? this.loadBestCombinationResults() : this.loadMajorResults(); });
    const invalidateMajorResults = debounce(() => this.invalidateMajorResults(), 120);
    $("#major-filter-form").addEventListener("input", (event) => {
      if (event.target.matches("#major-user-score")) this.exitAllCombinationMode(true);
      invalidateMajorResults();
    });
    $("#major-filter-form").addEventListener("change", (event) => {
      if (event.target.matches("#major-method-filter, #major-score-scale, #major-combination-filter")) this.exitAllCombinationMode(true);
      if (!event.target.matches("#major-sort")) invalidateMajorResults();
    });
    $("#major-method-filter").addEventListener("change", () => this.syncMajorScoreContext());
    $("#major-sort").addEventListener("change", () => { if ($("#major-result-grid").children.length) this.majorSearchMode === "combinations" ? this.loadBestCombinationResults() : this.loadMajorResults(); });
    $("#major-filter-clear").addEventListener("click", () => this.clearMajorFilters());
    $("#clear-saved-wishes").addEventListener("click", () => { if (!this.savedWishes.length) return; this.recentWishRemoval = { items: [...this.savedWishes], index: 0 }; this.savedWishes = []; this.persistWishes(); });
    $("#clear-comparison").addEventListener("click", () => { this.comparisonItems = []; this.persistComparison(); });
    $("#export-wishes-json").addEventListener("click", () => this.exportWishesJson());
    $("#export-wishes-excel").addEventListener("click", () => this.exportWishesExcel());
    $("#print-wishes").addEventListener("click", () => { $("#wish-print-meta").textContent = `Năm tuyển sinh 2026 · Xuất ngày ${new Date().toLocaleDateString("vi-VN")} · ${this.savedWishes.length} nguyện vọng`; window.print(); });
    $("#import-wishes-json").addEventListener("change", (event) => this.previewWishImport(event.target.files?.[0]));
  }

  handleDocumentKeydown(event) {
    if (event.key === "Escape") {
      if (!this.elements.modal.classList.contains("is-hidden")) this.closeModal();
      this.hideSearch();
    }
    if (event.key === "Tab" && !this.elements.modal.classList.contains("is-hidden")) {
      const nodes = [...this.elements.modal.querySelectorAll('button, a[href], input, select, summary, [tabindex="0"]')].filter((node) => !node.disabled && node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    const results = event.target.closest(".global-search, .mobile-search-panel")?.querySelector(".search-results");
    if (results && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      const buttons = [...results.querySelectorAll("button")];
      if (!buttons.length) return;
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement);
      buttons[event.key === "ArrowDown" ? Math.min(buttons.length - 1, index + 1) : Math.max(0, index - 1)]?.focus();
    }
  }

  handleDocumentClick(event) {
    if (!event.target.closest(".global-search, .mobile-search-panel, #mobile-search-toggle")) this.hideSearch();
    if (event.target.closest("[data-close-modal]")) this.closeModal();
    const retry = event.target.closest("[data-retry-load]"); if (retry) location.reload();
    const page = event.target.closest("[data-page-kind]");
    if (page) this.changePage(page.dataset.pageKind, Number(page.dataset.page));
    const school = event.target.closest("[data-school-id]"); if (school) this.openUniversityModal(school.dataset.schoolId, school);
    const combination = event.target.closest("[data-combination-id]"); if (combination) this.openCombinationModal(combination.dataset.combinationId, combination);
    const formula = event.target.closest("[data-formula-id]"); if (formula) this.openFormulaModal(formula.dataset.formulaId, formula);
    const searchSchool = event.target.closest("[data-search-school]"); if (searchSchool) { this.hideSearch(); this.openUniversityModal(searchSchool.dataset.searchSchool, searchSchool); }
    const searchMajor = event.target.closest("[data-search-major]"); if (searchMajor) { this.hideSearch(); this.openUniversityModal(searchMajor.dataset.universityId, searchMajor, searchMajor.dataset.searchMajor); }
    const searchCombination = event.target.closest("[data-search-combination]"); if (searchCombination) { this.hideSearch(); this.openCombinationModal(searchCombination.dataset.searchCombination, searchCombination); }
    const find = event.target.closest("[data-find-combination]"); if (find) this.findMajorsForCombination(find.dataset.findCombination, Number(find.dataset.score), Number(find.dataset.scale));
    const academicResult = event.target.closest("[data-academic-result-index]"); if (academicResult) this.selectAcademicResult(Number(academicResult.dataset.academicResultIndex));
    const save = event.target.closest("[data-save-major]"); if (save) this.saveWishFromButton(save);
    const viewMajor = event.target.closest("[data-view-major]"); if (viewMajor) this.openUniversityModal(viewMajor.dataset.universityId, viewMajor, viewMajor.dataset.viewMajor);
    const remove = event.target.closest("[data-remove-wish]"); if (remove) this.removeWish(remove.dataset.removeWish);
    const move = event.target.closest("[data-move-wish]"); if (move) this.moveWish(move.dataset.moveWish, Number(move.dataset.direction));
    const compare = event.target.closest("[data-compare-major]"); if (compare) this.addComparison(compare.dataset.compareMajor);
    const compareWish = event.target.closest("[data-compare-wish]"); if (compareWish) this.addComparison(compareWish.dataset.compareWish, true);
    const removeCompare = event.target.closest("[data-remove-compare]"); if (removeCompare) this.removeComparison(removeCompare.dataset.removeCompare);
    const undoWish = event.target.closest("[data-undo-wish]"); if (undoWish) this.undoWishRemoval();
    const applyImport = event.target.closest("[data-apply-wish-import]"); if (applyImport) this.applyWishImport(applyImport.dataset.applyWishImport);
    const reportSchool = event.target.closest("[data-report-school]"); if (reportSchool) this.openDataReport({ universityId: reportSchool.dataset.reportSchool }, reportSchool);
    const reportMajor = event.target.closest("[data-report-major]"); if (reportMajor) this.openDataReport({ majorId: reportMajor.dataset.reportMajor }, reportMajor);
    const downloadReport = event.target.closest("[data-download-report]"); if (downloadReport) this.downloadDataReport();
    const copyReport = event.target.closest("[data-copy-report]"); if (copyReport) this.copyDataReport();
    const applySimulation = event.target.closest("[data-apply-simulation]"); if (applySimulation) this.applyScoreSimulation();
    const useCertificate = event.target.closest("[data-use-certificate]"); if (useCertificate) this.useCertificateResult();
    const clearCertificate = event.target.closest("[data-clear-certificate]"); if (clearCertificate) this.clearAppliedCertificate({ announce: true });
  }

  setView(hash) {
    const allowed = ["calculator", "academic", "admission", "certificate", "major-finder", "combinations", "universities", "formulas", "guide"];
    const rawValue = String(hash || "").replace(/^#/, "");
    const value = /^(?:truong|nganh)\//.test(rawValue) ? "universities" : rawValue;
    const view = allowed.includes(value) ? value : "calculator";
    document.querySelectorAll("main > .section").forEach((section) => { section.hidden = section.id !== view && !(section.id === "home" && view === "calculator"); });
    document.querySelectorAll(".site-nav a").forEach((link) => { const active = link.hash === `#${view}`; link.classList.toggle("is-active", active); active ? link.setAttribute("aria-current", "page") : link.removeAttribute("aria-current"); });
    const heading = document.querySelector(`#${view} h1, #${view} h2`);
    document.title = `${heading?.textContent?.trim() || "Tính Điểm THPT"} | Tính Điểm THPT`;
  }
  async handleLocationChange() {
    this.setView(location.hash);
    const deepLink = parseDeepLink();
    if (deepLink && this.repository.universities.length) await this.openUniversityModal(deepLink.universityId, null, deepLink.majorId, false);
    else if (this.modalRouteActive && !this.elements.modal.classList.contains("is-hidden")) this.closeModal(false);
  }
  async openDeepLinkFromHash() { const deepLink = parseDeepLink(); if (deepLink) await this.openUniversityModal(deepLink.universityId, null, deepLink.majorId, false); }
  goTo(hash) { this.setView(hash); if (location.hash !== hash) history.pushState(null, "", hash); document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  applyTheme(theme) { const dark = theme === "dark"; document.body.classList.toggle("dark", dark); $("#theme-toggle span").textContent = dark ? "☀" : "☾"; $("#theme-toggle").setAttribute("aria-label", dark ? "Bật giao diện sáng" : "Bật giao diện tối"); }
  toggleTheme() { const next = document.body.classList.contains("dark") ? "light" : "dark"; this.applyTheme(next); storage.set(THEME_STORAGE_KEY, next); }
  toggleMenu() { const nav = $("#site-nav"), button = $("#menu-toggle"), open = !nav.classList.contains("open"); nav.classList.toggle("open", open); button.setAttribute("aria-expanded", String(open)); }
  closeMenu() { $("#site-nav").classList.remove("open"); $("#menu-toggle").setAttribute("aria-expanded", "false"); }
  toggleMobileSearch() { const panel = $("#mobile-search-panel"), button = $("#mobile-search-toggle"), open = panel.classList.contains("is-hidden"); panel.classList.toggle("is-hidden", !open); button.setAttribute("aria-expanded", String(open)); if (open) $("#mobile-search").focus(); }
  hideSearch() { $$(".search-results").forEach((item) => item.classList.add("is-hidden")); }

  restoreCommonControls() {
    const common = this.state.common || {};
    for (const id of ["admission-year", "area", "priority-group"]) if (common[id] && document.getElementById(id)) document.getElementById(id).value = common[id];
    if (this.state.academicMethod && ACADEMIC_METHODS[this.state.academicMethod]) this.elements.academicMethod.value = this.state.academicMethod;
    if (this.state.academicLanguage) this.elements.academicLanguage.value = this.state.academicLanguage;
    $("#academic-multiplier-enabled").checked = this.state.academicMultiplierEnabled === true;
    this.syncAcademicMultiplier();
    this.syncPriorityControls("thpt", false);
  }

  saveForm() {
    const academicScores = {};
    $$('[data-academic-score]').forEach((input) => { if (input.value) academicScores[input.id] = input.value; });
    const manualScores = {};
    $$('[data-manual-score]').forEach((input) => { if (input.value) manualScores[input.dataset.manualScore] = input.value; });
    storage.set(FORM_STORAGE_KEY, {
      common: { "admission-year": $("#admission-year").value, area: $("#area").value, "priority-group": $("#priority-group").value },
      thptMode: this.thptMode,
      autoEntries: $$('[data-auto-subject]').map((select, index) => ({ subjectKey: select.value, score: $(`[data-auto-score="${index}"]`)?.value || "" })),
      manualCombinationId: this.elements.combinationSelect.value,
      manualScores,
      academicMethod: this.elements.academicMethod.value,
      academicLanguage: this.elements.academicLanguage.value,
      academicScores,
      academicMultiplierEnabled: $("#academic-multiplier-enabled").checked,
      academicMultiplierSubject: $("#academic-multiplier-subject").value,
      universityId: this.elements.universitySelect.value,
      majorId: this.elements.methodSelect.value || this.elements.majorSelect.value
    });
  }

  getPriorityContext() { return { area: $("#area").value, priorityGroup: $("#priority-group").value }; }
  syncPriorityControls(source = "thpt", save = true) {
    const area = source === "academic" ? $("#academic-area").value : $("#area").value;
    const group = source === "academic" ? $("#academic-priority-group").value : $("#priority-group").value;
    $("#area").value = area; $("#academic-area").value = area;
    $("#priority-group").value = group; $("#academic-priority-group").value = group;
    if (save) this.invalidateScoreDerived("Thông tin ưu tiên đã thay đổi.");
    if (save) this.saveForm();
    if (this.lastThptResults.length) this.calculateTHPT(false);
    if (this.lastAcademicResult) { this.elements.academicResultContent.classList.add("is-hidden"); this.elements.academicResultEmpty.classList.remove("is-hidden"); this.elements.academicResultEmpty.querySelector("p").textContent = "Thông tin ưu tiên đã đổi. Hãy tính lại học bạ."; }
    if (this.elements.methodSelect.value) this.renderAdmissionCalculator();
  }
  invalidateScoreDerived(reason = "Thông tin đã thay đổi, cần tính lại.") {
    this.scoreRevision += 1;
    this.scoreProfile = null;
    if (this.activeFinderContext) {
      this.activeFinderContext.stale = true;
      this.activeFinderContext.staleReason = reason;
      this.allCombinationSearch = null;
      this.finderComparisonScore = null;
      this.finderComparisonScale = null;
      this.finderComparisonRule = null;
      this.majorAbort?.abort();
      this.majorRequestVersion += 1;
      $("#major-result-summary").textContent = "Thông tin đã thay đổi, cần tính lại.";
      $("#major-result-grid").classList.add("is-stale-results");
      $$("#major-result-grid button").forEach((button) => { button.disabled = true; });
      this.renderMajorScoreContext();
    }
  }
  markAcademicResultStale(message = "Thông tin đã thay đổi, cần tính lại.") {
    if (!this.lastAcademicResult) return;
    this.elements.academicResultContent.classList.add("is-hidden");
    this.elements.academicResultEmpty.classList.remove("is-hidden");
    this.elements.academicResultEmpty.querySelector("p").textContent = message;
    this.lastAcademicResult = null;
    this.lastAcademicTrigger = null;
  }
  setThptMode(mode, save = true) {
    if (save && this.thptMode !== (mode === "manual" ? "manual" : "auto")) this.invalidateScoreDerived("Chế độ tính điểm đã thay đổi.");
    this.thptMode = mode === "manual" ? "manual" : "auto";
    $$("[data-thpt-mode]").forEach((button) => { const active = button.dataset.thptMode === this.thptMode; button.classList.toggle("is-active", active); button.setAttribute("aria-selected", String(active)); });
    $("#thpt-auto-panel").classList.toggle("is-hidden", this.thptMode !== "auto");
    $("#thpt-manual-panel").classList.toggle("is-hidden", this.thptMode !== "manual");
    if (save) this.saveForm();
    this.resetThptResult();
    if (this.thptMode === "auto") this.calculateTHPT(false);
  }

  renderAutoSubjectRows() {
    const defaults = ["math", "physics", "chemistry", "foreignLanguage:english"];
    const saved = Array.isArray(this.state.autoEntries) && this.state.autoEntries.length === 4 ? this.state.autoEntries : defaults.map((subjectKey) => ({ subjectKey, score: "" }));
    this.elements.autoSubjectGrid.innerHTML = saved.map((entry, index) => `<div class="auto-subject-row"><div class="field"><label for="auto-subject-${index}">Môn ${index + 1}</label><select id="auto-subject-${index}" data-auto-subject="${index}">${STANDARD_SUBJECTS.map((subject) => `<option value="${escapeHTML(subject.key)}" ${subject.key === entry.subjectKey ? "selected" : ""}>${escapeHTML(subject.label)}</option>`).join("")}</select></div><div class="field"><label for="auto-score-${index}">Điểm</label><input id="auto-score-${index}" data-auto-score="${index}" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${escapeHTML(entry.score || "")}" /><small class="field-error" id="auto-error-${index}"></small></div></div>`).join("");
    this.syncAutoSubjectOptions();
  }
  syncAutoSubjectOptions() {
    const selected = $$('[data-auto-subject]').map((item) => item.value);
    $$('[data-auto-subject]').forEach((select) => [...select.options].forEach((option) => { option.disabled = option.value !== select.value && selected.includes(option.value); }));
  }
  getAutoEntries() {
    const rawEntries = $$('[data-auto-subject]').map((select, index) => ({
      subjectKey: select.value,
      score: $(`[data-auto-score="${index}"]`).value
    }));
    return applyCertificateToEntries(rawEntries, this.appliedCertificate);
  }

  populateCombinationSelects() {
    const combinations = this.repository.combinations.filter(isStandardCombination);
    this.elements.combinationSelect.innerHTML = combinations.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.code)} — ${escapeHTML(item.subjectText)}</option>`).join("");
    const saved = this.repository.getCombination(this.state.manualCombinationId);
    this.elements.combinationSelect.value = saved && isStandardCombination(saved) ? saved.id : this.repository.getCombinationByCode("D01")?.id || combinations[0]?.id || "";
    $("#major-combination-filter").innerHTML = '<option value="">Tất cả tổ hợp</option>' + combinations.map((item) => `<option value="${escapeHTML(item.code)}">${escapeHTML(item.code)} — ${escapeHTML(item.subjectText)}</option>`).join("");
  }
  getSelectedCombination() { return this.repository.getCombination(this.elements.combinationSelect.value); }
  renderManualScoreFields() {
    const combination = this.getSelectedCombination();
    if (!combination) { this.elements.scoreGrid.innerHTML = '<p class="empty-state">Không có tổ hợp tiêu chuẩn phù hợp.</p>'; return; }
    const keys = combinationSubjectKeys(combination);
    const saved = this.state.manualScores || {};
    this.elements.scoreGrid.innerHTML = keys.map((key, index) => `<div class="field score-field"><label for="manual-score-${index}">${escapeHTML(subjectLabelForKey(key))}</label><input id="manual-score-${index}" data-manual-score="${escapeHTML(key)}" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${escapeHTML(saved[key] || "")}" /><small class="field-error" id="manual-error-${index}"></small></div>`).join("");
  }

  calculateTHPT(announce = true) {
    const year = Number($("#admission-year").value);
    try {
      if (this.thptMode === "auto") {
        const entries = this.getAutoEntries();
        const calculation = calculateAutomaticCombinations({ entries, combinations: this.repository.combinations, year, priorityContext: this.getPriorityContext() });
        if (!calculation.valid) { this.resetThptResult(); if (announce) this.showToast(calculation.errors[0]); return; }
        if (!calculation.results.length) { this.resetThptResult("Không có tổ hợp ba môn tiêu chuẩn nào khớp với bốn môn đã chọn."); if (announce) this.showToast("Không tìm thấy tổ hợp phù hợp trong danh mục."); return; }
        this.lastThptInput = { automatic: true, entries: entries.map((item) => ({ ...item, score: Number(String(item.score).replace(",", ".")) })), year, priorityContext: this.getPriorityContext() };
        this.showThptResults(calculation.results, true, announce);
      } else {
        const combination = this.getSelectedCombination();
        const entries = $$('[data-manual-score]').map((input) => ({ subjectKey: input.dataset.manualScore, score: input.value }));
        const input = validateSubjectEntries(entries, 3);
        if (!input.valid) { if (announce) this.showToast(input.errors[0]); return; }
        const result = calculateCombination(combination, input.entries, { year, priorityContext: this.getPriorityContext() });
        this.lastThptInput = { automatic: false, entries: input.entries, year, priorityContext: this.getPriorityContext(), combination };
        this.showThptResults([{ combination, result }], false, announce);
      }
      this.saveForm();
    } catch (error) { this.resetThptResult(error.message); if (announce) this.showToast(error.message); }
  }

  resetThptResult(message = "Chọn và nhập đủ bốn môn để xem các tổ hợp phù hợp.") {
    this.elements.resultEmpty.classList.remove("is-hidden");
    this.elements.resultEmpty.querySelector("p").textContent = message;
    this.elements.resultContent.classList.add("is-hidden");
    this.lastThptResults = [];
    this.lastThptInput = null;
    this.scoreProfile = null;
  }
  showThptResults(results, automatic, shouldScroll = false) {
    this.lastThptResults = results;
    const top = results[0];
    this.lastResult = top.result;
    this.lastTrigger = { context: `Tổ hợp ${top.combination.code} · ${top.combination.subjectText}` };
    this.elements.resultEmpty.classList.add("is-hidden");
    this.elements.resultContent.classList.remove("is-hidden");
    this.elements.resultLabel.textContent = automatic ? "CÁC TỔ HỢP TỪ 4 MÔN CỦA BẠN" : "KẾT QUẢ TỔ HỢP CỤ THỂ";
    const scoreResults = results.map(({ combination, result }) => ({ combination: combination.code, score: result.total, scale: result.maxScore, year: Number($("#admission-year").value), method: "THPT", ruleId: result.comparisonRule || "three-subject-sum-priority-2026" }));
    this.scoreProfile = createScoreProfile({ type: "THPT", method: "THPT", year: Number($("#admission-year").value), results: scoreResults, subjects: this.lastThptInput?.entries || [], priorityContext: this.getPriorityContext(), inputVersion: this.scoreRevision });
    this.elements.resultContext.textContent = automatic ? `${results.length} tổ hợp hợp lệ · ${top.combination.code} — ${formatScore(top.result.total)}/${top.result.maxScore} — THPT ${this.scoreProfile.year}` : `${top.combination.code} — ${formatScore(top.result.total)}/${top.result.maxScore} — THPT ${this.scoreProfile.year}`;
    this.elements.resultTotal.textContent = formatScore(top.result.total);
    this.elements.resultMax.textContent = `/ ${top.result.maxScore}`;
    this.elements.resultDetails.innerHTML = `<div class="result-row"><span>Điểm tổ hợp cao nhất</span><b>${formatScore(top.result.examScore)}</b></div><div class="result-row"><span>Điểm ưu tiên</span><b>+ ${formatScore(top.result.priority.adjusted)}</b></div>`;
    this.elements.resultList.innerHTML = results.map(({ combination, result }, index) => `<article class="ranked-combination"><div class="ranked-heading"><span class="combination-code">${escapeHTML(combination.code)}</span>${index === 0 && automatic ? '<span class="best-badge">Cao nhất</span>' : ""}</div><p>${escapeHTML(combination.subjectText)}</p><dl><div><dt>Điểm môn</dt><dd>${formatScore(result.examScore)}</dd></div><div><dt>Ưu tiên</dt><dd>+${formatScore(result.priority.adjusted)}</dd></div><div><dt>Tổng xét tuyển</dt><dd>${formatScore(result.total)}</dd></div></dl><button class="button button-secondary" type="button" data-find-combination="${escapeHTML(combination.code)}" data-score="${result.total}" data-scale="${result.maxScore}">Tìm ngành với ${escapeHTML(combination.code)}</button></article>`).join("");
    $("#find-all-combinations").classList.toggle("is-hidden", !automatic || results.length < 2);
    $("#simulate-score").classList.toggle("is-hidden", !automatic);
    this.renderSavedWishes();
    if (shouldScroll) this.elements.resultContent.closest(".result-panel").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  renderAcademicFields() {
    const method = ACADEMIC_METHODS[this.elements.academicMethod.value] || ACADEMIC_METHODS["three-years"];
    const saved = this.state.academicScores || {};
    this.elements.academicHead.innerHTML = `<tr><th>Môn học</th>${method.columns.map((column) => `<th>${escapeHTML(column.label)}</th>`).join("")}</tr>`;
    this.elements.academicBody.innerHTML = ACADEMIC_SUBJECTS.map((subject) => `<tr><th scope="row">${escapeHTML(subject.label)}</th>${method.columns.map((column) => { const id = `academic-${subject.id}-${column.id}`; return `<td><input id="${id}" data-academic-score="${subject.id}__${column.id}" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="${escapeHTML(subject.label)} ${escapeHTML(column.label)}" value="${escapeHTML(saved[id] || "")}" /></td>`; }).join("")}</tr>`).join("");
    $("#academic-note").innerHTML = `<span aria-hidden="true">i</span> Đang dùng <b>${escapeHTML(method.name)}</b>. Chỉ các tổ hợp có đủ điểm mới được tính.`;
  }
  getAcademicScoreData() {
    const scores = {}; const errors = [];
    $$('[data-academic-score]').forEach((input) => {
      const checked = validateScore(input.value, false);
      input.classList.toggle("input-invalid", !checked.valid);
      if (!checked.valid) errors.push(checked.message);
      const [subject, column] = input.dataset.academicScore.split("__");
      scores[subject] ||= {};
      if (checked.valid && checked.value !== null) scores[subject][column] = checked.value;
    });
    return { valid: errors.length === 0, errors, scores };
  }
  populateAcademicMultiplierSubjects() {
    const languageMap = { "Tiếng Anh": "english", "Tiếng Pháp": "french", "Tiếng Trung": "chinese", "Tiếng Nhật": "japanese", "Tiếng Nga": "russian", "Tiếng Đức": "german", "Tiếng Hàn": "korean" };
    const languageKey = `foreignLanguage:${languageMap[this.elements.academicLanguage.value] || "english"}`;
    const items = ACADEMIC_SUBJECTS.map((item) => item.id === "foreignLanguage" ? { key: languageKey, label: this.elements.academicLanguage.value } : { key: item.id, label: item.label });
    const select = $("#academic-multiplier-subject");
    select.innerHTML = '<option value="">Chọn môn</option>' + items.map((item) => `<option value="${escapeHTML(item.key)}">${escapeHTML(item.label)}</option>`).join("");
    const saved = this.state.academicMultiplierSubject;
    if (saved && [...select.options].some((item) => item.value === saved)) select.value = saved;
  }
  syncAcademicMultiplier() {
    const enabled = $("#academic-multiplier-enabled").checked;
    $("#academic-multiplier-field").classList.toggle("is-hidden", !enabled);
    $("#academic-multiplier-note").classList.toggle("is-hidden", !enabled);
    $("#academic-multiplier-subject").disabled = !enabled;
  }
  calculateAcademic() {
    const input = this.getAcademicScoreData();
    if (!input.valid) { this.showToast(input.errors[0]); return; }
    const calculated = calculateAcademicCombinations({ combinations: this.repository.combinations, scores: input.scores, methodId: this.elements.academicMethod.value, languageLabel: this.elements.academicLanguage.value, priorityContext: this.getPriorityContext(), multiplierEnabled: $("#academic-multiplier-enabled").checked, multiplierSubject: $("#academic-multiplier-subject").value });
    if (!calculated.valid) { this.showToast(calculated.errors[0]); return; }
    if (!calculated.results.length) { this.showToast("Hãy nhập đủ điểm cho ít nhất một tổ hợp phù hợp."); return; }
    this.showAcademicResult(calculated.results[0].result, { results: calculated.results, method: ACADEMIC_METHODS[this.elements.academicMethod.value].name });
    this.saveForm();
  }
  showAcademicResult(result, view) {
    const first = view.results.find((item) => item.result === result) || view.results[0];
    this.lastAcademicResult = result;
    this.lastAcademicTrigger = view;
    this.elements.academicResultEmpty.classList.add("is-hidden"); this.elements.academicResultContent.classList.remove("is-hidden");
    this.elements.academicResultLabel.textContent = result.weighted ? "ĐIỂM HỌC BẠ CÓ TRỌNG SỐ" : "KẾT QUẢ HỌC BẠ";
    this.elements.academicResultContext.textContent = `${view.method} · ${first.combination.code} · ${first.combination.subjectText}`;
    this.elements.academicResultTotal.textContent = formatScore(result.total); this.elements.academicResultMax.textContent = `/ ${result.maxScore}`;
    this.elements.academicResultDetails.innerHTML = result.priorityApplied ? `<div class="result-row"><span>Điểm học bạ</span><b>${formatScore(result.examScore)}</b></div><div class="result-row"><span>Điểm ưu tiên</span><b>+ ${formatScore(result.priority.adjusted)}</b></div>` : `<div class="result-row"><span>Điểm có trọng số</span><b>${formatScore(result.examScore)} / ${result.maxScore}</b></div><div class="result-row"><span>Điểm ưu tiên</span><b>Chưa áp dụng</b></div><p class="result-warning">Cách quy đổi điểm ưu tiên phụ thuộc quy định của trường.</p>`;
    this.elements.academicResultList.innerHTML = `<h3>Tổ hợp phù hợp</h3>${view.results.slice(0, 8).map(({ combination, result: itemResult }, index) => `<button class="academic-result-item" type="button" data-academic-result-index="${index}"><span><b>${escapeHTML(combination.code)}</b><small>${escapeHTML(combination.subjectText)}</small></span><strong>${formatScore(itemResult.total)} / ${itemResult.maxScore}</strong></button>`).join("")}`;
    this.goTo("#academic");
  }
  selectAcademicResult(index) { const item = this.lastAcademicTrigger?.results?.[index]; if (item) this.showAcademicResult(item.result, this.lastAcademicTrigger); }
  clearAcademicData() { $$('[data-academic-score]').forEach((input) => { input.value = ""; input.classList.remove("input-invalid"); }); this.elements.academicResultEmpty.classList.remove("is-hidden"); this.elements.academicResultContent.classList.add("is-hidden"); this.state.academicScores = {}; this.saveForm(); this.showToast("Đã xóa điểm học bạ trên thiết bị."); }

  setupTranscriptTools() {
    this.transcriptPreview = new TranscriptPreview({ notify: (message) => this.showToast(message), onConfirm: (data) => this.confirmTranscriptAutofill(data) });
    this.transcriptScanner = new TranscriptScanner({ notify: (message) => this.showToast(message), onScanSuccess: (payload) => this.transcriptPreview.show(payload) });
  }
  confirmTranscriptAutofill(data) {
    const result = autoFillTranscript(data, { methodId: this.elements.academicMethod.value });
    if (!result.filled && result.conflicts?.length) throw new Error("Các điểm nhận diện khác dữ liệu đã nhập. Hãy kiểm tra và xóa điểm cũ trước khi áp dụng.");
    if (!result.filled) throw new Error("Không có điểm phù hợp với phương thức học bạ đang chọn.");
    if (result.language && [...this.elements.academicLanguage.options].some((item) => item.value === result.language)) this.elements.academicLanguage.value = result.language;
    this.saveForm(); this.showToast(`Đã điền ${result.filled} ô. Hãy kiểm tra lại trước khi tính.`); return result;
  }

  populateUniversitySelects() {
    const options = this.repository.universities.map((item) => `<option value="${escapeHTML(item.id)}">${item.calculableCount ? "✓ " : ""}${escapeHTML(item.shortName)} — ${escapeHTML(item.name)}</option>`).join("");
    this.elements.universitySelect.innerHTML = '<option value="">Chọn trường</option>' + options;
    const supportedCertificates = new Set(this.repository.metadata?.certificateUniversityIds || []);
    const certificateOptions = this.repository.universities.filter((item) => supportedCertificates.has(item.id)).map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.shortName)} — ${escapeHTML(item.name)}</option>`).join("");
    $("#certificate-university").innerHTML = certificateOptions ? '<option value="">Chọn trường</option>' + certificateOptions : '<option value="">Chưa có bảng quy đổi đã xác minh</option>';
    $("#certificate-university").disabled = !certificateOptions;
    if (!certificateOptions) $("#certificate-result").innerHTML = '<div class="result-empty"><span aria-hidden="true">◇</span><h3>Chưa có bảng quy đổi đã xác minh</h3><p>Chức năng sẽ được mở khi có bảng chính thức đúng trường, năm và phương thức.</p></div>';
    $("#major-university-filter").innerHTML = '<option value="">Tất cả trường</option>' + options;
  }
  async populateMajorSelect() {
    const id = this.elements.universitySelect.value;
    const loadVersion = ++this.admissionLoadVersion;
    this.elements.majorSelect.disabled = true; this.elements.methodSelect.disabled = true; this.elements.calculateAdmission.disabled = true;
    if (!id) { this.elements.majorSelect.innerHTML = '<option value="">Chọn trường trước</option>'; this.elements.selectionHint.textContent = "Hãy chọn trường để xem các ngành và công thức tương ứng."; this.saveForm(); return; }
    this.elements.majorSelect.innerHTML = '<option value="">Đang tải ngành...</option>';
    try {
      const majors = await this.repository.getMajors(id);
      if (loadVersion !== this.admissionLoadVersion || this.elements.universitySelect.value !== id) return;
      const groups = new Map();
      for (const major of majors) {
        const key = `${major.code}|${major.name}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(major);
      }
      this.admissionPrograms = new Map([...groups.values()].map((rows) => [rows[0].id, rows]));
      this.elements.majorSelect.innerHTML = majors.length ? '<option value="">Chọn ngành / chương trình</option>' + [...this.admissionPrograms.entries()].map(([key, rows]) => {
        const ready = rows.some((major) => canCalculateMajor(major, this.repository.getFormula(major.formula)));
        return `<option value="${escapeHTML(key)}">${ready ? "✓ " : ""}${escapeHTML(rows[0].name)} (${escapeHTML(rows[0].code)})</option>`;
      }).join("") : '<option value="">Đang cập nhật dữ liệu ngành</option>';
      this.elements.majorSelect.disabled = !majors.length;
      this.elements.selectionHint.textContent = majors.length ? `${this.admissionPrograms.size} ngành/chương trình · ${majors.filter((major) => canCalculateMajor(major, this.repository.getFormula(major.formula))).length} phương án hỗ trợ tự tính.` : "Trường đang cập nhật dữ liệu ngành.";
    } catch { if (loadVersion !== this.admissionLoadVersion) return; this.elements.majorSelect.innerHTML = '<option value="">Không thể tải ngành — chọn lại để thử</option>'; this.elements.selectionHint.textContent = "Không thể tải dữ liệu. Hãy thử lại."; }
    this.saveForm();
  }
  populateMethodSelect() {
    const rows = this.admissionPrograms?.get(this.elements.majorSelect.value) || [];
    this.elements.methodSelect.innerHTML = rows.length ? rows.map((major) => `<option value="${escapeHTML(major.id)}">${canCalculateMajor(major, this.repository.getFormula(major.formula)) ? "✓ " : ""}${escapeHTML(major.method)}</option>`).join("") : '<option value="">Chọn ngành trước</option>';
    this.elements.methodSelect.disabled = !rows.length;
    const major = this.repository.getMajor(this.elements.methodSelect.value);
    const formula = major ? this.repository.getFormula(major.formula) : null;
    const ready = canCalculateMajor(major, formula);
    this.elements.calculateAdmission.disabled = !ready;
    this.elements.calculateAdmission.textContent = ready ? "Nhập điểm" : "Chưa thể tự tính";
    this.elements.selectionHint.textContent = major ? (ready ? "Công thức riêng đã xác minh và sẵn sàng tính." : `Chỉ tra cứu: ${major.formulaText ? "công thức hiện mới ở mức tham khảo." : "chưa có đủ quy tắc tính."}`) : "Chọn ngành để xem khả năng tự tính.";
    this.renderAdmissionCalculator();
    this.saveForm();
  }
  async restoreAdmissionSelections() {
    if (!this.state.universityId || !this.repository.getUniversity(this.state.universityId)) return;
    this.elements.universitySelect.value = this.state.universityId;
    await this.populateMajorSelect();
    if (this.state.majorId && this.repository.getMajor(this.state.majorId)) {
      const group = [...(this.admissionPrograms?.entries() || [])].find(([, rows]) => rows.some((item) => item.id === this.state.majorId));
      if (group) { this.elements.majorSelect.value = group[0]; this.populateMethodSelect(); this.elements.methodSelect.value = this.state.majorId; this.renderAdmissionCalculator(); }
    }
  }
  focusAdmissionCalculator() { $("#admission-calculator-form input")?.focus(); }
  clearAdmissionResult() { const result = $("#admission-result"); if (result) result.innerHTML = '<p class="result-stale">Thông tin đã thay đổi, cần tính lại.</p>'; }
  renderAdmissionCalculator() {
    const panel = $("#admission-calculator-panel");
    const major = this.repository.getMajor(this.elements.methodSelect.value);
    const formula = major && this.repository.getFormula(major.formula);
    if (!major) { panel.innerHTML = '<div class="result-empty"><h3>Chọn ngành và phương thức</h3><p>Ngành được nhóm một lần; các phương thức nằm ở bước kế tiếp.</p></div>'; return; }
    if (!canCalculateMajor(major, formula) || typeof formula.getInputDefinition !== "function") {
      panel.innerHTML = `<div class="result-empty"><h3>Hiện chỉ hỗ trợ tra cứu</h3><p>${escapeHTML(major.calculationVerified ? "Module công thức chưa sẵn sàng trên trình duyệt." : "Chưa đủ hệ số, cách chuẩn hóa hoặc điều kiện riêng để tạo kết quả an toàn.")}</p>${major.formulaText ? `<div class="info-callout">${escapeHTML(major.formulaText)}</div>` : ""}</div>`;
      return;
    }
    const supported = Object.keys(formula.combinations || {}).filter((code) => String(major.combination || "").toLocaleUpperCase("vi").split(/[;,/|]+/).map((item) => item.trim()).includes(code));
    panel.innerHTML = `<form id="admission-calculator-form" class="form-card admission-dynamic-form"><div class="admission-form-heading"><div><p class="eyebrow">CÓ THỂ TỰ TÍNH</p><h3>${escapeHTML(major.name)}</h3></div><span class="verified-badge">✓ Quy tắc đã xác minh</span></div><div class="form-grid form-grid-two"><div class="field"><label for="admission-combination">Tổ hợp</label><select id="admission-combination">${supported.map((code) => `<option value="${code}">${code}</option>`).join("")}</select></div><div class="field is-hidden" id="admission-choice-field"><label for="admission-choice-subject">Môn tự chọn K01</label><select id="admission-choice-subject"><option value="physics">Vật lí</option><option value="chemistry">Hóa học</option><option value="biology">Sinh học</option><option value="informatics">Tin học</option></select></div></div><div class="score-grid" id="admission-inputs"></div><div class="priority-context-note">Ưu tiên đang dùng: <b>${escapeHTML($("#area").selectedOptions[0]?.textContent || "KV3")}</b> · <b>${escapeHTML($("#priority-group").selectedOptions[0]?.textContent || "Không thuộc nhóm ưu tiên")}</b></div><div class="form-actions"><button class="button button-primary" type="submit">Tính theo ngành</button></div></form><div id="admission-result"></div>`;
    const refresh = () => { this.clearAdmissionResult(); this.renderAdmissionInputs(formula); };
    $("#admission-combination").addEventListener("change", refresh);
    $("#admission-choice-subject").addEventListener("change", refresh);
    $("#admission-calculator-form").addEventListener("submit", (event) => { event.preventDefault(); this.calculateForMajor(); });
    refresh();
  }
  renderAdmissionInputs(formula) {
    const code = $("#admission-combination")?.value;
    const choice = $("#admission-choice-subject")?.value;
    const definition = formula.getInputDefinition(code, choice);
    $("#admission-choice-field")?.classList.toggle("is-hidden", !formula.combinations?.[code]?.choice);
    if (!definition) { $("#admission-inputs").innerHTML = '<p class="empty-state">Tổ hợp chưa được hỗ trợ.</p>'; return; }
    const reusable = new Map((this.lastThptInput?.entries || []).map((item) => [item.subjectKey, item.score]));
    $("#admission-inputs").innerHTML = definition.subjects.map((key, index) => `<div class="field score-field"><label for="admission-score-${index}">${escapeHTML(subjectLabelForKey(key))}</label><input id="admission-score-${index}" data-admission-score="${escapeHTML(key)}" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${escapeHTML(reusable.has(key) ? reusable.get(key) : "")}" /><small class="field-error"></small></div>`).join("");
  }
  calculateForMajor() {
    const major = this.repository.getMajor(this.elements.methodSelect.value);
    const formula = major && this.repository.getFormula(major.formula);
    if (!canCalculateMajor(major, formula)) { this.showToast("Công thức đang được cập nhật, chưa thể tự tính."); return; }
    const scores = {}; const errors = [];
    $$('[data-admission-score]').forEach((input) => { const checked = validateScore(input.value); input.classList.toggle("input-invalid", !checked.valid); if (checked.valid) scores[input.dataset.admissionScore] = checked.value; else errors.push(checked.message); });
    if (errors.length) { this.showToast(errors[0]); return; }
    try {
      const result = formula.calculate({ combinationCode: $("#admission-combination").value, choiceSubject: $("#admission-choice-subject")?.value, scores, priorityContext: this.getPriorityContext() });
      const breakdown = result.breakdown.map((item) => `<li><span>${escapeHTML(item.label)}${item.weight > 1 ? ` × ${item.weight}` : ""}</span><b>${formatScore(item.value)}</b></li>`).join("");
      $("#admission-result").innerHTML = `<div class="result-content admission-result-content"><span class="result-label">KẾT QUẢ THEO QUY TẮC ĐÃ XÁC MINH</span><h3>${escapeHTML(major.name)} · ${escapeHTML(result.combinationCode)}</h3><div class="result-score"><strong>${formatScore(result.total)}</strong><span>/ ${result.maxScore}</span></div><ul class="explanation-list">${breakdown}<li><span>Điểm sau trọng số</span><b>${formatScore(result.examScore)}</b></li><li><span>Điểm ưu tiên</span><b>+ ${formatScore(result.priority.adjusted)}</b></li></ul><div class="formula-box">${escapeHTML(formula.expression)}</div></div>`;
    } catch (error) { this.showToast(error.message); }
  }

  renderUniversities(filter = "", keepPage = false) {
    if (!keepPage) this.universityPage = 1;
    const term = this.normalizeSearch(filter);
    const items = this.repository.universities.filter((item) => (this.activeUniversityRegion === "all" || item.region === this.activeUniversityRegion) && (!term || this.normalizeSearch(`${item.name} ${item.shortName} ${item.officialAdmissionsCode || ""} ${item.code}`).includes(term)));
    const paging = paginate(items, this.universityPage, 24); this.universityPage = paging.page;
    this.elements.universityRegionFilters.querySelectorAll("button").forEach((button) => { const active = button.dataset.universityRegion === this.activeUniversityRegion; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); });
    const checkedAt = this.repository.metadata?.dataCheckedAt ? new Date(`${this.repository.metadata.dataCheckedAt}T00:00:00`).toLocaleDateString("vi-VN") : "Đang cập nhật";
    $("#university-summary").innerHTML = `<strong>${paging.total} / ${this.repository.universities.length} trường và cơ sở đào tạo</strong><span>Kiểm tra dữ liệu: ${escapeHTML(checkedAt)}</span>`;
    this.elements.universityGrid.innerHTML = UNIVERSITY_REGIONS.map((region) => { const regionItems = paging.items.filter((item) => item.region === region.id); return regionItems.length ? `<section class="university-region-group"><div class="university-region-heading"><h3>${region.label}</h3><span>${regionItems.length} trường trên trang</span></div><div class="university-region-list">${regionItems.map((item) => this.universityCard(item)).join("")}</div></section>` : ""; }).join("");
    this.elements.universityEmpty.classList.toggle("is-hidden", items.length > 0);
    this.renderPagination("university", paging);
  }
  logoMarkup(university) {
    if (university.logoStatus === "updating") {
      return `<span class="school-logo logo-fallback" role="img" aria-label="Logo ${escapeHTML(university.name)} đang cập nhật">${escapeHTML(university.shortName || university.code || "ĐH")}</span>`;
    }
    const fitClass = university.logoFit === "mark-right"
      ? " logo-mark-crop logo-mark-right"
      : university.logoFit === "mark-center"
        ? " logo-mark-crop logo-mark-center"
        : university.logoFit === "mark" ? " logo-mark-crop" : "";
    return `<img class="school-logo${fitClass}" src="${escapeHTML(university.logo)}" alt="Logo ${escapeHTML(university.name)}" data-code="${escapeHTML(university.shortName || university.code || "ĐH")}" width="56" height="56" loading="lazy" />`;
  }
  universityCard(university) { const label = university.programCount ? `${university.programCount} ngành / chương trình` : UNIVERSITY_PROFILE_STATUS[university.admissionsStatus]?.compact || "Đang cập nhật dữ liệu ngành"; const code = university.officialAdmissionsCode || university.code; return `<article class="university-card"><div class="university-card-identity">${this.logoMarkup(university)}<div><h3>${escapeHTML(university.name)}</h3><span class="school-code">${escapeHTML(code)} · ${escapeHTML(university.shortName)}</span></div></div><div class="university-actions"><span class="school-count">${escapeHTML(label)}</span><button class="card-link" data-school-id="${escapeHTML(university.id)}" type="button" aria-label="Hồ sơ ${escapeHTML(university.name)}">Hồ sơ ↗</button></div></article>`; }

  async openUniversityModal(universityId, trigger, targetMajorId = "", updateRoute = true) {
    const summary = this.repository.getUniversity(universityId); if (!summary) return;
    if (updateRoute) {
      this.modalSourceHash = /^(?:#truong|#nganh)\//.test(location.hash) ? "#universities" : location.hash || "#universities";
      const route = targetMajorId ? `#nganh/${encodeURIComponent(universityId)}/${encodeURIComponent(targetMajorId)}` : `#truong/${encodeURIComponent(universityId)}`;
      if (location.hash !== route) history.pushState({ modal: true }, "", route);
    }
    this.modalRouteActive = true;
    this.openModal(`<div class="modal-loading" role="status"><span class="loading-spinner" aria-hidden="true"></span><p>Đang tải hồ sơ ${escapeHTML(summary.shortName)}...</p></div>`, trigger);
    const token = Symbol("modal"); this.modalToken = token;
    try {
      const [university, initialPage] = await Promise.all([
        this.repository.getUniversityDetails(universityId),
        this.repository.getMajorsPage(universityId, { page: 1, pageSize: 25, targetId: targetMajorId })
      ]);
      if (this.modalToken !== token || this.elements.modal.classList.contains("is-hidden")) return;
      const evidence = university.admissions || {};
      const methods = initialPage.facets?.methods || [];
      const verifiedRows = Number(summary.verifiedRowCount) || 0;
      const referenceRows = Number(summary.informationalRowCount) || 0;
      const published = Number(summary.cutoffCount) || 0;
      const programCount = Number(summary.programCount) || 0;
      const checkedAt = university.dataCheckedAt ? new Date(`${university.dataCheckedAt}T00:00:00`).toLocaleDateString("vi-VN") : "Đang cập nhật";
      const profileVerified = ["official_verified", "official_announced", "official_proposed_methods_with_published_results"].includes(evidence.status);
      const profilePartial = evidence.status === "official_verified_partial";
      const reference = evidence.status === "reference_2026" || referenceRows > 0;
      const classified = UNIVERSITY_PROFILE_STATUS[evidence.status]?.full;
      const status = profileVerified ? "✓ Đã xác minh" : profilePartial ? "◐ Xác minh một phần" : reference ? "~ Dữ liệu tham khảo" : classified || "! Đang cập nhật";
      const note = publicProfileNote({ status: evidence.status, hasReference: reference, classified });
      const formulas = (evidence.formulas || []).map((item) => `<div class="method-entry"><b>${escapeHTML(item.method)}</b><p>${escapeHTML(item.text)}</p>${item.conditions ? `<p>${escapeHTML(item.conditions)}</p>` : ""}</div>`).join("");
      const website = safeWebsite(university.website);
      const admissionsCode = university.officialAdmissionsCode || university.code;
      this.elements.modalBody.innerHTML = `<div class="detail-header">${this.logoMarkup(university)}<div><p class="modal-kicker">Hồ sơ tuyển sinh 2026</p><h2 id="modal-title">${escapeHTML(university.name)}</h2><p>Mã tuyển sinh: ${escapeHTML(admissionsCode)}</p></div><button class="button button-text report-school-button" type="button" data-report-school="${escapeHTML(university.id)}">Báo dữ liệu sai</button></div><p class="modal-description">${escapeHTML(university.description)}</p><div class="detail-meta"><div><span>KHU VỰC</span><b>${escapeHTML(this.regionLabel(university.region))}</b></div><div><span>NGÀNH / CHƯƠNG TRÌNH</span><b>${programCount}</b></div><div><span>DÒNG NGÀNH / PHƯƠNG THỨC</span><b>${summary.majorRowCount || 0}</b></div><div><span>ĐIỂM CHUẨN ĐÃ CẬP NHẬT</span><b>${published}</b></div><div><span>KIỂM TRA DỮ LIỆU</span><b>${escapeHTML(checkedAt)}</b></div><div><span>WEBSITE</span>${website ? `<a href="${escapeHTML(website)}" target="_blank" rel="noopener">Trang của trường ↗</a>` : "<b>Đang cập nhật</b>"}</div></div><div class="profile-status"><p><b>${escapeHTML(status)}</b></p><p>${escapeHTML(note)}</p><p>${verifiedRows} mục đã xác minh · ${referenceRows} mục tham khảo.</p></div><div class="profile-sections"><details open><summary>Phương thức tuyển sinh</summary><div class="profile-section-body"><p>${escapeHTML((evidence.methods || university.methods || []).join(" · ") || classified || "Đang cập nhật")}</p></div></details><details ${formulas ? "open" : ""}><summary>Công thức tính điểm</summary><div class="profile-section-body">${formulas || (classified ? "Không có công thức điểm chung áp dụng cho hồ sơ này." : "Công thức đang được cập nhật, chưa thể tự tính.")}</div></details></div><h3 class="modal-section-title">Ngành và điểm chuẩn</h3><div class="detail-filters"><input id="detail-major-search" type="search" placeholder="Tìm ngành hoặc mã ngành" aria-label="Tìm ngành" ${summary.majorRowCount ? "" : "disabled"} /><select id="detail-method-filter" aria-label="Lọc phương thức" ${summary.majorRowCount ? "" : "disabled"}><option value="">Tất cả phương thức</option>${methods.map((method) => `<option value="${escapeHTML(method)}">${escapeHTML(method)}</option>`).join("")}</select></div><p class="detail-result-count" id="detail-result-count"></p><div class="detail-table-wrap"><table class="detail-table"><thead><tr><th>Ngành</th><th>Mã ngành</th><th>Tổ hợp</th><th>Phương thức</th><th>Điểm chuẩn 2026</th><th>Công thức tính điểm</th></tr></thead><tbody id="detail-major-rows"></tbody></table></div><nav class="pagination detail-pagination" id="detail-major-pagination" aria-label="Trang ngành trong hồ sơ"></nav>`;
      const pageSize = 25;
      let detailPage = initialPage.pagination.page;
      let detailRequest = 0;
      let pendingTargetId = targetMajorId;
      const renderRows = async (resetPage = false, firstPage = null) => {
        if (resetPage) detailPage = 1;
        const requestId = ++detailRequest;
        $("#detail-major-rows").innerHTML = '<tr><td colspan="6"><span class="loading-spinner" aria-hidden="true"></span> Đang tải...</td></tr>';
        try {
          const q = $("#detail-major-search").value.trim(), method = $("#detail-method-filter").value;
          const data = firstPage || await this.repository.getMajorsPage(universityId, { q, method, page: detailPage, pageSize, targetId: pendingTargetId && !q && !method ? pendingTargetId : "" });
          if (requestId !== detailRequest || this.modalToken !== token) return;
          pendingTargetId = "";
          detailPage = data.pagination.page;
          $("#detail-result-count").textContent = `${data.pagination.total} kết quả · đang hiển thị ${data.items.length}`;
          $("#detail-major-rows").innerHTML = data.items.length ? data.items.map((major) => this.majorRow(major, targetMajorId)).join("") : `<tr><td colspan="6">${escapeHTML(classified || "Không tìm thấy ngành phù hợp.")}</td></tr>`;
          $("#detail-major-pagination").innerHTML = data.pagination.pages > 1 ? `<button type="button" data-detail-page="${detailPage - 1}" ${detailPage === 1 ? "disabled" : ""}>← Trước</button><span>Trang ${detailPage} / ${data.pagination.pages}</span><button type="button" data-detail-page="${detailPage + 1}" ${detailPage === data.pagination.pages ? "disabled" : ""}>Sau →</button>` : "";
          if (targetMajorId) requestAnimationFrame(() => $(`[data-major-row="${CSS.escape(targetMajorId)}"]`)?.scrollIntoView({ block: "center" }));
        } catch (error) {
          if (requestId !== detailRequest) return;
          $("#detail-major-rows").innerHTML = `<tr><td colspan="6" class="error-state">${escapeHTML(error.message)} <button class="button button-text" type="button" data-detail-retry>Thử lại</button></td></tr>`;
          $("[data-detail-retry]")?.addEventListener("click", () => renderRows());
        }
      };
      $("#detail-major-search")?.addEventListener("input", debounce(() => renderRows(true), 180));
      $("#detail-method-filter")?.addEventListener("change", () => renderRows(true));
      $("#detail-major-pagination")?.addEventListener("click", (event) => { const button = event.target.closest("[data-detail-page]"); if (button) { detailPage = Number(button.dataset.detailPage); renderRows(); } });
      renderRows(false, initialPage);
    } catch (error) { if (this.modalToken === token) this.elements.modalBody.innerHTML = `<div class="error-state"><h2 id="modal-title">Không thể tải hồ sơ</h2><p>${escapeHTML(error.message)}</p><button class="button button-primary" type="button" data-school-id="${escapeHTML(universityId)}">Thử lại</button></div>`; }
  }
  majorRow(major, targetMajorId = "") {
    const status = publishableCutoff(major) ? cutoffStatusLabel(major) : cutoffLabel(major);
    const cutoff = publishableCutoff(major) ? `<b class="cutoff-value ${verifiedCutoff(major) ? "" : "cutoff-reference"}">${escapeHTML(cutoffLabel(major))}</b><small>${escapeHTML(status)}</small>` : `<span class="cutoff-pending">${escapeHTML(cutoffLabel(major))}</span>`;
    const formulaStatus = major.calculationVerified ? "✓ Đã xác minh" : major.formulaText ? "~ Công thức tham khảo" : "Đang cập nhật";
    const target = major.id === targetMajorId;
    return `<tr data-major-row="${escapeHTML(major.id)}" class="${target ? "is-target-major" : ""}" ${target ? 'aria-current="true"' : ""}><td data-label="Ngành">${escapeHTML(major.name)}</td><td data-label="Mã ngành">${escapeHTML(major.code)}</td><td data-label="Tổ hợp">${escapeHTML(major.combination || "Đang cập nhật")}</td><td data-label="Phương thức">${escapeHTML(major.method || "Đang cập nhật")}${major.methodDetails ? `<small>${escapeHTML(major.methodDetails)}</small>` : ""}</td><td data-label="Điểm chuẩn 2026">${cutoff}</td><td data-label="Công thức"><details class="formula-disclosure"><summary>${formulaStatus}</summary><p>${escapeHTML(major.formulaText || "Công thức đang được cập nhật.")}</p></details><div class="row-actions"><button class="save-major-button" type="button" data-save-major="${escapeHTML(major.id)}" data-major-name="${escapeHTML(major.name)}" data-major-code="${escapeHTML(major.code)}" data-university-id="${escapeHTML(major.universityId)}">♡ Lưu</button><button class="save-major-button" type="button" data-compare-major="${escapeHTML(major.id)}">So sánh</button><button class="save-major-button" type="button" data-report-major="${escapeHTML(major.id)}">Báo sai</button></div></td></tr>`;
  }

  renderCombinations(filter = "", keepPage = false) {
    if (!keepPage) this.combinationPage = 1;
    const term = this.normalizeSearch(filter);
    const items = this.repository.combinations.filter((item) => !term || this.normalizeSearch(`${item.code} ${item.subjectText}`).includes(term));
    const paging = paginate(items, this.combinationPage, 24); this.combinationPage = paging.page;
    this.elements.combinationCount.textContent = term ? `Tìm thấy ${items.length} tổ hợp phù hợp.` : `Có ${items.length} tổ hợp để tra cứu.`;
    this.elements.combinationGrid.innerHTML = paging.items.map((item) => `<article class="combination-card"><div><span class="combination-code">${escapeHTML(item.code)}</span><h3>${escapeHTML(item.subjectText)}</h3></div><button class="card-link" type="button" data-combination-id="${escapeHTML(item.id)}">Chi tiết</button></article>`).join("");
    this.elements.combinationEmpty.classList.toggle("is-hidden", items.length > 0); this.renderPagination("combination", paging);
  }
  renderFormulas() { this.elements.formulaGrid.innerHTML = formulaList.slice(0, 4).map((formula) => `<article class="formula-card"><span class="formula-type">${escapeHTML(formula.type)}</span><h3>${escapeHTML(formula.name)}</h3><p>${escapeHTML(formula.description)}</p><div class="formula-meta"><span>PHƯƠNG THỨC<b>${escapeHTML(formula.type)}</b></span><span>NĂM<b>${escapeHTML(formula.year)}</b></span></div><button class="card-link" type="button" data-formula-id="${escapeHTML(formula.id)}">Xem công thức →</button></article>`).join(""); }

  bindSearchInput(input, target) {
    input.addEventListener("input", debounce(() => this.renderSearch(input.value, target), 280));
    input.addEventListener("keydown", (event) => { if (event.key === "ArrowDown") { const first = target.querySelector("button"); if (first) { event.preventDefault(); first.focus(); } } });
  }
  async renderSearch(query, target) {
    if (!query.trim()) { target.innerHTML = ""; target.classList.add("is-hidden"); return; }
    this.searchAbort?.abort(); this.searchAbort = new AbortController();
    target.classList.remove("is-hidden"); target.innerHTML = '<p class="search-empty">Đang tìm...</p>';
    try {
      const results = await this.repository.search(query, { signal: this.searchAbort.signal, limit: 25 });
      target.innerHTML = results.length ? results.map(({ type, item, university }) => {
        if (type === "combination") return `<button class="search-result" type="button" data-search-combination="${escapeHTML(item.id)}"><span class="search-result-icon">TH</span><span><b>${escapeHTML(item.code)}</b><small>Tổ hợp · ${escapeHTML(item.subjectText)}</small></span></button>`;
        const school = type === "school" ? item : university;
        return `<button class="search-result" type="button" ${type === "school" ? `data-search-school="${escapeHTML(school.id)}"` : `data-search-major="${escapeHTML(item.id)}" data-university-id="${escapeHTML(school.id)}"`}><span class="search-result-icon">${type === "school" ? "T" : "N"}</span><span><b>${escapeHTML(item.name)}</b><small>${type === "school" ? `Trường · ${escapeHTML(item.officialAdmissionsCode || item.code)}` : `Ngành · ${escapeHTML(school.shortName)} · ${escapeHTML(item.code)}`}</small></span></button>`;
      }).join("") : '<p class="search-empty">Không tìm thấy kết quả phù hợp.</p>';
    } catch (error) { if (error.name !== "AbortError") target.innerHTML = '<p class="search-empty">Không thể tìm kiếm. Hãy thử lại.</p>'; }
  }

  async loadCertificateRules() {
    const id = $("#certificate-university").value;
    this.certificateRules = [];
    $("#certificate-type").disabled = true; $("#certificate-method").disabled = true; $("#certificate-score").disabled = true; $("#certificate-submit").disabled = true;
    if (!id) { $("#certificate-type").innerHTML = '<option value="">Chọn trường trước</option>'; return; }
    $("#certificate-result").innerHTML = '<div class="result-empty"><span class="loading-spinner" aria-hidden="true"></span><p>Đang kiểm tra bảng quy đổi...</p></div>';
    try {
      const data = await this.repository.getCertificateRules(id, 2026);
      this.certificateRules = data.rules;
      if (!data.available) { $("#certificate-type").innerHTML = '<option value="">Chưa có bảng quy đổi</option>'; $("#certificate-result").innerHTML = '<div class="result-empty"><span aria-hidden="true">◇</span><h3>Đang cập nhật</h3><p>Trường này chưa có bảng quy đổi chứng chỉ trong hệ thống.</p></div>'; return; }
      const certificates = [...new Set(data.rules.map((rule) => rule.certificate))];
      $("#certificate-type").innerHTML = certificates.map((item) => `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`).join("");
      $("#certificate-type").disabled = false; $("#certificate-score").disabled = false; this.syncCertificateControls();
    } catch { $("#certificate-result").innerHTML = '<div class="result-empty error-state"><h3>Không thể tải dữ liệu</h3><p>Hãy chọn lại trường để thử.</p></div>'; }
  }
  syncCertificateControls() {
    const certificate = $("#certificate-type").value;
    const methods = [...new Set(this.certificateRules.filter((rule) => rule.certificate === certificate).map((rule) => rule.method))];
    $("#certificate-method").innerHTML = methods.map((item) => `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`).join("");
    $("#certificate-method").disabled = !methods.length; $("#certificate-submit").disabled = !methods.length; this.syncCertificatePurpose();
  }
  syncCertificatePurpose() {
    const rules = this.certificateRules.filter((rule) => rule.certificate === $("#certificate-type").value && rule.method === $("#certificate-method").value);
    const field = $("#certificate-purpose-field"); field.classList.toggle("is-hidden", rules.length < 2);
    $("#certificate-purpose").innerHTML = rules.map((rule) => `<option value="${escapeHTML(rule.id)}">${escapeHTML(rule.label || rule.target?.type || rule.id)}</option>`).join("");
  }
  async calculateCertificate() {
    const input = { universityId: $("#certificate-university").value, year: 2026, certificate: $("#certificate-type").value, method: $("#certificate-method").value, purpose: $("#certificate-purpose").value || undefined, value: $("#certificate-score").value };
    $("#certificate-result").innerHTML = '<div class="result-empty"><span class="loading-spinner" aria-hidden="true"></span><p>Đang tính quy đổi...</p></div>';
    this.lastCertificateResult = null;
    try {
      const result = await this.repository.calculateCertificate(input);
      if (!result.available) { $("#certificate-result").innerHTML = '<div class="result-empty"><h3>Chưa có quy tắc phù hợp</h3><p>Hệ thống không tạo kết quả khi thiếu bảng quy đổi.</p></div>'; return; }
      if (!result.matched) { $("#certificate-result").innerHTML = `<div class="result-empty"><h3>Không nằm trong khoảng hỗ trợ</h3><p>${result.status === "verified" ? "✓ Đã xác minh" : "~ Tham khảo"}</p></div>`; return; }
      const labels = { subjectScore: "Điểm môn quy đổi", componentScore: "Điểm thành phần", bonusScore: "Điểm cộng", finalAdmissionScore: "Điểm xét tuyển", eligibilityOnly: "Điều kiện xét tuyển" };
      this.lastCertificateResult = result;
      $("#certificate-result").innerHTML = `<div class="result-content"><span class="result-label">${result.status === "verified" ? "✓ ĐÃ XÁC MINH" : "~ THAM KHẢO"}</span><h3>${escapeHTML(labels[result.target.type] || "Kết quả quy đổi")}</h3><div class="result-score"><strong>${result.target.type === "eligibilityOnly" ? (result.eligible ? "Đạt" : "Chưa đạt") : formatScore(result.value)}</strong>${result.outputScale ? `<span>/ ${result.outputScale}</span>` : ""}</div>${result.canApply ? '<button class="button button-light" type="button" data-use-certificate>Sử dụng khi tính xét tuyển</button>' : ""}</div>`;
    } catch (error) { $("#certificate-result").innerHTML = `<div class="result-empty error-state"><h3>Không thể quy đổi</h3><p>${escapeHTML(error.message)}</p></div>`; }
  }
  useCertificateResult() {
    const result = this.lastCertificateResult; if (!result?.canApply) return;
    const subject = result.target.subject === "english" ? "foreignLanguage:english" : result.target.subject;
    const row = $$('[data-auto-subject]').find((item) => item.value === subject);
    if (!row) { this.showToast(`Hãy chọn môn ${subjectLabelForKey(subject)} trong bốn môn trước khi áp dụng.`); return; }
    const university = this.repository.getUniversity(result.provenance?.universityId);
    this.appliedCertificate = {
      rowIndex: Number(row.dataset.autoSubject),
      subjectKey: subject,
      value: Number(result.value),
      rawScore: $(`[data-auto-score="${row.dataset.autoSubject}"]`)?.value || "",
      certificate: result.provenance?.certificate || $("#certificate-type").value,
      method: result.provenance?.method || $("#certificate-method").value,
      year: result.provenance?.year || 2026,
      university: university?.shortName || university?.name || "trường đã chọn",
      universityId: result.provenance?.universityId || "",
      recordId: result.provenance?.recordId || ""
    };
    this.renderAppliedCertificateNotice();
    this.setThptMode("auto"); this.goTo("#calculator"); this.calculateTHPT(false); this.showToast("Đã áp dụng điểm quy đổi; điểm gốc vẫn được giữ nguyên.");
  }

  renderAppliedCertificateNotice() {
    const note = $("#applied-certificate-note");
    if (!this.appliedCertificate) { note.innerHTML = ""; note.classList.add("is-hidden"); return; }
    const item = this.appliedCertificate;
    note.classList.remove("is-hidden");
    note.innerHTML = `<div><b>Đang áp dụng ${escapeHTML(item.certificate)}</b><span>${escapeHTML(item.university)} · ${item.year} · ${escapeHTML(subjectLabelForKey(item.subjectKey))}: ${formatScore(item.value)}${item.rawScore ? ` (điểm gốc ${escapeHTML(item.rawScore)})` : ""}</span></div><button class="button button-text" type="button" data-clear-certificate>Bỏ quy đổi</button>`;
  }

  clearAppliedCertificate({ announce = false } = {}) {
    if (!this.appliedCertificate) return;
    this.appliedCertificate = null;
    this.renderAppliedCertificateNotice();
    if (this.lastThptResults.length && this.thptMode === "auto") this.calculateTHPT(false);
    if (announce) this.showToast("Đã bỏ điểm quy đổi; điểm gốc không thay đổi.");
  }

  majorFilterQuery(page = this.majorPage) {
    const method = $("#major-method-filter").value;
    const manualScore = $("#major-user-score").value.trim().replace(",", ".");
    const score = this.finderComparisonScore ?? manualScore;
    const scale = this.finderComparisonScale ?? $("#major-score-scale").value;
    const ruleId = this.finderComparisonRule || (["ĐGNL V-ACT", "ĐGNL HSA", "ĐGTD TSA", "ĐGNL SPT", "V-SAT"].includes(method) ? "raw-exam-score" : (method === "THPT" ? "three-subject-sum-priority-2026" : ""));
    const sort = $("#major-sort").value;
    const needsCutoffScale = Boolean($("#major-score-filter").value.trim()) || ["cutoff-asc", "cutoff-desc"].includes(sort);
    return { q: $("#major-query").value, universityId: $("#major-university-filter").value, region: $("#major-region-filter").value, combination: $("#major-combination-filter").value, method, maxScore: $("#major-score-filter").value.trim().replace(",", "."), cutoffScale: needsCutoffScale ? scale : "", year: 2026, status: $("#major-status-filter").value, score, scale, ruleId, sort, page, pageSize: 24 };
  }
  syncMajorScoreContext() {
    const method = $("#major-method-filter").value;
    const contexts = SCORE_CONTEXTS[method] || [];
    const scale = $("#major-score-scale");
    scale.innerHTML = contexts.length ? contexts.map((item) => `<option value="${item.value}">${escapeHTML(item.label)}</option>`).join("") : '<option value="">Chọn phương thức trước</option>';
    scale.disabled = !contexts.length;
    $("#major-user-score").disabled = !contexts.length;
    $("#major-score-filter").disabled = !contexts.length;
    this.finderComparisonScore = null;
    this.finderComparisonScale = null;
    this.finderComparisonRule = null;
    this.renderMajorScoreContext();
  }
  renderMajorScoreContext() {
    const target = $("#major-score-context");
    if (!target) return;
    if (this.activeFinderContext?.stale || (this.activeFinderContext && !finderContextIsFresh(this.activeFinderContext, this.scoreProfile))) {
      target.classList.remove("is-hidden");
      target.dataset.state = "stale";
      target.textContent = `${this.activeFinderContext?.staleReason || "Thông tin đã thay đổi."} Cần tính lại trước khi lưu hoặc so sánh.`;
      return;
    }
    if (this.activeFinderContext?.results?.length) {
      target.classList.remove("is-hidden");
      target.dataset.state = "active";
      target.textContent = `Đang dùng: ${formatFinderScoreContext(this.activeFinderContext, formatScore)}`;
      return;
    }
    const raw = $("#major-user-score")?.value.trim().replace(",", ".");
    const method = $("#major-method-filter")?.value;
    const scale = $("#major-score-scale")?.value;
    target.classList.toggle("is-hidden", !raw);
    target.dataset.state = raw ? "manual" : "";
    target.textContent = raw ? `Đang dùng điểm nhập trực tiếp: ${raw}/${scale || "?"} — ${method || "chưa chọn phương thức"} 2026` : "";
  }
  exitAllCombinationMode(clearFinderContext = false) {
    this.majorSearchMode = "filters";
    this.allCombinationSearch = null;
    this.finderComparisonScore = null;
    this.finderComparisonScale = null;
    this.finderComparisonRule = null;
    if (clearFinderContext) this.activeFinderContext = null;
    this.renderMajorScoreContext();
  }
  invalidateMajorResults() {
    this.majorAbort?.abort();
    this.majorPage = 1;
    $("#major-result-grid").innerHTML = "";
    $("#major-pagination").innerHTML = "";
    $("#major-result-summary").textContent = "Bộ lọc đã thay đổi. Nhấn “Tìm ngành” để cập nhật kết quả.";
  }
  validateMajorFilterContext() {
    const query = this.majorFilterQuery();
    const scale = Number(query.scale);
    for (const [label, raw] of [["Điểm của tôi", query.score], ["Điểm chuẩn tối đa", query.maxScore]]) {
      if (raw === "" || raw === null || raw === undefined) continue;
      if (!query.method || !Number.isFinite(scale)) return { valid: false, message: `${label}: hãy chọn phương thức và thang điểm.` };
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > scale) return { valid: false, message: `${label} phải từ 0 đến ${scale}.` };
    }
    if (["cutoff-asc", "cutoff-desc"].includes(query.sort) && (!query.method || !Number.isFinite(scale))) {
      return { valid: false, message: "Để sắp xếp theo điểm chuẩn, hãy chọn phương thức và thang điểm tương ứng." };
    }
    return { valid: true, query };
  }
  async loadMajorResults() {
    const checked = this.validateMajorFilterContext();
    if (!checked.valid) { this.showToast(checked.message); $("#major-result-summary").textContent = checked.message; return; }
    this.majorSearchMode = "filters";
    this.majorAbort?.abort(); this.majorAbort = new AbortController();
    const requestVersion = ++this.majorRequestVersion;
    $("#major-result-summary").textContent = "Đang tải ngành..."; $("#major-result-grid").innerHTML = '<div class="loading-state"><span class="loading-spinner" aria-hidden="true"></span></div>';
    try {
      const data = await this.repository.listMajors(checked.query, { signal: this.majorAbort.signal });
      if (requestVersion !== this.majorRequestVersion) return;
      this.majorPage = data.pagination.page; this.renderMajorResults(data.items, data.pagination);
    } catch (error) { if (error.name !== "AbortError") { $("#major-result-summary").textContent = "Không thể tải dữ liệu."; $("#major-result-grid").innerHTML = '<p class="empty-state error-state">Không thể tải dữ liệu. Hãy thử lại.</p>'; } }
  }
  renderMajorResults(items, pagination = { page: 1, pages: 1, total: items.length }) {
    $("#major-result-grid").classList.remove("is-stale-results");
    $("#major-result-summary").textContent = items.length ? `${pagination.total} kết quả phù hợp` : "Không tìm thấy ngành phù hợp.";
    $("#major-result-grid").innerHTML = items.length ? items.map((major) => this.majorResultCard(major)).join("") : '<p class="empty-state">Không tìm thấy ngành phù hợp.</p>';
    this.renderPagination("major", pagination);
  }
  majorResultCard(major) {
    const status = publishableCutoff(major) ? cutoffStatusLabel(major) : cutoffLabel(major);
    let comparison = "Chưa đủ dữ liệu để so sánh.";
    if (major.comparison?.compatible) comparison = `${major.comparison.direction === "above" ? "Điểm của bạn cao hơn" : "Điểm của bạn thấp hơn"} mốc · Chênh lệch: ${major.comparison.difference >= 0 ? "+" : ""}${formatScore(major.comparison.difference)}`;
    else if (major.comparison?.reason) comparison = major.comparison.reason;
    const selected = major.combinationMatch;
    const comparedScore = selected?.userScore ?? major.comparison?.userScore;
    const comparedScale = selected?.scale ?? major.comparison?.scale;
    const alternatives = major.alternativeCombinations?.length > 1 ? `<details class="alternative-combinations"><summary>${major.alternativeCombinations.length - 1} tổ hợp thay thế</summary><ul>${major.alternativeCombinations.filter((item) => item.combination !== selected?.combination).map((item) => `<li><b>${escapeHTML(item.combination)}</b><span>${item.compatible ? `${formatScore(item.userScore)} / ${item.scale} · ${item.difference >= 0 ? "+" : ""}${formatScore(item.difference)}` : escapeHTML(item.reason || "Chưa so sánh được")}</span></li>`).join("")}</ul></details>` : "";
    const hasComparison = major.comparison !== undefined || this.finderComparisonScore !== null || $("#major-user-score").value.trim();
    return `<article class="major-result-card"><div class="major-result-school"><span>${escapeHTML(major.university?.shortName || "ĐH")}</span><small>${escapeHTML(major.method || "Đang cập nhật")}</small></div><h3>${escapeHTML(major.name)}</h3><p>${escapeHTML(major.code)} · ${escapeHTML(selected?.combination || major.comparison?.combination || major.combination || "Đang cập nhật tổ hợp")}</p>${Number.isFinite(comparedScore) ? `<div class="user-score-line"><span>Điểm của tôi</span><b>${formatScore(comparedScore)} / ${comparedScale}</b></div>` : ""}<div class="major-result-cutoff"><b>${escapeHTML(cutoffLabel(major))}</b><span>${escapeHTML(status)}</span></div>${hasComparison ? `<p class="comparison-text">${escapeHTML(comparison)}</p>` : ""}${alternatives}<div class="major-card-actions"><button class="button button-light" type="button" data-view-major="${escapeHTML(major.id)}" data-university-id="${escapeHTML(major.universityId)}">Chi tiết</button><button class="button button-light" type="button" data-compare-major="${escapeHTML(major.id)}">So sánh</button><button class="button button-secondary" type="button" data-save-major="${escapeHTML(major.id)}" data-major-name="${escapeHTML(major.name)}" data-major-code="${escapeHTML(major.code)}" data-university-id="${escapeHTML(major.universityId)}">♡ Lưu</button></div></article>`;
  }
  findMajorsForCombination(code, score, scale) {
    $("#major-combination-filter").value = code;
    $("#major-method-filter").value = "THPT";
    this.syncMajorScoreContext();
    $("#major-score-scale").value = String(scale);
    $("#major-user-score").value = String(score);
    $("#major-status-filter").value = "verified,reference";
    $("#major-score-filter").value = "";
    this.finderComparisonScore = score;
    this.finderComparisonScale = scale;
    this.finderComparisonRule = "three-subject-sum-priority-2026";
    const profileResult = this.scoreProfile?.results?.find((item) => item.combination === code) || { combination: code, score, scale, year: 2026, method: "THPT", ruleId: this.finderComparisonRule };
    this.activeFinderContext = this.scoreProfile ? createFinderScoreContext(this.scoreProfile, [profileResult]) : null;
    this.renderMajorScoreContext();
    this.majorPage = 1;
    this.goTo("#major-finder");
    this.loadMajorResults();
  }
  async findMajorsForAllCombinations() {
    if (!this.lastThptResults.length) return;
    this.goTo("#major-finder");
    $("#major-method-filter").value = "THPT";
    this.syncMajorScoreContext();
    $("#major-score-scale").value = "30";
    $("#major-user-score").value = "";
    $("#major-combination-filter").value = "";
    $("#major-result-summary").textContent = "Đang đối chiếu các tổ hợp...";
    try {
      this.majorSearchMode = "combinations";
      this.majorPage = 1;
      this.allCombinationSearch = this.lastThptResults.map(({ combination, result }) => ({ combination: combination.code, score: result.total, scale: result.maxScore, year: Number($("#admission-year").value), method: "THPT", ruleId: result.comparisonRule || "three-subject-sum-priority-2026" }));
      this.activeFinderContext = createFinderScoreContext(this.scoreProfile, this.allCombinationSearch);
      this.renderMajorScoreContext();
      await this.loadBestCombinationResults();
    } catch { $("#major-result-summary").textContent = "Không thể tải dữ liệu. Hãy thử lại."; }
  }
  async loadBestCombinationResults(page = this.majorPage) {
    if (!this.allCombinationSearch?.length) return;
    const checked = this.validateMajorFilterContext();
    if (!checked.valid) { this.showToast(checked.message); $("#major-result-summary").textContent = checked.message; return; }
    this.majorAbort?.abort(); this.majorAbort = new AbortController();
    const requestVersion = ++this.majorRequestVersion;
    $("#major-result-summary").textContent = "Đang gộp và chọn tổ hợp có lợi nhất...";
    const query = checked.query;
    try {
      const data = await this.repository.findBestMajorCombinations({ results: this.allCombinationSearch, year: Number($("#admission-year").value), q: query.q, universityId: query.universityId, region: query.region, maxScore: query.maxScore, cutoffScale: query.cutoffScale, status: query.status, sort: query.sort, page, pageSize: 24 }, { signal: this.majorAbort.signal });
      if (requestVersion !== this.majorRequestVersion) return;
      this.majorPage = data.pagination.page;
      this.finderComparisonScore = undefined;
      this.renderMajorResults(data.items, data.pagination);
    } catch (error) {
      if (error.name !== "AbortError" && requestVersion === this.majorRequestVersion) {
        $("#major-result-summary").textContent = "Không thể tải dữ liệu.";
        $("#major-result-grid").innerHTML = '<p class="empty-state error-state">Không thể tải dữ liệu. Hãy thử lại.</p>';
      }
    }
  }
  clearMajorFilters() { $("#major-filter-form").reset(); this.activeFinderContext = null; this.syncMajorScoreContext(); this.finderComparisonScore = null; this.finderComparisonScale = null; this.finderComparisonRule = null; this.majorSearchMode = "filters"; this.allCombinationSearch = null; this.majorPage = 1; $("#major-result-grid").innerHTML = ""; $("#major-result-summary").textContent = "Đã xóa bộ lọc."; $("#major-pagination").innerHTML = ""; this.renderMajorScoreContext(); }
  saveWishFromButton(button) {
    const id = button.dataset.saveMajor;
    const major = this.repository.getMajor(id);
    const item = this.wishFromMajor(major) || normalizeWish({ id, name: button.dataset.majorName, code: button.dataset.majorCode, universityId: button.dataset.universityId, university: this.repository.getUniversity(button.dataset.universityId)?.name || "Trường", year: 2026 });
    if (!item) return;
    if (this.savedWishes.some((saved) => wishIdentity(saved) === wishIdentity(item))) { this.showToast("Phương án xét tuyển này đã được lưu."); return; }
    this.savedWishes.push(item);
    this.persistWishes(); this.showToast("Đã lưu nguyện vọng trên thiết bị.");
  }
  wishFromMajor(major) {
    if (!major) return null;
    const university = major.university || this.repository.getUniversity(major.universityId);
    const match = major.combinationMatch;
    const comparison = major.comparison;
    const compatible = match?.compatible === true || comparison?.compatible === true;
    return normalizeWish({
      id: major.id, sourceId: major.id, universityId: major.universityId, university: university?.name || university?.shortName || "Trường",
      name: major.name, code: major.code, nationalMajorCode: major.nationalMajorCode, programId: major.programId,
      programType: major.programType, campusId: major.campusId, campus: major.campus || "", year: major.cutoff?.year || comparison?.year || 2026,
      method: major.method, methodCode: major.methodCode, admissionMethodCodes: major.admissionMethodCodes,
      methodDetails: major.methodDetails, combination: match?.combination || comparison?.combination || major.combination,
      scale: match?.scale || comparison?.scale || major.cutoff?.scale, cutoff: major.cutoff?.score,
      userScore: compatible ? (match?.userScore ?? comparison?.userScore) : null,
      ruleId: match?.ruleId || comparison?.ruleId || "", comparisonStatus: compatible ? "compatible" : "not-comparable",
      comparisonReason: compatible ? "" : comparison?.reason || "Chưa đủ dữ liệu để so sánh.", cutoffStatus: major.cutoff?.status,
      conditions: major.conditions || major.additionalConditions || "", tuitionMin: major.tuition?.min, tuitionMax: major.tuition?.max,
      tuitionUnit: major.tuition?.unit, tuitionPeriod: major.tuition?.period, savedAt: new Date().toISOString(),
      scoreContextVersion: this.scoreProfile?.inputVersion || 0, dataVersion: this.repository.metadata?.dataCheckedAt || ""
    });
  }
  persistWishes() { this.savedWishes = normalizeWishList(this.savedWishes); storage.set(WISH_STORAGE_KEY, this.savedWishes); this.renderSavedWishes(); }
  wishScoreNote(item) { const current = this.scoreProfile?.results?.find((result) => result.combination === item.combination && result.method === item.method && result.year === item.year && result.scale === item.scale); if (!current || item.userScore === null || Math.abs(current.score - item.userScore) < 0.001) return ""; return `<small class="wish-score-change">Điểm hiện tại ${formatScore(current.score)}/${current.scale}; mục này giữ điểm lúc lưu ${formatScore(item.userScore)}/${item.scale}.</small>`; }
  renderSavedWishes() { const target = $("#saved-wishes"); if (!target) return; const undo = this.recentWishRemoval ? `<p class="wish-undo" role="status">Đã xóa ${this.recentWishRemoval.items.length} mục. <button class="button button-text" type="button" data-undo-wish>Hoàn tác</button></p>` : ""; target.innerHTML = undo + (this.savedWishes.length ? this.savedWishes.map((item, index) => `<article class="saved-wish"><span>${index + 1}</span><div><b>${escapeHTML(item.name)}</b><small>${escapeHTML(item.university)} · ${escapeHTML(item.code)}${item.campus ? ` · ${escapeHTML(item.campus)}` : ""}${item.method ? ` · ${escapeHTML(item.method)}` : ""}</small>${this.wishScoreNote(item)}<dl class="wish-print-details"><div><dt>Năm</dt><dd>${item.year}</dd></div><div><dt>Phương thức</dt><dd>${escapeHTML(item.method || "Chưa có dữ liệu")}</dd></div><div><dt>Tổ hợp</dt><dd>${escapeHTML(item.combination || "Chưa có dữ liệu")}</dd></div><div><dt>Thang điểm</dt><dd>${item.scale ?? "Chưa có dữ liệu"}</dd></div><div><dt>Điểm chuẩn</dt><dd>${item.cutoff ?? "Chưa có dữ liệu"}</dd></div><div><dt>Điểm của tôi khi lưu</dt><dd>${item.userScore ?? "Chưa so sánh được"}</dd></div><div><dt>Trạng thái</dt><dd>${escapeHTML(item.comparisonStatus === "compatible" ? "Có thể đối chiếu" : item.comparisonReason || "Chưa so sánh được")}</dd></div></dl></div><div class="wish-actions"><button type="button" data-move-wish="${escapeHTML(item.wishId)}" data-direction="-1" aria-label="Đưa nguyện vọng lên" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-move-wish="${escapeHTML(item.wishId)}" data-direction="1" aria-label="Đưa nguyện vọng xuống" ${index === this.savedWishes.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-compare-wish="${escapeHTML(item.wishId)}" aria-label="Thêm vào so sánh">⇄</button><button type="button" data-remove-wish="${escapeHTML(item.wishId)}" aria-label="Xóa nguyện vọng">×</button></div></article>`).join("") : '<p class="empty-state">Chưa có nguyện vọng nào được lưu.</p>'); }
  removeWish(wishId) { const result = removeWishById(this.savedWishes, wishId); if (!result.removed) return; this.savedWishes = result.items; this.recentWishRemoval = { items: [result.removed], index: result.index }; this.persistWishes(); }
  undoWishRemoval() { if (!this.recentWishRemoval) return; this.savedWishes.splice(this.recentWishRemoval.index, 0, ...this.recentWishRemoval.items); this.recentWishRemoval = null; this.persistWishes(); this.showToast("Đã khôi phục nguyện vọng."); }
  moveWish(wishId, direction) { this.savedWishes = moveWishById(this.savedWishes, wishId, direction); this.persistWishes(); }
  addComparison(id, fromWish = false) {
    const item = fromWish ? this.savedWishes.find((wish) => wish.wishId === id) : this.wishFromMajor(this.repository.getMajor(id));
    if (!item) { this.showToast("Không tìm thấy dữ liệu để so sánh."); return; }
    if (this.comparisonItems.some((saved) => wishIdentity(saved) === wishIdentity(item))) { this.showToast("Mục này đã có trong bảng so sánh."); return; }
    if (this.comparisonItems.length >= 4) { this.showToast("Bảng so sánh nhận tối đa 4 mục."); return; }
    this.comparisonItems.push(item); this.persistComparison(); this.showToast("Đã thêm vào bảng so sánh.");
  }
  removeComparison(wishId) { this.comparisonItems = this.comparisonItems.filter((item) => item.wishId !== wishId); this.persistComparison(); }
  persistComparison() { this.comparisonItems = normalizeWishList(this.comparisonItems, 4); storage.set(COMPARE_STORAGE_KEY, this.comparisonItems); this.renderComparison(); }
  renderComparison() {
    const target = $("#comparison-items"); if (!target) return;
    if (!this.comparisonItems.length) { target.innerHTML = '<p class="empty-state">Thêm 2–4 kết quả để đối chiếu cạnh nhau.</p>'; return; }
    target.innerHTML = `<div class="comparison-scroll"><table class="comparison-table"><thead><tr><th>Tiêu chí</th>${this.comparisonItems.map((item) => `<th>${escapeHTML(item.university)}</th>`).join("")}</tr></thead><tbody>${[
      ["Ngành / chương trình", (item) => item.name], ["Mã ngành", (item) => item.code], ["Cơ sở", (item) => item.campus || "Chưa có dữ liệu"], ["Năm", (item) => item.year], ["Tổ hợp", (item) => item.combination || "Chưa có dữ liệu"], ["Phương thức", (item) => item.method || "Chưa có dữ liệu"], ["Thang điểm", (item) => item.scale ?? "Chưa có dữ liệu"], ["Điểm chuẩn", (item) => item.cutoff ?? "Chưa có dữ liệu"], ["Điểm của tôi khi lưu", (item) => item.userScore ?? "Chưa so sánh được"], ["Trạng thái", (item) => item.comparisonStatus === "compatible" ? "Có thể đối chiếu" : item.comparisonReason || "Chưa so sánh được"], ["Học phí", (item) => item.tuitionMin !== null && item.tuitionMin !== undefined ? `${item.tuitionMin}${item.tuitionMax !== null && item.tuitionMax !== undefined ? `–${item.tuitionMax}` : ""} ${item.tuitionUnit || ""}/${item.tuitionPeriod || ""}` : "Chưa có dữ liệu"], ["Điều kiện bổ sung", (item) => item.conditions || "Chưa có dữ liệu"]
    ].map(([label, value]) => `<tr><th>${label}</th>${this.comparisonItems.map((item) => `<td>${escapeHTML(value(item))}</td>`).join("")}</tr>`).join("")}<tr><th>Bỏ mục</th>${this.comparisonItems.map((item) => `<td><button class="button button-text" type="button" data-remove-compare="${escapeHTML(item.wishId)}">Bỏ</button></td>`).join("")}</tr></tbody></table></div>${this.comparisonItems.length < 2 ? '<p class="saved-wishes-note">Thêm ít nhất một mục nữa để so sánh.</p>' : ""}`;
  }
  exportWishesJson() {
    if (!this.savedWishes.length) { this.showToast("Chưa có nguyện vọng để xuất."); return; }
    downloadBlob(JSON.stringify(createWishBackup(this.savedWishes), null, 2), "application/json;charset=utf-8", `nguyen-vong-2026-${new Date().toISOString().slice(0, 10)}.json`);
  }
  exportWishesExcel() {
    if (!this.savedWishes.length) { this.showToast("Chưa có nguyện vọng để xuất."); return; }
    downloadBlob(wishesToXlsxBytes(this.savedWishes), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `nguyen-vong-2026-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  async previewWishImport(file) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("Tệp sao lưu vượt quá 1 MB.");
      const parsed = parseWishBackup(await file.text()); this.pendingWishImport = parsed;
      const preview = parsed.items.slice(0, 8).map((item, index) => `<li><span>${index + 1}. ${escapeHTML(item.university)}</span><b>${escapeHTML(item.name)} · ${escapeHTML(item.method || "Chưa có phương thức")}</b></li>`).join("");
      this.openModal(`<p class="modal-kicker">Xem trước tệp sao lưu</p><h2 id="modal-title">${parsed.items.length} nguyện vọng hợp lệ</h2><p class="modal-description">Hợp lệ: ${parsed.report.valid} · Trùng: ${parsed.report.duplicates} · Sai: ${parsed.report.invalid} · Vượt giới hạn: ${parsed.report.exceeded}</p><ul class="explanation-list">${preview}</ul>${parsed.items.length > 8 ? `<p class="modal-description">Và ${parsed.items.length - 8} mục khác.</p>` : ""}<div class="form-actions"><button class="button button-primary" type="button" data-apply-wish-import="merge">Gộp với danh sách hiện tại</button><button class="button button-light" type="button" data-apply-wish-import="replace">Thay thế danh sách</button><button class="button button-text" type="button" data-close-modal>Hủy</button></div>`, $("#import-wishes-json"));
    } catch (error) { this.showToast(error.message); }
    finally { $("#import-wishes-json").value = ""; }
  }
  applyWishImport(mode) { if (!this.pendingWishImport) return; const merged = mergeWishListsDetailed(this.savedWishes, this.pendingWishImport.items, mode); this.savedWishes = merged.items; this.pendingWishImport = null; this.persistWishes(); this.closeModal(); this.showToast(`Đã nhập ${merged.report.valid} mục; bỏ ${merged.report.duplicates} mục trùng và ${merged.report.invalid} mục sai.`); }
  openDataReport(context, trigger) {
    const major = context.majorId ? this.repository.getMajor(context.majorId) : null;
    const university = this.repository.getUniversity(major?.universityId || context.universityId);
    this.pendingReportContext = { universityId: university?.id, university: university?.name, majorId: major?.id, major: major?.name, code: major?.code, method: major?.method, year: major?.cutoff?.year || 2026 };
    this.openModal(`<p class="modal-kicker">Kiểm tra dữ liệu</p><h2 id="modal-title">Báo dữ liệu cần sửa</h2><p class="modal-description">Báo cáo sẽ được gửi trực tiếp tới hệ thống quản trị để bạn kiểm tra. Bạn vẫn có thể tải hoặc sao chép một bản riêng.</p><form id="data-report-form" class="form-card"><div class="form-grid form-grid-two"><div class="field"><label for="report-field">Trường dữ liệu</label><select id="report-field"><option>Hồ sơ trường</option><option>Tên ngành</option><option>Mã ngành</option><option>Tổ hợp</option><option>Phương thức</option><option>Điểm chuẩn</option><option>Công thức</option><option>Khác</option></select></div><div class="field"><label for="report-proposed">Giá trị đề xuất</label><input id="report-proposed" maxlength="500" /></div><div class="field full-field"><label for="report-description">Mô tả</label><textarea id="report-description" maxlength="1200" required placeholder="Nêu dữ liệu nào chưa đúng và lý do"></textarea></div><div class="field full-field"><label for="report-evidence">Liên kết kiểm chứng (không bắt buộc)</label><input id="report-evidence" type="url" maxlength="500" placeholder="https://..." /></div></div><div class="form-actions"><button class="button button-primary" type="submit" data-submit-report>Gửi báo cáo</button><button class="button button-light" type="button" data-download-report>Tải JSON</button><button class="button button-light" type="button" data-copy-report>Sao chép</button></div><p id="report-status" role="status" aria-live="polite"></p></form>`, trigger);
  }
  buildDataReportFromForm() { return createDataReport(this.pendingReportContext, { field: $("#report-field").value, description: $("#report-description").value, proposedValue: $("#report-proposed").value, evidenceUrl: $("#report-evidence").value }); }
  downloadDataReport() { try { const report = this.buildDataReportFromForm(); downloadBlob(JSON.stringify(report, null, 2), "application/json;charset=utf-8", `bao-du-lieu-${report.context.code || report.context.universityId || "truong"}-${Date.now()}.json`); $("#report-status").textContent = "Đã tạo tệp trên thiết bị; báo cáo chưa được gửi đi."; } catch (error) { this.showToast(error.message); } }
  async copyDataReport() { try { const report = this.buildDataReportFromForm(); await navigator.clipboard.writeText(JSON.stringify(report, null, 2)); $("#report-status").textContent = "Đã sao chép; báo cáo chưa được gửi đi."; } catch (error) { this.showToast(error.message || "Không thể sao chép báo cáo."); } }
  async submitDataReport(button) { try { if (!button || button.disabled) return; const report = this.buildDataReportFromForm(); button.disabled = true; button.textContent = "Đang gửi..."; $("#report-status").textContent = "Đang gửi báo cáo..."; const result = await this.repository.submitDataReport(report); const shortId = String(result.id || "").slice(0, 8); $("#report-status").textContent = result.delivery === "supabase" ? `Đã gửi thành công tới hệ thống quản trị${shortId ? ` · Mã ${shortId}` : ""}.` : `Đã tiếp nhận báo cáo${shortId ? ` · Mã ${shortId}` : ""} và sẽ tự đồng bộ khi kết nối ổn định.`; button.textContent = "Đã gửi"; this.showToast("Đã tiếp nhận báo cáo của bạn."); } catch (error) { $("#report-status").textContent = error.message || "Không thể gửi báo cáo. Bạn có thể tải JSON để giữ lại."; button.disabled = false; button.textContent = "Gửi lại"; this.showToast("Chưa gửi được báo cáo."); } }

  clearFormData() { this.invalidateScoreDerived("Điểm THPT đã bị xóa, cần tính lại."); this.clearAppliedCertificate(); this.state.autoEntries = undefined; this.state.manualScores = {}; this.renderAutoSubjectRows(); this.renderManualScoreFields(); this.resetThptResult(); this.saveForm(); this.showToast("Đã xóa điểm THPT đã lưu trên thiết bị."); }
  normalizeSearch(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi").trim(); }
  regionLabel(id) { return UNIVERSITY_REGIONS.find((item) => item.id === id)?.label || "Chưa phân miền"; }
  changePage(kind, page) { if (kind === "university") { this.universityPage = page; this.renderUniversities($("#university-query").value, true); } if (kind === "combination") { this.combinationPage = page; this.renderCombinations($("#combination-query").value, true); } if (kind === "major") { this.majorPage = page; this.majorSearchMode === "combinations" ? this.loadBestCombinationResults(page) : this.loadMajorResults(); } }
  renderPagination(kind, paging) { const target = document.getElementById(`${kind}-pagination`); if (!target) return; target.innerHTML = paging.pages > 1 ? `<button type="button" data-page-kind="${kind}" data-page="${paging.page - 1}" ${paging.page === 1 ? "disabled" : ""}>← Trước</button><span>Trang ${paging.page} / ${paging.pages}</span><button type="button" data-page-kind="${kind}" data-page="${paging.page + 1}" ${paging.page === paging.pages ? "disabled" : ""}>Sau →</button>` : ""; }

  openModal(content, trigger) { this.modalReturnFocus = trigger || document.activeElement; this.elements.modalBody.innerHTML = content; this.elements.modal.classList.remove("is-hidden"); document.body.classList.add("modal-open"); this.elements.modal.querySelector(".modal-close").focus(); }
  closeModal(restoreRoute = true) { this.modalToken = null; this.elements.modal.classList.add("is-hidden"); document.body.classList.remove("modal-open"); this.elements.modalBody.innerHTML = ""; if (restoreRoute && this.modalRouteActive && parseDeepLink()) { const target = this.modalSourceHash || "#universities"; history.replaceState(null, "", target); this.setView(target); } this.modalRouteActive = false; this.modalReturnFocus?.focus?.(); }
  openFormulaModal(id, trigger) { const formula = Calculator.getFormula(id); if (!formula) return; const inputs = (formula.inputs || []).map((item) => `<li><span>${escapeHTML(item)}</span><b>Đầu vào</b></li>`).join(""); this.openModal(`<p class="modal-kicker">${escapeHTML(formula.type)} · ${formula.year}</p><h2 id="modal-title">${escapeHTML(formula.name)}</h2><p class="modal-description">${escapeHTML(formula.description)}</p><h3 class="modal-section-title">Công thức</h3><div class="formula-box">${escapeHTML(formula.expression)}</div><h3 class="modal-section-title">Các biến đầu vào</h3><ul class="explanation-list">${inputs}</ul><h3 class="modal-section-title">Ví dụ</h3><div class="info-callout">${escapeHTML(formula.example)}</div>`, trigger); }
  openCalculationModal() { const result = this.lastResult; if (!result) return; const rows = result.breakdown.map((item) => `<li><span>${escapeHTML(item.label)}</span><b>${formatScore(item.value)}</b></li>`).join(""); this.openModal(`<p class="modal-kicker">Giải thích kết quả</p><h2 id="modal-title">${escapeHTML(this.lastTrigger?.context || "Điểm xét tuyển")}</h2><ul class="explanation-list">${rows}<li><span>Điểm tổ hợp</span><b>${formatScore(result.examScore)}</b></li><li><span>Điểm ưu tiên</span><b>+ ${formatScore(result.priority.adjusted)}</b></li><li><span>Tổng điểm xét tuyển</span><b>${formatScore(result.total)} / ${result.maxScore}</b></li></ul>`, $("#show-calculation")); }
  openAcademicCalculationModal() { const result = this.lastAcademicResult; if (!result) return; const rows = result.breakdown.map((item) => `<li><span>${escapeHTML(item.label)}</span><b>${formatScore(item.value)}${item.weight === 2 ? " × 2" : ""}</b></li>`).join(""); const priority = result.priorityApplied ? `<li><span>Điểm ưu tiên</span><b>+ ${formatScore(result.priority.adjusted)}</b></li>` : '<li><span>Điểm ưu tiên</span><b>Chưa áp dụng do thang 40</b></li>'; this.openModal(`<p class="modal-kicker">Giải thích học bạ</p><h2 id="modal-title">Điểm học bạ</h2><ul class="explanation-list">${rows}<li><span>Điểm có trọng số</span><b>${formatScore(result.examScore)} / ${result.maxScore}</b></li>${priority}</ul>`, $("#show-academic-calculation")); }
  openScoreSimulation() {
    if (!this.lastThptInput?.automatic) return;
    const options = this.lastThptInput.entries.map((item) => `<option value="${escapeHTML(item.subjectKey)}">${escapeHTML(subjectLabelForKey(item.subjectKey))} · ${formatScore(item.score)}</option>`).join("");
    this.openModal(`<p class="modal-kicker">Mô phỏng, chưa thay điểm thật</p><h2 id="modal-title">Thử tăng hoặc giảm một môn</h2><p class="modal-description">Kết quả chỉ cho thấy phép tính thay đổi thế nào, không dự báo chắc chắn trúng tuyển.</p><div class="form-grid form-grid-two"><div class="field"><label for="simulation-subject">Môn</label><select id="simulation-subject">${options}</select></div><div class="field"><label for="simulation-delta">Tăng / giảm</label><input id="simulation-delta" type="number" inputmode="decimal" min="-10" max="10" step="0.1" value="0.5" /></div></div><div id="simulation-preview" aria-live="polite"></div><div class="form-actions"><button class="button button-primary" type="button" data-apply-simulation disabled>Áp dụng vào điểm thật</button></div>`, $("#simulate-score"));
    const update = () => {
      try {
        const calculation = simulateScoreChange({ entries: this.lastThptInput.entries, subjectKey: $("#simulation-subject").value, delta: $("#simulation-delta").value, calculate: (entries) => calculateAutomaticCombinations({ entries, combinations: this.repository.combinations, year: this.lastThptInput.year, priorityContext: this.lastThptInput.priorityContext }).results });
        if (!calculation.before?.length || !calculation.after?.length) throw new Error("Không còn tổ hợp phù hợp sau thay đổi.");
        this.pendingSimulation = calculation;
        const beforeBest = calculation.before[0], afterBest = calculation.after[0];
        const byCode = new Map(calculation.before.map((item) => [item.combination.code, item]));
        const changes = calculation.after.map((item) => { const previous = byCode.get(item.combination.code); const difference = previous ? Number((item.result.total - previous.result.total).toFixed(2)) : null; return `<li><span>${escapeHTML(item.combination.code)} · ${previous ? formatScore(previous.result.total) : "—"} → ${formatScore(item.result.total)}</span><b>${difference === null ? "Mới" : `${difference >= 0 ? "+" : ""}${formatScore(difference)}`}</b></li>`; }).join("");
        $("#simulation-preview").innerHTML = `<div class="simulation-grid"><article><span>Tổ hợp tốt nhất trước</span><b>${escapeHTML(beforeBest.combination.code)} · ${formatScore(beforeBest.result.total)} / ${beforeBest.result.maxScore}</b></article><article><span>Tổ hợp tốt nhất sau mô phỏng</span><b>${escapeHTML(afterBest.combination.code)} · ${formatScore(afterBest.result.total)} / ${afterBest.result.maxScore}</b></article></div><p class="comparison-text">${escapeHTML(subjectLabelForKey(calculation.subjectKey))}: ${formatScore(calculation.originalScore)} → ${formatScore(calculation.simulatedScore)} · Ưu tiên ${formatScore(beforeBest.result.priority.adjusted)} → ${formatScore(afterBest.result.priority.adjusted)}</p><ul class="explanation-list">${changes}</ul>`;
        $("[data-apply-simulation]").disabled = false;
      } catch (error) { this.pendingSimulation = null; $("#simulation-preview").innerHTML = `<p class="error-state">${escapeHTML(error.message)}</p>`; $("[data-apply-simulation]").disabled = true; }
    };
    $("#simulation-subject").addEventListener("change", update); $("#simulation-delta").addEventListener("input", debounce(update, 100)); update();
  }
  applyScoreSimulation() {
    if (!this.pendingSimulation) return;
    const index = this.lastThptInput.entries.findIndex((item) => item.subjectKey === this.pendingSimulation.subjectKey);
    const input = $(`[data-auto-score="${index}"]`);
    if (!input) return;
    this.invalidateScoreDerived("Điểm mô phỏng đã được áp dụng, cần cập nhật kết quả tìm ngành.");
    input.value = String(this.pendingSimulation.simulatedScore); this.pendingSimulation = null; this.closeModal(); this.calculateTHPT(false); this.showToast("Đã áp dụng điểm mô phỏng vào bảng điểm.");
  }
  openCombinationModal(id, trigger) { const combination = this.repository.getCombination(id); if (!combination) return; const rows = combination.subjects.map((subject, index) => `<li><span>Môn ${index + 1}</span><b>${escapeHTML(subject)}</b></li>`).join(""); const usable = isStandardCombination(combination); this.openModal(`<p class="modal-kicker">Tổ hợp xét tuyển</p><h2 id="modal-title">${escapeHTML(combination.code)}</h2><p class="modal-description">${escapeHTML(combination.subjectText)}</p><ul class="explanation-list">${rows}</ul>${usable ? `<div class="form-actions"><button class="button button-primary" type="button" data-use-combination="${escapeHTML(combination.id)}">Dùng để tính điểm</button></div>` : '<div class="info-callout">Tổ hợp đặc thù được giữ để tra cứu và chưa dùng trong bộ tính THPT tiêu chuẩn.</div>'}`, trigger); $("[data-use-combination]")?.addEventListener("click", (event) => { this.elements.combinationSelect.value = event.currentTarget.dataset.useCombination; this.renderManualScoreFields(); this.setThptMode("manual"); this.closeModal(); this.goTo("#calculator"); }); }
  showToast(message) { this.elements.toast.textContent = message; this.elements.toast.classList.add("show"); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.elements.toast.classList.remove("show"), 3200); }
}

const app = new THPTApp();
app.init();
