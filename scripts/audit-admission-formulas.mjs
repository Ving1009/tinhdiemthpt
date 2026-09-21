import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateAdmissionFormulaData } from "../lib/admissionFormulaData.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const loadJson = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"));
const normalize = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .replace(/Đ/g, "D")
  .toLocaleLowerCase("vi")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function parseDocument(markdown) {
  const headings = [...markdown.matchAll(/^# \[([^\]]+)\] [–—-] (.+)$/gm)];
  const schools = headings.map((heading, index) => {
    const body = markdown.slice(heading.index, headings[index + 1]?.index ?? markdown.length);
    const methodMatches = [...body.matchAll(/^## Phương thức [–—-] (.+)$/gm)];
    const methods = methodMatches.map((method, methodIndex) => {
      const methodBody = body.slice(method.index, methodMatches[methodIndex + 1]?.index ?? body.length);
      const status = methodBody.match(/^### Trạng thái\r?\n\r?\n([^\r\n]+)/m)?.[1]?.trim() || "";
      const formula = methodBody.match(/^### Công thức\r?\n\r?\n([\s\S]*?)(?=^### )/m)?.[1]?.trim() || "";
      const fencedExpression = formula.match(/```(?:text)?\s*\r?\n([\s\S]*?)```/)?.[1]?.trim() || "";
      return {
        label: method[1].trim(),
        status,
        formula,
        hasDirectNumericExpression: /^Chính thức/.test(status) && fencedExpression.includes("="),
        fencedExpression
      };
    });
    const table = body.match(/^## Danh sách ngành\r?\n([\s\S]*?)(?=^---$)/m)?.[1] || "";
    const tableLines = table.split(/\r?\n/).filter((line) => /^\|/.test(line.trim()));
    return {
      code: heading[1].trim(),
      name: heading[2].trim(),
      status: body.match(/\*\*Trạng thái dữ liệu:\*\* ([^\r\n]+)/)?.[1]?.trim() || "",
      majorRows: Math.max(0, tableLines.length - 2),
      methods
    };
  });

  const firstSchoolOffset = headings[0]?.index ?? markdown.length;
  const toc = markdown.slice(0, firstSchoolOffset);
  const tocTargets = [...toc.matchAll(/^\d+\. \[[^\]]+\]\(#([^)]+)\)$/gm)].map((match) => match[1]);
  const anchors = [...markdown.matchAll(/^<a id=([^ >]+)><\/a>$/gm)].map((match) => match[1]);
  const duplicateValues = (items) => {
    const counts = new Map();
    for (const item of items) counts.set(item, (counts.get(item) || 0) + 1);
    return [...counts].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
  };

  return {
    schools,
    markdown: {
      tocEntries: tocTargets.length,
      anchors: anchors.length,
      missingAnchorTargets: [...new Set(tocTargets.filter((target) => !anchors.includes(target)))],
      orphanAnchors: [...new Set(anchors.filter((anchor) => !tocTargets.includes(anchor)))],
      duplicateTocTargets: duplicateValues(tocTargets),
      duplicateAnchors: duplicateValues(anchors),
      fencedBlocksBalanced: (markdown.match(/^```/gm) || []).length % 2 === 0
    }
  };
}

function duplicateFormulaSummary(schools) {
  const formulas = new Map();
  for (const school of schools) {
    for (const method of school.methods) {
      const fingerprint = method.formula.replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
      if (!fingerprint) continue;
      const occurrences = formulas.get(fingerprint) || [];
      occurrences.push({ schoolCode: school.code, method: method.label, official: /^Chính thức/.test(method.status) });
      formulas.set(fingerprint, occurrences);
    }
  }
  const groups = [...formulas.values()].filter((items) => items.length > 1);
  return {
    duplicateGroups: groups.length,
    entriesInDuplicateGroups: groups.reduce((total, items) => total + items.length, 0),
    officialDuplicateGroups: groups.filter((items) => items.every((item) => item.official)).length
  };
}

const [markdown, universities, majors, formulaData] = await Promise.all([
  readFile(`${ROOT}công thức thpt2.md`, "utf8"),
  loadJson("universities.json"),
  loadJson("majors.json"),
  loadJson("admission-formulas-2026.json")
]);

const parsed = parseDocument(markdown);
const universityByCode = new Map(universities.map((item) => [item.code, item]));
const majorsByUniversity = new Map();
for (const major of majors) {
  const rows = majorsByUniversity.get(major.universityId) || [];
  rows.push(major);
  majorsByUniversity.set(major.universityId, rows);
}

const documentCodes = parsed.schools.map((school) => school.code);
const mapped = parsed.schools.filter((school) => universityByCode.has(school.code));
const nameMismatches = mapped
  .filter((school) => normalize(school.name) !== normalize(universityByCode.get(school.code).name))
  .map((school) => ({ code: school.code, documentName: school.name, repositoryName: universityByCode.get(school.code).name }));

const extraMethodSections = [];
const missingMethodSections = [];
let repositorySchoolMethodPairs = 0;
for (const school of mapped) {
  const university = universityByCode.get(school.code);
  const repositoryMethods = new Set([
    ...(university.methods || []),
    ...(majorsByUniversity.get(university.id) || []).map((major) => major.method)
  ].filter(Boolean));
  const documentMethods = new Set(school.methods.map((method) => method.label));
  repositorySchoolMethodPairs += repositoryMethods.size;
  for (const method of documentMethods) if (!repositoryMethods.has(method)) extraMethodSections.push({ schoolCode: school.code, method });
  for (const method of repositoryMethods) if (!documentMethods.has(method)) missingMethodSections.push({ schoolCode: school.code, method });
}

const integratedKeys = new Set(formulaData.schools.flatMap((school) => school.methods.map((method) => `${school.schoolCode}|${method.repositoryMethods[0]}`)));
const directNumericCandidates = parsed.schools.flatMap((school) => school.methods
  .filter((method) => method.hasDirectNumericExpression)
  .map((method) => ({ schoolCode: school.code, method: method.label, status: method.status })));
const excludedOfficialNumericCandidates = directNumericCandidates.filter((item) => !integratedKeys.has(`${item.schoolCode}|${item.method}`));
const integrationWithoutDirectExpression = [...integratedKeys].filter((key) => !directNumericCandidates.some((item) => `${item.schoolCode}|${item.method}` === key));
const schoolStatusCounts = Object.fromEntries([...new Set(parsed.schools.map((school) => school.status))]
  .sort((a, b) => a.localeCompare(b, "vi"))
  .map((status) => [status, parsed.schools.filter((school) => school.status === status).length]));
const formulaValidation = validateAdmissionFormulaData(formulaData, { universities, majors });
const duplicateFormulas = duplicateFormulaSummary(parsed.schools);
const integratedMethodCount = formulaValidation.stats.verifiedSchoolMethods;

const report = {
  generatedAt: new Date().toISOString(),
  sourceDocument: "công thức thpt2.md",
  repository: {
    universities: universities.length,
    uniqueUniversityCodes: new Set(universities.map((item) => item.code)).size,
    majorRows: majors.length,
    uniqueMajorIds: new Set(majors.map((item) => item.id)).size,
    schoolMethodPairs: repositorySchoolMethodPairs
  },
  document: {
    schoolSections: parsed.schools.length,
    mappedSchools: mapped.length,
    unmappedSchoolCodes: documentCodes.filter((code) => !universityByCode.has(code)),
    duplicateSchoolCodes: [...new Set(documentCodes.filter((code, index) => documentCodes.indexOf(code) !== index))],
    nameMismatches,
    majorRowsInTables: parsed.schools.reduce((total, school) => total + school.majorRows, 0),
    methodSections: parsed.schools.reduce((total, school) => total + school.methods.length, 0),
    missingMethodSections,
    extraMethodSections,
    officialSourceSchoolSections: parsed.schools.filter((school) => /^Chính thức/.test(school.status)).length,
    schoolStatusCounts,
    markdown: parsed.markdown,
    duplicateFormulas
  },
  integration: {
    mappedSchoolsWithPublishedFormulas: formulaValidation.stats.mappedSchools,
    verifiedSchoolMethodFormulas: integratedMethodCount,
    applicableMajorRows: formulaValidation.stats.applicableMajorRows,
    skippedRepositorySchoolMethodPairs: repositorySchoolMethodPairs - integratedMethodCount,
    sourceCheckedMethods: formulaData.schools.reduce((total, school) => total + school.methods.filter((method) => method.source?.verifiedAt === formulaData.verifiedAt).length, 0),
    directNumericCandidatesInDocument: directNumericCandidates.length,
    excludedOfficialNumericCandidates,
    integrationWithoutDirectExpression,
    validation: formulaValidation
  }
};

const criticalErrors = [
  ...(formulaValidation.errors || []),
  ...(report.document.unmappedSchoolCodes.length ? ["Có mã trường trong tài liệu không ánh xạ được."] : []),
  ...(report.document.duplicateSchoolCodes.length ? ["Có mã trường trùng trong tài liệu."] : []),
  ...(report.document.missingMethodSections.length ? ["Tài liệu thiếu cặp trường–phương thức từ repository."] : []),
  ...(report.integration.integrationWithoutDirectExpression.length ? ["Có công thức tích hợp không có biểu thức trực tiếp trong tài liệu."] : []),
  ...(!report.document.markdown.fencedBlocksBalanced ? ["Khối mã Markdown không cân bằng."] : []),
  ...(report.document.markdown.missingAnchorTargets.length ? ["Mục lục có anchor bị gãy."] : [])
];

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ...report, valid: criticalErrors.length === 0, criticalErrors }, null, 2));
} else {
  console.log(`Trường: ${report.document.mappedSchools}/${report.repository.universities} ánh xạ bằng mã chính xác.`);
  console.log(`Ngành: ${report.document.majorRowsInTables}/${report.repository.majorRows} dòng xuất hiện trong bảng.`);
  console.log(`Phương thức: ${report.repository.schoolMethodPairs} cặp chuẩn hóa; ${report.document.methodSections} mục tài liệu.`);
  console.log(`Tích hợp: ${report.integration.verifiedSchoolMethodFormulas} công thức của ${report.integration.mappedSchoolsWithPublishedFormulas} trường; bỏ qua ${report.integration.skippedRepositorySchoolMethodPairs} cặp chưa đủ căn cứ.`);
  console.log(`Nguồn chính thức đã kiểm tra lại: ${report.integration.sourceCheckedMethods}/${report.integration.verifiedSchoolMethodFormulas}.`);
  console.log(`Ứng viên mang nhãn chính thức nhưng bị loại do không được nguồn nêu trực tiếp: ${report.integration.excludedOfficialNumericCandidates.length}.`);
  console.log(`Anchor lỗi: ${report.document.markdown.missingAnchorTargets.length}; nhóm công thức chính thức trùng bất thường: ${report.document.duplicateFormulas.officialDuplicateGroups}.`);
  if (report.document.extraMethodSections.length) console.log(`Mục phương thức ngoài ${report.repository.schoolMethodPairs} cặp chuẩn hóa: ${report.document.extraMethodSections.map((item) => `${item.schoolCode}–${item.method}`).join("; ")}.`);
  if (criticalErrors.length) console.error(criticalErrors.join("\n"));
}

if (criticalErrors.length) process.exitCode = 1;
