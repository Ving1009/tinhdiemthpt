import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { answerAdmissionsQuestion, createAssistantKnowledge, searchAssistantKnowledge } from "../public/js/core/localAdmissionsAssistant.js";

const raw = JSON.parse(await readFile(new URL("../public/data/assistant-knowledge.json", import.meta.url), "utf8"));
const knowledge = createAssistantKnowledge(raw);

test("kho trợ lý chứa đầy đủ trường và danh mục ngành rút gọn", () => {
  assert.ok(knowledge.schools.length > 300);
  assert.ok(knowledge.programs.length > 6000);
  assert.equal(knowledge.year, 2026);
});

test("trợ lý tìm được trường, tên ngành có dấu và không dấu mà không gọi AI ngoài", () => {
  const schools = searchAssistantKnowledge(knowledge, "BKA", 5);
  assert.match(JSON.stringify(schools.schools), /BKA/i);
  const accented = searchAssistantKnowledge(knowledge, "Công nghệ thông tin", 10);
  const plain = searchAssistantKnowledge(knowledge, "cong nghe thong tin", 10);
  assert.match(JSON.stringify(accented.programs), /Công nghệ thông tin/i);
  assert.match(JSON.stringify(plain.programs), /Công nghệ thông tin/i);
});

test("tư vấn theo điểm chỉ lấy mốc THPT công khai trên thang 30", () => {
  const answer = answerAdmissionsQuestion(knowledge, "25 điểm THPT nên xem ngành nào?");
  assert.ok(answer.cards.length > 0);
  assert.match(answer.text, /chỉ là đối chiếu|chưa phải dự đoán/i);
  for (const card of answer.cards) assert.equal(card.type, "program");
});

test("trợ lý giải thích tổ hợp từ kho website", () => {
  const answer = answerAdmissionsQuestion(knowledge, "Tổ hợp A00 gồm môn gì?");
  assert.match(answer.text, /A00/);
  assert.match(answer.text, /Toán/i);
});

test("trợ lý tìm ngành có dùng một tổ hợp cụ thể", () => {
  const answer = answerAdmissionsQuestion(knowledge, "Tìm ngành xét tuyển bằng A00");
  assert.ok(answer.cards.length > 0);
  assert.match(answer.text, /tổ hợp A00/i);
});

test("ý định báo sai luôn mở biểu mẫu, không tự gửi nội dung trò chuyện", () => {
  const answer = answerAdmissionsQuestion(knowledge, "Tôi muốn báo sai thông tin điểm chuẩn");
  assert.equal(answer.action, "report");
  assert.match(answer.text, /biểu mẫu|Turnstile/i);
});
