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
    throw new Error("Kho kiến thức trợ lý không đúng định dạng.");
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
    "chon", "diem", "goi", "hoc", "khoang", "muc", "nen", "phu", "hop", "tam", "thi", "thpt", "voi", "xem", "y"
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
  const candidates = [];
  for (const program of knowledge.programs) {
    const school = knowledge.schoolById.get(program.universityId);
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
    text: `Mình tìm thấy ${ranked.length} ngành có mốc THPT 2026 trong dữ liệu website không cao hơn ${score}. Đây chỉ là đối chiếu theo điểm đã công bố, chưa phải dự đoán trúng tuyển; bạn cần kiểm tra tổ hợp và điều kiện của từng trường.`,
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
    text: `Tổ hợp ${code} gồm: ${subjects}. Bạn có thể mở mục Tổ hợp để xem và dùng tổ hợp này trong công cụ tính điểm.`,
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
    text: `Mình tìm thấy các ngành có ghi tổ hợp ${code} trong dữ liệu website. Danh sách chỉ hiển thị một số kết quả đầu tiên; hãy mở hồ sơ để kiểm tra phương thức và điều kiện đi kèm.`,
    cards: programs.map((program) => programCard(knowledge, program)),
    suggestions: ["Tìm ngành Công nghệ thông tin", "25 điểm THPT nên xem ngành nào?", "Báo thông tin sai"]
  };
}

export function answerAdmissionsQuestion(knowledge, input) {
  const query = String(input ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (query.length < 2) throw new Error("Hãy nhập câu hỏi có ít nhất 2 ký tự.");
  if (query.length > 500) throw new Error("Mỗi câu hỏi tối đa 500 ký tự.");
  const normalized = normalizeAssistantText(query);
  if (/\b(bao sai|bao loi|sai thong tin|chinh sua|gop y)\b/.test(normalized)) {
    return {
      text: "Bạn có thể gửi thông tin cần sửa kèm nguồn kiểm chứng. Báo cáo chỉ được gửi sau khi bạn điền biểu mẫu và xác nhận Cloudflare Turnstile.",
      cards: [], suggestions: [], action: "report"
    };
  }
  if (/^(xin chao|chao|hello|hi|alo)\b/.test(normalized)) {
    return {
      text: `Chào bạn! Mình là trợ lý nội bộ của Tính Điểm THPT. Mình tra cứu dữ liệu ${knowledge.year} ngay trên thiết bị, tư vấn cách dùng website và hỗ trợ gửi báo sai.`,
      cards: [], suggestions: ["Tìm ngành Công nghệ thông tin", "25 điểm THPT nên xem ngành nào?", "Báo thông tin sai"]
    };
  }
  const combinationPrograms = combinationProgramAnswer(knowledge, query);
  if (combinationPrograms) return combinationPrograms;
  const combination = combinationAnswer(knowledge, query);
  if (combination) return combination;
  const score = extractScore(query);
  if (score !== null && /\b(diem|thpt|xet|nganh|truong)\b/.test(normalized)) {
    const advice = scoreAdvice(knowledge, query, score);
    if (advice) return advice;
  }
  const results = searchAssistantKnowledge(knowledge, query, 6);
  const schoolExact = results.schools.filter((entry) => entry.rank <= 4);
  const programExact = results.programs.filter((entry) => entry.rank <= 7);
  const cards = [
    ...schoolExact.slice(0, 3).map(({ item }) => schoolCard(item)),
    ...programExact.slice(0, Math.max(0, 6 - schoolExact.slice(0, 3).length)).map(({ item }) => programCard(knowledge, item))
  ];
  if (cards.length) {
    const asksCutoff = /\b(diem chuan|bao nhieu diem|moc diem)\b/.test(normalized);
    const asksFormula = /\b(cong thuc|cach tinh)\b/.test(normalized);
    const detail = asksCutoff ? "Các mốc điểm hiển thị trên thẻ lấy từ hồ sơ website và ghi rõ thang điểm."
      : asksFormula ? "Mở hồ sơ để xem công thức theo từng phương thức và nguồn đã kiểm tra."
        : "Mở hồ sơ để xem đầy đủ ngành, tổ hợp, phương thức, điểm và công thức.";
    return {
      text: `Mình tìm thấy ${cards.length} kết quả phù hợp trong kho dữ liệu ${knowledge.year}. ${detail}`,
      cards,
    suggestions: ["Tìm ngành 7480201", "25 điểm THPT nên xem ngành nào?", "Báo thông tin sai"]
    };
  }
  if (/\b(lam gi|giup gi|chuc nang|tu van)\b/.test(normalized)) {
    return {
      text: "Mình có thể tìm trường hoặc ngành theo tên/mã, giải thích tổ hợp, đối chiếu mức điểm THPT và hướng dẫn dùng các công cụ. Mình chỉ dùng dữ liệu đang có trên website; chỗ chưa đủ căn cứ mình sẽ không tự đoán.",
      cards: [], suggestions: ["Tìm trường Bách khoa Hà Nội", "Tổ hợp A00 gồm môn gì?", "Báo thông tin sai"]
    };
  }
  return {
    text: "Mình chưa tìm thấy nội dung khớp trong kho dữ liệu của website. Bạn hãy thử tên đầy đủ, mã trường, mã ngành hoặc hỏi theo dạng “25 điểm THPT nên xem ngành nào?”.",
    cards: [], suggestions: ["Tìm trường Bách khoa Hà Nội", "25 điểm THPT nên xem ngành nào?", "Báo thông tin sai"]
  };
}

export function describeProgramMethod(method) {
  return `${method.name || "Phương thức đang cập nhật"}: ${formatScore(method)}`;
}
