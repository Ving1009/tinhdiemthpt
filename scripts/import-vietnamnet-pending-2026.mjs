import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shouldWrite = process.argv.includes("--write");
const checkedAt = "2026-09-10";
const importTag = "vietnamnet-pending-2026";
const cacheDir = join(root, "data", ".vnn-cache-2026");
const universities = JSON.parse(await readFile(join(root, "data", "universities.json"), "utf8"));
const currentMajors = JSON.parse(await readFile(join(root, "data", "majors.json"), "utf8"));
const combinations = JSON.parse(await readFile(join(root, "data", "combinations.json"), "utf8"));
const universityByCode = new Map(universities.map((item) => [item.code.toUpperCase(), item]));
const validCombinationCodes = new Set(combinations.map((item) => item.code.toUpperCase()));
const subjectsByCode = new Map(combinations.map((item) => [item.code.toUpperCase(), item.subjectIds || []]));

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalize = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
const slug = (value) => normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function methodFor(note) {
  const text = normalize(note);
  if (text.includes("kq thi tn thpt")) return "THPT";
  if (text.includes("kq hoc tap") && (text.includes("dgnlcb") || text.includes("ket hop"))) return "Xét tuyển kết hợp";
  if (text.includes("hoc ba") || text.includes("kq hoc tap") || text.includes("ket qua hoc tap")) return "Học bạ";
  if (text.includes("cmc test")) return "CMC-TEST";
  if (text.includes("v act") || text.includes("dhqg tp hcm")) return "ĐGNL V-ACT";
  if (text.includes("hsa") || text.includes("dhqg ha noi")) return "ĐGNL HSA";
  if (text.includes("spt") || text.includes("dgnlcb") || text.includes("dhsp") || text.includes("danh gia nang luc chuyen biet")) return "ĐGNL SPT";
  if (text.includes("tsa") || text.includes("danh gia tu duy")) return "ĐGTD TSA";
  if (text.includes("chung chi") || text.includes("ket hop")) return "Xét tuyển kết hợp";
  if (text.includes("thpt") || text.includes("tot nghiep")) return "THPT";
  return "Phương thức khác";
}

function scaleFor(note, method, score) {
  const reported = clean(note).match(/thang điểm:\s*([\d.,]+)/i)?.[1];
  const parsed = Number(String(reported || "").replace(",", "."));
  if (Number.isFinite(parsed) && parsed >= score) return { scale: parsed, scaleStatus: "reported" };
  if (method === "ĐGNL HSA" || method === "ĐGNL SPT") return { scale: 150, scaleStatus: "inferred_from_method" };
  if (method === "ĐGNL V-ACT") return { scale: 1200, scaleStatus: "inferred_from_method" };
  if (method === "ĐGTD TSA") return { scale: 100, scaleStatus: "inferred_from_method" };
  if (method === "CMC-TEST") return { scale: 80, scaleStatus: "inferred_from_method" };
  if (score <= 30) return { scale: 30, scaleStatus: "inferred_from_method" };
  if (score <= 40) return { scale: 40, scaleStatus: "inferred_from_method" };
  if (score <= 100) return { scale: 100, scaleStatus: "inferred_from_method" };
  if (score <= 150) return { scale: 150, scaleStatus: "inferred_from_method" };
  return { scale: 1200, scaleStatus: "inferred_from_method" };
}

function formulaText(method) {
  if (method === "THPT") return "Điểm các môn thi tốt nghiệp THPT theo tổ hợp hoặc thành phần trường công bố, cộng điểm ưu tiên theo quy định.";
  if (method === "Học bạ") return "Điểm kết quả học tập THPT theo tổ hợp hoặc thành phần trường công bố, cộng điểm ưu tiên theo quy định.";
  if (method === "Xét tuyển kết hợp") return "Điểm thành phần được quy đổi và kết hợp theo quy định tuyển sinh năm 2026 của trường.";
  return `Điểm ${method} theo thang điểm và ngưỡng trúng tuyển trường công bố.`;
}

function combinationData(value) {
  const codes = clean(value).toUpperCase().match(/[A-Z]\d{2,3}/g) || [];
  const valid = [...new Set(codes.filter((code) => validCombinationCodes.has(code)))];
  return {
    combination: clean(value),
    combinationStatus: clean(value) ? "reference" : "not_provided",
    subjects: valid.length ? subjectsByCode.get(valid[0]) || [] : []
  };
}

const imported = [];
const importedUniversityIds = new Set();
const perUniversity = [];

for (const filename of await readdir(cacheDir)) {
  if (!filename.endsWith(".json")) continue;
  const code = filename.slice(0, -5).toUpperCase();
  const university = universityByCode.get(code);
  if (!university || university.admissions?.status !== "updating") continue;
  const cached = JSON.parse(await readFile(join(cacheDir, filename), "utf8"));
  const rows = (cached.rows || []).filter((row) => {
    const score = Number(String(row.score || "").replace(",", "."));
    return clean(row.name) && Number.isFinite(score) && score > 0;
  });
  if (!rows.length) continue;

  const sourceUrl = `https://vietnamnet.vn/giao-duc/diem-thi/tra-cuu-diem-chuan-cd-dh?keyword=${encodeURIComponent(code)}&year=2026`;
  importedUniversityIds.add(university.id);
  const methods = new Set();
  rows.forEach((row, index) => {
    const score = Number(String(row.score).replace(",", "."));
    const method = methodFor(row.note);
    const { scale, scaleStatus } = scaleFor(row.note, method, score);
    if (score > scale) return;
    methods.add(method);
    const formula = `${code.toLowerCase()}-${slug(method)}-2026`;
    imported.push({
      id: `${university.id}-${importTag}-${index + 1}`,
      universityId: university.id,
      code: clean(row.code) || "Chưa công bố mã riêng",
      ...(/^\d{7}$/.test(clean(row.code)) ? { nationalMajorCode: clean(row.code) } : {}),
      name: clean(row.name),
      ...combinationData(row.subjectGroup),
      method,
      methodDetails: clean(row.note) || method,
      formula,
      formulaText: formulaText(method),
      formulaSourceUrl: sourceUrl,
      calculationVerified: false,
      dataStatus: "reference",
      sourceName: "VietnamNet",
      sourceUrl,
      importTag,
      cutoff: {
        year: 2026,
        score,
        scale,
        scaleStatus,
        method: clean(row.note) || method,
        status: "reference",
        sourceName: "VietnamNet",
        sourceUrl
      }
    });
  });
  const methodList = [...methods];
  university.methods = [...new Set([...(university.methods || []), ...methodList])];
  university.formulas = [...new Set([...(university.formulas || []), ...methodList.map((method) => `${code.toLowerCase()}-${slug(method)}-2026`)])];
  university.admissions = {
    ...(university.admissions || {}),
    status: "reference_2026",
    methods: [...new Set([...(university.admissions?.methods || []), ...methodList])],
    formulas: methodList.map((method) => ({ method, text: formulaText(method), sourceUrl })),
    referenceSources: [...(university.admissions?.referenceSources || []).filter((item) => item.name !== "VietnamNet"), { name: "VietnamNet", url: sourceUrl, checkedAt, has2026Data: true }],
    referenceNote: "Đã bổ sung dữ liệu điểm trúng tuyển năm 2026 từ nguồn tổng hợp VietnamNet; cần đối chiếu thông báo chính thức của trường.",
    note: `Đã cập nhật ${rows.length} dòng ngành/phương thức có điểm năm 2026 ở mức tham khảo.`
  };
  university.dataCheckedAt = checkedAt;
  perUniversity.push({ code, universityId: university.id, rows: rows.length, methods: methodList });
}

const retained = currentMajors.filter((major) => !importedUniversityIds.has(major.universityId) || major.dataStatus === "verified" || major.cutoff?.status === "verified");
const majors = [...retained, ...imported];
const report = {
  checkedAt,
  importedUniversities: importedUniversityIds.size,
  importedRows: imported.length,
  replacedPendingRows: currentMajors.length - retained.length,
  totalMajorsAfterImport: majors.length,
  perUniversity
};

if (shouldWrite) {
  await Promise.all([
    writeFile(join(root, "data", "majors.json"), `${JSON.stringify(majors, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "universities.json"), `${JSON.stringify(universities, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "vietnamnet-pending-import-report-2026.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  ]);
}

console.log(JSON.stringify({ mode: shouldWrite ? "write" : "audit", ...report }, null, 2));
