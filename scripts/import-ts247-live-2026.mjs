import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shouldWrite = process.argv.includes("--write");
const capture = JSON.parse(await readFile(join(root, "data", "ts247-live-2026.json"), "utf8"));
const universities = JSON.parse(await readFile(join(root, "data", "universities.json"), "utf8"));
const currentMajors = JSON.parse(await readFile(join(root, "data", "majors.json"), "utf8"));
const combinations = JSON.parse(await readFile(join(root, "data", "combinations.json"), "utf8"));

const SOURCE_NAME = "TuyểnSinh247";
const CHECKED_AT = "2026-09-10";
const CODE_ALIASES = { UTH: "GTS", QSA: "TAG" };

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function pageCode(url) {
  return clean(url).match(/-([A-Z0-9]+)\.html(?:\?.*)?$/)?.[1]?.toUpperCase() || "";
}

function parseScore(value) {
  const normalized = clean(value).replace(/\./g, (match, offset, input) => input.includes(",") ? "" : match).replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
}

const universitiesByCode = new Map(universities.map((university) => [university.code.toUpperCase(), university]));
const universitiesByShortName = new Map();
for (const university of universities) {
  const key = clean(university.shortName).toUpperCase();
  if (key && !universitiesByShortName.has(key)) universitiesByShortName.set(key, university);
}

function resolveUniversity(url) {
  const raw = pageCode(url);
  const code = CODE_ALIASES[raw] || raw;
  return universitiesByCode.get(code) || universitiesByShortName.get(raw) || null;
}

function methodFromAlias(alias, displayName = "") {
  const key = clean(alias).toLowerCase();
  if (key === "diem-thi-thpt") return "THPT";
  if (["diem-thi-hoc-ba", "diem-hoc-ba"].includes(key)) return "Học bạ";
  if (key === "diem-thi-dgnl-hn") return "ĐGNL HSA";
  if (["diem-thi-dgnl-hcm", "diem-thi-dgnl-qg-hcm"].includes(key)) return "ĐGNL V-ACT";
  if (key === "diem-thi-dgnl-dh-su-pham-hn") return "ĐGNL SPT";
  if (key === "dgnl-bo-quoc-phong") return "ĐGNL QDA";
  if (["diem-thi-dgtd", "diem-dg-tu-duy-dhbkhn"].includes(key)) return "ĐGTD TSA";
  if (key === "diem-thi-danh-gia-dau-vao-v-sat") return "V-SAT";
  if (key === "xet-tuyen-ket-hop") return "Xét tuyển kết hợp";
  if (key === "chung-chi-quoc-te") return "Chứng chỉ quốc tế";
  if (key === "uu-tien-xet-tuyen-xet-tuyen-thang") return "ƯTXT / xét tuyển thẳng";
  if (key === "diem-thi-rieng") return "Thi riêng";
  const value = normalize(displayName);
  if (value.includes("thpt")) return "THPT";
  if (value.includes("hoc ba")) return "Học bạ";
  if (value.includes("hsa")) return "ĐGNL HSA";
  if (value.includes("v act")) return "ĐGNL V-ACT";
  if (value.includes("spt")) return "ĐGNL SPT";
  if (value.includes("qda")) return "ĐGNL QDA";
  if (value.includes("tsa")) return "ĐGTD TSA";
  if (value.includes("v sat")) return "V-SAT";
  if (value.includes("ket hop")) return "Xét tuyển kết hợp";
  if (value.includes("chung chi")) return "Chứng chỉ quốc tế";
  return clean(displayName) || "Phương thức khác";
}

function methodForRow(row) {
  const note = normalize(row.introtext);
  const score = parseScore(row.mark) || 0;
  if (note.includes("sang v act") && score > 150) return "ĐGNL V-ACT";
  if (note.includes("sang hsa") && score > 30) return "ĐGNL HSA";
  if (note.includes("sang qda") && score > 30) return "ĐGNL QDA";
  return methodFromAlias(row.admission_alias, row.admission_name);
}

function methodSlug(method) {
  const key = normalize(method);
  if (key === "thpt") return "thpt";
  if (key.includes("hoc ba")) return "hocba";
  if (key.includes("hsa")) return "dgnl-hsa";
  if (key.includes("v act")) return "dgnl-vact";
  if (key.includes("spt")) return "dgnl-spt";
  if (key.includes("qda")) return "dgnl-qda";
  if (key.includes("tsa")) return "dgt-tsa";
  if (key.includes("v sat")) return "vsat";
  if (key.includes("ket hop")) return "ket-hop";
  if (key.includes("chung chi")) return "sat";
  if (key.includes("thang")) return "xet-thang";
  if (key.includes("thi rieng")) return "thi-rieng";
  return key.replaceAll(" ", "-") || "khac";
}

function scaleFor(method, score, explicitScale = null) {
  if (Number.isFinite(explicitScale) && explicitScale >= score) return explicitScale;
  if (score <= 30) return 30;
  const key = normalize(method);
  if (key.includes("hsa")) return 150;
  if (key.includes("v act")) return 1200;
  if (key.includes("qda")) return 150;
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

function pendingScaleFor(method) {
  const key = normalize(method);
  if (key.includes("hsa") || key.includes("qda")) return 150;
  if (key.includes("v act")) return 1200;
  if (key.includes("tsa")) return 100;
  if (key.includes("v sat")) return 450;
  if (key.includes("chung chi")) return 1600;
  return 30;
}

function formulaText(row, method) {
  const raw = clean(row.formula)
    .replaceAll("MON_1", "Môn 1").replaceAll("MON_2", "Môn 2").replaceAll("MON_3", "Môn 3")
    .replaceAll("UT", "điểm ưu tiên").replaceAll("KK", "điểm khuyến khích");
  if (raw && !raw.includes("�")) return raw;
  if (method === "THPT" || method === "Học bạ") return "Tổng điểm các môn/thành phần xét tuyển + điểm ưu tiên (nếu có).";
  if (method.startsWith("ĐGNL") || method === "ĐGTD TSA" || method === "V-SAT") return `Điểm ${method.replace(/^ĐGNL /, "bài thi ")} theo ngưỡng hoặc bảng quy đổi mà trường công bố.`;
  return "Tổng điểm các thành phần theo phương thức + điểm ưu tiên (nếu có).";
}

const subjectByCombination = new Map(combinations.filter((item) => item.code).map((item) => [item.code.toUpperCase(), item.subjectIds || []]));
function subjectsFor(block) {
  for (const code of clean(block).toUpperCase().split(/[;,/|\s]+/).filter(Boolean)) {
    if (subjectByCombination.has(code)) return subjectByCombination.get(code);
  }
  return [];
}

function pseudoRow({ code = "Chưa công bố trên nguồn", name, block = "", mark, method, detail = "", formula = "", explicitScale = null }) {
  return { code, name, block, mark, admission_alias: "", admission_name: method, introtext: detail, formula, explicitScale };
}

function parseSpecialTables(page) {
  const code = pageCode(page.url);
  const rows = [];
  const add = (value) => { if (value?.name && parseScore(value.mark) != null) rows.push(value); };
  for (const [tableIndex, table] of page.tables.entries()) {
    const [header, second, ...rest] = table.rows;
    const headerText = normalize(header.join(" "));
    const dataRows = /^diem (thpt|hoc ba)/.test(normalize(second?.[0])) ? rest : table.rows.slice(1);

    if (headerText.includes("truong ten nganh to hop xet tuyen khu vuc nam nu")) {
      for (const row of dataRows) for (const [gender, index] of [["Nam", 5], ["Nữ", 6]]) {
        add(pseudoRow({ name: `${clean(row[2])} (${clean(row[4])}, ${gender})`, block: row[3], mark: row[index], method: "Xét tuyển kết hợp", detail: `Thí sinh ${gender}, ${clean(row[4])}; mã đơn vị ${clean(row[1])}.` }));
      }
      continue;
    }
    if (code === "DTS") {
      for (const row of dataRows) {
        const match = clean(row[1]).match(/^(.*?)\s+Mã:\s*([A-Z0-9]+)(.*)$/i);
        if (match) add(pseudoRow({ code: match[2], name: match[1], block: row[2], mark: row[3], method: "THPT", detail: match[3] }));
      }
      continue;
    }
    if (code === "GTA") {
      const methods = [[2, "THPT"], [3, "Học bạ"], [4, "ĐGTD TSA"], [5, "ĐGNL HSA"], [6, "ĐGNL SPT"]];
      for (const row of dataRows) for (const [index, method] of methods) add(pseudoRow({ code: row[0], name: row[1], mark: row[index], method }));
      continue;
    }
    if (code === "HVQ") {
      for (const row of dataRows) add(pseudoRow({ code: row[0], name: row[1], mark: row[3], method: "THPT" }));
      continue;
    }
    if (code === "TTD") {
      for (const row of dataRows) {
        const match = clean(row[1]).match(/^(.*?)\s*\(([^)]+)\)$/);
        add(pseudoRow({ code: match?.[2], name: match?.[1] || row[1], mark: row[2], method: "Các phương thức quy đổi", detail: row[4], explicitScale: parseScore(row[3]) }));
      }
      continue;
    }
    if (code === "SNH") {
      for (const row of dataRows) add(pseudoRow({ name: row[1], mark: row[3], method: "Xét tuyển kết hợp", detail: row[6] }));
      continue;
    }
    if (code === "HCA" && headerText.includes("ma xet tuyen")) {
      for (const row of dataRows) add(pseudoRow({ code: row[1], name: row[2], mark: row[3], method: "THPT" }));
      continue;
    }
    if (code === "DKC") {
      const methods = [[3, "THPT"], [4, "Học bạ"], [5, "V-SAT"], [6, "ĐGNL V-ACT"]];
      for (const row of dataRows) for (const [index, method] of methods) add(pseudoRow({ code: row[2], name: row[1], mark: row[index], method }));
      continue;
    }
    if (code === "DQT") {
      const methods = [[4, "Học bạ"], [5, "THPT"], [6, "Xét tuyển kết hợp"], [7, "ĐGNL SPT"], [8, "ĐGNL V-ACT"]];
      for (const row of dataRows) for (const [index, method] of methods) add(pseudoRow({ code: row[2], name: row[1], mark: row[index], method, detail: row[3] }));
      continue;
    }
    if (code === "DTM" && tableIndex === 0) {
      for (const row of dataRows) add(pseudoRow({ code: row[1], name: row[2], block: row[3], mark: row[4], method: "THPT" }));
      continue;
    }
    if (code === "DTM" && tableIndex === 1) {
      const blocks = second || [];
      for (const row of rest) {
        for (let index = 0; index < blocks.length; index += 1) add(pseudoRow({ code: row[1], name: row[2], block: blocks[index], mark: row[index + 3], method: "Học bạ" }));
        add(pseudoRow({ code: row[1], name: row[2], block: "Điểm trung bình 3 năm học", mark: row[blocks.length + 3], method: "Học bạ" }));
      }
      continue;
    }
    if (code === "DTM" && tableIndex === 2) {
      for (const row of dataRows) add(pseudoRow({ code: row[1], name: row[2], mark: row[3], method: "ĐGNL V-ACT" }));
      continue;
    }
    if (headerText.includes("doi tuong chi tieu diem chuan")) {
      for (const row of dataRows) add(pseudoRow({ name: row[1], mark: row[3], method: "Xét tuyển kết hợp", detail: row[6] }));
      continue;
    }
  }
  return rows;
}

function parsePendingStandardRows(page) {
  const rows = [];
  for (const table of page.tables || []) {
    const header = (table.rows?.[0] || []).map(normalize);
    const nameIndex = header.indexOf("ten nganh");
    const combinationIndex = header.indexOf("to hop mon");
    const scoreIndex = header.indexOf("diem chuan");
    if (nameIndex < 0 || scoreIndex < 0) continue;
    const method = methodFromAlias("", clean(table.heading).replace(/^Điểm chuẩn theo phương thức\s*/i, "").replace(/\s*năm\s*2026.*$/i, ""));
    for (const row of table.rows.slice(1)) {
      const name = clean(row[nameIndex]);
      if (!name || parseScore(row[scoreIndex]) != null) continue;
      const note = row.slice(scoreIndex + 1).map(clean).filter(Boolean).join(" · ");
      rows.push(pseudoRow({ name, block: combinationIndex >= 0 ? row[combinationIndex] : "", mark: null, method, detail: note }));
    }
  }
  return rows;
}

function repairEmbeddedRows(rows) {
  const namesByCode = new Map();
  for (const row of rows) if (!clean(row.name).includes("�")) namesByCode.set(normalize(row.code), clean(row.name));
  return rows.map((row) => ({
    ...row,
    name: clean(row.name).includes("�") ? namesByCode.get(normalize(row.code)) || clean(row.name).replaceAll("�", "") : clean(row.name),
    block: clean(row.block).includes("�") ? "" : clean(row.block),
    admission_name: clean(row.admission_name).includes("�") ? methodFromAlias(row.admission_alias) : clean(row.admission_name),
    formula: clean(row.formula).includes("�") ? "" : clean(row.formula),
    introtext: clean(row.introtext).includes("�") ? "" : clean(row.introtext)
  }));
}

function selectReportedScores(rows) {
  const exact = new Map();
  for (const row of rows) {
    const method = methodForRow(row);
    const key = [normalize(row.code), normalize(row.name), normalize(method), normalize(row.block), normalize(row.introtext), parseScore(row.mark)].join("|");
    if (!exact.has(key)) exact.set(key, row);
  }
  const groups = new Map();
  for (const row of exact.values()) {
    const method = methodForRow(row);
    const key = [normalize(row.code), normalize(row.name), normalize(method), normalize(row.block), normalize(row.introtext)].join("|");
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const selected = [];
  for (const list of groups.values()) {
    if (list.length === 2 && list.some((row) => row.converted_score_data == null) && list.some((row) => row.converted_score_data != null)) {
      selected.push(list.find((row) => row.converted_score_data == null));
    } else selected.push(...list);
  }
  return selected;
}

const officialRows = currentMajors.filter((major) => major.dataStatus === "verified" || major.cutoff?.status === "verified");
function duplicatesOfficial(universityId, row, method) {
  const code = normalize(row.code);
  return officialRows.some((major) => major.universityId === universityId && normalize(major.code) === code && major.cutoff?.status === "verified" && normalize(`${major.method} ${major.cutoff?.method || ""}`).includes(normalize(method)));
}

const liveUniversityIds = new Set();
const imported = [];
const importedPerUniversity = new Map();

for (const page of capture.pages) {
  const university = resolveUniversity(page.url);
  if (!university) continue;
  liveUniversityIds.add(university.id);
  const scoredRows = page.embeddedRows?.length ? selectReportedScores(repairEmbeddedRows(page.embeddedRows)) : parseSpecialTables(page);
  const sourceRows = [...scoredRows, ...parsePendingStandardRows(page)];
  let index = 0;
  for (const row of sourceRows) {
    const score = parseScore(row.mark);
    const name = clean(row.name);
    const code = clean(row.code) || "Chưa công bố trên nguồn";
    const method = methodForRow(row);
    if (!name || name.includes("�") || duplicatesOfficial(university.id, row, method)) continue;
    index += 1;
    const formula = `${university.code.toLowerCase()}-${methodSlug(method)}-2026`;
    const scale = score == null ? pendingScaleFor(method) : scaleFor(method, score, row.explicitScale);
    const detail = [clean(row.admission_name), clean(row.introtext)].filter(Boolean).join(" · ");
    imported.push({
      id: `${university.id}-ts247-${row.id || `${methodSlug(method)}-${index}`}`,
      universityId: university.id,
      code,
      ...( /^\d{7}$/.test(code) ? { nationalMajorCode: code } : {} ),
      name,
      combination: clean(row.block),
      combinationStatus: clean(row.block) ? "reference" : "not_provided",
      subjects: subjectsFor(row.block),
      method,
      methodDetails: detail || `Theo bảng điểm chuẩn 2026 của ${SOURCE_NAME}.`,
      formula,
      formulaText: formulaText(row, method),
      formulaSourceUrl: page.url,
      calculationVerified: false,
      dataStatus: "reference",
      sourceName: SOURCE_NAME,
      sourceUrl: page.url,
      cutoff: {
        year: 2026,
        score,
        scale,
        scaleStatus: row.explicitScale ? "reported" : "inferred_from_method",
        method: clean(row.admission_name) || method,
        status: score == null ? "not_published" : "reference",
        sourceName: SOURCE_NAME,
        sourceUrl: page.url
      }
    });
  }
  importedPerUniversity.set(university.id, imported.filter((major) => major.universityId === university.id).length);
}

const retained = currentMajors.filter((major) => !liveUniversityIds.has(major.universityId) || major.dataStatus === "verified" || major.cutoff?.status === "verified");
const dedupedImported = [...new Map(imported.map((major) => [[major.universityId, normalize(major.code), normalize(major.name), normalize(major.method), normalize(major.combination), major.cutoff.score].join("|"), major])).values()];
const TEXT_REPAIRS = new Map([
  ["hoc-vien-hanh-chinh-quoc-gia-hch132-dgnl-132", "Quản trị nhân lực"],
  ["truong-dai-hoc-cmc-cmc029-thpt-29", "Trí tuệ Nhân tạo"],
  ["truong-dai-hoc-su-pham-ky-thuat-nam-dinh-skn069-dgnl-69", "Công nghệ thông tin"],
  ["truong-dai-hoc-ba-ria-vung-tau-bvu096-hocba-96", "Ngôn ngữ Anh (Tiếng Anh biên - phiên dịch - Chương trình chuẩn, ngoại ngữ tiếng Anh/Nhật/Hàn/Trung)"],
  ["truong-dai-hoc-ba-ria-vung-tau-bvu136-hocba-136", "Tài chính ngân hàng & Luật (Chương trình chuẩn nhận cùng lúc hai bằng cử nhân)"]
]);
const majors = [...retained, ...dedupedImported].map((major) => TEXT_REPAIRS.has(major.id) ? { ...major, name: TEXT_REPAIRS.get(major.id) } : major);

const liveUrls = new Set(capture.pages.map((page) => page.url));
let linkedReferencePages = 0;
for (const university of universities) {
  const listedUrl = capture.listedUrls?.find((url) => resolveUniversity(url)?.id === university.id);
  if (!listedUrl) continue;
  linkedReferencePages += 1;
  const has2026Data = liveUrls.has(listedUrl);
  const admissions = university.admissions || {};
  const referenceSources = (admissions.referenceSources || []).filter((source) => source.name !== SOURCE_NAME);
  referenceSources.push({ name: SOURCE_NAME, url: listedUrl, checkedAt: CHECKED_AT, has2026Data });
  admissions.referenceSources = referenceSources;
  admissions.referenceNote = has2026Data
    ? "Đã bổ sung dữ liệu năm 2026 từ nguồn tham khảo TuyểnSinh247; nên đối chiếu lại thông báo chính thức của trường."
    : "Đã kiểm tra TuyểnSinh247; trang trường chưa có bảng dữ liệu năm 2026 tại thời điểm đối chiếu.";
  if (has2026Data) {
    const methods = [...new Set(dedupedImported.filter((major) => major.universityId === university.id).map((major) => major.method))];
    university.methods = [...new Set([...(university.methods || []), ...methods])];
    admissions.methods = [...new Set([...(admissions.methods || []), ...methods])];
    if (admissions.status === "updating") admissions.status = "reference_2026";
    for (const method of methods) {
      const formula = `${university.code.toLowerCase()}-${methodSlug(method)}-2026`;
      if (!university.formulas.includes(formula)) university.formulas.push(formula);
    }
  }
  university.admissions = admissions;
  university.dataCheckedAt = CHECKED_AT;
}

const report = {
  capturedAt: capture.scrapedAt,
  listedPages: capture.totalListed,
  linkedReferencePages,
  pagesWith2026Data: capture.pages.length,
  matchedUniversitiesWith2026Data: liveUniversityIds.size,
  importedReferenceRows: dedupedImported.length,
  retainedOfficialRows: retained.filter((major) => major.dataStatus === "verified" || major.cutoff?.status === "verified").length,
  totalMajorsAfterImport: majors.length,
  perUniversity: [...importedPerUniversity.entries()].map(([universityId, rows]) => ({ universityId, rows })).sort((a, b) => b.rows - a.rows)
};

if (shouldWrite) {
  await Promise.all([
    writeFile(join(root, "data", "majors.json"), `${JSON.stringify(majors, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "universities.json"), `${JSON.stringify(universities, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "ts247-import-report-2026.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  ]);
}

console.log(JSON.stringify({ mode: shouldWrite ? "write" : "audit", ...report }, null, 2));
