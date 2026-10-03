import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { plainText } from './lib/ts247-plans.mjs';
import { formulaKind, scoreEquations, scoringDefinitions } from './lib/school-formulas.mjs';

export function officialFormulaDocument(document, profile, sharedDocuments = []) {
  let url;
  try { url = new URL(document.url); } catch { return false; }
  if (url.protocol !== 'https:' || sharedDocuments.includes(document.url) || /thường xuyên|liên thông|dự bị|bổ sung|đợt\s*[2-9]|thạc sĩ|tiến sĩ/i.test(document.title)) return false;
  if (/thong[-_]?tu.*quy[-_]?che|\d+[-_]202[0-5][-_]tt[-_]bgddt/i.test(url.pathname) || /202[0-5]/.test(document.title) && !/2026/.test(document.title)) return false;
  if (/phân hiệu|phan-hieu/i.test(`${document.title} ${url.pathname}`) && !/phân hiệu/i.test(profile.name)) return false;
  return profile.code !== 'CCM' || /(^|\.)hict\.edu\.vn$/.test(url.hostname);
}

export function officialMethodKind(label) {
  // Institution names identify the exam only when the text explicitly names
  // an assessment. A university name in a programme title is not an exam.
  let value = String(label || '');
  if (/ĐGNL|đánh giá năng lực/i.test(value)) {
    value = value.replace(/(?:Đại học|ĐH|ĐHQG)\s*(?:Quốc gia\s*)?Hà Nội/gi, 'HSA')
      .replace(/(?:Đại học|ĐH)\s*Sư phạm\s*(?:Hà Nội|HN)/gi, 'SPT')
      .replace(/(?:Đại học Quốc gia|ĐHQG)\s*(?:TP\.?\s*(?:HCM|Hồ Chí Minh)|TPHCM)/gi, 'V-ACT');
  }
  return formulaKind(value).split('+').filter((part, i, parts) => part !== 'assessment' || !parts.some(p => ['hsa', 'v-act', 'v-sat', 'spt'].includes(p))).join('+');
}

// A heading identifies the method. Text elsewhere in a plan must not be treated
// as that method's formula (especially shared military/university handbooks).
export function officialFormulaSections(text) {
  const lines = String(text || '').normalize('NFC').replace(/phương th\s+ức/gi, 'Phương thức').replace(/tuy\s+ển/gi, 'tuyển').replace(/khi\s+ếu/gi, 'khiếu').replace(/năng l\s+ực/gi, 'năng lực').split('\n').map((line) => line.trim()).filter(Boolean);
  const sections = [];
  const isHeading = (line) => line.length < 500 && /^(?:[-+•*]\s*)?(?:(?:\d+(?:\.\d+)*[.)]?|[a-z][.)])\s*)?(?:Phương thức(?:(?:\s+(?:xét tuyển|tuyển sinh))?\s+\d+[.:)\s]|\s+(?:xét|theo|dựa|kết hợp|sử dụng))|Xét tuyển\s+|Xét\s+(?:kết quả|điểm|theo))/i.test(line);
  const sectionDepth = (line) => {
    const match = line.match(/^(\d+(?:\.\d+)*)(?:[.)]|\s)\s*[A-Za-zÀ-ỹĐđ]/);
    return match ? match[1].split('.').length : null;
  };
  // PDF titles often wrap before the exam name or certificate/aptitude part.
  // Join only title continuations; never consume a formula or a new heading.
  for (let i = 0; i < lines.length; i++) {
    if (!isHeading(lines[i])) continue;
    for (let n = 0; n < 3 && lines[i + 1] && !isHeading(lines[i + 1]) && !lines[i + 1].includes('=') && /^(?:nghiệp|phổ thông|tập THPT|THPT|HSA|TSA|V-SAT|chứng chỉ|ngoại ngữ|kết hợp|và |hoặc |với |của |do |năm 2026|Đại học|ĐHQG|Quốc gia|Hà Nội|TP\.)/i.test(lines[i + 1]); n++) lines[i] += ` ${lines.splice(i + 1, 1)[0]}`;
  }
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i];
    if (heading.length > 500 || /202[0-5]|2027|thường xuyên|liên thông|thạc sĩ|tiến sĩ/i.test(heading)) continue;
    if (!isHeading(heading)) continue;
    // A wrapped sentence such as "xét tuyển và dấu xác nhận của trường THPT"
    // is a boundary, not a method heading with authoritative scope.
    if (!/Phương thức/i.test(heading) && sectionDepth(heading) === null) continue;
    const kind = officialMethodKind(heading);
    if (['eligibility', 'application', 'other'].includes(kind)) continue;
    sections.push({ heading, kind, index: i, depth: sectionDepth(heading) });
  }
  // Stop at ANY new method, including combinations not in the supported list.
  return sections.map((section) => {
    let end = section.index + 1;
    while (end < lines.length && !isHeading(lines[end]) && !(section.depth && sectionDepth(lines[end]) && sectionDepth(lines[end]) <= section.depth)) end++;
    const body = lines.slice(section.index, end).join('\n').slice(0, 10000);
    const equations = scoreEquations(lines.slice(section.index + 1, end).join('\n').slice(0, 10000)).filter((equation) => /(?:ĐXT|Điểm xét tuyển|Điểm Xét tuyển|Điểm học bạ|Điểm học tập|Điểm tổ hợp)\s*(?:\([^\n]*?\))?\s*(?:=|là|được|bằng|:)/i.test(equation) && !/[+=×\/]\s*$/.test(equation) && !/đi\s+ểm|điểm ưu tiên\s*=/i.test(equation.split('\n').at(-1)) && !/(?:điểm thi|so|lớp|nếu)\s*$/i.test(equation) && (equation.match(/\(/g) || []).length === (equation.match(/\)/g) || []).length);
    return { ...section, equations, definitions: scoringDefinitions(body).filter(line => !/(?:lớp|năm|môn|[+=×/])\s*$/.test(line)), body };
  }).filter((section) => section.equations.length);
}

export async function researchSchoolFormulas() {
  const load = async (name) => JSON.parse(await fs.readFile(name, 'utf8'));
  const [profiles, research, catalog, manual, links] = await Promise.all([
    'data/research/official-profiles-2026.json', 'data/research/admission-methods-2026.json',
    'data/school-formula-catalog-2026.json', 'data/research/school-formulas-2026-overrides.json',
    'data/research/official-profile-links-2026.json',
  ].map(load));
  const methods = {};
  const audit = [];
  for (const school of research.schools) {
    const profile = profiles.schools.find((s) => s.code === school.code);
    const existing = catalog.schools.find((s) => s.schoolCode === school.code);
    const candidates = [];
    for (const document of profile?.documents || []) {
      if (!officialFormulaDocument(document, profile, links[school.code]?.sharedDocuments)) continue;
      const base = `tmp/official-profiles-2026/${createHash('sha256').update(document.url).digest('hex')}`;
      let text = '';
      try {
        const page = await load(`${base}.json`);
        text = page.kind === 'pdf' ? await fs.readFile(`${base}.txt`, 'utf8') : plainText((await fs.readFile(`${base}.html`, 'utf8')).replace(/<(?:style|nav|footer)\b[^>]*>[\s\S]*?<\/(?:style|nav|footer)>/gi, ''));
      } catch { continue; }
      if (document.kind === 'pdf' && !/2026/.test(text.slice(0, 2500))) continue;
      if (/THÔNG BÁO[^\n]{0,150}(?:BỔ SUNG|THƯỜNG XUYÊN|DỰ BỊ)/i.test(text.slice(0, 2000))) continue;
      for (const section of officialFormulaSections(text)) candidates.push({ ...section, document });
    }
    for (const method of school.methods) {
      const key = `${school.code}:${method.id}`;
      if (manual.methods[key] || existing?.methods.find((m) => m.id === `school-${school.code.toLowerCase()}-${method.id}`)?.status === 'official_verified') continue;
      const kind = officialMethodKind(method.label);
      if (['eligibility', 'application', 'other'].includes(kind)) continue;
      // Multiple differently scoped methods of one kind need manual mapping.
      if (school.methods.filter((m) => officialMethodKind(m.label) === kind).length !== 1) continue;
      const matches = candidates.filter((c) => c.kind === kind);
      const signatures = new Map(matches.map((match) => [JSON.stringify(match.equations), match]));
      if (signatures.size !== 1) { if (matches.length) audit.push({ school: school.code, method: method.id, issue: 'different_official_expressions', urls: [...new Set(matches.map((c) => c.document.url))] }); continue; }
      const selected = [...signatures.values()][0];
      methods[key] = {
        status: 'source_reported', expression: selected.equations.join('\n'), equations: selected.equations,
        conditions: [...new Set([...method.requirements, ...selected.definitions])],
        issues: ['Biểu thức nằm trong mục phương thức của tài liệu chính thức; hệ số, quy đổi và phạm vi ngành vẫn cần đối chiếu đầy đủ trước khi tự tính.'],
        evidence: { kind: 'official_primary', url: selected.document.url, checkedAt: '2026-10-04', note: `Mục: ${selected.heading}. Trích phục vụ tra cứu, không xác nhận đủ điều kiện tự tính.` },
      };
    }
  }
  const result = { year: 2026, checkedAt: '2026-10-04', policy: 'Chỉ lấy biểu thức trong mục phương thức xác định; không suy công thức từ tên, không mở tự tính từ trích xuất.', methods, audit };
  await fs.writeFile('data/research/school-formulas-2026-official-excerpts.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ officialMethodExcerpts: Object.keys(methods).length, needsManualMapping: audit.length }));
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await researchSchoolFormulas();
