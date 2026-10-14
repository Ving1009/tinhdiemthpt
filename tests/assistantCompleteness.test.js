import assert from "node:assert/strict";
import test from "node:test";
import { cleanAssistantAnswer, createGroqAssistantService } from "../server/services/groqAssistant.js";
import { createOpenAiCompatibleAssistantService } from "../server/services/openAiCompatibleAssistant.js";
import { createCloudflareWorkersAssistantService } from "../server/services/cloudflareWorkersAssistant.js";
import { createConfiguredAdmissionsAssistant } from "../server/configuredAssistant.js";

test("câu trả lời bị cắt được ghi rõ, nội dung rỗng không biến thành lời tư vấn", () => {
  assert.match(cleanAssistantAnswer("Tuần 1: ôn tập.", 4_000, "length"), /viết tiếp/);
  assert.match(cleanAssistantAnswer("abcdef", 3, "stop"), /^abc[\s\S]*viết tiếp/);
  assert.equal(cleanAssistantAnswer("", 4_000, "length"), "");
  assert.equal(cleanAssistantAnswer("Kế hoạch đầy đủ.", 4_000, "stop"), "Kế hoạch đầy đủ.");
});

test("endpoint chung giữ câu trả lời có căn cứ cho ưu tiên, học phí thiếu nguồn và kế hoạch, dù gọi API trực tiếp", async () => {
  let calls = 0;
  const ask = createConfiguredAdmissionsAssistant({ GROQ_API_KEY: "test-key" }, { fetchImpl: async () => { calls += 1; throw new Error("Không được dùng provider để thay dữ kiện đã xác định"); } });
  for (const [question, expected] of [
    ["26 điểm, KV1 được cộng bao nhiêu?", /0\.40[\s\S]*26\.40/],
    ["Học phí BKA năm 2027 chính xác bao nhiêu?", /chưa.*xác nhận|chưa đủ.*xác minh/i],
    ["Lập kế hoạch ôn Toán trong 8 tuần, mỗi ngày 2 giờ", /8 tuần[\s\S]*120 phút/],
    ["Lập kế hoạch ôn Toán trong 8 tuần, 2 giờ mỗi ngày", /8 tuần[\s\S]*120 phút/]
  ]) {
    const result = await ask({ question });
    assert.equal(result.provider, "website");
    assert.match(result.answer, expected);
    assert.doesNotMatch(result.answer, /Số phức|tháng 6.*tháng 7|20.?25 triệu/i);
  }
  assert.equal(calls, 0);
});

test("Groq, compatible và Cloudflare giữ dấu hiệu giới hạn khi nhận câu trả lời chưa hoàn tất", async () => {
  const choice = { choices: [{ message: { content: "Tuần 1: ôn tập." }, finish_reason: "length" }] };
  for (const create of [
    fetchImpl => createGroqAssistantService({ apiKey: "test-key", fetchImpl }),
    fetchImpl => createOpenAiCompatibleAssistantService({ apiKey: "test-key", endpoint: "https://example.test/chat", model: "test-model", provider: "test", fetchImpl }),
    fetchImpl => createCloudflareWorkersAssistantService({ apiToken: "test-key", accountId: "a".repeat(32), fetchImpl })
  ]) {
    const ask = create(async () => new Response(JSON.stringify({ ...choice, success: true, result: { ...choice } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await ask({ question: "Lập kế hoạch ôn thi" });
    assert.match(result.answer, /Tuần 1[\s\S]*viết tiếp/);
  }
});
