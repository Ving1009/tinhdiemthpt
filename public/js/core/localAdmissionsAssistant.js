import { calculateAdmissionPriority, rounded } from "../utils.js";

const STOP_WORDS = new Set([
  "ai", "ban", "cho", "co", "cua", "dai", "duoc", "gi", "hay", "ho", "la", "minh", "mot", "muon", "nao", "nam",
  "nganh", "o", "tim", "toi", "truong", "van", "ve", "xem", "xin", "xet", "tuyen", "sinh"
]);
const PUBLIC_SCORE_STATUSES = new Set(["verified", "reference"]);
const REGION_LABELS = { north: "Miền Bắc", central: "Miền Trung", south: "Miền Nam" };

export function normalizeAssistantText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return normalizeAssistantText(value).split(/\s+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function schoolFromTuple(item) {
  return {
    id: item[0], code: item[1], name: item[2], shortName: item[3], region: item[4],
    description: item[5], admissionsStatus: item[6], admissionsNote: item[7]
  };
}

function methodFromTuple(item) {
  return {
    name: item[0], combination: item[1], year: item[2], score: item[3], scale: item[4],
    status: item[5], formula: item[6]
  };
}

function programFromTuple(item) {
  return { id: item[0], universityId: item[1], code: item[2], name: item[3], methods: item[4].map(methodFromTuple) };
}

export function createAssistantKnowledge(raw) {
  if (!raw || Number(raw.v) !== 1 || !Array.isArray(raw.s) || !Array.isArray(raw.p)) {
    throw new Error("Dữ liệu của trợ lý không đúng định dạng. Bạn hãy tải lại trang.");
  }
  const schools = raw.s.map(schoolFromTuple);
  const schoolById = new Map(schools.map((item) => [item.id, item]));
  const programs = raw.p.map(programFromTuple).filter((item) => schoolById.has(item.universityId));
  const indexedSchools = schools.map((item) => ({
    item,
    code: normalizeAssistantText(item.code),
    text: normalizeAssistantText(`${item.name} ${item.shortName} ${item.code} ${REGION_LABELS[item.region] || ""}`)
  }));
  const indexedPrograms = programs.map((item) => ({
    item,
    code: normalizeAssistantText(item.code),
    nameText: normalizeAssistantText(item.name),
    text: normalizeAssistantText(`${item.name} ${item.code} ${schoolById.get(item.universityId)?.name || ""} ${REGION_LABELS[schoolById.get(item.universityId)?.region] || ""}`)
  }));
  return {
    year: Number(raw.y) || 2026,
    checkedAt: raw.c || null,
    schools,
    schoolById,
    programs,
    indexedSchools,
    indexedPrograms,
    combinations: new Map((raw.t || []).map((item) => [String(item[0]).toLocaleUpperCase("vi"), item[1]]))
  };
}

function matchRank(entry, query, queryTokens) {
  if (!query) return null;
  if (entry.code && entry.code === query) return 0;
  if (entry.code && entry.code.startsWith(query)) return 1;
  if (entry.text === query) return 2;
  if (entry.text.includes(query)) return 3;
  if (!queryTokens.length) return null;
  const matched = queryTokens.filter((word) => entry.text.includes(word)).length;
  if (!matched) return null;
  if (matched === queryTokens.length) return 4 + Math.max(0, queryTokens.length - matched);
  return matched / queryTokens.length >= 0.6 ? 10 - matched : null;
}

function distinctPrograms(items, limit) {
  const seen = new Set();
  return items.filter(({ item }) => {
    const key = `${item.universityId}|${item.code}|${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function searchAssistantKnowledge(knowledge, input, limit = 6) {
  const query = normalizeAssistantText(input);
  const queryTokens = tokens(input);
  const subjectPhrase = queryTokens.join(" ");
  const schools = knowledge.indexedSchools
    .map((entry) => ({ ...entry, rank: matchRank(entry, query, queryTokens) }))
    .filter((entry) => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name, "vi"));
  const programs = distinctPrograms(knowledge.indexedPrograms
    .map((entry) => {
      let rank = matchRank(entry, query, queryTokens);
      if (subjectPhrase && entry.nameText === subjectPhrase) rank = Math.min(rank ?? Infinity, 1);
      else if (subjectPhrase && entry.nameText.startsWith(subjectPhrase)) rank = Math.min(rank ?? Infinity, 2);
      else if (subjectPhrase && entry.nameText.includes(subjectPhrase)) rank = Math.min(rank ?? Infinity, 3);
      else if (queryTokens.length && queryTokens.every((word) => entry.nameText.includes(word))) rank = Math.min(rank ?? Infinity, 4);
      return { ...entry, rank: Number.isFinite(rank) ? rank : null };
    })
    .filter((entry) => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name, "vi")), limit);
  return { schools: schools.slice(0, limit), programs };
}

function formatScore(method) {
  if (!Number.isFinite(method.score) || !PUBLIC_SCORE_STATUSES.has(method.status)) return "chưa công bố điểm";
  return `${method.score}/${method.scale || 30}`;
}

function uniqueMethodSummary(program, maximum = 3) {
  const seen = new Set();
  return program.methods.filter((method) => {
    const key = `${method.name}|${method.combination}|${method.score}|${method.scale}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maximum).map((method) => {
    const parts = [method.name || "Phương thức đang cập nhật"];
    if (method.combination) parts.push(method.combination);
    if (Number.isFinite(method.score) && PUBLIC_SCORE_STATUSES.has(method.status)) parts.push(`${method.score}/${method.scale || 30}`);
    return parts.join(" · ");
  });
}

function schoolCard(school) {
  return {
    type: "school",
    universityId: school.id,
    title: school.name,
    subtitle: [school.code, school.shortName, REGION_LABELS[school.region]].filter(Boolean).join(" · "),
    description: school.admissionsNote || school.description || "Mở hồ sơ để xem thông tin tuyển sinh.",
    reportContext: { universityId: school.id, university: school.name, year: 2026 }
  };
}

function programCard(knowledge, program) {
  const school = knowledge.schoolById.get(program.universityId);
  return {
    type: "program",
    universityId: program.universityId,
    majorId: program.id,
    title: program.name,
    subtitle: `${program.code || "Chưa có mã"} · ${school?.name || "Trường đang cập nhật"}`,
    lines: uniqueMethodSummary(program),
    reportContext: {
      universityId: school?.id || program.universityId,
      university: school?.name || "",
      majorId: program.id,
      major: program.name,
      code: program.code,
      method: program.methods[0]?.name || "",
      year: program.methods.find((item) => item.year)?.year || knowledge.year
    }
  };
}

function extractScore(query) {
  const values = [...String(query).matchAll(/(?:^|\s)(\d{1,2}(?:[.,]\d{1,2})?)(?=\s*(?:điểm|diem|đ|d)?(?:\s|$))/giu)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => value >= 0 && value <= 30);
  return values[0] ?? null;
}

function scoreAdviceTokens(query) {
  const ignored = new Set([
    "chon", "diem", "goi", "hoc", "khoang", "muc", "nen", "phu", "hop", "tam", "thi", "thpt", "voi", "xem", "y", "mien", "bac", "trung", "nam", "con", "vay", "the", "sao"
  ]);
  return [...new Set(tokens(query).filter((word) => !/^\d+(?:[.,]\d+)?d?$/.test(word) && !ignored.has(word)))];
}

function asksElectricalElectronics(query) {
  const normalized = normalizeAssistantText(query);
  if (/\bthuong mai dien tu\b/.test(normalized)) return false;
  return /\bdien\s+(?:va\s+)?dien\s+tu\b|\bnganh\s+dien\s+tu\b/.test(normalized);
}

function matchesAdviceTopic(programName, wantedTokens, electricalElectronics) {
  const name = normalizeAssistantText(programName);
  if (electricalElectronics) {
    if (/\b(?:thuong mai|kinh doanh)\s+dien\s+tu\b/.test(name)) return false;
    return (/\b(?:ky thuat|cong nghe ky thuat)\b/.test(name) && /\bdien/.test(name))
      || /\bco dien tu\b|\bdien tu\s*-?\s*vien thong\b|\bdien\s*(?:-|va|,)\s*dien tu\b/.test(name);
  }
  return !wantedTokens.length || wantedTokens.every((word) => name.includes(word));
}

function scoreProgramCard(knowledge, program, method, score) {
  const card = programCard(knowledge, program);
  const difference = Math.max(0, score - method.score);
  const comparison = difference > 0
    ? `điểm của bạn cao hơn mốc ${difference.toFixed(2).replace(/\.00$/, "").replace(/0$/, "")} điểm`
    : "mốc bằng điểm bạn nhập";
  const detail = [method.name || "THPT", method.combination, `${method.score}/${method.scale || 30}`, comparison].filter(Boolean).join(" · ");
  card.lines = [detail, ...card.lines.filter((line) => !line.includes(`${method.score}/${method.scale || 30}`))].slice(0, 3);
  return card;
}

function scoreAdvice(knowledge, query, score) {
  const wantedTokens = scoreAdviceTokens(query);
  const electricalElectronics = asksElectricalElectronics(query);
  const normalized = normalizeAssistantText(query);
  const region = /\bmien nam\b/.test(normalized) ? "south" : /\bmien bac\b/.test(normalized) ? "north" : /\bmien trung\b/.test(normalized) ? "central" : null;
  const candidates = [];
  for (const program of knowledge.programs) {
    const school = knowledge.schoolById.get(program.universityId);
    if (region && school?.region !== region) continue;
    const text = normalizeAssistantText(`${program.name} ${program.code} ${school?.name || ""} ${school?.region || ""}`);
    if (!matchesAdviceTopic(program.name, wantedTokens, electricalElectronics)) continue;
    if (!electricalElectronics && wantedTokens.length && !wantedTokens.every((word) => text.includes(word))) continue;
    const method = program.methods
      .filter((item) => /thpt/i.test(item.name) && Number.isFinite(item.score) && Number(item.scale) === 30 && PUBLIC_SCORE_STATUSES.has(item.status) && item.score <= score)
      .sort((a, b) => b.score - a.score)[0];
    if (method) candidates.push({ program, method, difference: score - method.score });
  }
  const seenSchools = new Map();
  const ranked = candidates.sort((a, b) => a.difference - b.difference || b.method.score - a.method.score).filter((item) => {
    const count = seenSchools.get(item.program.universityId) || 0;
    if (count >= 2) return false;
    seenSchools.set(item.program.universityId, count + 1);
    return true;
  }).slice(0, 6);
  if (!ranked.length) return null;
  return {
    text: `Có ${ranked.length} ngành trong dữ liệu website có mốc điểm THPT 2026 không cao hơn ${score}. Kết quả chỉ đối chiếu với điểm đã công bố, chưa phải dự đoán khả năng trúng tuyển. Bạn cần kiểm tra tổ hợp và điều kiện của từng trường.`,
    cards: ranked.map(({ program, method }) => scoreProgramCard(knowledge, program, method, score)),
    suggestions: ["Tìm ngành Công nghệ thông tin", "Xem các trường miền Bắc", "Báo thông tin sai"]
  };
}

function combinationAnswer(knowledge, query) {
  const match = normalizeAssistantText(query).match(/\b([a-z]\d{2}|x\d{2})\b/i);
  if (!match) return null;
  const code = match[1].toLocaleUpperCase("vi");
  const subjects = knowledge.combinations.get(code);
  if (!subjects) return null;
  return {
    text: `Tổ hợp ${code} gồm ${subjects}. Bạn có thể xem tổ hợp này ở mục Tổ hợp và dùng trong công cụ tính điểm.`,
    cards: [],
    suggestions: ["Tìm ngành Công nghệ thông tin", "25 điểm THPT nên xem ngành nào?", "Báo thông tin sai"]
  };
}

function combinationProgramAnswer(knowledge, query) {
  const normalized = normalizeAssistantText(query);
  if (!/\b(nganh|xet|tuyen)\b/.test(normalized)) return null;
  const match = normalized.match(/\b([a-z]\d{2}|x\d{2})\b/i);
  if (!match) return null;
  const code = match[1].toLocaleUpperCase("vi");
  if (!knowledge.combinations.has(code)) return null;
  const programs = knowledge.programs.filter((program) => program.methods.some((method) =>
    String(method.combination || "").split(/[;,/|]+/).map((item) => item.trim().toLocaleUpperCase("vi")).includes(code)
  )).slice(0, 6);
  if (!programs.length) return null;
  return {
    text: `Các ngành dưới đây có ghi tổ hợp ${code} trong dữ liệu website. Danh sách hiển thị một số kết quả đầu tiên. Bạn hãy mở hồ sơ để kiểm tra phương thức và điều kiện đi kèm.`,
    cards: programs.map((program) => programCard(knowledge, program)),
    suggestions: ["Tìm ngành Công nghệ thông tin", "25 điểm THPT nên xem ngành nào?", "Báo thông tin sai"]
  };
}

function guidance(text, suggestions = ["Nên chọn ngành theo sở thích hay điểm số?", "THPT và học bạ khác nhau thế nào?", "Cách sắp xếp nguyện vọng"], { localOnly = false } = {}) {
  return { text, cards: [], suggestions, intent: "guidance", ...(localOnly ? { localOnly: true } : {}) };
}

function followUpQuery(query, history) {
  const continuation = (text) => /^(?:con |vay |the |no |nganh do|truong do|phuong thuc do|chi tiet hon|noi ro hon|giai thich them)/.test(text)
    && !/\b(?:tim (?:truong|nganh)|bao sai|bao loi|chuyen chu de|hoc phi|chi phi|cong thuc|cach tinh|so sanh|phan biet|khac nhau)\b/.test(text);
  if (!continuation(normalizeAssistantText(query))) return query;
  const previous = (Array.isArray(history) ? history : []).slice(-6)
    .filter((message) => message?.role === "user" && typeof message.content === "string" && message.content.trim() !== query)
    .map((message) => message.content.slice(0, 500));
  let context = "";
  for (const message of [...previous, query]) {
    const text = normalizeAssistantText(message);
    if (!continuation(text)) context = text;
    else {
      if (/\bmien (?:bac|trung|nam)\b/.test(text)) context = context.replace(/\bmien (?:bac|trung|nam)\b/g, " ");
      context = `${context} ${text}`.trim();
    }
  }
  return context || query;
}

function advisoryAnswer(query, originalQuery) {
  const normalized = normalizeAssistantText(query);
  const latest = normalizeAssistantText(originalQuery);
  if (/\bdiem (?:chuan|san)\b/.test(latest) && /\b(khac|phan biet|la gi|the nao)\b/.test(latest)) {
    return guidance("Điểm sàn là ngưỡng điểm để hồ sơ được xem xét theo điều kiện của phương thức; đạt điểm sàn chưa có nghĩa là trúng tuyển. Điểm chuẩn là mốc trúng tuyển được công bố cho một ngành, chương trình và phương thức cụ thể. Khi so điểm, cần khớp năm tuyển sinh, thang điểm và cách quy đổi. Điểm chuẩn 2026 trên website chỉ là tham khảo cho 2027.");
  }
  if (/\b(website|trang web|web|du lieu)\b/.test(latest) && /\b(nam nao|2027|2026|cap nhat|moi nhat)\b/.test(latest) && !/\b(tim|tra cuu)\b/.test(latest)) {
    return guidance("Website dành cho thí sinh thi THPT năm 2027. Dữ liệu tuyển sinh 2027 đang cập nhật; hồ sơ trường, điểm chuẩn, công thức và đề thi năm 2026 hiện dùng để tham khảo. Khi đăng ký, bạn cần đối chiếu thông báo chính thức đúng năm, đúng trường, ngành và phương thức.");
  }
  if (/\b(chinh sua|sua|doi|xoa)\b/.test(latest) && /\b(hoc ba|da nhap|da luu|nguyen vong)\b/.test(latest)) {
    if (/\bnguyen vong\b/.test(latest)) return guidance("Trong Tìm ngành, kéo đến “Nguyện vọng đã lưu”. Dùng nút mũi tên lên hoặc xuống để đổi thứ tự, nút × để xóa một mục; nếu chọn sai ngành hay phương thức, xóa mục đó rồi lưu lại kết quả đúng. Kiểm tra danh sách trước khi xuất PDF. Thao tác ở đây chỉ sửa danh sách chuẩn bị trên website.");
    return guidance("Bạn có thể sửa trực tiếp điểm ở bảng học bạ rồi tính lại. Nếu đang xem kết quả quét, hãy đối chiếu môn, lớp và học kỳ trong bảng xem trước, sửa ô sai rồi mới xác nhận điền điểm. Việc sửa điểm bạn đã nhập không cần gửi báo cáo sai dữ liệu trường.", ["Cách dùng tính điểm học bạ", "Cách quét ảnh học bạ"]);
  }
  if (/\b(uu tien|kv1|kv2|kv3|ut1|ut2)\b/.test(normalized)) {
    const score = extractScore(originalQuery);
    const area = latest.match(/\bkv\s*([123])(?:[ -]?nt)?\b/);
    const group = latest.match(/\but\s*([12])\b/);
    const context = { area: area ? (area[0].includes("nt") ? "KV2-NT" : `KV${area[1]}`) : "KV3", priorityGroup: group ? `UT${group[1]}` : "none" };
    if (score !== null && (area || group)) {
      const priority = calculateAdmissionPriority(score, context);
      return guidance(`Theo cách tính hiện có trên website, ${score.toFixed(2)} điểm tổ hợp trên thang 30 với ${context.area}${group ? ` và ${context.priorityGroup}` : ""} có mức ưu tiên gốc ${priority.base.toFixed(2)}, ưu tiên sau điều chỉnh ${priority.adjusted.toFixed(2)} điểm; tổng là ${rounded(score + priority.adjusted).toFixed(2)}/30. Từ mốc 22,50, ưu tiên giảm dần; đạt 30 thì phần ưu tiên bằng 0. Đây là cách tính tham khảo theo dữ liệu 2026; cần đối chiếu quy định 2027 và điều kiện ưu tiên của bạn.`, ["Vì sao ưu tiên bị giảm?", "THPT và học bạ khác nhau thế nào?"], { localOnly: true });
    }
    return guidance("Ưu tiên gồm khu vực và đối tượng đủ điều kiện. Trong công cụ hiện tại, từ 22,50/30 điểm tổ hợp trở lên, phần ưu tiên được giảm theo điểm; đạt 30 thì phần này bằng 0. Bạn chọn đúng khu vực và đối tượng trong Tính điểm THPT, rồi mở “Xem cách tính” để xem mức gốc và mức sau điều chỉnh. Công thức đang dùng dữ liệu 2026 để tham khảo cho 2027. Bạn có bao nhiêu điểm tổ hợp và thuộc khu vực, đối tượng nào?", ["26 điểm, KV1 được cộng bao nhiêu?", "Cách dùng tính điểm THPT"]);
  }
  if (/\b(hoc phi|chi phi|ngan sach|tien hoc|tai chinh|ky tuc xa|sinh hoat phi)\b/.test(latest)) {
    if (/\b(truong|dai hoc|hoc vien|bach khoa)\b/.test(latest) && !/\btruong nao\b/.test(latest)
      || /\b[A-Z]{2,8}\b/.test(originalQuery)) return null;
    return guidance("Bạn nên tính ngân sách cả năm gồm học phí của đúng chương trình, tiền ở, ăn uống, đi lại và dụng cụ học tập. Kiểm tra thêm lộ trình tăng học phí, điều kiện học bổng và các khoản hỗ trợ trong thông báo chính thức của trường. Tôi chưa có đủ căn cứ để chốt một mức chi phí cho bạn. Bạn dự kiến tối đa bao nhiêu mỗi năm và muốn học ở tỉnh, thành nào?", ["Cách chọn ngành phù hợp", "Cách sắp xếp nguyện vọng"]);
  }
  if (/\b(on thi|on tap|lich hoc|ke hoach hoc|ke hoach on|mat goc|luyen de|ap luc|lo lang|cang thang)\b/.test(normalized)) {
    const subject = [[/\btoan\b/, "Toán"], [/\b(vat ly|ly)\b/, "Vật lý"], [/\b(hoa hoc|hoa)\b/, "Hóa học"], [/\b(ngu van|van)\b/, "Ngữ văn"], [/\b(tieng anh|anh)\b/, "Tiếng Anh"]].find(([pattern]) => pattern.test(normalized))?.[1];
    const time = normalized.match(/\b(\d{1,2})\s*(tuan|thang|ngay)\b/);
    const remaining = time ? `${time[1]} ${ { tuan: "tuần", thang: "tháng", ngay: "ngày" }[time[2]]}` : "";
    if (subject && time && Number(time[1]) > 0) {
      const units = { tuan: "Tuần", thang: "Tháng", ngay: "Ngày" };
      const total = Number(time[1]);
      const firstEnd = Math.max(1, Math.floor(total / 4));
      const secondEnd = Math.max(firstEnd + 1, Math.floor(total * 3 / 4));
      const span = (from, to) => `${units[time[2]]} ${from}${to > from ? ` đến ${to}` : ""}`;
      const phases = total < 3
        ? `${span(1, total)}: kiểm tra phần yếu, ôn kiến thức cần thiết, làm bài có bấm giờ và dành lượt cuối để sửa lỗi.`
        : `${span(1, firstEnd)}: làm bài kiểm tra ngắn, ghi lỗi và ôn lại phần nền tảng còn yếu. ${span(firstEnd + 1, secondEnd)}: luyện từng dạng còn sai, kiểm tra lại sau vài buổi. ${span(secondEnd + 1, total)}: làm đề có bấm giờ, sửa lỗi và ôn nhẹ trước ngày thi.`;
      const daily = normalized.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:gio|h)\s*(?:(?:moi|mot)\s*)?ngay\b/)
        || normalized.match(/\b(?:moi|mot) ngay (?:(?:toi|minh|em) )?(?:(?:co|hoc|on|danh) )?(\d{1,2}(?:[.,]\d+)?)\s*(?:gio|h)\b/);
      const minutes = daily ? Math.round(Number(daily[1].replace(",", ".")) * 60) : 0;
      const routine = minutes >= 30 && minutes <= 720
        ? ` Với ${daily[1]} giờ mỗi ngày (${minutes} phút), bạn có thể chia khoảng ${Math.round(minutes / 4)} phút ôn kiến thức, ${Math.round(minutes / 2)} phút làm bài, ${minutes - Math.round(minutes / 4) - Math.round(minutes / 2)} phút sửa lỗi và nghỉ ngắn; giữ tổng trong ${minutes} phút.` : " Chia mỗi buổi thành phần ôn kiến thức, làm bài và sửa lỗi, có nghỉ ngắn.";
      return guidance(`Kế hoạch tham khảo cho môn ${subject} trong ${remaining}: ${phases}${routine} Nội dung cụ thể cần bám sách giáo khoa và chương trình bạn đang học; đây không phải lịch ôn hay cấu trúc thi chính thức 2027. Bạn thường mất điểm ở phần kiến thức nào?`, ["Cách dùng phòng thi thử", "Nên chọn ngành theo sở thích hay điểm số?"], { localOnly: true });
    }
    const opening = subject || time ? `Với ${subject ? `môn ${subject}` : "kế hoạch ôn tập"}${time ? ` và ${remaining} còn lại` : ""}, bạn có thể bắt đầu` : "Bạn có thể bắt đầu";
    const followUp = !subject && !time ? "Bạn đang cần cải thiện môn nào và còn khoảng bao lâu để ôn?" : !subject ? "Bạn đang cần cải thiện môn nào?" : !time ? "Bạn còn khoảng bao lâu để ôn?" : "Bạn thường mất điểm ở phần kiến thức nào?";
    return guidance(`${opening} bằng một đề để biết phần nào đang mất điểm, rồi chia tuần học thành buổi ôn kiến thức yếu và buổi làm bài có bấm giờ. Sau mỗi đề, ghi nguyên nhân sai và làm lại câu đó trước khi chuyển sang đề mới. Chừa thời gian nghỉ và điều chỉnh khối lượng nếu quá tải. Trong Phòng thi 2026, bạn có thể luyện đề, xem đáp án và lời giải từng câu nếu có; đây là đề tham khảo. ${followUp}`, ["Cách dùng phòng thi thử", "Nên chọn ngành theo sở thích hay điểm số?"]);
  }
  if (/\b(nguyen vong|thu tu dang ky|sap xep nganh)\b/.test(normalized) && !/\b(?:tim nganh|diem chuan)\b/.test(latest)) {
    return guidance("Hãy xếp ngành, chương trình bạn thực sự muốn học lên trước; đồng thời giữ những phương án phù hợp ở các mức điểm khác nhau. Với mỗi dòng, rà lại mã trường, mã ngành, phương thức, điều kiện và chi phí. Điểm chuẩn 2026 chỉ giúp đối chiếu, không bảo đảm khả năng trúng tuyển 2027. Danh sách lưu hoặc xuất PDF trên website dùng để chuẩn bị; bạn vẫn phải đăng ký và kiểm tra trạng thái trên hệ thống tuyển sinh chính thức theo hướng dẫn đúng năm.", ["25 điểm THPT nên xem ngành nào?", "Nên chọn ngành theo sở thích hay điểm số?"]);
  }
  if (/\b(quet|ocr|tai anh|nhan dien|quyen rieng tu|du lieu ca nhan)\b/.test(normalized)) {
    return guidance("Ở mục Tính điểm học bạ, chọn ảnh rõ toàn bộ bảng điểm và đúng lớp. Website nhận diện trên thiết bị trước; nếu cần quét online, ảnh chỉ được gửi sau khi bạn đồng ý. Hãy che họ tên, ngày sinh và số giấy tờ trước khi tải ảnh. So lại môn, lớp, học kỳ và từng điểm trong bảng xem trước, xử lý ô mâu thuẫn rồi mới xác nhận điền điểm. Nếu nhận diện thiếu hoặc sai, bạn có thể sửa hay nhập tay.", ["THPT và học bạ khác nhau thế nào?", "Cách dùng tính điểm học bạ"]);
  }
  if (/\b(cach dung|huong dan|dung the nao|su dung|lam sao|xuat pdf)\b/.test(normalized)) {
    if (/\bhoc ba\b/.test(normalized)) return guidance("Trong Tính điểm học bạ, chọn cách lấy điểm phù hợp với phương thức trường công bố, nhập tay hoặc quét ảnh rồi kiểm tra lại. Chọn đúng lớp, học kỳ, khu vực và đối tượng ưu tiên trước khi tính. Với một trường cụ thể, mở Công thức xét tuyển theo trường để kiểm tra điều kiện; không dùng một cách tính học bạ cho mọi trường.");
    if (/\b(phong thi|thi thu|lam de)\b/.test(normalized)) return guidance("Mở Phòng thi 2026, chọn môn và đề có ghi rõ nguồn, rồi bắt đầu làm bài với đồng hồ đếm ngược. Sau khi nộp, xem điểm, đáp án và lời giải từng câu nếu đề có lời giải. Các đề này giúp luyện tập; hãy kiểm tra cấu trúc thi chính thức của năm bạn dự thi.");
    if (/\b(thpt|tinh diem)\b/.test(normalized)) return guidance("Trong Tính điểm THPT, chọn khu vực và đối tượng ưu tiên, nhập điểm 4 môn rồi bấm tính. Website tạo các tổ hợp ba môn phù hợp và xếp điểm từ cao xuống thấp. Mở “Xem cách tính” để xem điểm từng môn và ưu tiên sau điều chỉnh. Đây là điểm phục vụ tham khảo xét tuyển, không phải điểm xét tốt nghiệp.");
    return guidance("Ở Tìm ngành, nhập tên ngành hoặc điểm, chọn miền, phương thức và tổ hợp rồi tìm. Bạn có thể đổi cách sắp xếp, mở hồ sơ trường, lưu nguyện vọng, chọn từ 2 đến 4 ngành để so sánh và xuất danh sách thành PDF. Kết quả dùng dữ liệu tuyển sinh 2026 làm tham khảo cho 2027; hãy kiểm tra thông báo chính thức trước khi đăng ký.");
  }
  const pathways = [
    [/\bthpt\b/, "THPT dùng kết quả kỳ thi THPT và tổ hợp mà chương trình chấp nhận"],
    [/\bhoc ba\b/, "Học bạ dùng kết quả học tập theo số năm hoặc học kỳ do trường quy định"],
    [/\b(dgnl|danh gia nang luc)\b/, "Đánh giá năng lực dùng kết quả kỳ thi đánh giá năng lực mà trường tiếp nhận"],
    [/\b(v-sat|v sat|vsat)\b/, "V-SAT dùng kết quả kỳ thi V-SAT theo môn và cách tính của trường"]
  ].filter(([pattern]) => pattern.test(normalized));
  if (pathways.length && /\b(khac|so sanh|nen|la gi|the nao|phuong thuc|chon|uu diem|nhuoc diem)\b/.test(normalized) && !/\b(cong thuc|cach tinh)\b/.test(normalized)) {
    return guidance(`${pathways.map(([, description]) => `${description}.`).join(" ")} Bạn nên ưu tiên phương thức trường và ngành mình muốn học có tiếp nhận, rồi đối chiếu kết quả đang có, thời gian ôn và chi phí dự thi. Điểm ở các thang hoặc phương thức khác nhau cần được tính, quy đổi theo trường trước khi so sánh. Dữ liệu 2026 trên website là tham khảo; danh mục và điều kiện 2027 cần xem thông báo mới. Bạn đang nhắm ngành hoặc trường nào?`, ["Cách chọn ngành phù hợp", "Cách sắp xếp nguyện vọng"]);
  }
  if (/\b(chon nganh|nganh nao phu hop|phu hop voi|so thich|the manh|gioi |thich |hoc gi|hoc nhu the nao|lam gi|nghe nghiep|viec lam|luong|co hoi)\b/.test(normalized) || (/\b(so sanh|khac|phan biet)\b/.test(normalized) && /\b(nganh|cntt|khmt|khoa hoc may tinh|kinh te|dien|luat|su pham)\b/.test(normalized))) {
    const topics = [
      [/\b(cntt|cong nghe thong tin|lap trinh)\b/, "Công nghệ thông tin gắn với lập trình, hệ thống và xử lý dữ liệu; bạn có thể thử viết một chương trình nhỏ để xem mình có thích việc tìm và sửa lỗi không."],
      [/\b(khmt|khoa hoc may tinh)\b/, "Khoa học máy tính thường đi sâu vào thuật toán và nền tảng tính toán. Tên ngành có thể gần nhau, nên cần so chương trình học cụ thể để biết mức độ lý thuyết và thực hành."],
      [/\b(dien dien tu|dien tu|ky thuat dien|co dien tu)\b/, "Nhóm điện, điện tử gắn với mạch, thiết bị và hệ thống điều khiển; bạn nên xem lượng thực hành, phòng thí nghiệm và nền tảng Toán, Vật lý trong chương trình."],
      [/\b(kinh te|kinh doanh|thuong mai|marketing)\b/, "Nhóm kinh tế, kinh doanh có các hướng khác nhau như phân tích, quản trị hoặc tiếp thị; hãy đọc các môn học bắt buộc và thử một việc gần với hướng bạn thích."],
      [/\b(ngon ngu|tieng anh|ngoai ngu)\b/, "Nhóm ngôn ngữ cần luyện đọc, viết và giao tiếp đều đặn; bạn nên xem chương trình thiên về ngôn ngữ học, biên phiên dịch hay ứng dụng trong một lĩnh vực khác."]
    ].filter(([pattern]) => pattern.test(normalized)).map(([, description]) => description);
    return guidance(`${topics.length ? `${topics.join(" ")} ` : ""}Để chọn ngành, hãy đối chiếu việc bạn thích làm, môn học đang có thế mạnh và chương trình thực tế. Xem thêm chi phí, địa điểm học, rồi thử một hoạt động nhỏ liên quan trước khi quyết định. Chưa thể kết luận ngành nào hợp chỉ từ một mức điểm, hoặc bảo đảm việc làm, thu nhập. Bạn thích và học tốt những môn nào? Bạn muốn học ở đâu?`, ["THPT và học bạ khác nhau thế nào?", "Cách dự trù học phí", "Cách sắp xếp nguyện vọng"]);
  }
  return null;
}

export function answerAdmissionsQuestion(knowledge, input, { history = [] } = {}) {
  const query = String(input ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (query.length < 2) throw new Error("Bạn hãy nhập câu hỏi có ít nhất 2 ký tự.");
  if (query.length > 500) throw new Error("Mỗi câu hỏi có tối đa 500 ký tự. Bạn hãy rút ngắn câu hỏi.");
  const normalized = normalizeAssistantText(query);
  if (/\b(bao sai|bao loi|bao thong tin sai|gui bao cao|gui gop y|phan anh|gop y)\b/.test(normalized) || /\b(muon|can|hay|giup|de nghi)\b.{0,35}\b(sua diem chuan|sua ho so truong|bao cao)\b/.test(normalized)) {
    return {
      text: "Bạn hãy điền thông tin cần sửa và nguồn kiểm chứng vào biểu mẫu. Báo cáo chỉ được gửi sau khi bạn hoàn tất biểu mẫu và xác minh bằng Cloudflare Turnstile.",
      cards: [], suggestions: [], action: "report"
    };
  }
  if (/^(xin chao|chao|hello|hi|alo)\b/.test(normalized)) {
    return {
      text: `Chào bạn. Website dành cho thí sinh thi THPT 2027; dữ liệu tuyển sinh ${knowledge.year} hiện dùng để tham khảo, thông tin 2027 đang cập nhật. Bạn có thể hỏi về trường, ngành, cách dùng website hoặc gửi thông tin cần sửa. Phần tra cứu nội bộ chạy ngay trên thiết bị của bạn.`,
      cards: [], suggestions: ["Tìm ngành Công nghệ thông tin", "25 điểm THPT nên xem ngành nào?", "Báo thông tin sai"]
    };
  }
  const contextualQuery = followUpQuery(query, history);
  const normalizedContext = normalizeAssistantText(contextualQuery);
  const advisory = advisoryAnswer(contextualQuery, query);
  // Concrete score-based lookups retain their existing profile results.
  const concreteScoreLookup = extractScore(contextualQuery) !== null && /\b(?:diem|thpt)\b|\d(?:[.,]\d+)?d\b/.test(normalizedContext)
    && /\b(?:nen (?:chon|xem)|truong nao|tim nganh)\b/.test(normalizedContext) && !/\b(uu tien|kv1|kv2|kv3|ut1|ut2)\b/.test(normalizedContext)
    && (contextualQuery === query || extractScore(query) !== null || /\bmien (?:bac|nam|trung)\b/.test(normalized));
  if (advisory && !concreteScoreLookup) return advisory;
  const combinationPrograms = combinationProgramAnswer(knowledge, contextualQuery);
  if (combinationPrograms) return combinationPrograms;
  const combination = combinationAnswer(knowledge, contextualQuery);
  if (combination) return combination;
  const score = extractScore(query) ?? extractScore(contextualQuery);
  if (score !== null && /\b(diem|thpt|xet|nganh|truong)\b/.test(normalizedContext)) {
    const advice = scoreAdvice(knowledge, contextualQuery, score);
    if (advice) return advice;
  }
  const asksFormula = /\b(cong thuc|cach tinh)\b/.test(normalized);
  const asksFee = /\b(hoc phi|chi phi|tien hoc)\b/.test(normalized);
  const feeText = "Dữ liệu được cung cấp cho trợ lý chưa đủ để xác nhận học phí của trường, chương trình và năm bạn hỏi. Điều này không có nghĩa là trường chưa công bố học phí. Bạn cần kiểm tra thông báo chính thức đúng năm và chương trình, gồm mức thu, đơn vị tính, các khoản khác và lộ trình tăng nếu có.";
  const asksCutoff = /\b(diem chuan|bao nhieu diem|moc diem)\b/.test(normalized);
  const lookupBase = normalizedContext.replace(/\b([a-z]{2,8})(20\d{2})\b/g, "$1 $2").replace(/^(?:con|vay|the)\s+/, "");
  const lookupQuery = asksFormula ? lookupBase.replace(/\b(cong thuc|cach tinh|xet tuyen|phuong thuc|la gi|hoc ba|thpt|dgnl|danh gia nang luc|v-sat|vsat)\b/g, " ").replace(/\s+/g, " ").trim()
    : asksFee || asksCutoff ? lookupBase.replace(/\b(hoc phi|chi phi|tien hoc|diem chuan|moc diem|nam|2027|2026|bao nhieu diem|bao nhieu|la)\b/g, " ").replace(/\s+/g, " ").trim() : contextualQuery;
  const results = searchAssistantKnowledge(knowledge, lookupQuery, 6);
  const schoolExact = results.schools.filter((entry) => entry.rank <= 4);
  const programExact = results.programs.filter((entry) => entry.rank <= 7);
  const cards = [
    ...schoolExact.slice(0, 3).map(({ item }) => schoolCard(item)),
    ...programExact.slice(0, Math.max(0, 6 - schoolExact.slice(0, 3).length)).map(({ item }) => programCard(knowledge, item))
  ];
  if (cards.length) {
    if (asksFormula) {
      const requestedMethod = /\bhoc ba\b/.test(normalized) ? /hoc ba/ : /\bthpt\b/.test(normalized) ? /thpt/
        : /\b(dgnl|danh gia nang luc)\b/.test(normalized) ? /dgnl|danh gia nang luc/ : /\b(v-sat|vsat)\b/.test(normalized) ? /v-sat|vsat/ : null;
      for (const card of cards) {
        const programs = card.type === "program" ? knowledge.programs.filter((program) => program.id === card.majorId)
          : knowledge.programs.filter((program) => program.universityId === card.universityId);
        const formulas = [...new Set(programs.flatMap((program) => program.methods.filter((method) => typeof method.formula === "string" && method.formula.trim() && (!requestedMethod || requestedMethod.test(normalizeAssistantText(method.name)))).map((method) => `${method.name}: ${method.formula}`)))].slice(0, 3);
        if (formulas.length) card.lines = formulas;
      }
    }
    const detail = asksCutoff ? "Điểm trên mỗi thẻ lấy từ hồ sơ website, kèm thang điểm. Điểm chuẩn 2026 là mốc tham khảo; thông tin 2027 đang cập nhật, cần đối chiếu thông báo chính thức."
      : asksFormula ? "Bạn hãy mở hồ sơ để xem công thức của từng phương thức và nguồn đã kiểm tra."
        : "Bạn hãy mở hồ sơ để xem đầy đủ ngành, tổ hợp, phương thức, điểm và công thức.";
    return {
      text: asksFee ? feeText : `Có ${cards.length} kết quả phù hợp trong dữ liệu ${knowledge.year}. ${detail}`,
      cards,
      ...(asksFee ? { localOnly: true } : {}),
    suggestions: ["Tìm ngành 7480201", "25 điểm THPT nên xem ngành nào?", "Báo thông tin sai"]
    };
  }
  if (asksFee) return { text: feeText, cards: [], suggestions: ["Cách dự trù học phí", "Cách chọn ngành phù hợp"], localOnly: true };
  if (/\b(lam gi|giup gi|chuc nang|tu van)\b/.test(normalized)) {
    return {
      text: "Bạn có thể hỏi cách chọn ngành, so sánh phương thức xét tuyển, lập kế hoạch ôn tập, sắp xếp nguyện vọng hoặc dùng các công cụ trên website. Khi cần thông tin cụ thể, hãy cho biết trường, ngành hoặc điểm để đối chiếu dữ liệu. Điểm chuẩn và hồ sơ 2026 hiện là mốc tham khảo cho 2027.",
      cards: [], suggestions: ["Tìm trường Bách khoa Hà Nội", "Tổ hợp A00 gồm môn gì?", "Báo thông tin sai"]
    };
  }
  return {
    text: 'Chưa tìm thấy nội dung phù hợp trong dữ liệu website. Bạn hãy thử tên đầy đủ, mã trường, mã ngành hoặc hỏi "25 điểm THPT nên xem ngành nào?".',
    cards: [], suggestions: ["Tìm trường Bách khoa Hà Nội", "25 điểm THPT nên xem ngành nào?", "Báo thông tin sai"]
  };
}

export function describeProgramMethod(method) {
  return `${method.name || "Phương thức đang cập nhật"}: ${formatScore(method)}`;
}
