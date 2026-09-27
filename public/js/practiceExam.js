import { PRACTICE_CATEGORIES, PRACTICE_EXAMS_2026 } from "./data/practiceExams2026.js";
import { createPracticeAttempt, formatExamTime, gradePracticeExam, normalizePracticeHistory, remainingExamSeconds } from "./core/practiceExam.js";
import { escapeHTML, storage } from "./utils.js";

export const PRACTICE_ACTIVE_KEY = "thpt-practice-active-v1";
export const PRACTICE_HISTORY_KEY = "thpt-practice-history-v1";

function formatDate(timestamp) {
  try {
    return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

function scoreTone(score) {
  if (score >= 8) return "excellent";
  if (score >= 5) return "passed";
  return "needs-work";
}

export class PracticeExamApp {
  constructor(root = document.getElementById("practice-exam-app")) {
    this.root = root;
    this.active = storage.get(PRACTICE_ACTIVE_KEY, null);
    this.history = normalizePracticeHistory(storage.get(PRACTICE_HISTORY_KEY, []));
    this.category = "Tất cả";
    this.query = "";
    this.submitArmed = false;
    this.pendingStartExamId = null;
    this.timer = null;
  }

  init() {
    if (!this.root) return;
    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("change", (event) => this.handleChange(event));
    this.root.addEventListener("input", (event) => {
      if (!event.target.matches("[data-practice-search]")) return;
      this.query = event.target.value.trim().toLocaleLowerCase("vi");
      this.renderDashboard();
      const search = this.root.querySelector("[data-practice-search]");
      search?.focus();
      search?.setSelectionRange(search.value.length, search.value.length);
    });
    if (this.active && this.examById(this.active.examId)) {
      if (remainingExamSeconds(this.active) <= 0) this.finishAttempt(true);
      else this.renderExam();
    } else {
      this.active = null;
      storage.remove(PRACTICE_ACTIVE_KEY);
      this.renderDashboard();
    }
  }

  examById(id) {
    return PRACTICE_EXAMS_2026.find((item) => item.id === id);
  }

  filteredExams() {
    return PRACTICE_EXAMS_2026.filter((item) => {
      const categoryMatches = this.category === "Tất cả" || item.category === this.category;
      const queryMatches = !this.query || `${item.subject} ${item.title}`.toLocaleLowerCase("vi").includes(this.query);
      return categoryMatches && queryMatches;
    });
  }

  renderDashboard() {
    this.stopTimer();
    const completedByExam = new Map();
    this.history.forEach((item) => {
      if (!completedByExam.has(item.examId)) completedByExam.set(item.examId, item);
    });
    const cards = this.filteredExams().map((item) => {
      const latest = completedByExam.get(item.id);
      return `<article class="practice-subject-card">
        <div class="practice-card-top"><span class="practice-icon" aria-hidden="true">${escapeHTML(item.icon)}</span><span class="practice-category">${escapeHTML(item.category)}</span></div>
        <h3>${escapeHTML(item.subject)}</h3>
        <p>${escapeHTML(item.title)} · ${item.questions.length} câu</p>
        <dl><div><dt>Thời gian luyện</dt><dd>${item.durationMinutes} phút</dd></div><div><dt>Thi chính thức</dt><dd>${item.officialMinutes} phút</dd></div></dl>
        ${latest ? `<div class="practice-latest">Lần gần nhất <strong>${Number(latest.result?.score || 0).toFixed(2)}</strong>/10</div>` : ""}
        <button class="button button-primary" type="button" data-start-exam="${escapeHTML(item.id)}">${latest ? "Thi lại" : "Bắt đầu"}</button>
      </article>`;
    }).join("");
    const resume = this.active ? (() => {
      const item = this.examById(this.active.examId);
      return item ? `<aside class="practice-resume"><div><span>Bài đang làm</span><strong>${escapeHTML(item.subject)} · còn ${formatExamTime(remainingExamSeconds(this.active))}</strong></div><button class="button button-primary" type="button" data-resume-exam>Tiếp tục</button></aside>` : "";
    })() : "";
    const replace = this.pendingStartExamId ? (() => {
      const pendingExam = this.examById(this.pendingStartExamId);
      const activeExam = this.examById(this.active?.examId);
      return pendingExam && activeExam ? `<aside class="practice-replace" role="alert"><div><strong>Bắt đầu ${escapeHTML(pendingExam.subject)}?</strong><span>Bài ${escapeHTML(activeExam.subject)} chưa nộp sẽ được thay thế.</span></div><div><button class="button button-primary" type="button" data-confirm-start="${escapeHTML(pendingExam.id)}">Bắt đầu môn mới</button><button class="button button-light" type="button" data-cancel-start>Giữ bài đang làm</button></div></aside>` : "";
    })() : "";
    const history = this.history.slice(0, 8).map((item) => {
      const subject = this.examById(item.examId)?.subject || "Đề luyện tập";
      return `<button class="practice-history-row" type="button" data-view-attempt="${escapeHTML(item.id)}"><span><b>${escapeHTML(subject)}</b><small>${escapeHTML(formatDate(item.submittedAt))}</small></span><strong>${Number(item.result?.score || 0).toFixed(2)}</strong></button>`;
    }).join("");
    this.root.innerHTML = `
      ${resume}${replace}
      <div class="practice-toolbar">
        <div class="practice-filters" aria-label="Lọc môn thi">${PRACTICE_CATEGORIES.map((category) => `<button type="button" class="${category === this.category ? "is-active" : ""}" data-practice-category="${escapeHTML(category)}" aria-pressed="${category === this.category}">${escapeHTML(category)}</button>`).join("")}</div>
        <label class="practice-search"><span aria-hidden="true">⌕</span><span class="sr-only">Tìm môn thi</span><input type="search" value="${escapeHTML(this.query)}" placeholder="Tìm môn..." data-practice-search></label>
      </div>
      <div class="practice-directory">
        <div>
          <p class="practice-count">${cards ? `${this.filteredExams().length} đề luyện tập` : "Không tìm thấy môn phù hợp."}</p>
          <div class="practice-subject-grid">${cards}</div>
        </div>
        <aside class="practice-history"><div class="practice-history-heading"><div><span>Kết quả trên thiết bị</span><h3>Lịch sử thi thử</h3></div><b>${this.history.length}</b></div>${history || '<p class="practice-empty">Kết quả sau khi nộp bài sẽ xuất hiện tại đây.</p>'}</aside>
      </div>`;
  }

  handleClick(event) {
    const start = event.target.closest("[data-start-exam]");
    if (start) return this.startExam(start.dataset.startExam);
    const confirmStart = event.target.closest("[data-confirm-start]");
    if (confirmStart) return this.startExam(confirmStart.dataset.confirmStart, true);
    if (event.target.closest("[data-cancel-start]")) {
      this.pendingStartExamId = null;
      return this.renderDashboard();
    }
    if (event.target.closest("[data-resume-exam]")) return this.renderExam();
    const category = event.target.closest("[data-practice-category]");
    if (category) {
      this.category = category.dataset.practiceCategory;
      return this.renderDashboard();
    }
    const nav = event.target.closest("[data-question-nav]");
    if (nav) return document.getElementById(`practice-question-${nav.dataset.questionNav}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const flag = event.target.closest("[data-flag-question]");
    if (flag) return this.toggleFlag(flag.dataset.flagQuestion);
    if (event.target.closest("[data-submit-exam]")) return this.requestSubmit();
    if (event.target.closest("[data-exit-exam]")) return this.renderDashboard();
    const view = event.target.closest("[data-view-attempt]");
    if (view) return this.renderResult(this.history.find((item) => item.id === view.dataset.viewAttempt));
    if (event.target.closest("[data-back-practice]")) return this.renderDashboard();
    const retry = event.target.closest("[data-retry-exam]");
    if (retry) return this.startExam(retry.dataset.retryExam);
  }

  handleChange(event) {
    const answer = event.target.closest("[data-practice-answer]");
    if (!answer || !this.active) return;
    this.active.answers[answer.dataset.practiceAnswer] = Number(answer.value);
    this.submitArmed = false;
    this.persistActive();
    this.updateExamProgress();
  }

  startExam(examId, replaceActive = false) {
    const selectedExam = this.examById(examId);
    if (!selectedExam) return;
    if (this.active?.examId === examId) return this.renderExam();
    if (this.active && !replaceActive) {
      this.pendingStartExamId = examId;
      this.renderDashboard();
      this.root.querySelector(".practice-replace")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    this.pendingStartExamId = null;
    this.active = createPracticeAttempt(selectedExam);
    this.submitArmed = false;
    this.persistActive();
    this.renderExam();
    this.root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  renderExam() {
    const selectedExam = this.examById(this.active?.examId);
    if (!selectedExam) return this.renderDashboard();
    const answers = this.active.answers || {};
    const flagged = new Set(this.active.flagged || []);
    this.root.innerHTML = `
      <div class="practice-exam-shell">
        <header class="practice-exam-header">
          <div><p class="eyebrow">PHÒNG THI 2026 · ĐỀ LUYỆN NHANH</p><h3>${escapeHTML(selectedExam.subject)}</h3><p>${escapeHTML(selectedExam.title)} · ${selectedExam.questions.length} câu · thang 10</p></div>
          <div class="practice-timer-wrap"><span>Thời gian còn lại</span><strong id="practice-timer" aria-live="polite">${formatExamTime(remainingExamSeconds(this.active))}</strong></div>
        </header>
        <div class="practice-progress"><span id="practice-progress-label">Đã làm 0/${selectedExam.questions.length}</span><div><i id="practice-progress-bar"></i></div></div>
        ${selectedExam.note ? `<p class="practice-exam-note">${escapeHTML(selectedExam.note)}</p>` : ""}
        <div class="practice-exam-layout">
          <form class="practice-question-list" id="practice-question-form">
            ${selectedExam.questions.map((question, index) => `<fieldset class="practice-question" id="practice-question-${index + 1}">
              <legend><span>Câu ${index + 1}</span> ${escapeHTML(question.prompt)}</legend>
              <div class="practice-options">${question.options.map((option, optionIndex) => `<label><input type="radio" name="${escapeHTML(question.id)}" value="${optionIndex}" data-practice-answer="${escapeHTML(question.id)}" ${answers[question.id] === optionIndex ? "checked" : ""}><span><b>${String.fromCharCode(65 + optionIndex)}</b>${escapeHTML(option)}</span></label>`).join("")}</div>
              <button class="practice-flag ${flagged.has(question.id) ? "is-active" : ""}" type="button" data-flag-question="${escapeHTML(question.id)}" aria-pressed="${flagged.has(question.id)}">⚑ ${flagged.has(question.id) ? "Đã đánh dấu" : "Xem lại sau"}</button>
            </fieldset>`).join("")}
          </form>
          <aside class="practice-question-nav">
            <h4>Phiếu trả lời</h4>
            <div class="practice-nav-grid">${selectedExam.questions.map((question, index) => `<button type="button" data-question-nav="${index + 1}" data-question-id="${escapeHTML(question.id)}" class="${answers[question.id] !== undefined ? "is-answered" : ""} ${flagged.has(question.id) ? "is-flagged" : ""}">${index + 1}</button>`).join("")}</div>
            <p id="practice-submit-note">Bài được lưu tự động trên thiết bị.</p>
            <button class="button button-primary" type="button" data-submit-exam>Nộp bài</button>
            <button class="button button-text" type="button" data-exit-exam>Thoát và làm tiếp sau</button>
          </aside>
        </div>
      </div>`;
    this.updateExamProgress();
    this.startTimer();
  }

  updateExamProgress() {
    const selectedExam = this.examById(this.active?.examId);
    if (!selectedExam) return;
    const answered = selectedExam.questions.filter((question) => this.active.answers?.[question.id] !== undefined).length;
    const percent = selectedExam.questions.length ? (answered / selectedExam.questions.length) * 100 : 0;
    const label = this.root.querySelector("#practice-progress-label");
    const bar = this.root.querySelector("#practice-progress-bar");
    if (label) label.textContent = `Đã làm ${answered}/${selectedExam.questions.length}`;
    if (bar) bar.style.width = `${percent}%`;
    this.root.querySelectorAll("[data-question-id]").forEach((button) => {
      button.classList.toggle("is-answered", this.active.answers?.[button.dataset.questionId] !== undefined);
      button.classList.toggle("is-flagged", this.active.flagged?.includes(button.dataset.questionId));
    });
  }

  toggleFlag(questionId) {
    if (!this.active) return;
    const selectedExam = this.examById(this.active.examId);
    const questionIndex = selectedExam?.questions.findIndex((item) => item.id === questionId) ?? -1;
    const flags = new Set(this.active.flagged || []);
    flags.has(questionId) ? flags.delete(questionId) : flags.add(questionId);
    this.active.flagged = [...flags];
    this.persistActive();
    this.renderExam();
    if (questionIndex >= 0) document.getElementById(`practice-question-${questionIndex + 1}`)?.scrollIntoView({ block: "center" });
  }

  requestSubmit() {
    const selectedExam = this.examById(this.active?.examId);
    if (!selectedExam) return;
    const unanswered = selectedExam.questions.filter((question) => this.active.answers?.[question.id] === undefined).length;
    const note = this.root.querySelector("#practice-submit-note");
    if (unanswered > 0 && !this.submitArmed) {
      this.submitArmed = true;
      if (note) note.textContent = `Còn ${unanswered} câu chưa trả lời. Bấm “Nộp bài” lần nữa để xác nhận.`;
      return;
    }
    this.finishAttempt(false);
  }

  finishAttempt(autoSubmitted) {
    const selectedExam = this.examById(this.active?.examId);
    if (!selectedExam) return this.renderDashboard();
    const submittedAt = Date.now();
    const completed = {
      ...this.active,
      submittedAt,
      autoSubmitted,
      result: gradePracticeExam(selectedExam, this.active.answers || {})
    };
    this.history = normalizePracticeHistory([completed, ...this.history]);
    storage.set(PRACTICE_HISTORY_KEY, this.history);
    storage.remove(PRACTICE_ACTIVE_KEY);
    this.active = null;
    this.renderResult(completed);
  }

  renderResult(attempt) {
    this.stopTimer();
    const selectedExam = this.examById(attempt?.examId);
    if (!selectedExam || !attempt?.result) return this.renderDashboard();
    const result = attempt.result;
    const detailById = new Map(result.details.map((item) => [item.questionId, item]));
    this.root.innerHTML = `
      <div class="practice-result">
        <header class="practice-result-hero ${scoreTone(result.score)}">
          <div><p class="eyebrow">KẾT QUẢ · ${escapeHTML(selectedExam.subject)}</p><h3>${result.score.toFixed(2)}<span>/10</span></h3><p>${attempt.autoSubmitted ? "Hết giờ, hệ thống đã tự nộp bài." : "Bài đã được chấm và lưu trên thiết bị."}</p></div>
          <dl><div><dt>Đúng</dt><dd>${result.correctCount}/${result.totalQuestions}</dd></div><div><dt>Đã trả lời</dt><dd>${result.answeredCount}</dd></div><div><dt>Bỏ trống</dt><dd>${result.unansweredCount}</dd></div></dl>
        </header>
        <div class="practice-result-actions"><button class="button button-primary" type="button" data-retry-exam="${escapeHTML(selectedExam.id)}">Làm lại đề</button><button class="button button-secondary" type="button" data-back-practice>Về danh sách môn</button></div>
        <div class="practice-review-heading"><div><p class="eyebrow">XEM LẠI BÀI LÀM</p><h3>Đáp án và lời giải chi tiết</h3></div><span>Đỏ: đã chọn sai · Xanh: đáp án đúng</span></div>
        <div class="practice-review-list">${selectedExam.questions.map((question, index) => {
          const detail = detailById.get(question.id);
          return `<article class="practice-review ${detail.correct ? "is-correct" : "is-wrong"}"><h4><span>Câu ${index + 1}</span>${escapeHTML(question.prompt)}</h4><div class="practice-review-options">${question.options.map((option, optionIndex) => {
            const classes = [optionIndex === question.answer ? "is-answer" : "", optionIndex === detail.selected && optionIndex !== question.answer ? "is-selected-wrong" : ""].filter(Boolean).join(" ");
            return `<p class="${classes}"><b>${String.fromCharCode(65 + optionIndex)}</b>${escapeHTML(option)}${optionIndex === question.answer ? "<strong>Đáp án đúng</strong>" : optionIndex === detail.selected ? "<strong>Bạn chọn</strong>" : ""}</p>`;
          }).join("")}</div><div class="practice-explanation"><b>Lời giải</b><p>${escapeHTML(question.explanation)}</p></div></article>`;
        }).join("")}</div>
      </div>`;
    this.root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  persistActive() {
    storage.set(PRACTICE_ACTIVE_KEY, this.active);
  }

  startTimer() {
    this.stopTimer();
    const tick = () => {
      if (!this.active) return this.stopTimer();
      const remaining = remainingExamSeconds(this.active);
      const timer = this.root.querySelector("#practice-timer");
      if (timer) {
        timer.textContent = formatExamTime(remaining);
        timer.classList.toggle("is-urgent", remaining <= 60);
      }
      if (remaining <= 0) this.finishAttempt(true);
    };
    tick();
    this.timer = window.setInterval(tick, 1000);
  }

  stopTimer() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
  }
}
