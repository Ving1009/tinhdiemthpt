const clean = (text) => String(text || '').normalize('NFC').replace(/[ \t]+/g, ' ').trim();

// Extract score equations from the source; never create one from a method's name.
export function scoreEquations(text) {
  const equations = [];
  const lines = String(text || '').split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const value = clean(line.replace(/\s+\|\s*$/, ''));
    // Some plans state the arithmetic in words instead of an '=' sign.
    // Keep that statement verbatim; do not invent weights or missing terms.
    if (!value.includes('=') && value.length < 700 && /^(?:[-•]\s*)?(?:Điểm xét tuyển|ĐXT|ĐTX)\s*(?:là|được|bằng|:)/i.test(value) && /(?:tổng (?:điểm|của)|trung bình|nhân (?:với|hệ số)|cộng (?:với|điểm)|quy đổi)/i.test(value)) {
      equations.push(value);
      continue;
    }
    const equal = value.indexOf('=');
    const math = /[+×*÷/]|\s[xX]\s/.test(equal < 0 ? value : value.slice(equal + 1));
    const score = /(điểm|đxt|đtx|đx\b|dxt|kqhb|đkh|đtb|hsnl|tổ hợp|m[123i]\b|nk[12]\b)/i;
    if (!math || value.length > 900) continue;
    if (equal >= 0 ? equal > 150 || !score.test(value.slice(0, equal)) : value.length > 240 || !score.test(lines[i - 1] || '') || !/^(?:[-•]\s*)?(?:Toán|Ngữ văn|Văn|Môn|Điểm môn|Điểm thi|\()/i.test(value) || !/[+×*]|\s[xX]\s/.test(value)) continue;
    if (/i\s*=\s*1\s*,\s*2|stt|học phí|số tiền|chỉ tiêu/i.test(value)) continue;
    const context = clean(lines[i - 1]);
    const heading = /^(?:[-•]\s*)?(?:\d+[.)]\s*)?(?:Đối với|Nhóm|Ngành|Tổ hợp|Thang điểm|Công thức|Phương thức|Xét tuyển)/i.test(context) && context.length < 160 && !context.includes('=') ? `${context}\n` : '';
    equations.push(heading + value.replace(/\s[xX]\s/g, ' × ').replace(/\*/g, '×'));
  }
  return [...new Set(equations)];
}

export function formulaKind(label) {
  const value = String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  if (/tuyen thang|xt thang|u txt|u?txt|uu tien xet tuyen|cu tuyen|du bi/.test(value)) return 'eligibility';
  const parts = [];
  const transcript = /hoc ba|hoc tap|lop 10|lop 12/.test(value);
  if (transcript) parts.push('transcript');
  if (/thpt|tot nghiep/.test(value) && (!transcript || /thi (?:tot nghiep )?thpt|thi tot nghiep/.test(value))) parts.push('thpt');
  for (const exam of ['hsa', 'v-act', 'v-sat', 'vsat', 'tsa', 'spt', 'sat', 'act']) {
    if (new RegExp(`(?<![a-z-])${exam}(?![a-z])`).test(value)) parts.push(exam === 'vsat' ? 'v-sat' : exam);
  }
  if (/danh gia tu duy/.test(value) && !parts.includes('tsa')) parts.push('tsa');
  if (/danh gia nang luc|dgnl/.test(value) && !parts.some((p) => ['hsa', 'v-act', 'spt', 'tsa'].includes(p))) parts.push('assessment');
  if (/ccnn|ccqt|ccta|chung chi|ielts|toefl/.test(value)) parts.push('certificate');
  if (/nang khieu|thi tuyen/.test(value)) parts.push('aptitude');
  if (/phong van/.test(value)) parts.push('interview');
  return [...new Set(parts)].sort().join('+') || (/ho so/.test(value) ? 'application' : 'other');
}

// This is a description of the stated scoring basis, not a manufactured equation.
// Only explicit facts in the method's text activate a line; an empty article stays pending.
export function describeScoring(text, kind = '') {
  const value = clean(text);
  const facts = [];
  if ((!kind || kind.includes('thpt')) && /thi (?:tốt nghiệp (?:trung học phổ thông\s*\(THPT\)|THPT)|THPT)/i.test(value)) facts.push('Sử dụng kết quả thi tốt nghiệp THPT theo tổ hợp và điều kiện đã công bố.');
  if ((!kind || kind.includes('transcript')) && /học bạ|kết quả học tập|trung bình môn/i.test(value)) {
    const period = /(?:lớp )?10\s*,?\s*11\s*(?:,|và)?\s*(?:lớp )?12|3 năm|ba năm|6 học kỳ|sáu học kỳ/i.test(value) ? 'lớp 10, 11 và 12' : /lớp 12/i.test(value) ? 'lớp 12' : '';
    facts.push(`Sử dụng kết quả học tập${period ? ` ${period}` : ' THPT'}; cần tuân thủ cách chọn môn, học kỳ và ngưỡng từng ngành.`);
  }
  const exams = [
    [/HSA|ĐHQG\s*(?:Hà Nội|HN)|Đại học Quốc gia Hà Nội/i, 'HSA của ĐHQG Hà Nội'],
    [/V-ACT|APT|ĐHQG\s*(?:TP\.?\s*HCM|TP\.?\s*Hồ Chí Minh|HCM)|Đại học quốc gia (?:Tp\.?\s*Hồ Chí Minh|TPHCM)/i, 'ĐGNL của ĐHQG TP.HCM'],
    [/V-SAT/i, 'V-SAT'], [/TSA|đánh giá tư duy/i, 'TSA'],
    [/SPT|(?:ĐGNL|đánh giá năng lực).{0,80}(?:Sư phạm Hà Nội|Sư phạm HN)/i, 'ĐGNL của ĐH Sư phạm Hà Nội'],
    [/(?<![A-Z-])(?:SAT|ACT)(?![A-Z])/i, 'chứng chỉ bài thi quốc tế']
  ];
  if (!kind || /assessment|hsa|v-act|v-sat|tsa|spt|sat|act/.test(kind)) for (const [pattern, name] of exams) if (pattern.test(value)) facts.push(`Điểm ${name} được dùng theo ngưỡng, thành phần và quy đổi riêng trong phương thức này.`);
  if ((!kind || kind.includes('aptitude')) && /năng khiếu|NK1|NK2/i.test(value)) facts.push('Có điểm hoặc điều kiện thi năng khiếu; không mặc định tất cả môn có cùng hệ số.');
  if ((!kind || /interview|application/.test(kind)) && /phỏng vấn|hồ sơ năng lực/i.test(value)) facts.push('Có đánh giá hồ sơ / phỏng vấn; tiêu chí thành phần cần theo quy định của trường.');
  if ((!kind || kind.includes('certificate')) && /chứng chỉ ngoại ngữ|IELTS|TOEFL|CCNN/i.test(value)) facts.push('Chứng chỉ ngoại ngữ được sử dụng theo điều kiện và bảng quy đổi hoặc điểm cộng do trường công bố.');
  return [...new Set(facts)].join('\n');
}

export function scoringDefinitions(text) {
  const lines = String(text || '').split(/\n/).map(clean);
  return [...new Set(lines.filter((line) => line.length < 800 && !/học phí|lệ phí|danh sách ngành|số lượng|chỉ tiêu/i.test(line) && (
    /(?:M[123i]|HM|HMQĐ|VMQĐ|ĐTB|ĐKH|ĐC|ĐHL|ĐNL|ĐUT|ĐƯT|điểm môn [123]|điểm thành tích|điểm tư duy|điểm thưởng)\s*(?:[(:=]|là|được|bằng)/i.test(line) ||
    /(?:nhân hệ số|trọng số|hệ số quy đổi|trung bình (?:cộng|môn)).*(?:lớp|môn|Toán|Văn|ngữ|năm|học kỳ)/i.test(line)
  )))].slice(0, 12);
}

export function formulaScale(text) {
  const values = [...String(text || '').matchAll(/thang\s*(?:điểm\s*)?(30|40|100|150|450|1200|1600)\b/gi)].map((x) => Number(x[1]));
  const scales = [...new Set(values)];
  return scales.length ? scales.map((value) => `Thang ${value}`).join(' / ') : 'Theo quy định và bảng quy đổi của trường';
}

export function nonNumericExpression(label) {
  const kind = formulaKind(label);
  if (kind === 'eligibility') return 'Xét điều kiện đối tượng, thành tích và ngành phù hợp; không dùng một phép cộng điểm chung cho mọi thí sinh.';
  if (kind === 'application') return 'Đánh giá hồ sơ và các tiêu chí của chương trình; không quy đổi mặc định về tổng điểm ba môn.';
  return '';
}
