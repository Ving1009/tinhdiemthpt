import { PRACTICE_CATEGORIES, PRACTICE_EXAMS_2026 } from "./data/practiceExams2026.js";
import {
  createPracticeAttempt,
  formatExamTime,
  gradePracticeExam,
  isPracticeQuestionAnswered,
  normalizePracticeHistory,
  remainingExamSeconds
} from "./core/practiceExam.js?v=20261001-1";
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

function answerLabel(value) {
  return value === true ? "Đúng" : value === false ? "Sai" : "Chưa chọn";
}

function renderPageGallery(images, label, className) {
  if (!Array.isArray(images) || !images.length) return "";
  return `<div class="${className}">${images.map((src, index) => `<a href="${escapeHTML(src)}" target="_blank" rel="noopener" aria-label="Mở ${escapeHTML(label.toLocaleLowerCase("vi"))} trang ${index + 1}"><img src="${escapeHTML(src)}" alt="${escapeHTML(label)} trang ${index + 1}" ${index ? 'loading="lazy"' : 'fetchpriority="high"'}></a>`).join("")}</div>`;
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
    this.root.addEventListener("input", (event) => this.handleInput(event));
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

  questionsForAttempt(exam, attempt = this.active) {
    const questions = Array.isArray(exam?.questions) ? exam.questions : [];
    if (!exam?.answerBranches?.length) return questions;
    const branch = exam.answerBranches.includes(attempt?.branch) ? attempt.branch : exam.answerBranches[0];
    return questions.filter((question) => !question.branch || question.branch === branch);
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
    const filteredExams = this.filteredExams();
    const cards = filteredExams.map((item) => {
      const latest = completedByExam.get(item.id);
      const official = item.sourceKind === "official-paper";
      return `<article class="practice-subject-card">
        <div class="practice-card-top"><span class="practice-icon" aria-hidden="true">${escapeHTML(item.icon)}</span><span class="practice-category ${official ? "is-official" : ""}">${official ? "Đề chính thức" : "Đề luyện"}</span></div>
        <h3>${escapeHTML(item.subject)}</h3>
        <p>${escapeHTML(item.title)} · ${item.questionCount || item.questions.length} câu cần làm</p>
        <dl><div><dt>Thời gian</dt><dd>${item.durationMinutes} phút</dd></div><div><dt>Tài liệu</dt><dd>${item.digitizedSolutionCount ? `${item.digitizedSolutionCount} lời giải theo câu` : item.answerImages?.length ? "Đáp án đã số hóa" : item.answerSource ? "Có đáp án đối chiếu" : official ? "Có đáp án chấm" : "Có lời giải"}</dd></div></dl>
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
      return pendingExam && activeExam ? `<aside class="practice-replace" role="alert"><div><strong>Bắt đầu ${escapeHTML(pendingExam.subject)}?</strong><span>Nếu bắt đầu môn mới, bài ${escapeHTML(activeExam.subject)} chưa nộp sẽ được thay thế.</span></div><div><button class="button button-primary" type="button" data-confirm-start="${escapeHTML(pendingExam.id)}">Bắt đầu môn mới</button><button class="button button-light" type="button" data-cancel-start>Giữ bài đang làm</button></div></aside>` : "";
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
          <p class="practice-count">${cards ? `${filteredExams.length} đề thi và đề luyện tập` : "Không tìm thấy môn phù hợp. Bạn hãy thử tên môn khác."}</p>
          <div class="practice-subject-grid">${cards}</div>
        </div>
        <aside class="practice-history"><div class="practice-history-heading"><div><span>Kết quả trên thiết bị</span><h3>Lịch sử thi thử</h3></div><b>${this.history.length}</b></div>${history || '<p class="practice-empty">Nộp bài để xem kết quả tại đây.</p>'}</aside>
      </div>`;
  }

  handleInput(event) {
    const shortAnswer = event.target.closest("[data-practice-short]");
    if (shortAnswer && this.active) {
      this.active.answers[shortAnswer.dataset.practiceShort] = shortAnswer.value;
      this.submitArmed = false;
      this.persistActive();
      this.updateExamProgress();
      return;
    }
    if (!event.target.matches("[data-practice-search]")) return;
    this.query = event.target.value.trim().toLocaleLowerCase("vi");
    this.renderDashboard();
    const search = this.root.querySelector("[data-practice-search]");
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
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
    const branch = event.target.closest("[data-practice-branch]");
    if (branch && this.active) {
      this.active.branch = branch.dataset.practiceBranch;
      this.submitArmed = false;
      this.persistActive();
      return this.renderExam();
    }
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
    const solutionJump = event.target.closest("[data-solution-jump]");
    if (solutionJump) {
      const target = document.getElementById(solutionJump.value);
      if (target) {
        target.open = true;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    if (!this.active) return;
    const trueFalse = event.target.closest("[data-practice-tf]");
    if (trueFalse) {
      const questionId = trueFalse.dataset.practiceTf;
      const statementIndex = Number(trueFalse.dataset.statementIndex);
      const current = Array.isArray(this.active.answers[questionId])
        ? [...this.active.answers[questionId]]
        : [null, null, null, null];
      current[statementIndex] = trueFalse.value === "true";
      this.active.answers[questionId] = current;
      this.submitArmed = false;
      this.persistActive();
      this.updateExamProgress();
      return;
    }
    const answer = event.target.closest("[data-practice-answer]");
    if (!answer) return;
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

  renderQuestion(question, index, answers, flagged) {
    const value = answers[question.id];
    let fields = "";
    if (question.type === "true-false") {
      const selected = Array.isArray(value) ? value : [];
      fields = `<div class="practice-tf-list">${question.statements.map((statement, statementIndex) => `<div class="practice-tf-row"><div class="practice-tf-statement"><b>Ý ${String.fromCharCode(97 + statementIndex)}</b><p>${escapeHTML(statement)}</p></div><div><label><input type="radio" name="${escapeHTML(question.id)}-${statementIndex}" value="true" data-practice-tf="${escapeHTML(question.id)}" data-statement-index="${statementIndex}" ${selected[statementIndex] === true ? "checked" : ""}><span>Đúng</span></label><label><input type="radio" name="${escapeHTML(question.id)}-${statementIndex}" value="false" data-practice-tf="${escapeHTML(question.id)}" data-statement-index="${statementIndex}" ${selected[statementIndex] === false ? "checked" : ""}><span>Sai</span></label></div></div>`).join("")}</div>`;
    } else if (question.type === "short") {
      fields = `<label class="practice-short"><span>Nhập đáp án</span><input type="text" inputmode="decimal" autocomplete="off" value="${escapeHTML(String(value ?? ""))}" data-practice-short="${escapeHTML(question.id)}" placeholder="Ví dụ: 7,35"></label>`;
    } else {
      const compact = question.options.every((option) => /^[A-D]$/.test(option));
      fields = `<div class="practice-options ${compact ? "is-answer-sheet" : ""}">${question.options.map((option, optionIndex) => `<label><input type="radio" name="${escapeHTML(question.id)}" value="${optionIndex}" data-practice-answer="${escapeHTML(question.id)}" ${value === optionIndex ? "checked" : ""}><span><b>${String.fromCharCode(65 + optionIndex)}</b>${compact ? "" : escapeHTML(option)}</span></label>`).join("")}</div>`;
    }
    const numberLabel = Number.isInteger(question.number) ? `Câu ${question.number}` : `Câu ${index + 1}`;
    const context = String(question.context || "").trim();
    return `<fieldset class="practice-question type-${escapeHTML(question.type || "single")}" id="practice-question-${index + 1}">
      <legend><span>${escapeHTML(question.section || "")}</span> ${escapeHTML(numberLabel)}. ${escapeHTML(question.prompt)}</legend>
      ${context ? `<div class="practice-question-context">${escapeHTML(context)}</div>` : ""}
      ${fields}
      <button class="practice-flag ${flagged.has(question.id) ? "is-active" : ""}" type="button" data-flag-question="${escapeHTML(question.id)}" aria-pressed="${flagged.has(question.id)}">⚑ ${flagged.has(question.id) ? "Đã đánh dấu" : "Xem lại sau"}</button>
    </fieldset>`;
  }

  renderExam() {
    const selectedExam = this.examById(this.active?.examId);
    if (!selectedExam) return this.renderDashboard();
    const questions = this.questionsForAttempt(selectedExam);
    const answers = this.active.answers || {};
    const flagged = new Set(this.active.flagged || []);
    const branchPicker = selectedExam.answerBranches?.length ? `<div class="practice-branch-picker"><span>Chọn định hướng Tin học</span><div>${selectedExam.answerBranches.map((branch) => `<button type="button" data-practice-branch="${escapeHTML(branch)}" class="${this.active.branch === branch ? "is-active" : ""}" aria-pressed="${this.active.branch === branch}">${escapeHTML(branch)}</button>`).join("")}</div></div>` : "";
    const sourcePages = selectedExam.pageImages?.length ? `<details class="practice-paper"><summary><span><b>Đối chiếu đề gốc · Mã ${escapeHTML(selectedExam.examCode)}</b><small>Chỉ mở khi bạn cần kiểm tra hình, bảng hoặc công thức</small></span><strong>${selectedExam.pageImages.length} trang</strong></summary>${renderPageGallery(selectedExam.pageImages, `Đề ${selectedExam.subject}`, "practice-paper-pages")}</details>` : "";
    this.root.innerHTML = `
      <div class="practice-exam-shell">
        <header class="practice-exam-header">
          <div><p class="eyebrow">Thi thử 2026 · ${selectedExam.sourceKind === "official-paper" ? "Đề chính thức" : "Đề luyện"}</p><h3>${escapeHTML(selectedExam.subject)}</h3><p>${escapeHTML(selectedExam.title)} · ${questions.length} câu cần làm · thang 10</p></div>
          <div class="practice-timer-wrap"><span>Thời gian còn lại</span><strong id="practice-timer" aria-live="polite">${formatExamTime(remainingExamSeconds(this.active))}</strong></div>
        </header>
        <div class="practice-progress"><span id="practice-progress-label">Đã làm 0/${questions.length}</span><div><i id="practice-progress-bar"></i></div></div>
        ${selectedExam.note ? `<p class="practice-exam-note">${escapeHTML(selectedExam.note)}</p>` : ""}
        ${branchPicker}
        ${sourcePages}
        <div class="practice-exam-layout">
          <form class="practice-question-list ${selectedExam.hasFullText ? "is-full-text" : selectedExam.pageImages?.length ? "is-answer-sheet" : ""}" id="practice-question-form">
            ${questions.map((question, index) => this.renderQuestion(question, index, answers, flagged)).join("")}
          </form>
          <aside class="practice-question-nav">
            <h4>Phiếu trả lời</h4>
            <div class="practice-nav-grid">${questions.map((question, index) => `<button type="button" data-question-nav="${index + 1}" data-question-id="${escapeHTML(question.id)}" class="${isPracticeQuestionAnswered(question, answers[question.id]) ? "is-answered" : ""} ${flagged.has(question.id) ? "is-flagged" : ""}">${index + 1}</button>`).join("")}</div>
            <p id="practice-submit-note">Bài làm của bạn được tự động lưu trên thiết bị.</p>
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
    const questions = this.questionsForAttempt(selectedExam);
    const answered = questions.filter((question) => isPracticeQuestionAnswered(question, this.active.answers?.[question.id])).length;
    const percent = questions.length ? (answered / questions.length) * 100 : 0;
    const label = this.root.querySelector("#practice-progress-label");
    const bar = this.root.querySelector("#practice-progress-bar");
    if (label) label.textContent = `Đã làm ${answered}/${questions.length}`;
    if (bar) bar.style.width = `${percent}%`;
    this.root.querySelectorAll("[data-question-id]").forEach((button) => {
      const question = questions.find((item) => item.id === button.dataset.questionId);
      button.classList.toggle("is-answered", isPracticeQuestionAnswered(question, this.active.answers?.[button.dataset.questionId]));
      button.classList.toggle("is-flagged", this.active.flagged?.includes(button.dataset.questionId));
    });
  }

  toggleFlag(questionId) {
    if (!this.active) return;
    const selectedExam = this.examById(this.active.examId);
    const questionIndex = this.questionsForAttempt(selectedExam).findIndex((item) => item.id === questionId);
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
    const questions = this.questionsForAttempt(selectedExam);
    const unanswered = questions.filter((question) => !isPracticeQuestionAnswered(question, this.active.answers?.[question.id])).length;
    const note = this.root.querySelector("#practice-submit-note");
    if (unanswered > 0 && !this.submitArmed) {
      this.submitArmed = true;
      if (note) note.textContent = `Còn ${unanswered} câu chưa trả lời. Bạn hãy bấm Nộp bài lần nữa để xác nhận.`;
      return;
    }
    this.finishAttempt(false);
  }

  finishAttempt(autoSubmitted) {
    const selectedExam = this.examById(this.active?.examId);
    if (!selectedExam) return this.renderDashboard();
    const submittedAt = Date.now();
    const gradingExam = { ...selectedExam, questions: this.questionsForAttempt(selectedExam) };
    const completed = { ...this.active, submittedAt, autoSubmitted, result: gradePracticeExam(gradingExam, this.active.answers || {}) };
    this.history = normalizePracticeHistory([completed, ...this.history]);
    storage.set(PRACTICE_HISTORY_KEY, this.history);
    storage.remove(PRACTICE_ACTIVE_KEY);
    this.active = null;
    this.renderResult(completed);
  }

  renderReview(question, index, detail) {
    const reviewText = `${question.context ? `<div class="practice-review-context">${escapeHTML(question.context)}</div>` : ""}<p class="practice-review-prompt">${escapeHTML(question.prompt)}</p>`;
    const solution = question.explanation ? `<details class="practice-question-solution" id="practice-solution-${index + 1}"><summary>Xem lời giải câu này</summary><div>${escapeHTML(question.explanation)}</div></details>` : "";
    if (question.type === "true-false") {
      return `<article class="practice-review ${detail.correct ? "is-correct" : "is-wrong"}"><h4><span>${escapeHTML(question.section)} · Câu ${question.number}</span>${detail.correctItems}/4 ý đúng · ${Number(detail.points).toFixed(2)}/${Number(detail.maximumPoints).toFixed(2)} điểm</h4>${reviewText}<div class="practice-review-options">${question.statements.map((statement, statementIndex) => {
        const selected = detail.selected?.[statementIndex];
        const expected = question.answer[statementIndex];
        return `<p class="${selected === expected ? "is-answer" : "is-selected-wrong"}"><b>${escapeHTML(statement)}</b>Bạn chọn: ${answerLabel(selected)}<strong>Đáp án: ${answerLabel(expected)}</strong></p>`;
      }).join("")}</div>${solution}</article>`;
    }
    if (question.type === "short") {
      return `<article class="practice-review ${detail.correct ? "is-correct" : "is-wrong"}"><h4><span>${escapeHTML(question.section)} · Câu ${question.number}</span>${detail.correct ? "Chính xác" : "Chưa chính xác"} · ${Number(detail.points).toFixed(2)}/${Number(detail.maximumPoints).toFixed(2)} điểm</h4>${reviewText}<div class="practice-review-options"><p class="${detail.correct ? "is-answer" : "is-selected-wrong"}"><b>✎</b>Bạn nhập: ${escapeHTML(detail.selected || "Bỏ trống")}<strong>Đáp án: ${escapeHTML(question.answerText)}</strong></p></div>${solution}</article>`;
    }
    return `<article class="practice-review ${detail.correct ? "is-correct" : "is-wrong"}"><h4><span>${escapeHTML(question.section || "")} · Câu ${question.number || index + 1}</span>${detail.correct ? "Chính xác" : "Chưa chính xác"}</h4>${reviewText}<div class="practice-review-options">${question.options.map((option, optionIndex) => {
      const classes = [optionIndex === question.answer ? "is-answer" : "", optionIndex === detail.selected && optionIndex !== question.answer ? "is-selected-wrong" : ""].filter(Boolean).join(" ");
      return `<p class="${classes}"><b>${String.fromCharCode(65 + optionIndex)}</b>${question.options.every((item) => /^[A-D]$/.test(item)) ? "" : escapeHTML(option)}${optionIndex === question.answer ? "<strong>Đáp án đúng</strong>" : optionIndex === detail.selected ? "<strong>Bạn chọn</strong>" : ""}</p>`;
    }).join("")}</div>${solution}</article>`;
  }

  renderResult(attempt) {
    this.stopTimer();
    const selectedExam = this.examById(attempt?.examId);
    if (!selectedExam || !attempt?.result) return this.renderDashboard();
    const result = attempt.result;
    const questions = this.questionsForAttempt(selectedExam, attempt);
    const detailById = new Map(result.details.map((item) => [item.questionId, item]));
    const sourcePages = selectedExam.pageImages?.length ? `<details class="practice-solutions"><summary>Đề thi gốc (${selectedExam.pageImages.length} trang)</summary>${renderPageGallery(selectedExam.pageImages, `Đề ${selectedExam.subject}`, "practice-paper-pages")}</details>` : "";
    const answers = selectedExam.answerImages?.length ? `<details class="practice-solutions" open><summary>Đáp án trong tài liệu nguồn (${selectedExam.answerImages.length} trang)</summary>${renderPageGallery(selectedExam.answerImages, `Đáp án ${selectedExam.subject}`, "practice-solution-pages")}</details>` : "";
    const answerSource = selectedExam.answerSource ? `<p class="practice-answer-source">Đáp án được đối chiếu với <a href="${escapeHTML(selectedExam.answerSource)}" target="_blank" rel="noopener">trang đáp án</a>.</p>` : "";
    const solutions = selectedExam.solutionImages?.length ? `<details class="practice-solutions"><summary>Ảnh lời giải gốc để đối chiếu (${selectedExam.solutionImages.length} trang)</summary>${renderPageGallery(selectedExam.solutionImages, `Lời giải ${selectedExam.subject}`, "practice-solution-pages")}</details>` : (!answers && !answerSource ? `<p class="practice-no-solution">Tài liệu nguồn chưa có lời giải chi tiết. Bạn chỉ xem được đáp án dùng để chấm bài.</p>` : "");
    const solvedQuestions = questions.map((question, index) => ({ question, index })).filter(({ question }) => question.explanation);
    const solutionPicker = solvedQuestions.length ? `<label class="practice-solution-picker"><span>Chọn câu cần xem lời giải</span><select data-solution-jump><option value="">Chọn một câu…</option>${solvedQuestions.map(({ question, index }) => `<option value="practice-solution-${index + 1}">${escapeHTML(question.section)} · Câu ${question.number}</option>`).join("")}</select></label>` : "";
    this.root.innerHTML = `
      <div class="practice-result">
        <header class="practice-result-hero ${scoreTone(result.score)}">
          <div><p class="eyebrow">Kết quả · ${escapeHTML(selectedExam.subject)}</p><h3>${result.score.toFixed(2)}<span>/10</span></h3><p>${attempt.autoSubmitted ? "Đã tự động nộp bài vì hết giờ." : "Bài của bạn đã được chấm và lưu trên thiết bị."}</p></div>
          <dl><div><dt>Câu đạt trọn điểm</dt><dd>${result.correctCount}/${result.totalQuestions}</dd></div><div><dt>Đã trả lời</dt><dd>${result.answeredCount}</dd></div><div><dt>Bỏ trống</dt><dd>${result.unansweredCount}</dd></div></dl>
        </header>
        <div class="practice-result-actions"><button class="button button-primary" type="button" data-retry-exam="${escapeHTML(selectedExam.id)}">Làm lại đề</button><button class="button button-secondary" type="button" data-back-practice>Về danh sách môn</button></div>
        ${solutionPicker}${solutions}${answers}${answerSource}${sourcePages}
        <div class="practice-review-heading"><div><p class="eyebrow">Xem lại bài làm</p><h3>Đáp án và điểm từng câu</h3></div><span>Đỏ: trả lời sai · Xanh: trả lời đúng</span></div>
        <div class="practice-review-list">${questions.map((question, index) => this.renderReview(question, index, detailById.get(question.id))).join("")}</div>
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
