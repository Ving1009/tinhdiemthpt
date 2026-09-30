import fs from "node:fs/promises";
import { mentionedExams, programsForTag } from "./lib/ts247-plans.mjs";

const universities = JSON.parse(await fs.readFile("data/universities.json", "utf8"));
const raw = JSON.parse(await fs.readFile("tmp/admissions-plans-2026/raw-plans.json", "utf8"));
const notes = JSON.parse(await fs.readFile("data/research/admission-methods-2026-notes.json", "utf8"));
const byCode = new Map(raw.pages.map((page) => [page.code, page]));
const byUrl = new Map(raw.pages.map((page) => [page.url, page]));
const references = (school) => [school.admissions?.methodsSourceUrl, ...(school.admissions?.referenceSources || []).map((value) => typeof value === "string" ? value : value.url)].filter(Boolean);
const planUrl = (url) => url.replace("/diem-chuan/", "/de-an-tuyen-sinh/");
const unique = (values) => [...new Set(values.filter(Boolean))];
const dedupePrograms = (programs) => [...new Map(programs.map((p) => [`${p.code}|${p.name}|${p.group}|${p.combinations}|${p.note}`, p])).values()];
const sectionNames = { object: "Đối tượng", quality: "Ngưỡng đầu vào", condition: "Điều kiện", regulations: "Cách xét / cách tính điểm", admission_time: "Thời gian", other_infomation: "Thông tin khác", description: "Mô tả" };

// Publish factual names and matrices, not copies of the source's explanatory article.
function methodRecord(method, page, schoolNote) {
  const correction = schoolNote.methodCorrections?.[method.id] || {};
  let programs = correction.programs || method.programs || [];
  let scopeStatus = correction.scopeStatus || method.scopeStatus;
  const tag = correction.variantTag || notes.variantTags[method.id];
  if (!programs.length && tag && page) {
    programs = programsForTag(page.programs, tag);
    if (programs.length) scopeStatus = "explicit_program_variant_tags";
  }
  const requirements = correction.requirements || method.requirements || [];
  const detailText = [...Object.values(method.details || {}), ...requirements].join("\n");
  const sourceUrl = correction.sourceUrl || method.sourceUrl || page?.url || schoolNote.sources?.[0]?.url || "";
  return {
    id: String(method.id), label: correction.label || method.label, year: 2026,
    sourceLabel: method.label,
    methodCode: method.methodCode, codeNamespace: method.codeNamespace || "tuyensinh247_internal",
    scopeStatus, disputed: Boolean(correction.disputed), yearEvidence: method.yearEvidence || "explicit_2026",
    programs: dedupePrograms(programs), requirements,
    examsAndCertificatesMentioned: mentionedExams(detailText),
    availableSourceSections: Object.keys(method.details || {}).map((key) => sectionNames[key] || key),
    sourceUrl,
    sourceSectionId: sourceUrl === page?.url ? method.sectionId || "" : "",
    issues: unique([correction.issue, ...(method.issues || [])])
  };
}

const schools = universities.map((school) => {
  const note = notes.schools[school.code] || {};
  const campus = notes.campuses?.[school.code];
  const alias = notes.aliasPlans?.[school.code];
  const page = campus || alias ? byCode.get(campus?.parent || alias) : byUrl.get(notes.additionalPlanUrls?.[school.code]) || references(school).map((url) => byUrl.get(planUrl(url))).find(Boolean) || byCode.get(school.code);
  let methods = [...(note.methods || page?.methods || []), ...(note.additionalMethods || [])].map((method) => methodRecord(method, page, note));
  if (campus && !note.methods) {
    methods = methods.map((method) => ({ ...method, programs: method.programs.filter((p) =>
      (!campus.namePattern || new RegExp(campus.namePattern, "i").test(p.name)) && (!campus.groupPattern || new RegExp(campus.groupPattern, "i").test(p.group))) }));
    // A parent's method with explicit rows solely for another campus does not apply here.
    methods = methods.filter((method) => method.programs.length || method.scopeStatus === "program_scope_missing");
  }
  if (note.classification) methods = [];
  const issues = [...(note.issues || [])];
  if (page && !page.methods.length && !note.methods) issues.push(`Nguồn tổng hợp chưa có phương thức năm 2026; các năm trong nguồn: ${page.availableMethodYears.join(", ") || "không ghi"}.`);
  if (campus) issues.push(`Chỉ lấy các dòng ghi đúng phân hiệu từ đề án ${campus.parent}; không sao chép toàn bộ ngành của trường mẹ.`);
  if (!methods.length && !note.classification) issues.push("Chưa xác nhận được đủ phương thức và bảng ngành áp dụng cho năm 2026.");
  const status = note.classification || (!methods.length ? "missing_2026_evidence" : note.unresolved || methods.some((m) => !m.programs.length || m.disputed) ? "partial_program_mapping" : methods.some((m) => m.yearEvidence === "current_policy") ? "current_policy_collected" : "source_program_mapping_collected");
  return {
    code: school.code, name: school.name, checkedAt: notes.checkedAt, status,
    sourceSchoolCode: page?.code || null, sourceSchoolName: page?.name || null,
    sources: [...new Map([...(page ? [{ url: page.url, type: "secondary", year: page.availableMethodYears.includes(2026) ? 2026 : null, availableYears: page.availableMethodYears }] : []), ...(note.sources || [])].map((s) => [s.url, s])).values()],
    documents: unique((page?.documentUrls || []).filter((url) => /\/2026\//.test(url))),
    methods, unresolved: Boolean(note.unresolved), issues: unique(issues),
    coverageNote: "Danh sách phương thức và ngành theo nguồn đã thu thập; chưa đồng nghĩa đề án không còn phương thức khác. Ngưỡng, tổ hợp và quyền tuyển thẳng cần đọc điều kiện gốc."
  };
}).sort((a, b) => a.code.localeCompare(b.code));

const counts = {};
for (const school of schools) counts[school.status] = (counts[school.status] || 0) + 1;
const summary = { schools: schools.length, sourcePages: raw.pages.length, methods: schools.reduce((n, s) => n + s.methods.length, 0), programMethodRows: schools.reduce((n, s) => n + s.methods.reduce((m, x) => m + x.programs.length, 0), 0), statusCounts: counts };
const dataset = { schemaVersion: 1, year: 2026, checkedAt: notes.checkedAt, sourcePagesCollectedAt: raw.checkedAt, purpose: "research_only", summary, schools };
await fs.mkdir("docs/research", { recursive: true });
await fs.writeFile("data/research/admission-methods-2026.json", JSON.stringify(dataset, null, 2) + "\n");

const escape = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const statusText = { source_program_mapping_collected: "Đã thu bảng ngành theo phương thức", current_policy_collected: "Đã thu chính sách hiện hành — chưa có đề án riêng ghi năm 2026", partial_program_mapping: "Còn thiếu / mâu thuẫn phạm vi ngành", missing_2026_evidence: "Chưa đủ nguồn năm 2026", university_system: "Hệ thống đại học — xem các trường thành viên", specialized_or_postgraduate: "Đào tạo đặc thù / sau đại học" };
const overview = ["# Rà soát phương thức xét tuyển 2026", "", `Ngày tra cứu: ${notes.checkedAt}. Phạm vi: toàn bộ ${summary.schools} hồ sơ hiện có.`, "", `Đã đọc ${summary.sourcePages} trang đề án trên TuyểnSinh247 và đối chiếu bổ sung tài liệu trường. Thu được ${summary.methods} mục phương thức / biến thể và ${summary.programMethodRows} dòng ngành–phương thức.`, "", "Đây là tài liệu nghiên cứu, chưa nạp vào dữ liệu phục vụ website. Trạng thái ‘đã thu’ chỉ xác nhận đã lấy được bảng ngành từ nguồn; không phải chứng nhận mọi điều kiện đã được kiểm chứng độc lập hoặc mọi đề án đã đầy đủ. Không lấy phương thức năm cũ để điền năm 2026, không tự gán mọi ngành cho mọi phương thức.", "", "## Kết quả theo trạng thái", "", ...Object.entries(counts).map(([key, count]) => `- ${statusText[key]}: **${count} hồ sơ**.`), "", "## Hồ sơ còn thiếu nguồn hoặc phạm vi ngành", "", "| Mã | Trường | Tình trạng / thông tin còn thiếu |", "|---|---|---|"];
for (const school of schools.filter((s) => ["partial_program_mapping", "missing_2026_evidence"].includes(s.status))) {
  const missing = school.methods.filter((m) => !m.programs.length || m.disputed).map((m) => `${m.label} (${m.id})${m.disputed ? " — mâu thuẫn nguồn" : " — thiếu bảng ngành"}`);
  overview.push(`| ${school.code} | [${escape(school.name)}](phuong-thuc-xet-tuyen-2026.md#school-${school.code}) | ${escape([...missing, ...school.issues].join("; "))} |`);
}
overview.push("", "## Chính sách hiện hành và lưu ý đối chiếu", "", "| Mã | Trường | Ghi chú |", "|---|---|---|");
for (const school of schools.filter((s) => !["partial_program_mapping", "missing_2026_evidence"].includes(s.status) && (s.status !== "source_program_mapping_collected" || s.issues.some((issue) => !issue.startsWith("Chỉ lấy"))))) {
  overview.push(`| ${school.code} | [${escape(school.name)}](phuong-thuc-xet-tuyen-2026.md#school-${school.code}) | ${escape([statusText[school.status], ...school.issues].join("; "))} |`);
}
overview.push("", "## Đọc và tái tạo kết quả", "", "- Chi tiết từng trường: [phuong-thuc-xet-tuyen-2026.md](phuong-thuc-xet-tuyen-2026.md).", "- Dữ liệu có cấu trúc: `data/research/admission-methods-2026.json`.", "- Đối chiếu thủ công: `data/research/admission-methods-2026-notes.json`.", "- Thu trang nguồn: `node scripts/research-admission-methods-2026.mjs` (cache tại `tmp/admissions-plans-2026`); thêm `--refresh` để tải lại các trang thay vì dùng cache.", "- Tạo tài liệu: `node scripts/build-admission-research-2026.mjs`.", "", "Mã phương thức của TuyểnSinh247 là mã nội bộ, không dùng như mã phương thức Bộ GDĐT. Mã ngành, chuyên ngành, nhóm và phân hiệu được giữ riêng theo nguồn. Chỉ tiêu có thể là tổng chương trình, không cộng các dòng lặp ở nhiều phương thức. Chứng chỉ được nhắc trong điều kiện không tự động được coi là một phương thức độc lập. Các PDF được gắn năm 2026 nhưng có mốc ngày khác được ghi chú khi phát hiện. Bản thu thập lưu nguyên nhãn khi chưa có căn cứ sửa.");
await fs.writeFile("docs/research/ra-soat-phuong-thuc-2026.md", overview.join("\n") + "\n");

const detail = ["# Phương thức xét tuyển 2026 của các trường trong hồ sơ", "", `Tra cứu ${notes.checkedAt}. Đọc [báo cáo phạm vi và phần còn thiếu](ra-soat-phuong-thuc-2026.md) trước khi sử dụng.`, "", "Bảng ghi phạm vi ngành theo nguồn. Danh mục ứng viên chưa đủ ma trận được cảnh báo ngay tại phương thức tương ứng. Tuyển thẳng còn phụ thuộc giải thưởng, môn thi, đối tượng và quy định của trường; việc một ngành xuất hiện trong bảng không có nghĩa mọi thí sinh được tuyển thẳng. Ô trống là nguồn chưa có thông tin, không phải mức 0. Một số hồ sơ là hệ thống đại học hoặc đào tạo đặc thù, không có đề án tuyển mới từ THPT riêng."];
detail.push("", "## Mục lục", "", ...schools.map((school) => `- [${school.code} — ${school.name}](#school-${school.code})`));
for (const school of schools) {
  detail.push("", `<a id="school-${school.code}"></a>`, "", `## ${school.code} — ${school.name}`, "", `**Tình trạng:** ${statusText[school.status]}.`, "");
  school.sources.forEach((s, i) => detail.push(`- [Nguồn ${i + 1} (${s.type})](${s.url})`));
  school.documents.forEach((url, i) => detail.push(`- [Tài liệu 2026 đính kèm ${i + 1}](${url})`));
  if (school.issues.length) detail.push("", ...school.issues.map((issue) => `> ${issue}`));
  for (const method of school.methods) {
    detail.push("", `### ${method.label}`, "", `ID đối chiếu: ${method.id}; mã nguồn: ${method.methodCode || "không ghi"} (${method.codeNamespace}).`, "");
    if (method.sourceUrl) detail.push(`[Đọc quy định gốc](${method.sourceUrl}${method.sourceSectionId ? `#${method.sourceSectionId}` : ""})`, "");
    if (method.requirements.length) detail.push(...method.requirements.map((line) => `- ${line}`), "");
    if (method.availableSourceSections.length) detail.push(`Nguồn có các mục: ${method.availableSourceSections.join("; ")}.`, "");
    if (method.examsAndCertificatesMentioned.length) detail.push(`Bài thi / chứng chỉ được nhắc trong điều kiện: ${method.examsAndCertificatesMentioned.join(", ")}.`, "");
    if (method.issues.length) detail.push(...method.issues.map((issue) => `> ${issue}`), "");
    if (method.disputed) detail.push("**Có mâu thuẫn giữa các nguồn; chưa xác nhận phương thức/phạm vi ngành này.**", "");
    if (/candidate_catalog/.test(method.scopeStatus)) detail.push("**Danh mục ngành đang dùng để đối chiếu; nguồn chưa có ma trận đủ để xác nhận từng ngành.**", "");
    if (!method.programs.length) { detail.push("**Chưa xác nhận được bảng ngành áp dụng. Không tự gán các ngành của phương thức khác.**"); continue; }
    detail.push("| Mã ngành / chương trình | Tên ngành / chuyên ngành | Nhóm / cơ sở | Tổ hợp nguồn ghi | Chỉ tiêu nguồn ghi | Ghi chú |", "|---|---|---|---|---|---|");
    for (const p of method.programs) detail.push(`| ${escape(p.displayCode || p.code)} | ${p.sourceUrl ? `[${escape(p.name)}](${p.sourceUrl})` : escape(p.name)} | ${escape(p.group)} | ${escape(p.combinations)} | ${escape(p.quota)} | ${escape(p.note)} |`);
  }
}
await fs.writeFile("docs/research/phuong-thuc-xet-tuyen-2026.md", detail.join("\n") + "\n");
console.log(JSON.stringify(summary, null, 2));
