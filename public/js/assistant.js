import { answerAdmissionsQuestion, createAssistantKnowledge } from "./core/localAdmissionsAssistant.js?v=20260929-2";
import { createDataReport } from "./core/dataReport.js";
import { turnstileGate } from "./turnstile.js";

const KNOWLEDGE_PATH = "data/assistant-knowledge.json";
const REPORT_FIELDS = ["Hồ sơ trường", "Tên ngành", "Mã ngành", "Tổ hợp", "Phương thức", "Điểm chuẩn", "Công thức", "Liên kết nguồn", "Khác"];

function apiUrl(path) {
  const url = new URL(path, document.baseURI);
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && /^55\d\d$/.test(url.port)) url.port = "3000";
  return url;
}

export async function requestAssistantAnswer(input, { fetchImpl = globalThis.fetch.bind(globalThis), timeoutMs = 45_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(apiUrl("/api/assistant-chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success || !payload?.data?.answer) {
      throw new Error(payload?.error?.message || "Trợ lý AI tạm thời chưa phản hồi. Bạn hãy thử lại sau.");
    }
    return payload.data;
  } finally {
    clearTimeout(timer);
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function reportContextLabel(context) {
  return [context.university, context.major, context.code].filter(Boolean).join(" · ") || "Báo thông tin chung";
}

export class AdmissionsAssistant {
  constructor({ repository } = {}) {
    this.repository = repository;
    this.knowledge = null;
    this.knowledgePromise = null;
    this.reportContext = {};
    this.contexts = new Map();
    this.contextSequence = 0;
    this.history = [];
    this.busy = false;
  }

  init() {
    this.root = document.querySelector("#admissions-assistant");
    if (!this.root) return;
    this.launcher = this.root.querySelector("[data-assistant-open]");
    this.panel = this.root.querySelector("#assistant-panel");
    this.messages = this.root.querySelector("#assistant-messages");
    this.chatView = this.root.querySelector("[data-assistant-chat]");
    this.reportView = this.root.querySelector("[data-assistant-report]");
    this.form = this.root.querySelector("#assistant-form");
    this.input = this.root.querySelector("#assistant-input");
    this.reportForm = this.root.querySelector("#assistant-report-form");
    this.reportStatus = this.root.querySelector("#assistant-report-status");
    this.reportContextLabel = this.root.querySelector("#assistant-report-context");
    this.schoolList = this.root.querySelector("#assistant-school-list");

    this.launcher.addEventListener("click", () => this.toggle());
    this.root.querySelector("[data-assistant-close]").addEventListener("click", () => this.close());
    this.root.querySelector("[data-assistant-report-open]").addEventListener("click", () => this.openReport());
    this.root.querySelector("[data-assistant-report-back]").addEventListener("click", () => this.showChat());
    this.form.addEventListener("submit", (event) => { event.preventDefault(); this.ask(this.input.value); });
    this.input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      this.ask(this.input.value);
    });
    this.reportForm.addEventListener("submit", (event) => { event.preventDefault(); this.submitReport(); });
    this.root.addEventListener("click", (event) => this.handleClick(event));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.panel.hidden) this.close();
    });
  }

  async loadKnowledge() {
    if (this.knowledge) return this.knowledge;
    if (!this.knowledgePromise) {
      this.knowledgePromise = fetch(new URL(KNOWLEDGE_PATH, document.baseURI), { cache: "force-cache" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Không tải được dữ liệu tư vấn. Bạn hãy thử lại.");
          return createAssistantKnowledge(await response.json());
        })
        .then((knowledge) => {
          this.knowledge = knowledge;
          this.populateSchoolList();
          return knowledge;
        })
        .catch((error) => {
          this.knowledgePromise = null;
          throw error;
        });
    }
    return this.knowledgePromise;
  }

  toggle() {
    this.panel.hidden ? this.open() : this.close();
  }

  open() {
    this.panel.hidden = false;
    this.launcher.setAttribute("aria-expanded", "true");
    this.launcher.querySelector(".assistant-launcher-label").textContent = "Đóng trợ lý";
    this.input.focus();
    this.loadKnowledge().catch(() => {});
  }

  close() {
    this.panel.hidden = true;
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.querySelector(".assistant-launcher-label").textContent = "Hỏi trợ lý";
    this.launcher.focus();
  }

  handleClick(event) {
    if (event.target.closest(".assistant-card-link")) return this.close();
    const suggestion = event.target.closest("[data-assistant-suggestion]");
    if (suggestion) return this.ask(suggestion.dataset.assistantSuggestion);
    const report = event.target.closest("[data-assistant-report-context]");
    if (report) return this.openReport(this.contexts.get(report.dataset.assistantReportContext));
  }

  addMessage(kind, text, { cards = [], suggestions = [] } = {}) {
    const message = element("article", `assistant-message assistant-message-${kind}`);
    const body = element("div", "assistant-message-body");
    body.append(element("p", "", text));
    message.append(body);
    if (cards.length) {
      const results = element("div", "assistant-result-list");
      cards.forEach((card) => results.append(this.renderCard(card)));
      message.append(results);
    }
    if (suggestions.length) {
      const actions = element("div", "assistant-suggestions");
      suggestions.slice(0, 3).forEach((label) => {
        const button = element("button", "assistant-chip", label);
        button.type = "button";
        button.dataset.assistantSuggestion = label;
        actions.append(button);
      });
      message.append(actions);
    }
    this.messages.append(message);
    this.messages.scrollTop = this.messages.scrollHeight;
    return message;
  }

  renderCard(card) {
    const article = element("article", "assistant-result-card");
    const heading = element("h3", "", card.title);
    const subtitle = element("p", "assistant-result-subtitle", card.subtitle);
    article.append(heading, subtitle);
    if (card.description) article.append(element("p", "assistant-result-description", card.description));
    if (card.lines?.length) {
      const list = element("ul", "assistant-result-lines");
      card.lines.forEach((line) => list.append(element("li", "", line)));
      article.append(list);
    }
    const actions = element("div", "assistant-result-actions");
    const link = element("a", "assistant-card-link", "Mở hồ sơ");
    link.href = card.type === "program"
      ? `#nganh/${encodeURIComponent(card.universityId)}/${encodeURIComponent(card.majorId)}`
      : `#truong/${encodeURIComponent(card.universityId)}`;
    const report = element("button", "assistant-card-report", "Báo thông tin sai");
    report.type = "button";
    const contextId = `context-${++this.contextSequence}`;
    this.contexts.set(contextId, card.reportContext || {});
    report.dataset.assistantReportContext = contextId;
    actions.append(link, report);
    article.append(actions);
    return article;
  }

  async ask(value) {
    const question = String(value || "").trim();
    if (!question || this.busy) return;
    this.input.value = "";
    this.addMessage("user", question);
    this.setBusy(true);
    const pending = this.addMessage("assistant", "Đang tìm thông tin và chuẩn bị câu trả lời…");
    try {
      const knowledge = await this.loadKnowledge();
      const answer = answerAdmissionsQuestion(knowledge, question);
      if (answer.action === "report") {
        pending.remove();
        this.addMessage("assistant", answer.text, answer);
        this.history.push({ role: "user", content: question }, { role: "assistant", content: answer.text });
        this.history = this.history.slice(-6);
        this.openReport();
        return;
      }
      let responseText = answer.text;
      try {
        const remote = await requestAssistantAnswer({
          question,
          history: this.history,
          context: { localSummary: answer.text, cards: answer.cards || [] }
        });
        responseText = remote.answer;
      } catch {
        responseText = `${answer.text}\n\nTrợ lý AI tạm thời chưa phản hồi. Câu trả lời này dùng dữ liệu tra cứu trên website.`;
      }
      pending.remove();
      this.addMessage("assistant", responseText, answer);
      this.history.push({ role: "user", content: question }, { role: "assistant", content: responseText });
      this.history = this.history.slice(-6);
    } catch (error) {
      pending.remove();
      this.addMessage("assistant", error.message || "Chưa đọc được dữ liệu. Bạn hãy thử lại.", {
        suggestions: ["Tìm trường, ngành", "Báo thông tin sai"]
      });
    } finally {
      this.setBusy(false);
      this.input.focus();
    }
  }

  setBusy(busy) {
    this.busy = busy;
    this.input.disabled = busy;
    this.form.querySelector("button").disabled = busy;
  }

  async openReport(context = {}) {
    this.reportContext = { ...context };
    this.chatView.hidden = true;
    this.reportView.hidden = false;
    this.reportStatus.textContent = "";
    const submit = this.reportForm.querySelector("[data-assistant-report-submit]");
    submit.disabled = false;
    submit.textContent = "Gửi báo cáo";
    this.reportContextLabel.textContent = reportContextLabel(this.reportContext);
    const schoolInput = this.reportForm.elements.school;
    schoolInput.value = this.reportContext.university || "";
    await this.loadKnowledge().catch(() => {});
    this.reportForm.elements.field.focus();
  }

  showChat() {
    this.reportView.hidden = true;
    this.chatView.hidden = false;
    this.input.focus();
  }

  populateSchoolList() {
    if (!this.knowledge || this.schoolList.children.length) return;
    const fragment = document.createDocumentFragment();
    this.knowledge.schools.forEach((school) => {
      const option = document.createElement("option");
      option.value = school.name;
      option.label = [school.code, school.shortName].filter(Boolean).join(" · ");
      fragment.append(option);
    });
    this.schoolList.append(fragment);
  }

  resolvedReportContext() {
    const schoolName = String(this.reportForm.elements.school.value || "").trim();
    const known = this.knowledge?.schools.find((item) => item.name === schoolName || item.code.toLocaleUpperCase("vi") === schoolName.toLocaleUpperCase("vi"));
    return {
      ...this.reportContext,
      universityId: this.reportContext.universityId || known?.id || "",
      university: this.reportContext.university || known?.name || schoolName,
      year: this.reportContext.year || this.knowledge?.year || 2026
    };
  }

  async submitReport() {
    const button = this.reportForm.querySelector("[data-assistant-report-submit]");
    if (button.disabled) return;
    try {
      const context = this.resolvedReportContext();
      if (!context.university) throw new Error("Bạn hãy chọn hoặc nhập tên trường có thông tin cần sửa.");
      const report = createDataReport(context, {
        field: this.reportForm.elements.field.value,
        description: this.reportForm.elements.description.value,
        proposedValue: this.reportForm.elements.proposedValue.value,
        evidenceUrl: this.reportForm.elements.evidenceUrl.value
      });
      button.disabled = true;
      button.textContent = "Đang xác minh…";
      this.reportStatus.textContent = "Bạn cần hoàn tất xác minh để gửi báo cáo. Báo cáo hiện chưa được gửi.";
      const turnstileToken = await turnstileGate.getToken("data_report");
      button.textContent = "Đang gửi…";
      const result = await this.repository.submitDataReport(report, { turnstileToken });
      const shortId = String(result.id || "").slice(0, 8);
      this.reportStatus.textContent = `Đã gửi báo cáo và đang chờ duyệt${shortId ? ` · Mã ${shortId}` : ""}.`;
      button.textContent = "Đã gửi";
      this.addMessage("assistant", "Đã nhận báo cáo của bạn và chuyển vào hàng chờ để quản trị viên đối chiếu.");
    } catch (error) {
      this.reportStatus.textContent = error.message || "Chưa gửi được báo cáo. Bạn hãy thử lại.";
      button.disabled = false;
      button.textContent = "Gửi báo cáo";
    }
  }
}

export function assistantReportFields() { return [...REPORT_FIELDS]; }
