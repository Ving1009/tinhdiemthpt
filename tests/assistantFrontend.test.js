import assert from "node:assert/strict";
import test from "node:test";
import { AdmissionsAssistant, requestAssistantAnswer, requestAssistantKnowledge } from "../public/js/assistant.js";

test("trợ lý hủy request quá hạn để giao diện dùng tra cứu nội bộ", async () => {
  const originalDocument = globalThis.document;
  globalThis.document = { baseURI: "https://tinhdiemthpt.id.vn/" };
  let aborted = false;
  try {
    await assert.rejects(() => requestAssistantAnswer({ question: "25đ chọn ngành điện điện tử" }, {
      timeoutMs: 10,
      fetchImpl: async (_url, { signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
      })
    }), { name: "AbortError" });
    assert.equal(aborted, true);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test("giới hạn chờ bao gồm JSON phản hồi AI và kho dữ liệu, kể cả fetch không tuân AbortSignal", async () => {
  const originalDocument = globalThis.document;
  globalThis.document = { baseURI: "https://tinhdiemthpt.id.vn/" };
  try {
    for (const task of [
      () => requestAssistantAnswer({ question: "Giúp tôi chọn ngành" }, { timeoutMs: 10, fetchImpl: async () => new Promise(() => {}) }),
      () => requestAssistantAnswer({ question: "Giúp tôi chọn ngành" }, { timeoutMs: 10, fetchImpl: async () => ({ ok: true, json: async () => new Promise(() => {}) }) }),
      () => requestAssistantKnowledge({ timeoutMs: 10, fetchImpl: async () => ({ ok: true, json: async () => new Promise(() => {}) }) })
    ]) await assert.rejects(task, { name: "AbortError" });
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

function chatHarness(options = {}) {
  const chat = new AdmissionsAssistant(options);
  const messages = [];
  chat.input = { value: "", focus() {} };
  chat.setBusy = value => { chat.busy = value; };
  chat.populateSchoolList = () => {};
  chat.addMessage = (kind, text, detail) => {
    const message = { kind, text, detail, removed: false, remove() { this.removed = true; } };
    messages.push(message);
    return message;
  };
  return { chat, messages, lastAnswer: () => messages.filter(item => item.kind === "assistant" && !item.removed).at(-1) };
}

test("tư vấn chung gọi AI ngay mà không chờ kho hồ sơ trường", async () => {
  let knowledgeCalls = 0;
  let input;
  const { chat, lastAnswer } = chatHarness({
    requestKnowledge: async () => { knowledgeCalls += 1; throw new Error("Không được chờ kho dữ liệu cho câu hỏi chung"); },
    requestAnswer: async value => { input = value; return { answer: "Điểm sàn là điều kiện nhận hồ sơ; điểm chuẩn là mốc trúng tuyển." }; }
  });
  await chat.ask("Điểm chuẩn khác điểm sàn thế nào?");
  assert.equal(knowledgeCalls, 0);
  assert.equal(input.context.cards.length, 0);
  assert.doesNotMatch(input.context.localSummary, /Chưa tìm thấy/);
  assert.match(lastAnswer().text, /Điểm sàn/);
  assert.equal(chat.busy, false);
});

test("kho hồ sơ lỗi vẫn hỏi được AI, không coi lỗi tải là trường thiếu thông tin", async () => {
  let input;
  const { chat, lastAnswer } = chatHarness({
    requestKnowledge: async () => { throw new Error("Network error"); },
    requestAnswer: async value => { input = value; return { answer: "Tôi chưa xác nhận được danh sách ngành của trường. Bạn có thể đối chiếu thông báo chính thức." }; }
  });
  await chat.ask("BKA có những ngành nào?");
  assert.match(input.context.localSummary, /Hồ sơ trường chưa tải được/);
  assert.equal(input.context.cards.length, 0);
  assert.match(lastAnswer().text, /chưa xác nhận/);
  assert.equal(chat.busy, false);
});

test("AI lỗi vẫn có hướng dẫn có ích và giữ lịch sử hỏi tiếp", async () => {
  const received = [];
  const { chat, lastAnswer } = chatHarness({
    requestKnowledge: async () => { throw new Error("Catalog offline"); },
    requestAnswer: async value => { received.push(structuredClone(value)); throw new Error("Provider offline"); }
  });
  await chat.ask("Em mất gốc Toán, nên bắt đầu ôn thi thế nào?");
  assert.match(lastAnswer().text, /tuần/i);
  assert.match(lastAnswer().text, /Chưa kết nối được AI/);
  assert.doesNotMatch(lastAnswer().text, /Chưa tìm thấy/);
  await chat.ask("Mỗi ngày tôi có 2 giờ thì sao?");
  assert.equal(received[1].history[0].content, "Em mất gốc Toán, nên bắt đầu ôn thi thế nào?");
  assert.equal(received[1].history[0].role, "user");
  assert.equal(chat.history.length, 4);
  assert.equal(chat.busy, false);
});

test("sửa dữ liệu đã nhập không mở báo sai, yêu cầu báo sai vẫn giữ biểu mẫu", async () => {
  let reports = 0;
  let remoteCalls = 0;
  const { chat } = chatHarness({
    requestKnowledge: async () => { throw new Error("Catalog offline"); },
    requestAnswer: async () => { remoteCalls += 1; return { answer: "Bạn có thể sửa trực tiếp ở bảng điểm." }; }
  });
  chat.openReport = () => { reports += 1; };
  await chat.ask("Làm sao chỉnh sửa điểm học bạ em đã nhập?");
  assert.equal(reports, 0);
  assert.equal(remoteCalls, 1);
  await chat.ask("Tôi muốn báo sai thông tin điểm chuẩn");
  assert.equal(reports, 1);
  assert.equal(remoteCalls, 1);
});

test("giữ kết quả ưu tiên đã tính và thông tin học phí chưa xác minh, không để AI viết lại thành dữ kiện khác", async () => {
  let remoteCalls = 0;
  const { chat, lastAnswer } = chatHarness({
    requestKnowledge: async () => { throw new Error("Catalog offline"); },
    requestAnswer: async () => { remoteCalls += 1; return { answer: "Không được dùng câu trả lời này." }; }
  });
  await chat.ask("26 điểm, KV1 được cộng bao nhiêu?");
  assert.match(lastAnswer().text, /0\.40/);
  assert.match(lastAnswer().text, /26\.40/);
  await chat.ask("Học phí BKA năm 2027 chính xác bao nhiêu?");
  assert.match(lastAnswer().text, /chưa.*xác nhận|chưa đủ.*xác minh/i);
  assert.doesNotMatch(lastAnswer().text, /20.?25 triệu|tháng [0-9]/i);
  assert.equal(remoteCalls, 0);
});
