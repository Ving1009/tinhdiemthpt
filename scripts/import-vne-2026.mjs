import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shouldWrite = process.argv.includes("--write");
const cacheDir = join(root, "data", ".vne-cache-2026");
const universities = JSON.parse(await readFile(join(root, "data", "universities.json"), "utf8"));
const currentMajors = JSON.parse(await readFile(join(root, "data", "majors.json"), "utf8"));
const combinations = JSON.parse(await readFile(join(root, "data", "combinations.json"), "utf8"));
const vneMapping = JSON.parse(await readFile(join(root, "scripts", "vne-mapping.json"), "utf8"));

const SOURCE_NAME = "VnExpress";
const CHECKED_AT = "2026-09-04";
const VNE_CODE_ALIASES = { TMU: "TMA", UFA: "DKQ" };

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function decodeHtml(value, preserveBreaks = false) {
  let text = String(value ?? "");
  if (preserveBreaks) text = text.replace(/<br\s*\/?\s*>/gi, "; ").replace(/<\/p>/gi, "; ");
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseScore(value) {
  let text = clean(value).replace(/\s/g, "");
  if (/^[1-9]\.\d{3}$/.test(text)) text = text.replace(".", "");
  else text = text.replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const score = Number(text);
  return Number.isFinite(score) && score > 0 && score <= 1600 ? score : null;
}

function methodFromLabel(label) {
  const key = normalize(label);
  if (key.includes("hoc ba") && (key.includes("chung chi") || key.includes("ccnn"))) return "Xét tuyển kết hợp";
  if (key.includes("hoc ba")) return "Học bạ";
  if (key.includes("hsa")) return "ĐGNL HSA";
  if (key.includes("v act") || key.includes("apt") || key.includes("dgnl hcm")) return "ĐGNL V-ACT";
  if (key.includes("spt")) return "ĐGNL SPT";
  if (key.includes("tsa") || key.includes("dgtd")) return "ĐGTD TSA";
  if (key.includes("v sat")) return "V-SAT";
  if (key.includes("sat") || key.includes("act") || key.includes("a level") || key.includes("ib") || key.includes("ccqt")) return "Chứng chỉ quốc tế";
  if (key.includes("xttn") || key.includes("ket hop")) return "Xét tuyển kết hợp";
  if (key.includes("nang khieu") || key.includes("thi rieng")) return "Thi riêng";
  return "Phương thức khác";
}

function methodSlug(method) {
  return normalize(method).replaceAll(" ", "-") || "khac";
}

function scaleFor(method, score) {
  if (score <= 30) return 30;
  const key = normalize(method);
  if (key.includes("hsa") || key.includes("spt")) return 150;
  if (key.includes("v act")) return 1200;
  if (key.includes("tsa")) return 100;
  if (key.includes("v sat")) return 450;
  if (key.includes("chung chi")) return score <= 36 ? 36 : 1600;
  if (score <= 40) return 40;
  if (score <= 100) return 100;
  if (score <= 150) return 150;
  if (score <= 450) return 450;
  if (score <= 1200) return 1200;
  return 1600;
}

function formulaText(method) {
  if (method === "THPT") return "Tổng điểm các môn trong tổ hợp xét tuyển + điểm ưu tiên (nếu có), theo quy định của trường.";
  if (method === "Học bạ") return "Tổng điểm học tập của các môn/thành phần được trường quy định + điểm ưu tiên (nếu có).";
  if (method.startsWith("ĐGNL") || method === "ĐGTD TSA" || method === "V-SAT") return `Điểm bài thi ${method} theo ngưỡng hoặc bảng quy đổi do trường công bố.`;
  return "Tổng điểm hoặc điểm quy đổi của các thành phần theo phương thức tuyển sinh do trường công bố.";
}

const subjectByCombination = new Map(combinations.filter((item) => item.code).map((item) => [item.code.toUpperCase(), item.subjectIds || []]));
function subjectsFor(value) {
  for (const code of clean(value).toUpperCase().split(/[;,/|\s]+/).filter(Boolean)) {
    if (subjectByCombination.has(code)) return subjectByCombination.get(code);
  }
  return [];
}

function parseVne(html) {
  const rows = [];
  for (const tr of html.split('<tr class="university__benchmark').slice(1)) {
    const nameMatch = tr.match(/<strong><a[^>]*>([\s\S]*?)<\/a><\/strong>/i);
    const codeMatch = tr.match(/<span\s+style="display:\s*block;?">([\s\S]*?)<\/span>/i);
    const cells = tr.match(/<td[\s\S]*?<\/td>/gi) || [];
    if (!nameMatch || cells.length < 4) continue;
    const name = decodeHtml(nameMatch[1]);
    const code = decodeHtml(codeMatch?.[1] || "") || "Chưa công bố trên nguồn";
    const combination = decodeHtml(cells[1]);
    const thptScore = parseScore(decodeHtml(cells[2]));
    if (name && thptScore != null) rows.push({ name, code, combination, method: "THPT", methodLabel: "Điểm thi tốt nghiệp THPT", score: thptScore });

    const otherText = decodeHtml(cells[3], true);
    if (!otherText || /điểm chuẩn đã quy đổi/i.test(otherText)) continue;
    for (const segment of otherText.split(/\s*;\s*/).filter(Boolean)) {
      const match = segment.match(/^(.+?):\s*([\d.,]+)$/);
      if (!match) continue;
      const score = parseScore(match[2]);
      if (score == null) continue;
      rows.push({ name, code, combination, method: methodFromLabel(match[1]), methodLabel: clean(match[1]), score });
    }
  }
  return [...new Map(rows.map((row) => [[normalize(row.code), normalize(row.name), normalize(row.combination), normalize(row.methodLabel), row.score].join("|"), row])).values()];
}

const universitiesByCode = new Map(universities.map((university) => [university.code.toUpperCase(), university]));
const mappingByCode = new Map((vneMapping.matched || []).map((item) => [item.uni.code.toUpperCase(), item]));
const hasPublished2026 = new Set(currentMajors.filter((major) => major.sourceName !== SOURCE_NAME && ["verified", "reference"].includes(major.cutoff?.status) && major.cutoff?.year === 2026).map((major) => major.universityId));
const imported = [];
const importedUniversityIds = new Set();
const perUniversity = [];
const rejectedMappings = [];
let rejectedInconsistentCutoffs = 0;

for (const filename of await readdir(cacheDir)) {
  if (!filename.endsWith(".json")) continue;
  const code = filename.slice(0, -5).toUpperCase();
  const university = universitiesByCode.get(code);
  if (!university || hasPublished2026.has(university.id)) continue;
  const mapping = mappingByCode.get(code);
  const expectedVneCode = VNE_CODE_ALIASES[code] || code;
  const mappedVneCode = clean(mapping?.vne?.code || mapping?.vne?.text?.match(/^(\S+)/)?.[1]).toUpperCase();
  if (!mappedVneCode || mappedVneCode !== expectedVneCode) {
    rejectedMappings.push({ code, university: university.name, matchedVneCode: mappedVneCode, matchedVneName: mapping?.vne?.name || "" });
    continue;
  }
  const cached = JSON.parse(await readFile(join(cacheDir, filename), "utf8"));
  const rows = parseVne(cached.html || "");
  if (!rows.length || !cached.vneId) continue;
  const sourceUrl = `https://diemthi.vnexpress.net/tra-cuu-dai-hoc/${cached.vneId}`;
  importedUniversityIds.add(university.id);
  perUniversity.push({ universityId: university.id, code: university.code, rows: rows.length });
  rows.forEach((row, index) => {
    const formula = `${university.code.toLowerCase()}-${methodSlug(row.method)}-2026`;
    const scale = scaleFor(row.method, row.score);
    const publishCutoff = row.score <= scale;
    if (!publishCutoff) rejectedInconsistentCutoffs += 1;
    imported.push({
      id: `${university.id}-vne-${index + 1}`,
      universityId: university.id,
      code: row.code,
      ...(/^\d{7}$/.test(row.code) ? { nationalMajorCode: row.code } : {}),
      name: row.name,
      combination: row.combination,
      combinationStatus: row.combination ? "reference" : "not_provided",
      subjects: subjectsFor(row.combination),
      method: row.method,
      methodDetails: row.methodLabel,
      formula,
      formulaText: formulaText(row.method),
      formulaSourceUrl: sourceUrl,
      calculationVerified: false,
      dataStatus: "reference",
      sourceName: SOURCE_NAME,
      sourceUrl,
      cutoff: {
        year: 2026,
        score: publishCutoff ? row.score : null,
        scale,
        scaleStatus: "inferred_from_method",
        method: row.methodLabel,
        status: publishCutoff ? "reference" : "unverified",
        sourceName: SOURCE_NAME,
        sourceUrl,
        ...(publishCutoff ? {} : { note: `Không hiển thị số ${row.score} vì vượt thang ${scale} suy ra từ phương thức ${row.method}.` })
      }
    });
  });
}

const retained = currentMajors.filter((major) => !importedUniversityIds.has(major.universityId) || major.dataStatus === "verified" || major.cutoff?.status === "verified");
const majors = [...retained, ...imported];

for (const university of universities) {
  if (!importedUniversityIds.has(university.id)) continue;
  const rows = imported.filter((major) => major.universityId === university.id);
  const sourceUrl = rows[0].sourceUrl;
  const methods = [...new Set(rows.map((major) => major.method))];
  university.methods = [...new Set([...(university.methods || []), ...methods])];
  university.formulas = [...new Set([...(university.formulas || []), ...rows.map((major) => major.formula)])];
  const admissions = university.admissions || {};
  admissions.methods = [...new Set([...(admissions.methods || []), ...methods])];
  admissions.referenceSources = [...(admissions.referenceSources || []).filter((source) => source.name !== SOURCE_NAME), { name: SOURCE_NAME, url: sourceUrl, checkedAt: CHECKED_AT, has2026Data: true }];
  admissions.referenceNote = "Đã bổ sung điểm chuẩn năm 2026 từ nguồn tham khảo VnExpress; nên đối chiếu lại thông báo chính thức của trường.";
  if (admissions.status === "updating") admissions.status = "reference_2026";
  university.admissions = admissions;
  university.dataCheckedAt = CHECKED_AT;
}

const report = {
  source: SOURCE_NAME,
  sourceCacheCheckedAt: CHECKED_AT,
  targetUniversitiesWithoutPublished2026: universities.filter((university) => !hasPublished2026.has(university.id)).length,
  importedUniversities: importedUniversityIds.size,
  importedReferenceRows: imported.length,
  rejectedInconsistentCutoffs,
  rejectedAmbiguousMappings: rejectedMappings.length,
  replacedPendingRows: currentMajors.filter((major) => importedUniversityIds.has(major.universityId) && major.dataStatus !== "verified" && major.cutoff?.status !== "verified").length,
  totalMajorsAfterImport: majors.length,
  rejectedMappings,
  perUniversity: perUniversity.sort((a, b) => b.rows - a.rows)
};

if (shouldWrite) {
  await Promise.all([
    writeFile(join(root, "data", "majors.json"), `${JSON.stringify(majors, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "universities.json"), `${JSON.stringify(universities, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "vne-import-report-2026.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  ]);
}

console.log(JSON.stringify({ mode: shouldWrite ? "write" : "audit", ...report }, null, 2));
