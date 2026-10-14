import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { answerAdmissionsQuestion, createAssistantKnowledge, searchAssistantKnowledge } from "../public/js/core/localAdmissionsAssistant.js";
import { calculateAdmissionPriority } from "../public/js/utils.js";

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

test("tư vấn hiểu điểm viết tắt và lọc đúng ngành điện điện tử", () => {
  const answer = answerAdmissionsQuestion(knowledge, "25đ thpt nên chọn ngành điện điện tử ở trường nào");
  assert.ok(answer.cards.length > 0);
  assert.ok(answer.cards.every((card) => /điện/i.test(card.title)));
  assert.ok(answer.cards.every((card) => !/thương mại điện tử/i.test(card.title)));
  assert.ok(answer.cards.some((card) => /kỹ thuật|công nghệ kỹ thuật|cơ điện tử/i.test(card.title)));
  assert.ok(answer.cards.every((card) => card.lines.some((line) => /THPT|xét tuyển/i.test(line) && /\/30/.test(line))));
  assert.match(answer.text, /không cao hơn 25/i);
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

test("trợ lý tư vấn phương thức, chọn ngành, ôn tập và nguyện vọng trước khi tìm thẻ", () => {
  for (const [question, expected] of [
    ["THPT, học bạ, ĐGNL và V-SAT khác nhau thế nào?", /Học bạ dùng kết quả học tập.*Đánh giá năng lực.*V-SAT/s],
    ["Em thích Toán và Lý nên chọn ngành nào phù hợp?", /thế mạnh.*Bạn thích và học tốt/s],
    ["So sánh ngành công nghệ thông tin với kỹ thuật điện điện tử", /lập trình.*mạch, thiết bị/s],
    ["Em mất gốc Toán, giúp em lập kế hoạch ôn thi", /nguyên nhân sai.*còn khoảng bao lâu/s],
    ["Cách sắp xếp nguyện vọng để không bỏ lỡ ngành yêu thích?", /thực sự muốn học lên trước.*hệ thống tuyển sinh chính thức/s],
    ["Ngân sách 30 triệu mỗi năm thì chọn trường nào?", /học phí.*sinh hoạt|học phí.*tiền ở/s]
  ]) {
    const answer = answerAdmissionsQuestion(knowledge, question);
    assert.equal(answer.intent, "guidance", question);
    assert.equal(answer.cards.length, 0, question);
    assert.match(answer.text, expected, question);
    assert.notEqual(answer.action, "report", question);
  }
});

test("hướng dẫn dùng website không đòi catalog và nói đúng local OCR, đồng ý gửi ảnh", () => {
  const empty = createAssistantKnowledge({ v: 1, y: 2026, s: [], p: [], t: [] });
  const answer = answerAdmissionsQuestion(empty, "Làm sao quét ảnh học bạ mà không lộ thông tin cá nhân?");
  assert.equal(answer.intent, "guidance");
  assert.match(answer.text, /trên thiết bị trước.*sau khi bạn đồng ý.*che họ tên/s);
  assert.match(answer.text, /rồi mới xác nhận/i);
  for (const question of ["Cách dùng tính điểm THPT", "Cách dùng phòng thi thử", "Cách xuất PDF nguyện vọng"]) {
    assert.equal(answerAdmissionsQuestion(empty, question).cards.length, 0);
    assert.equal(answerAdmissionsQuestion(empty, question).intent, "guidance");
  }
});

test("câu hỏi năm dữ liệu giải thích 2027 và 2026, không trả ngành ngẫu nhiên", () => {
  const answer = answerAdmissionsQuestion(knowledge, "Website dùng dữ liệu năm nào?");
  assert.equal(answer.intent, "guidance");
  assert.equal(answer.cards.length, 0);
  assert.match(answer.text, /2027.*2026.*tham khảo/s);
});

test("sửa điểm cá nhân và nguyện vọng không mở nhầm biểu mẫu báo sai", () => {
  for (const question of ["Làm sao chỉnh sửa điểm học bạ em đã nhập?", "Em muốn chỉnh sửa nguyện vọng đã lưu", "Vì sao điểm ưu tiên của em sai?"]) {
    const answer = answerAdmissionsQuestion(knowledge, question);
    assert.equal(answer.intent, "guidance", question);
    assert.notEqual(answer.action, "report", question);
    assert.equal(answer.cards.length, 0);
  }
  assert.equal(answerAdmissionsQuestion(knowledge, "Báo thông tin sai").action, "report");
});

test("giải thích ưu tiên gọi đúng hàm đang được công cụ dùng, gồm điểm biên", () => {
  for (const [score, area, priorityGroup] of [[26, "KV1", "none"], [22.5, "KV1", "none"], [22.49, "KV1", "none"], [30, "KV1", "UT1"], [20, "KV1", "UT1"], [26, "KV2-NT", "UT2"]]) {
    const answer = answerAdmissionsQuestion(knowledge, `${score} điểm, ${area}${priorityGroup === "none" ? "" : ` và ${priorityGroup}`} được cộng bao nhiêu ưu tiên?`);
    const priority = calculateAdmissionPriority(score, { area, priorityGroup });
    assert.equal(answer.intent, "guidance");
    assert.equal(answer.localOnly, true);
    assert.ok(answer.text.includes(`sau điều chỉnh ${priority.adjusted.toFixed(2)}`), answer.text);
    assert.equal(answer.cards.length, 0);
  }
});

test("theo mạch hỏi gần nhất nhưng không kéo chủ đề cũ vào tìm trường mới", () => {
  const history = [{ role: "user", content: "Em muốn so sánh THPT và học bạ" }, { role: "assistant", content: "Nội dung trước" }];
  const followUp = answerAdmissionsQuestion(knowledge, "Còn ĐGNL thì sao?", { history });
  assert.equal(followUp.intent, "guidance");
  assert.match(followUp.text, /THPT dùng.*Học bạ dùng.*Đánh giá năng lực/s);
  const fresh = answerAdmissionsQuestion(knowledge, "Tìm trường BKA", { history });
  assert.notEqual(fresh.intent, "guidance");
  assert.ok(fresh.cards.some((card) => card.type === "school" && card.subtitle.includes("BKA")));
  assert.equal(answerAdmissionsQuestion(knowledge, "Cách ôn thi Toán", { history }).cards.length, 0);
});

test("tư vấn điện điện tử có điểm vẫn lọc đúng miền", () => {
  for (const [region, label] of [["south", "Nam"], ["north", "Bắc"]]) {
    const answer = answerAdmissionsQuestion(knowledge, `25đ THPT nên chọn ngành điện điện tử ở miền ${label}`);
    assert.ok(answer.cards.length > 0);
    assert.ok(answer.cards.every((card) => knowledge.schoolById.get(card.universityId)?.region === region));
    assert.ok(answer.cards.every((card) => /điện/i.test(card.title) && !/thương mại điện tử/i.test(card.title)));
  }
});

test("công thức trong thẻ chỉ lấy từ phương thức đã có trong dữ liệu", () => {
  const answer = answerAdmissionsQuestion(knowledge, "Công thức BKA");
  assert.ok(answer.cards.length > 0);
  const formulas = knowledge.programs.filter((program) => program.universityId === answer.cards[0].universityId)
    .flatMap((program) => program.methods.map((method) => `${method.name}: ${method.formula}`));
  assert.ok(answer.cards[0].lines.length > 0);
  assert.ok(answer.cards[0].lines.every((line) => formulas.includes(line)));
});

test("phân biệt điểm sàn, điểm chuẩn và CNTT, KHMT bằng giải thích thay vì thẻ", () => {
  const cutoff = answerAdmissionsQuestion(knowledge, "Điểm chuẩn khác điểm sàn thế nào?");
  assert.equal(cutoff.intent, "guidance");
  assert.equal(cutoff.cards.length, 0);
  assert.match(cutoff.text, /Điểm sàn.*chưa có nghĩa là trúng tuyển.*Điểm chuẩn/s);
  const comparison = answerAdmissionsQuestion(knowledge, "CNTT và KHMT khác nhau thế nào?");
  assert.equal(comparison.intent, "guidance");
  assert.match(comparison.text, /Công nghệ thông tin.*Khoa học máy tính.*thuật toán/s);
});

test("câu hỏi học phí một trường vẫn cung cấp hồ sơ để kiểm tra, không bịa số tiền", () => {
  const answer = answerAdmissionsQuestion(knowledge, "Học phí BKA năm 2027 bao nhiêu?");
  assert.notEqual(answer.intent, "guidance");
  assert.ok(answer.cards.some((card) => card.type === "school" && card.subtitle.includes("BKA")));
});

test("tư vấn ôn tập dùng môn, thời gian đã nêu và không hỏi lại hai thông tin đó", () => {
  const answer = answerAdmissionsQuestion(knowledge, "Em cần kế hoạch ôn thi Toán trong 8 tuần");
  assert.equal(answer.intent, "guidance");
  assert.match(answer.text, /môn Toán.*8 tuần/s);
  assert.doesNotMatch(answer.text, /còn (?:khoảng )?bao lâu|cải thiện môn nào/i);
});

test("các lượt hỏi miền kế tiếp giữ ngành, điểm và thay miền cũ", () => {
  const history = [{ role: "user", content: "25đ THPT nên chọn ngành điện điện tử ở miền Nam" }];
  const north = answerAdmissionsQuestion(knowledge, "Còn miền Bắc?", { history });
  assert.ok(north.cards.length > 0);
  assert.ok(north.cards.every((card) => knowledge.schoolById.get(card.universityId)?.region === "north"));
  history.push({ role: "assistant", content: north.text }, { role: "user", content: "Còn miền Bắc?" });
  const south = answerAdmissionsQuestion(knowledge, "Vậy miền Nam thì sao?", { history });
  assert.ok(south.cards.length > 0);
  assert.ok(south.cards.every((card) => /điện/i.test(card.title) && knowledge.schoolById.get(card.universityId)?.region === "south"));
  const conceptual = answerAdmissionsQuestion(knowledge, "Còn THPT và học bạ khác nhau thế nào?", { history });
  assert.equal(conceptual.intent, "guidance");
  assert.equal(conceptual.cards.length, 0);
});

test("tra công thức có tên phương thức chỉ trả công thức phương thức đó", () => {
  const answer = answerAdmissionsQuestion(knowledge, "Công thức THPT BKA là gì?");
  assert.ok(answer.cards.length > 0);
  assert.ok(answer.cards[0].lines.length > 0);
  assert.ok(answer.cards[0].lines.every((line) => line.startsWith("THPT:")));
});

test("hỏi điểm chuẩn của trường kèm năm vẫn trả đúng hồ sơ tham khảo", () => {
  for (const query of ["Điểm chuẩn BKA2027", "Điểm chuẩn BKA năm 2026 là bao nhiêu?", "Điểm chuẩn BKA 2027"]) {
    const answer = answerAdmissionsQuestion(knowledge, query);
    assert.notEqual(answer.intent, "guidance", query);
    assert.ok(answer.cards.some((card) => card.type === "school" && card.subtitle.includes("BKA")), query);
    assert.match(answer.text, /2026.*tham khảo.*2027.*đang cập nhật/s);
  }
});

test("câu hỏi mới mở đầu bằng còn không mang theo ngành và điểm của chủ đề cũ", () => {
  const history = [{ role: "user", content: "25đ THPT nên chọn ngành điện điện tử ở miền Nam" }];
  const fee = answerAdmissionsQuestion(knowledge, "Còn học phí BKA năm 2027?", { history });
  assert.notEqual(fee.intent, "guidance");
  assert.ok(fee.cards.some((card) => card.type === "school" && card.subtitle.includes("BKA")));
  const compare = answerAdmissionsQuestion(knowledge, "Còn so sánh CNTT và KHMT thì sao?", { history });
  assert.equal(compare.intent, "guidance");
  assert.match(compare.text, /Công nghệ thông tin.*Khoa học máy tính/s);
  assert.doesNotMatch(compare.text, /THPT dùng|Nhóm điện/);
});

test("hỏi ngành học như thế nào không bị hiểu thành kế hoạch ôn thi", () => {
  const answer = answerAdmissionsQuestion(knowledge, "Ngành điện điện tử BKA học như thế nào?");
  assert.equal(answer.intent, "guidance");
  assert.match(answer.text, /mạch, thiết bị.*thực hành/s);
  assert.doesNotMatch(answer.text, /bắt đầu bằng một đề|còn khoảng bao lâu|chia tuần học/);
});

test("học phí trường cụ thể giữ hồ sơ nhưng không để mô hình điền số tiền chưa kiểm chứng", () => {
  for (const question of ["Học phí BKA năm 2027 bao nhiêu?", "Học phí trường chưa có trong danh sách năm 2027 bao nhiêu?"]) {
    const answer = answerAdmissionsQuestion(knowledge, question);
    assert.equal(answer.localOnly, true);
    assert.match(answer.text, /chưa đủ để xác nhận học phí.*không có nghĩa là trường chưa công bố.*đúng năm và chương trình/s);
    assert.doesNotMatch(answer.text, /\d+\s*(triệu|đồng)/);
  }
  assert.notEqual(answerAdmissionsQuestion(knowledge, "Cách dự trù học phí").localOnly, true);
});

test("kế hoạch có môn, thời lượng và quỹ giờ bao phủ đủ thời gian, không đoán chương học", () => {
  const answer = answerAdmissionsQuestion(knowledge, "Lập kế hoạch ôn thi Toán trong 8 tuần, 2 giờ mỗi ngày");
  assert.equal(answer.localOnly, true);
  assert.match(answer.text, /Tuần 1 đến 2.*Tuần 3 đến 6.*Tuần 7 đến 8/s);
  assert.match(answer.text, /2 giờ mỗi ngày \(120 phút\).*30 phút.*60 phút.*30 phút/s);
  assert.match(answer.text, /sách giáo khoa.*không phải.*chính thức 2027/s);
  assert.doesNotMatch(answer.text, /lượng giác|số phức|hình trụ|chương [IVX0-9]+/i);
  for (const duration of [1, 2, 3]) {
    const short = answerAdmissionsQuestion(knowledge, `Kế hoạch ôn tập Toán ${duration} ngày`);
    assert.equal(short.localOnly, true);
    assert.doesNotMatch(short.text, /Ngày 0/);
    assert.match(short.text, new RegExp(`Ngày (?:1 đến )?${duration}(?:\\D|$)`));
  }
  assert.notEqual(answerAdmissionsQuestion(knowledge, "Em muốn lập kế hoạch ôn thi Toán").localOnly, true);
});
