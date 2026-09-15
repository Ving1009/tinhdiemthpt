import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shouldWrite = process.argv.includes("--write");
const checkedAt = "2026-09-11";
const universities = JSON.parse(await readFile(join(root, "data", "universities.json"), "utf8"));
let majors = JSON.parse(await readFile(join(root, "data", "majors.json"), "utf8"));
const universityById = new Map(universities.map((item) => [item.id, item]));
const universityByCode = new Map(universities.map((item) => [item.code.toUpperCase(), item]));
const validCode = (value) => /^\d{7,8}[A-Z0-9]*$/.test(String(value || ""));
const normalizeName = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const unique = (items) => [...new Set(items.filter(Boolean))];

function formulaFor(method) {
  const text = normalizeName(method);
  if (text.includes("hoc ba")) return "Điểm xét tuyển = tổng điểm kết quả học tập THPT theo tổ hợp/thành phần trường công bố + điểm ưu tiên sau quy đổi (nếu có).";
  if (text.includes("thpt")) return "Điểm xét tuyển = tổng điểm các môn thi tốt nghiệp THPT theo tổ hợp/thành phần trường công bố + điểm ưu tiên sau quy đổi (nếu có).";
  if (text.includes("dgnl") || text.includes("danh gia nang luc")) return "Điểm xét tuyển là điểm kỳ thi đánh giá năng lực sau quy đổi về thang điểm của trường, cộng điểm ưu tiên theo quy định.";
  if (text.includes("dgtd") || text.includes("tu duy")) return "Điểm xét tuyển là điểm kỳ thi đánh giá tư duy sau quy đổi về thang điểm của trường, cộng điểm ưu tiên theo quy định.";
  if (text.includes("nang khieu")) return "Điểm xét tuyển kết hợp môn văn hóa và điểm thi năng khiếu/chuyên môn theo hệ số, điều kiện của từng ngành, cộng ưu tiên theo quy định.";
  if (text.includes("chung chi") || text.includes("ket hop")) return "Điểm xét tuyển là tổng các thành phần học tập, bài thi hoặc chứng chỉ sau quy đổi theo quy định của trường, cộng điểm ưu tiên.";
  return "Điểm xét tuyển được tính từ các thành phần do trường quy định, sau quy đổi tương đương và cộng điểm ưu tiên (nếu có).";
}

// Lập từ điển mã ngành quốc gia bằng biểu quyết từ các dòng đã có mã trong toàn bộ dữ liệu.
const candidates = new Map();
for (const major of majors) {
  const code = major.nationalMajorCode || major.code;
  if (!validCode(code)) continue;
  const name = normalizeName(major.name);
  if (!name) continue;
  if (!candidates.has(name)) candidates.set(name, new Map());
  const counts = candidates.get(name);
  counts.set(code, (counts.get(code) || 0) + 1);
}

let codesInferred = 0;
let formulasAdded = 0;
const inferredByUniversity = new Map();
majors = majors.map((major) => {
  const university = universityById.get(major.universityId);
  let next = major;
  if (!validCode(major.code)) {
    const ranked = [...(candidates.get(normalizeName(major.name)) || [])].sort((a, b) => b[1] - a[1]);
    const confident = ranked.length === 1 || (ranked[0] && (!ranked[1] || ranked[0][1] >= ranked[1][1] * 3));
    if (confident && ranked[0]) {
      const code = ranked[0][0];
      next = { ...next, code, nationalMajorCode: code, codeStatus: "reference_inferred_from_national_major_name" };
      codesInferred += 1;
      inferredByUniversity.set(major.universityId, (inferredByUniversity.get(major.universityId) || 0) + 1);
    }
  }
  if (!next.formulaText) {
    const sourceUrl = next.formulaSourceUrl || next.sourceUrl || university?.admissions?.methodsSourceUrl || university?.website;
    next = { ...next, formulaText: formulaFor(next.method), formulaSourceUrl: sourceUrl, calculationVerified: false };
    formulasAdded += 1;
  }
  return next;
});

let profilesWithFormula = 0;
for (const university of universities) {
  const rows = majors.filter((major) => major.universityId === university.id);
  const rowMethods = unique(rows.map((major) => major.method));
  const methods = unique([...(university.admissions?.methods || []), ...(university.methods || []), ...rowMethods]);
  if (!methods.length) continue;
  const existing = university.admissions?.formulas || [];
  const existingMethods = new Set(existing.map((item) => item.method));
  const sourceUrl = university.admissions?.methodsSourceUrl || university.website;
  const additions = methods.filter((method) => !existingMethods.has(method)).map((method) => ({ method, text: formulaFor(method), sourceUrl }));
  if (!additions.length && (university.admissions?.methods || []).length) continue;
  university.admissions = { ...(university.admissions || {}), methods, formulas: [...existing, ...additions] };
  university.dataCheckedAt = checkedAt;
  profilesWithFormula += 1;
}

// Các trường quân đội, công an và nghệ thuật/thể thao có sơ tuyển hoặc thi năng khiếu riêng.
const specialAdmissions = {
  NVH: "Tuyển sinh âm nhạc có thi chuyên môn/năng khiếu theo từng ngành.",
  MTH: "Tuyển sinh mỹ thuật có thi năng khiếu/chuyên môn theo từng ngành.",
  SKD: "Tuyển sinh sân khấu - điện ảnh có sơ tuyển và thi năng khiếu/chuyên môn.",
  GNT: "Các ngành sư phạm nghệ thuật và nghệ thuật có môn năng khiếu theo quy định riêng.",
  TDH: "Tuyển sinh thể dục thể thao có điều kiện sơ tuyển và môn năng khiếu.",
  NVS: "Tuyển sinh âm nhạc có thi chuyên môn/năng khiếu theo từng ngành.",
  MTS: "Tuyển sinh mỹ thuật có thi năng khiếu/chuyên môn theo từng ngành.",
  DSD: "Tuyển sinh sân khấu - điện ảnh có sơ tuyển và thi năng khiếu/chuyên môn.",
  TDS: "Tuyển sinh thể dục thể thao có điều kiện sơ tuyển và môn năng khiếu.",
  TDB: "Tuyển sinh thể dục thể thao có điều kiện sơ tuyển và môn năng khiếu.",
  HEH: "Tuyển sinh quân sự yêu cầu sơ tuyển và thực hiện theo quy định của Bộ Quốc phòng.",
  NQH: "Tuyển sinh quân sự yêu cầu sơ tuyển và thực hiện theo quy định của Bộ Quốc phòng.",
  ZNH: "Tuyển sinh quân sự, văn hóa nghệ thuật có sơ tuyển và yêu cầu chuyên môn riêng.",
  VPH: "Tuyển sinh quân sự yêu cầu sơ tuyển và thực hiện theo quy định của Bộ Quốc phòng.",
  TGH: "Tuyển sinh quân sự yêu cầu sơ tuyển và thực hiện theo quy định của Bộ Quốc phòng.",
  HCN: "Tuyển sinh công an nhân dân yêu cầu sơ tuyển và thực hiện theo quy định của Bộ Công an."
};
for (const [code, note] of Object.entries(specialAdmissions)) {
  const university = universityByCode.get(code);
  if (!university || university.admissions?.status !== "updating") continue;
  university.admissions = { ...(university.admissions || {}), status: "special_admissions", note, methods: unique([...(university.admissions?.methods || []), ...(university.methods || [])]) };
  university.dataCheckedAt = checkedAt;
}

const report = {
  checkedAt,
  codesInferred,
  formulasAdded,
  profilesWithFormula,
  specialProfilesClassified: Object.keys(specialAdmissions).filter((code) => universityByCode.has(code)).length,
  inferredByUniversity: [...inferredByUniversity].map(([id, count]) => ({ code: universityById.get(id)?.code, count })).sort((a, b) => b.count - a.count)
};

if (shouldWrite) {
  await Promise.all([
    writeFile(join(root, "data", "majors.json"), `${JSON.stringify(majors, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "universities.json"), `${JSON.stringify(universities, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "remaining-profile-enrichment-report-2026.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  ]);
}

console.log(JSON.stringify({ mode: shouldWrite ? "write" : "audit", ...report }, null, 2));
