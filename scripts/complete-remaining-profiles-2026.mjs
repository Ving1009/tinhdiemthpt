import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shouldWrite = process.argv.includes("--write");
const checkedAt = "2026-09-12";
const importTag = "remaining-profiles-2026";
const universities = JSON.parse(await readFile(join(root, "data", "universities.json"), "utf8"));
let majors = JSON.parse(await readFile(join(root, "data", "majors.json"), "utf8"));
const byCode = new Map();
for (const item of universities) {
  byCode.set(item.code.toUpperCase(), item);
  for (const alias of [item.legacyCode, ...(item.legacyCodes || [])].filter(Boolean)) byCode.set(alias.toUpperCase(), item);
}

const unique = (values) => [...new Set(values.filter(Boolean))];
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalize = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
const nameKey = (value) => normalize(value).replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

function genericFormula(method) {
  const value = normalize(method);
  if (value.includes("hoc ba")) return "Điểm xét tuyển = tổng điểm trung bình 03 môn trong tổ hợp của lớp 10, lớp 11 và lớp 12, sau quy đổi + điểm cộng + điểm ưu tiên theo quy định.";
  if (value.includes("thpt")) return "Điểm xét tuyển = tổng điểm 03 môn thi tốt nghiệp THPT trong tổ hợp + điểm cộng + điểm ưu tiên theo quy định.";
  if (value.includes("v-act")) return "Sử dụng điểm kỳ thi ĐGNL V-ACT của ĐHQG TP.HCM, sau quy đổi và cộng điểm ưu tiên theo quy định.";
  if (value.includes("hsa")) return "Sử dụng điểm kỳ thi HSA của ĐHQG Hà Nội, sau quy đổi và cộng điểm ưu tiên theo quy định.";
  if (value.includes("dgnl")) return "Sử dụng điểm kỳ thi đánh giá năng lực, sau quy đổi và cộng điểm ưu tiên theo quy định.";
  if (value.includes("dgtd")) return "Sử dụng điểm kỳ thi đánh giá tư duy, sau quy đổi và cộng điểm ưu tiên theo quy định.";
  return "Điểm các thành phần được quy đổi về thang điểm xét tuyển của trường và cộng điểm ưu tiên theo quy định năm 2026.";
}

function setProfile(code, { status, url, methods, note, reference = false }) {
  const university = byCode.get(code);
  if (!university) throw new Error(`Không tìm thấy trường ${code}`);
  const existing = university.admissions || {};
  const resolvedMethods = unique(methods || existing.methods || university.methods || []);
  const sources = unique([...(existing.sources || []), ...(reference ? [] : [url])]);
  const referenceSources = [...(existing.referenceSources || [])];
  if (reference && url && !referenceSources.some((item) => item?.url === url)) {
    referenceSources.push({ name: "TuyểnSinh247", url, checkedAt, has2026Data: true });
  }
  university.methods = unique([...(university.methods || []), ...resolvedMethods]);
  university.dataCheckedAt = checkedAt;
  university.admissions = {
    ...existing,
    status,
    methods: resolvedMethods,
    methodsSourceUrl: url || existing.methodsSourceUrl || university.website,
    formulas: resolvedMethods.map((method) => ({ method, text: genericFormula(method), sourceUrl: url || university.website })),
    sources,
    referenceSources,
    note
  };
}

function templateFor(universityId, name) {
  const wanted = nameKey(name);
  const candidates = majors.filter((major) => major.universityId === universityId);
  return candidates.find((major) => nameKey(major.name) === wanted)
    || candidates.find((major) => nameKey(major.name).startsWith(wanted) || wanted.startsWith(nameKey(major.name)));
}

// Phân hiệu ĐHTN tại Lào Cai: bảng công bố chính thức gồm 12 ngành.
const dtp = byCode.get("DTP");
const dtpUrl = "https://tnu.edu.vn/tin-tuc-su-kien/phan-hieu-dai-hoc-thai-nguyen-tai-tinh-lao-cai-cong-bo-diem-chuan-12-nganh-dao-tao.html?categoryId=101886792";
const dtpPrograms = [
  ["7140201", "Giáo dục Mầm non", 22.1],
  ["7140202", "Giáo dục Tiểu học", 23.75],
  ["7140202TA", "Giáo dục Tiểu học (Chương trình dạy và học bằng tiếng Anh)", 21],
  ["7220204", "Ngôn ngữ Trung Quốc", 21.8],
  ["7310101", "Kinh tế", 16],
  ["7310109", "Kinh tế số", 16],
  ["7640101", "Thú y", 16],
  ["7480201", "Công nghệ thông tin", 16],
  ["7620105", "Chăn nuôi", 16],
  ["7620110", "Khoa học cây trồng", 16],
  ["7850101", "Quản lý tài nguyên và môi trường", 16],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", 16]
];
const dtpFormula = "Điểm trúng tuyển là điểm xét tuyển của phương thức sau quy đổi về thang 30, đã gồm điểm cộng và điểm ưu tiên theo quy định.";
const dtpCombinationUrl = "https://diemthi.tuyensinh247.com/thong-tin-phan-hieu-dai-hoc-thai-nguyen-tai-lao-cai-DTP.html";
const dtpCombinationByCode = {
  "7640101": "B03; C01; C02; D01; D04",
  "7480201": "A00; A01; D01; D04; D07; X06; X26"
};
const dtpOld = majors.filter((major) => major.universityId === dtp.id);
majors = majors.filter((major) => major.universityId !== dtp.id);
for (const [index, [code, name, score]] of dtpPrograms.entries()) {
  const template = dtpOld.find((major) => nameKey(major.name) === nameKey(name)) || templateFor(dtp.id, name);
  majors.push({
    ...(template || {}),
    id: `${dtp.id}-${importTag}-${index + 1}`,
    universityId: dtp.id,
    code,
    nationalMajorCode: code.slice(0, 7),
    name,
    combination: dtpCombinationByCode[code] || (template?.combination && !/chưa xác minh/i.test(template.combination) ? template.combination : "Theo tổ hợp xét tuyển trong thông tin tuyển sinh 2026 của Phân hiệu"),
    combinationStatus: dtpCombinationByCode[code] ? "reference" : (template?.combination && !/chưa xác minh/i.test(template.combination) ? (template.combinationStatus || "reference") : "not_provided"),
    combinationSourceUrl: dtpCombinationByCode[code] ? dtpCombinationUrl : (template?.combinationSourceUrl || dtpUrl),
    subjects: template?.subjects || [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: "Mức điểm trúng tuyển chính thức đợt 1 năm 2026 sau quy đổi giữa các phương thức",
    formula: "dtp-quy-doi-2026",
    formulaText: dtpFormula,
    formulaSourceUrl: dtpUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "Đại học Thái Nguyên",
    sourceUrl: dtpUrl,
    importTag,
    cutoff: { year: 2026, score, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Đại học Thái Nguyên", sourceUrl: dtpUrl }
  });
}
setProfile("DTP", {
  status: "official_verified",
  url: dtpUrl,
  methods: ["Điểm trúng tuyển sau quy đổi", "THPT", "Học bạ"],
  note: "Đã cập nhật đủ 12 ngành và điểm trúng tuyển chính thức đợt 1 năm 2026 từ công bố của Đại học Thái Nguyên."
});
addCombinationSource("DTP", dtpCombinationUrl);

// BMU: bảng chính thức công bố đồng thời bốn cột điểm cho bảy ngành sức khỏe.
const bmu = byCode.get("BMU");
const bmuUrl = "https://bmu.edu.vn/truong-dai-hoc-y-duoc-buon-ma-thuot-cong-bo-diem-chuan-dai-hoc-he-chinh-quy-nam-2026";
const bmuRulesUrl = "https://bmu.edu.vn/quy-tac-tinh-diem-quy-doi-tuong-duong-nguong-dau-vao-va-diem-trung-tuyen-giua-cac-phuong-thuc-xet-tuyen-nam-2026";
const bmuPrograms = [
  ["7720101", "Y khoa", 22, 24.37, 738, 75],
  ["7720115", "Y học cổ truyền", 20, 22.97, 656, 68],
  ["7720110", "Y học dự phòng", 18, 20.5, 589, 61.5],
  ["7720201", "Dược học", 20, 22.97, 656, 68],
  ["7720601", "Kỹ thuật xét nghiệm y học", 20, 22.97, 656, 68],
  ["7720301", "Điều dưỡng", 20, 22.97, 656, 68],
  ["7720701", "Y tế công cộng", 18, 20.5, 589, 61.5]
];
const bmuMethods = [
  ["THPT", 2, 30],
  ["Học bạ", 3, 30],
  ["ĐGNL V-ACT", 4, 1200],
  ["ĐGNL HSA", 5, 150]
];
const bmuOld = majors.filter((major) => major.universityId === bmu.id);
majors = majors.filter((major) => major.universityId !== bmu.id);
let bmuIndex = 0;
for (const program of bmuPrograms) {
  const [code, name] = program;
  const template = bmuOld.find((major) => nameKey(major.name) === nameKey(name)) || bmuOld[0];
  for (const [method, scoreIndex, scale] of bmuMethods) {
    bmuIndex += 1;
    const combination = method === "THPT" || method === "Học bạ"
      ? (template?.combination && !/chưa xác minh/i.test(template.combination) ? template.combination : "Theo tổ hợp tuyển sinh 2026 của BMU")
      : method === "ĐGNL V-ACT" ? "Điểm kỳ thi V-ACT" : "Điểm kỳ thi HSA";
    majors.push({
      ...(template || {}),
      id: `${bmu.id}-${importTag}-${bmuIndex}`,
      universityId: bmu.id,
      code,
      nationalMajorCode: code,
      name,
      combination,
      combinationStatus: method === "THPT" || method === "Học bạ" ? "reference" : "verified",
      subjects: method === "THPT" || method === "Học bạ" ? (template?.subjects || []) : [],
      method,
      methodDetails: method,
      formula: `bmu-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
      formulaText: genericFormula(method),
      formulaSourceUrl: bmuRulesUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "Trường Đại học Y Dược Buôn Ma Thuột",
      sourceUrl: bmuUrl,
      importTag,
      cutoff: { year: 2026, score: program[scoreIndex], scale, scaleStatus: "reported", method, status: "verified", sourceName: "Trường Đại học Y Dược Buôn Ma Thuột", sourceUrl: bmuUrl }
    });
  }
}
setProfile("BMU", {
  status: "official_verified",
  url: bmuUrl,
  methods: bmuMethods.map(([method]) => method),
  note: "Đã cập nhật đủ 7 ngành và 28 mức điểm chính thức năm 2026 cho THPT, học bạ, V-ACT và HSA."
});
bmu.admissions.sources = unique([...(bmu.admissions.sources || []), bmuRulesUrl]);
bmu.admissions.formulas = bmuMethods.map(([method]) => ({ method, text: genericFormula(method), sourceUrl: bmuRulesUrl }));

// Trường Đại học Công nghệ Kỹ thuật Vinh: Quyết định 706/QĐ-ĐHCNKTV, 14 ngành x 3 phương thức.
const skv = byCode.get("SKV");
const skvUrl = "https://vuted.edu.vn/Resources/Document/2026/8/2026-skv_d1_qd_diem-chuan-trung-tuyen.pdf";
const skvPrograms = [
  ["7140246", "Sư phạm công nghệ", 22, 20, 14.3, "A00; A01; B00; D01; D07; X01; X02; X03"],
  ["7340301", "Kế toán", 17, 15, 9.73, "A00; A01; B00; C03; D01; D07; X01; X02"],
  ["7340101", "Quản trị kinh doanh", 17, 15, 9.73, "A00; A01; B00; C03; D01; D07; X01; X02"],
  ["7340122", "Thương mại điện tử", 17, 15, 9.73, "A00; A01; B00; C03; D01; D07; X01; X02"],
  ["7480108", "Công nghệ kỹ thuật máy tính", 17, 15, 9.73, "A00; A01; B00; C01; C02; D01; D07; X02; X03"],
  ["7480201", "Công nghệ thông tin", 17, 15, 9.73, "A00; A01; B00; C01; C02; D01; D07; X02; X03"],
  ["7510201", "Công nghệ kỹ thuật cơ khí", 20.2, 18.2, 12.55, "A00; A01; B00; C01; C02; D01; D07; X02; X03"],
  ["7510202", "Công nghệ chế tạo máy", 18.2, 16.2, 10.78, "A00; A01; B00; C01; C02; D01; D07; X02; X03"],
  ["7510203", "Công nghệ kỹ thuật cơ điện tử", 21.2, 19.2, 13.52, "A00; A01; B00; C01; C02; D01; D07; X02; X03"],
  ["7510205", "Công nghệ kỹ thuật ô tô", 22, 20, 14.3, "A00; A01; B00; C01; C02; D01; D07; X02; X03"],
  ["7510206", "Công nghệ kỹ thuật nhiệt", 19, 17, 11.48, "A00; A01; B00; C01; C02; D01; D07; X02; X03"],
  ["7510301", "Công nghệ kỹ thuật điện, điện tử", 23.5, 21.5, 16.72, "A00; A01; B00; C01; C02; D01; D07; X02; X03"],
  ["7510302", "Công nghệ kỹ thuật điện tử - viễn thông", 17, 15, 9.73, "A00; A01; B00; C01; C02; D01; D07; X02; X03"],
  ["7510303", "Công nghệ kỹ thuật điều khiển và tự động hóa", 24.5, 22.5, 18.03, "A00; A01; B00; C01; C02; D01; D07; X02; X03"]
];
const skvMethods = [["Học bạ", 2], ["THPT", 3], ["ĐGNL HSA/SPT quy đổi", 4]];
majors = majors.filter((major) => major.universityId !== skv.id);
let skvIndex = 0;
for (const program of skvPrograms) {
  const [code, name, , , , combinations] = program;
  for (const [method, scoreIndex] of skvMethods) {
    skvIndex += 1;
    majors.push({
      id: `${skv.id}-${importTag}-${skvIndex}`,
      universityId: skv.id,
      code,
      nationalMajorCode: code,
      name,
      combination: method.startsWith("ĐGNL") ? "Kết quả HSA hoặc SPT sau quy đổi" : combinations,
      combinationStatus: "verified",
      subjects: [],
      method,
      methodDetails: method === "Học bạ" ? "Mã phương thức 200" : method === "THPT" ? "Mã phương thức 100" : "Mã phương thức 402",
      formula: `skv-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
      formulaText: genericFormula(method),
      formulaSourceUrl: skvUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "Trường Đại học Công nghệ Kỹ thuật Vinh",
      sourceUrl: skvUrl,
      importTag,
      cutoff: { year: 2026, score: program[scoreIndex], scale: 30, scaleStatus: "reported", method, status: "verified", sourceName: "Trường Đại học Công nghệ Kỹ thuật Vinh", sourceUrl: skvUrl }
    });
  }
}
setProfile("SKV", {
  status: "official_verified",
  url: skvUrl,
  methods: skvMethods.map(([method]) => method),
  note: "Đã cập nhật đủ 14 ngành và 42 mức điểm chính thức theo Quyết định 706/QĐ-ĐHCNKTV ngày 10/08/2026."
});

// Trường Đại học Khánh Hòa: Thông báo 07/TB-HĐTS, 21 mã xét tuyển x 3 phương thức.
const ukh = byCode.get("UKH");
const ukhUrl = "https://ukh.edu.vn/tuyensinh/vi-vn/chi-tiet-tin/id/6394";
const ukhPrograms = [
  ["7140217", "Sư phạm Ngữ văn", "C00; C03; C04; D01; D14; D15", 24.17, 30, 853],
  ["7140249", "Sư phạm Lịch sử - Địa lý", "A07; C00; C03; C04; D09; D10; D14; D15", 24.73, 30, 878],
  ["7140231", "Sư phạm Tiếng Anh", "D01; D09; D10; D14; D15; X79", 24.38, 30, 862],
  ["7140209", "Sư phạm Toán học", "A00; A01; B00; D07; X06; X26", 24.88, 30, 887],
  ["7140202", "Giáo dục Tiểu học", "A00; A01; B03; C00; C01; C02; C03; C04; D01", 24.61, 30, 872],
  ["7140211", "Sư phạm Vật lý", "A00; A01; A02; C01; C05; C06; X06", 23.25, 30, 811],
  ["7140247", "Sư phạm Khoa học tự nhiên", "A00; A01; A02; B00; D07; D08; X06", 22.99, 29.9, 798],
  ["7420203", "Sinh học ứng dụng", "A02; B00; B02; B03; B08; X14; X15", 15, 19.78, 503],
  ["7440112", "Hóa học", "A00; A06; B00; C02; D07; X10; X11", 15, 19.78, 503],
  ["7340101", "Quản trị kinh doanh", "A01; D01; D07; D08; D09; D10; X25; X26", 15, 19.78, 503],
  ["7810201", "Quản trị khách sạn", "D01; D11; D12; D13; D14; D15", 15, 19.78, 503],
  ["7810101", "Du lịch", "D01; D11; D12; D13; D14; D15", 15, 19.78, 503],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "D01; D11; D12; D13; D14; D15", 15, 19.78, 503],
  ["7310630", "Việt Nam học (Văn hóa Du lịch)", "C00; C03; C04; D01; D09; D10; D14; D15; D65; X70; X74; X78", 15, 19.78, 503],
  ["7229030", "Văn học (Báo chí - Truyền thông)", "C00; C03; C04; D01; D09; D10; D14; D15; D65; X70; X74; X78", 18.8, 24.59, 635],
  ["7229040", "Văn hóa học (Văn hóa - Truyền thông)", "C00; C03; C04; D01; D09; D10; D14; D15; D65; X70; X74; X78", 15, 19.78, 503],
  ["7220201", "Ngôn ngữ Anh", "D01; D09; D10; D11; D12; D13; D14; D15; X79", 15, 19.78, 503],
  ["7229020", "Ngôn ngữ học (Ngôn ngữ học ứng dụng)", "C00; C03; C04; D01; D09; D10; D14; D15; D65; X70; X74; X78", 15, 19.78, 503],
  ["7220204", "Ngôn ngữ Trung Quốc", "D01; D04; D14; D15; D45; D65; X79", 18.25, 23.9, 617],
  ["7320104", "Truyền thông đa phương tiện", "A01; C03; C04; D01; D09; D10; D14; X02; X18; X26; X71; X79", 19.02, 24.87, 642],
  ["7340115", "Marketing", "A01; D01; D07; D08; D09; D10; X25; X26", 15, 19.78, 503]
];
const ukhMethods = [["THPT", 3, 30], ["Học bạ", 4, 30], ["ĐGNL V-ACT", 5, 1200]];
majors = majors.filter((major) => major.universityId !== ukh.id);
let ukhIndex = 0;
for (const program of ukhPrograms) {
  const [code, name, combinations] = program;
  for (const [method, scoreIndex, scale] of ukhMethods) {
    ukhIndex += 1;
    majors.push({
      id: `${ukh.id}-${importTag}-${ukhIndex}`,
      universityId: ukh.id,
      code,
      nationalMajorCode: code,
      name,
      combination: method === "ĐGNL V-ACT" ? "Điểm kỳ thi ĐGNL ĐHQG TP.HCM năm 2026" : combinations,
      combinationStatus: "verified",
      subjects: [],
      method,
      methodDetails: method,
      formula: `ukh-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
      formulaText: genericFormula(method),
      formulaSourceUrl: ukhUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "Trường Đại học Khánh Hòa",
      sourceUrl: ukhUrl,
      importTag,
      cutoff: { year: 2026, score: program[scoreIndex], scale, scaleStatus: "reported", method, status: "verified", sourceName: "Trường Đại học Khánh Hòa", sourceUrl: ukhUrl }
    });
  }
}
setProfile("UKH", {
  status: "official_verified",
  url: ukhUrl,
  methods: ukhMethods.map(([method]) => method),
  note: "Đã cập nhật đủ 21 mã xét tuyển và 63 mức điểm chính thức theo Thông báo 07/TB-HĐTS ngày 09/08/2026."
});

// Trường Đại học Sư phạm Kỹ thuật Nam Định: 16 mã xét tuyển, một mức điểm quy đổi chung cho các phương thức.
const skn = byCode.get("SKN");
const sknUrl = "https://thi.tuyensinh247.com/da-co-diem-chuan-dai-hoc-su-pham-ky-thuat-nam-dinh-nute-2026-c24a91090.html";
const sknPrograms = [
  ["7340101", "Quản trị kinh doanh", 16],
  ["73401011", "Quản trị kinh doanh (Chuyên ngành Logistics)", 16],
  ["7340301", "Kế toán", 16],
  ["7480101", "Khoa học máy tính", 25],
  ["7480201", "Công nghệ thông tin", 16],
  ["74802011", "Công nghệ thông tin (Chuyên ngành Đồ họa máy tính)", 16],
  ["7510201", "Công nghệ kỹ thuật cơ khí", 15.5],
  ["75102011", "Công nghệ kỹ thuật cơ khí (Chuyên ngành Công nghệ kỹ thuật khuôn mẫu)", 15.5],
  ["7510202", "Công nghệ chế tạo máy", 15.5],
  ["7510203", "Công nghệ kỹ thuật cơ điện tử", 17],
  ["7510205", "Công nghệ kỹ thuật ô tô", 16],
  ["7510301", "Công nghệ kỹ thuật điện, điện tử", 16],
  ["75103011", "Công nghệ kỹ thuật điện, điện tử (Chuyên ngành Công nghệ kỹ thuật điện)", 16],
  ["75103012", "Công nghệ kỹ thuật điện, điện tử (Chuyên ngành Hệ thống điện)", 22],
  ["75103013", "Công nghệ kỹ thuật điện, điện tử (Chuyên ngành Công nghệ điện lạnh và điều hòa không khí)", 16],
  ["7510303", "Công nghệ kỹ thuật điều khiển và tự động hóa", 16]
];
const sknFormula = "Điểm trúng tuyển = điểm xét tuyển đã quy đổi tương đương + điểm cộng (nếu có) + điểm ưu tiên khu vực và đối tượng (nếu có), theo quy chế tuyển sinh hiện hành.";
const sknOld = majors.filter((major) => major.universityId === skn.id);
majors = majors.filter((major) => major.universityId !== skn.id);
for (const [index, [code, name, score]] of sknPrograms.entries()) {
  const template = sknOld.find((major) => nameKey(major.name) === nameKey(name)) || templateFor(skn.id, name);
  const combination = template?.combination && !/chưa xác minh/i.test(template.combination)
    ? template.combination
    : "Theo tổ hợp xét tuyển trong thông tin tuyển sinh 2026 của NUTE";
  majors.push({
    ...(template || {}),
    id: `${skn.id}-${importTag}-${index + 1}`,
    universityId: skn.id,
    code,
    nationalMajorCode: code.slice(0, 7),
    name,
    combination,
    combinationStatus: template?.combination && !/chưa xác minh/i.test(template.combination) ? "reference" : "not_provided",
    subjects: template?.subjects || [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: "Điểm chuẩn đợt 1 dùng chung sau quy đổi tương đương giữa các phương thức",
    formula: "skn-quy-doi-2026",
    formulaText: sknFormula,
    formulaSourceUrl: sknUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "TuyểnSinh247 (ảnh công bố của NUTE)",
    sourceUrl: sknUrl,
    importTag,
    cutoff: {
      year: 2026,
      score,
      scale: 30,
      scaleStatus: "reported",
      method: "Điểm trúng tuyển sau quy đổi",
      status: "verified",
      sourceName: "TuyểnSinh247 (ảnh công bố của NUTE)",
      sourceUrl: sknUrl
    }
  });
}
setProfile("SKN", {
  status: "official_verified",
  url: sknUrl,
  methods: ["Điểm trúng tuyển sau quy đổi", "THPT", "Học bạ", "ĐGNL", "ĐGTD"],
  note: "Đã cập nhật đủ 16 mã xét tuyển và điểm chuẩn đợt 1 năm 2026 từ ảnh công bố của NUTE được TuyểnSinh247 đăng lại. Điểm đã quy đổi về thang 30 và gồm điểm cộng, điểm ưu tiên nếu có."
});

// Trường Đại học Lương Thế Vinh: bảng điểm chính thức gồm 11 ngành x THPT và học bạ.
const dtv = byCode.get("DTV");
const dtvUrl = "https://thi.tuyensinh247.com/dai-hoc-luong-the-vinh-ltvu-cong-bo-diem-chuan-trung-tuyen-2026-c24a91004.html";
const dtvRulesUrl = "https://thi.tuyensinh247.com/thong-tin-tuyen-sinh-truong-dai-hoc-luong-the-vinh-2026-c24a88522.html";
const dtvPrograms = [
  ["7220201", "Ngôn ngữ Anh", 15, 17],
  ["7340101", "Quản trị kinh doanh", 15, 17],
  ["7340201", "Tài chính - Ngân hàng", 15, 17],
  ["7340301", "Kế toán", 15, 17],
  ["7480201", "Công nghệ thông tin", 15, 17],
  ["7510301", "Công nghệ kỹ thuật điện, điện tử", 15, 17],
  ["7580201", "Kỹ thuật xây dựng", 15, 17],
  ["7580205", "Kỹ thuật xây dựng công trình giao thông", 15, 17],
  ["7640101", "Thú y", 15, 17],
  ["7720115", "Y học cổ truyền", 20, 22],
  ["7720603", "Kỹ thuật phục hồi chức năng", 18, 20]
];
const dtvMethods = [["THPT", 2], ["Học bạ", 3]];
const dtvOld = majors.filter((major) => major.universityId === dtv.id);
majors = majors.filter((major) => major.universityId !== dtv.id);
let dtvIndex = 0;
for (const program of dtvPrograms) {
  const [code, name] = program;
  const template = dtvOld.find((major) => nameKey(major.name) === nameKey(name));
  for (const [method, scoreIndex] of dtvMethods) {
    dtvIndex += 1;
    const combination = template?.combination && !/chưa xác minh/i.test(template.combination)
      ? template.combination
      : "Theo tổ hợp xét tuyển trong thông tin tuyển sinh 2026 của LTVU";
    majors.push({
      ...(template || {}),
      id: `${dtv.id}-${importTag}-${dtvIndex}`,
      universityId: dtv.id,
      code,
      nationalMajorCode: code,
      name,
      combination,
      combinationStatus: template?.combination && !/chưa xác minh/i.test(template.combination) ? "reference" : "not_provided",
      subjects: template?.subjects || [],
      method,
      methodDetails: method === "THPT" ? "Xét kết quả thi tốt nghiệp THPT" : "Xét học bạ THPT",
      formula: method === "THPT" ? "dtv-thpt-2026" : "dtv-hocba-2026",
      formulaText: genericFormula(method),
      formulaSourceUrl: dtvRulesUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "TuyểnSinh247 (bảng công bố của LTVU)",
      sourceUrl: dtvUrl,
      importTag,
      cutoff: {
        year: 2026,
        score: program[scoreIndex],
        scale: 30,
        scaleStatus: "reported",
        method,
        status: "verified",
        sourceName: "TuyểnSinh247 (bảng công bố của LTVU)",
        sourceUrl: dtvUrl
      }
    });
  }
}
setProfile("DTV", {
  status: "official_verified",
  url: dtvUrl,
  methods: dtvMethods.map(([method]) => method),
  note: "Đã cập nhật đủ 11 ngành và 22 mức điểm chuẩn chính thức năm 2026 cho phương thức THPT và học bạ."
});
dtv.admissions.sources = unique([...(dtv.admissions.sources || []), dtvRulesUrl]);
dtv.admissions.formulas = dtvMethods.map(([method]) => ({ method, text: genericFormula(method), sourceUrl: dtvRulesUrl }));

// Phân hiệu Trường Đại học Thủy lợi: công bố chính thức 20 ngành x 2 phương thức.
const tls = byCode.get("TLS");
const tlsUrl = "https://tlus.edu.vn/phan-hieu-truong-dai-hoc-thuy-loi-cong-bo-diem-chuan-dai-hoc-chinh-quy-nam-2026-6968";
const tlsRulesUrl = "https://thi.tuyensinh247.com/thong-tin-tuyen-sinh-dai-hoc-thuy-loi-co-so-2-nam-2026-c24a89292.html";
const tlsTechnical = "A00; A01; D01; D07; C01; C02; X02; X06";
const tlsTechnology = "A00; A01; D01; D07; C01; X02; X06; X26";
const tlsBusiness = "A00; A01; D01; D07; X02; X26";
const tlsLaw = "C00; C03; C04; D01; D14; D15; X01";
const tlsPrograms = [
  ["TLS108", "Kỹ thuật thủy lợi thông minh", tlsTechnical, 15.35, 18.02],
  ["TLS101", "Xây dựng và quản lý công trình thủy (Kỹ thuật xây dựng công trình thủy)", tlsTechnical, 16, 19],
  ["TLS104", "Kỹ thuật xây dựng dân dụng và công nghiệp (Kỹ thuật xây dựng)", tlsTechnical, 17, 20.33],
  ["TLS113", "Kỹ thuật xây dựng công trình giao thông", tlsTechnical, 16.5, 19.66],
  ["TLS115", "Xây dựng và quản lý đô thị thông minh", tlsTechnical, 15, 17.5],
  ["TLS111", "Công nghệ kỹ thuật xây dựng", tlsTechnical, 17, 20.33],
  ["TLS114", "Quản lý xây dựng", tlsTechnical, 16.5, 19.66],
  ["TLS102", "Kỹ thuật tài nguyên nước", tlsTechnical, 16, 19],
  ["TLS107", "Kỹ thuật cấp thoát nước", tlsTechnical, 16.5, 19.66],
  ["TLS106", "Công nghệ thông tin", tlsTechnology, 17.5, 21],
  ["TLS126", "Trí tuệ nhân tạo và khoa học dữ liệu", tlsTechnology, 18.5, 22],
  ["TLS404", "Kinh tế xây dựng", tlsBusiness, 16, 19],
  ["TLS407", "Logistics và quản lý chuỗi cung ứng", tlsBusiness, 21.5, 24.6],
  ["TLS405", "Thương mại điện tử", tlsBusiness, 20.5, 23.8],
  ["TLS402", "Quản trị kinh doanh", tlsBusiness, 19, 22.5],
  ["TLS403", "Kế toán", tlsBusiness, 18.5, 22],
  ["TLS412", "Chương trình Công nghệ tài chính", tlsBusiness, 15.25, 17.87],
  ["TLS301", "Luật", tlsLaw, 20, 23.4],
  ["TLS302", "Luật kinh tế", tlsLaw, 20, 23.4],
  ["TLS203", "Ngôn ngữ Anh", "A01; D01; D07; D08; D09; D10", 20, 23.4]
];
const tlsMethods = [["THPT", 3], ["Kết hợp học bạ", 4]];
const tlsThptFormula = "Điểm xét tuyển = tổng điểm 03 môn thi tốt nghiệp THPT trong tổ hợp (có thể quy đổi chứng chỉ ngoại ngữ theo bảng của trường) + điểm ưu tiên theo quy định.";
const tlsHocBaFormula = "Điểm xét tuyển = M1 + M2 + M3 + điểm cộng xét tuyển + điểm ưu tiên; mỗi Mi là trung bình môn tương ứng của lớp 10, 11 và 12.";
const tlsEnglishFormula = "Điểm xét tuyển Ngôn ngữ Anh = (M1 × 2 + M2 × 2 + M3) × 3/5 + điểm cộng xét tuyển + điểm ưu tiên; M1 là Toán, M2 là Tiếng Anh, M3 là môn còn lại trong tổ hợp.";
majors = majors.filter((major) => major.universityId !== tls.id);
let tlsIndex = 0;
for (const program of tlsPrograms) {
  const [code, name, combination] = program;
  for (const [method, scoreIndex] of tlsMethods) {
    tlsIndex += 1;
    const formulaText = method === "THPT" ? tlsThptFormula : code === "TLS203" ? tlsEnglishFormula : tlsHocBaFormula;
    majors.push({
      id: `${tls.id}-${importTag}-${tlsIndex}`,
      universityId: tls.id,
      code,
      nationalMajorCode: code,
      name,
      combination,
      combinationStatus: "verified",
      subjects: [],
      method,
      methodDetails: method === "THPT" ? "PT1 - Xét kết quả thi tốt nghiệp THPT năm 2026" : "PT2 - Kết hợp kết quả học tập THPT và các điều kiện ưu tiên",
      formula: method === "THPT" ? "tls-thpt-2026" : code === "TLS203" ? "tls-hocba-ngon-ngu-anh-2026" : "tls-hocba-2026",
      formulaText,
      formulaSourceUrl: tlsRulesUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "Phân hiệu Trường Đại học Thủy lợi",
      sourceUrl: tlsUrl,
      importTag,
      cutoff: {
        year: 2026,
        score: program[scoreIndex],
        scale: 30,
        scaleStatus: "reported",
        method,
        status: "verified",
        sourceName: "Phân hiệu Trường Đại học Thủy lợi",
        sourceUrl: tlsUrl
      }
    });
  }
}
setProfile("TLS", {
  status: "official_verified",
  url: tlsUrl,
  methods: ["THPT", "Kết hợp học bạ", "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 20 mã xét tuyển, tổ hợp, công thức và 40 mức điểm chính thức năm 2026 cho PT1 và PT2."
});
tls.admissions.sources = unique([...(tls.admissions.sources || []), tlsRulesUrl]);
tls.admissions.formulas = [
  { method: "THPT", text: tlsThptFormula, sourceUrl: tlsRulesUrl },
  { method: "Kết hợp học bạ", text: tlsHocBaFormula, sourceUrl: tlsRulesUrl },
  { method: "Kết hợp học bạ - Ngôn ngữ Anh", text: tlsEnglishFormula, sourceUrl: tlsRulesUrl }
];

// Trường Đại học Intracom (tên mới của Đại học Chu Văn An): 14 ngành x 5 cột điểm.
const inu = byCode.get("DCA") || byCode.get("INU");
const inuUrl = "https://thi.tuyensinh247.com/dai-hoc-intracom-thong-bao-diem-chuan-trung-tuyen-2026-c24a91065.html";
const inuRulesUrl = "https://thi.tuyensinh247.com/thong-tin-tuyen-sinh-dai-hoc-intracom-2026-c24a90373.html";
const inuPrograms = [
  ["7380107", "Luật kinh tế", "A00; A01; C00; C04; D01; X26; C14; C19; C20", 20, 21, 70, 645, 46.42],
  ["7340101", "Quản trị kinh doanh", "A00; A01; C03; D07; D01; X26; C14; C19; C20", 15, 16, 50, 480, 37.01],
  ["7340201", "Tài chính - Ngân hàng", "A00; D01; A01; C01; X02; X26", 15, 16, 50, 480, 37.01],
  ["7340301", "Kế toán", "A00; D01; A01; C01; X02; X26", 15, 16, 50, 480, 37.01],
  ["7520201", "Kỹ thuật điện", "A00; A01; C01; D01; A0C; D0C", 15, 16, 50, 480, 37.01],
  ["7580201", "Kỹ thuật xây dựng", "A00; A01; C01; D01; D07; A04", 15, 16, 50, 480, 37.01],
  ["7480201", "Công nghệ thông tin", "A00; A01; C01; D01; A0C; D0C", 15, 16, 50, 480, 37.01],
  ["7510103", "Kỹ thuật cơ khí", "A00; A01; A09; C01; C04; C14; D01", 15, 16, 50, 480, 37.01],
  ["7580101", "Kiến trúc", "V00; V01; V02; V03; A00; A01", 15, 16, 50, 480, 37.01],
  ["7220201", "Ngôn ngữ Anh", "A01; D01; D10; D14; D15; D07; C14; D66; D84", 15, 16, 50, 480, 37.01],
  ["7220204", "Ngôn ngữ Trung Quốc", "D01; D04; C00; A01; D14; D15; C14; C19; C20; D66; D84", 15, 16, 50, 480, 37.01],
  ["7810101", "Du lịch", "C00; D01; D15; C04; A10; D14", 15, 16, 50, 480, 37.01],
  ["7810201", "Quản trị khách sạn", "C00; D01; D15; C04; A10; D14", 15, 16, 50, 480, 37.01],
  ["7340409", "Quản lý dự án", "A00; A01; C03; D07; D01; X26; C14; C19; C20", 15, 16, 50, 480, 37.01]
];
const inuMethods = [
  ["THPT", 3, 30],
  ["Học bạ", 4, 30],
  ["ĐGNL HSA", 5, 150],
  ["ĐGNL V-ACT", 6, 1200],
  ["ĐGTD TSA", 7, 100]
];
const inuSubjectFormula = "Điểm xét tuyển = M1 + M2 + M3 + điểm cộng + điểm ưu tiên; kết quả được quy đổi tương đương về thang 30, làm tròn đến hai chữ số và không vượt quá 30 điểm.";
const inuAssessmentFormula = "Điểm xét tuyển = điểm kỳ thi đánh giá năng lực/đánh giá tư duy + điểm cộng + điểm ưu tiên; kết quả được quy đổi tương đương về thang 30 trước khi xét tuyển.";
majors = majors.filter((major) => major.universityId !== inu.id);
let inuIndex = 0;
for (const program of inuPrograms) {
  const [code, name, combination] = program;
  for (const [method, scoreIndex, scale] of inuMethods) {
    inuIndex += 1;
    const isAssessment = method.startsWith("ĐGNL") || method.startsWith("ĐGTD");
    majors.push({
      id: `${inu.id}-${importTag}-${inuIndex}`,
      universityId: inu.id,
      code,
      nationalMajorCode: code,
      name,
      combination: isAssessment ? `Điểm kỳ thi ${method.replace(/^ĐGNL |^ĐGTD /, "")}` : combination,
      combinationStatus: code === "7340409" && !isAssessment ? "reference" : "verified",
      subjects: [],
      method,
      methodDetails: method,
      formula: `inu-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
      formulaText: isAssessment ? inuAssessmentFormula : inuSubjectFormula,
      formulaSourceUrl: inuRulesUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "TuyểnSinh247 (ảnh công bố của Đại học Intracom)",
      sourceUrl: inuUrl,
      importTag,
      cutoff: {
        year: 2026,
        score: program[scoreIndex],
        scale,
        scaleStatus: "reported",
        method,
        status: "verified",
        sourceName: "TuyểnSinh247 (ảnh công bố của Đại học Intracom)",
        sourceUrl: inuUrl
      }
    });
  }
}
setProfile(inu.code, {
  status: "official_verified",
  url: inuUrl,
  methods: inuMethods.map(([method]) => method),
  note: "Đã cập nhật tên và mã tuyển sinh hiện hành cùng 14 ngành, tổ hợp, công thức và 70 mức điểm chính thức năm 2026."
});
inu.admissions.sources = unique([...(inu.admissions.sources || []), inuRulesUrl]);
inu.admissions.formulas = inuMethods.map(([method]) => ({
  method,
  text: method.startsWith("ĐGNL") || method.startsWith("ĐGTD") ? inuAssessmentFormula : inuSubjectFormula,
  sourceUrl: inuRulesUrl
}));
inu.legacyCode = "DCA";
inu.code = "INU";
inu.shortName = "INU";
inu.name = "Trường Đại học Intracom";
inu.website = "https://intracomuni.edu.vn/";
inu.description = "Trường Đại học Intracom, tên mới của Trường Đại học Chu Văn An từ tháng 11/2025, tuyển sinh với mã trường INU.";

// Học viện Tòa án: điểm chung đã quy đổi giữa phương thức/tổ hợp, công bố theo hai vùng tuyển sinh.
const vca = byCode.get("HTA") || byCode.get("VCA");
const vcaUrl = "https://thi.tuyensinh247.com/hoc-vien-toa-an-vca-cong-bo-diem-chuan-2026-c24a90883.html";
const vcaRulesUrl = "https://thi.tuyensinh247.com/hoc-vien-toa-an-cong-bo-thong-tin-tuyen-sinh-2026-c24a88488.html";
const vcaPrograms = [["Phía Bắc", 22.69], ["Phía Nam", 21.48]];
const vcaFormula = "Điểm trúng tuyển thang 30 đã gồm điểm ưu tiên, điểm thưởng (nếu có), đã quy đổi tương đương giữa các phương thức, tổ hợp và độ lệch giữa các tổ hợp theo quy định.";
majors = majors.filter((major) => major.universityId !== vca.id);
for (const [index, [area, score]] of vcaPrograms.entries()) {
  majors.push({
    id: `${vca.id}-${importTag}-${index + 1}`,
    universityId: vca.id,
    code: "7380101",
    nationalMajorCode: "7380101",
    name: `Luật (${area})`,
    combination: "A00; A01; C00; D01",
    combinationStatus: "verified",
    subjects: [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: `Mức điểm áp dụng cho vùng tuyển sinh ${area.replace("Phía ", "").toLowerCase()}`,
    formula: "vca-quy-doi-2026",
    formulaText: vcaFormula,
    formulaSourceUrl: vcaUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "TuyểnSinh247 (bảng công bố của Học viện Tòa án)",
    sourceUrl: vcaUrl,
    importTag,
    cutoff: {
      year: 2026,
      score,
      scale: 30,
      scaleStatus: "reported",
      method: "Điểm trúng tuyển sau quy đổi",
      status: "verified",
      sourceName: "TuyểnSinh247 (bảng công bố của Học viện Tòa án)",
      sourceUrl: vcaUrl
    }
  });
}
setProfile(vca.code, {
  status: "official_verified",
  url: vcaUrl,
  methods: ["Điểm trúng tuyển sau quy đổi", "THPT", "Học bạ", "Xét tuyển thẳng"],
  note: "Đã cập nhật ngành Luật, tổ hợp, công thức và hai mức điểm chính thức theo vùng tuyển sinh năm 2026; công bố không tách điểm theo giới tính."
});
vca.admissions.sources = unique([...(vca.admissions.sources || []), vcaRulesUrl]);
vca.legacyCode = "HTA";
vca.code = "VCA";
vca.shortName = "VCA";

// Học viện Cán bộ TP.HCM: 5 ngành x THPT, học bạ và V-ACT.
const hvc = byCode.get("HVC");
const hvcUrl = "https://thi.tuyensinh247.com/hoc-vien-can-bo-tphcm-hca-cong-bo-diem-chuan-trung-tuyen-2026-c24a91008.html";
const hvcRulesUrl = "https://thi.tuyensinh247.com/thong-tin-tuyen-sinh-hoc-vien-can-bo-tphcm-2026-c24a89358.html";
const hvcSocialCombinations = "C00; C03; C04; D01; D09; D10; D15; X01";
const hvcLawCombinations = "A00; A01; A07; C00; C03; C04; D01; D07; D09";
const hvcPrograms = [
  ["7310205", "Quản lý nhà nước", hvcSocialCombinations, 22.7, 24.72, 843],
  ["7310202", "Xây dựng Đảng và chính quyền nhà nước", hvcSocialCombinations, 23.15, 25.26, 868],
  ["7310201", "Chính trị học", hvcSocialCombinations, 22.9, 24.96, 854],
  ["7760101", "Công tác xã hội", hvcSocialCombinations, 22.45, 24.43, 829],
  ["7380101", "Luật", hvcLawCombinations, 24.8, 26.84, 937]
];
const hvcMethods = [["THPT", 3, 30], ["Học bạ", 4, 30], ["ĐGNL V-ACT", 5, 1200]];
const hvcThptFormula = "Điểm xét tuyển = M1 + M2 + M3 + điểm khuyến khích (nếu có) + điểm ưu tiên; tổng tối đa 30 điểm, không quy đổi chứng chỉ quốc tế thay môn ngoại ngữ.";
const hvcHocBaFormula = "Điểm xét tuyển = M1 + M2 + M3 + điểm ưu tiên; mỗi Mi là trung bình cả năm của môn tương ứng ở lớp 10, 11 và 12; tổng tối đa 30 điểm.";
const hvcVactFormula = "Điểm xét tuyển V-ACT = tổng điểm bài thi ĐGNL ĐHQG TP.HCM × 30/1200 + điểm ưu tiên (nếu có).";
majors = majors.filter((major) => major.universityId !== hvc.id);
let hvcIndex = 0;
for (const program of hvcPrograms) {
  const [code, name, combination] = program;
  for (const [method, scoreIndex, scale] of hvcMethods) {
    hvcIndex += 1;
    const formulaText = method === "THPT" ? hvcThptFormula : method === "Học bạ" ? hvcHocBaFormula : hvcVactFormula;
    majors.push({
      id: `${hvc.id}-${importTag}-${hvcIndex}`,
      universityId: hvc.id,
      code,
      nationalMajorCode: code,
      name,
      combination: method === "ĐGNL V-ACT" ? "Điểm kỳ thi ĐGNL ĐHQG TP.HCM năm 2026" : combination,
      combinationStatus: "verified",
      subjects: [],
      method,
      methodDetails: method,
      formula: `hvc-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
      formulaText,
      formulaSourceUrl: hvcRulesUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "TuyểnSinh247 (bảng công bố của Học viện Cán bộ TP.HCM)",
      sourceUrl: hvcUrl,
      importTag,
      cutoff: {
        year: 2026,
        score: program[scoreIndex],
        scale,
        scaleStatus: "reported",
        method,
        status: "verified",
        sourceName: "TuyểnSinh247 (bảng công bố của Học viện Cán bộ TP.HCM)",
        sourceUrl: hvcUrl
      }
    });
  }
}
setProfile("HVC", {
  status: "official_verified",
  url: hvcUrl,
  methods: [...hvcMethods.map(([method]) => method), "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 5 ngành, tổ hợp, công thức và 15 mức điểm chính thức năm 2026 cho THPT, học bạ và V-ACT."
});
hvc.admissions.sources = unique([...(hvc.admissions.sources || []), hvcRulesUrl]);
hvc.admissions.formulas = [
  { method: "THPT", text: hvcThptFormula, sourceUrl: hvcRulesUrl },
  { method: "Học bạ", text: hvcHocBaFormula, sourceUrl: hvcRulesUrl },
  { method: "ĐGNL V-ACT", text: hvcVactFormula, sourceUrl: hvcRulesUrl }
];

// Khoa Kỹ thuật và Công nghệ - Đại học Huế: 8 chương trình x 3 phương thức.
const dhe = byCode.get("DHE");
const dheUrl = "https://thi.tuyensinh247.com/da-co-diem-chuan-2026-khoa-ky-thuat-va-cong-nghe-dh-hue-huet-c24a90996.html";
const dheRulesUrl = "https://thi.tuyensinh247.com/thong-tin-tuyen-sinh-khoa-cong-nghe-va-ky-thuat-dh-hue-2026-c24a88710.html";
const dheComputingCombinations = "A00; A01; C01; D01; X07; X26";
const dheEngineeringCombinations = "A00; A01; C01; C02; D01; X07";
const dhePrograms = [
  ["7510301", "Chương trình đào tạo Công nghệ thiết kế vi mạch (thuộc ngành Công nghệ kỹ thuật điện, điện tử)", dheEngineeringCombinations, 23, 24.36, 800],
  ["7520216", "Kỹ thuật điều khiển và tự động hóa", dheEngineeringCombinations, 20.5, 22.12, 695],
  ["7510205", "Công nghệ kỹ thuật ô tô", dheEngineeringCombinations, 20, 21.75, 676],
  ["7480112KS", "Khoa học dữ liệu và Trí tuệ nhân tạo", dheComputingCombinations, 19, 21, 639],
  ["7480106", "Kỹ thuật máy tính", dheComputingCombinations, 19, 21, 639],
  ["7510301", "Công nghệ kỹ thuật điện, điện tử", dheEngineeringCombinations, 19, 21, 639],
  ["7520201", "Kỹ thuật điện", dheEngineeringCombinations, 17.5, 19.87, 587],
  ["7580201", "Kỹ thuật xây dựng", dheEngineeringCombinations, 15.75, 18.56, 526]
];
const dheMethods = [["THPT/Kết hợp", 3, 30], ["Học bạ/Kết hợp", 4, 30], ["ĐGNL V-ACT", 5, 1200]];
const dheThptFormula = "Điểm xét tuyển = M1 + M2 + M3 + điểm cộng (nếu có) + điểm ưu tiên; điểm ưu tiên giảm dần khi tổng điểm từ 22,5 và tổng không vượt 30.";
const dheHocBaFormula = "Điểm xét tuyển = tổng điểm trung bình cả năm lớp 10, 11, 12 của 03 môn trong tổ hợp sau quy đổi tương đương + điểm cộng + điểm ưu tiên; tổng không vượt 30.";
const dheVactFormula = "Điểm xét tuyển = điểm V-ACT được quy đổi tương đương về thang 30 + điểm cộng + điểm ưu tiên; tổng không vượt 30.";
majors = majors.filter((major) => major.universityId !== dhe.id);
let dheIndex = 0;
for (const program of dhePrograms) {
  const [code, name, combination] = program;
  for (const [method, scoreIndex, scale] of dheMethods) {
    dheIndex += 1;
    const formulaText = method === "THPT/Kết hợp" ? dheThptFormula : method === "Học bạ/Kết hợp" ? dheHocBaFormula : dheVactFormula;
    majors.push({
      id: `${dhe.id}-${importTag}-${dheIndex}`,
      universityId: dhe.id,
      code,
      nationalMajorCode: code.slice(0, 7),
      name,
      combination: method === "ĐGNL V-ACT" ? "Điểm kỳ thi ĐGNL ĐHQG TP.HCM năm 2026" : combination,
      combinationStatus: "verified",
      subjects: [],
      method,
      methodDetails: name.includes("vi mạch") ? `${method}; yêu cầu điểm thi tốt nghiệp THPT môn Toán từ 7,5` : method,
      formula: `dhe-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
      formulaText,
      formulaSourceUrl: dheRulesUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "TuyểnSinh247 (bảng công bố của Khoa KT&CN - Đại học Huế)",
      sourceUrl: dheUrl,
      importTag,
      cutoff: {
        year: 2026,
        score: program[scoreIndex],
        scale,
        scaleStatus: "reported",
        method,
        status: "verified",
        sourceName: "TuyểnSinh247 (bảng công bố của Khoa KT&CN - Đại học Huế)",
        sourceUrl: dheUrl
      }
    });
  }
}
setProfile("DHE", {
  status: "official_verified",
  url: dheUrl,
  methods: [...dheMethods.map(([method]) => method), "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 8 chương trình, tổ hợp, công thức và 24 mức điểm chính thức năm 2026; chương trình vi mạch có điều kiện Toán từ 7,5."
});
dhe.admissions.sources = unique([...(dhe.admissions.sources || []), dheRulesUrl]);
dhe.admissions.formulas = [
  { method: "THPT/Kết hợp", text: dheThptFormula, sourceUrl: dheRulesUrl },
  { method: "Học bạ/Kết hợp", text: dheHocBaFormula, sourceUrl: dheRulesUrl },
  { method: "ĐGNL V-ACT", text: dheVactFormula, sourceUrl: dheRulesUrl }
];

// Khoa Quốc tế - Đại học Huế: 3 ngành x THPT, học bạ và kết hợp chứng chỉ ngoại ngữ.
const dhi = byCode.get("DHI");
const dhiUrl = "https://huis.hueuni.edu.vn/vi/tuyen-sinh/thong-bao-diem-chuan-tuyen-sinh-nam-2026";
const dhiReferenceUrl = "https://thi.tuyensinh247.com/khoa-quoc-te-dh-hue-huis-thong-bao-diem-chuan-trung-tuyen-2026-c24a90998.html";
const dhiRulesUrl = "https://huis.hueuni.edu.vn/vi/tuyen-sinh/chinh-thuc-mo-cong-dang-ky-xet-tuyen-vao-khoa-quoc-te-dai-hoc-hue-nam-2026";
const dhiPrograms = [
  ["7310206", "Quan hệ quốc tế", "C00; C03; C04; D01; D14; D15", 18.5, 20.62, 18.5],
  ["7320104", "Truyền thông đa phương tiện", "C00; C03; C04; D01; D14; D15", 23.5, 24.81, 23.5],
  ["7850102", "Kinh tế tài nguyên thiên nhiên", "A00; A01; C03; C04; D01; D10", 16.5, 19.12, 16.5]
];
const dhiMethods = [["THPT", 3], ["Học bạ", 4], ["Kết hợp", 5]];
const dhiThptFormula = "Điểm xét tuyển = M1 + M2 + M3 + điểm cộng (nếu có) + điểm ưu tiên sau quy đổi theo quy định của Đại học Huế; tổng tối đa 30 điểm.";
const dhiHocBaFormula = "Điểm xét tuyển = tổng điểm trung bình cả năm lớp 10, 11 và 12 của 03 môn trong tổ hợp sau quy đổi tương đương + điểm cộng + điểm ưu tiên; tổng tối đa 30 điểm.";
const dhiCombinedFormula = "Điểm xét tuyển kết hợp = tổng điểm các môn trong tổ hợp, trong đó chứng chỉ ngoại ngữ quốc tế được quy đổi thành điểm môn ngoại ngữ, + điểm cộng + điểm ưu tiên sau quy đổi; tổng tối đa 30 điểm.";
majors = majors.filter((major) => major.universityId !== dhi.id);
let dhiIndex = 0;
for (const program of dhiPrograms) {
  const [code, name, combination] = program;
  for (const [method, scoreIndex] of dhiMethods) {
    dhiIndex += 1;
    const formulaText = method === "THPT" ? dhiThptFormula : method === "Học bạ" ? dhiHocBaFormula : dhiCombinedFormula;
    majors.push({
      id: `${dhi.id}-${importTag}-${dhiIndex}`,
      universityId: dhi.id,
      code,
      nationalMajorCode: code,
      name,
      combination,
      combinationStatus: "verified",
      subjects: [],
      method,
      methodDetails: method === "Kết hợp" ? "Kết hợp điểm thi và chứng chỉ ngoại ngữ quốc tế" : method,
      formula: `dhi-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
      formulaText,
      formulaSourceUrl: dhiRulesUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "Khoa Quốc tế - Đại học Huế",
      sourceUrl: dhiUrl,
      importTag,
      cutoff: {
        year: 2026,
        score: program[scoreIndex],
        scale: 30,
        scaleStatus: "reported",
        method,
        status: "verified",
        sourceName: "Khoa Quốc tế - Đại học Huế",
        sourceUrl: dhiUrl
      }
    });
  }
}
setProfile("DHI", {
  status: "official_verified",
  url: dhiUrl,
  methods: [...dhiMethods.map(([method]) => method), "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 3 ngành, mã ngành, tổ hợp, công thức và 9 mức điểm chính thức năm 2026 cho THPT, học bạ và kết hợp chứng chỉ ngoại ngữ."
});
dhi.admissions.sources = unique([...(dhi.admissions.sources || []), dhiReferenceUrl, dhiRulesUrl]);
dhi.admissions.formulas = [
  { method: "THPT", text: dhiThptFormula, sourceUrl: dhiRulesUrl },
  { method: "Học bạ", text: dhiHocBaFormula, sourceUrl: dhiRulesUrl },
  { method: "Kết hợp", text: dhiCombinedFormula, sourceUrl: dhiRulesUrl }
];

// Viện Nghiên cứu và Đào tạo Việt - Anh: điểm chuẩn chung sau quy đổi của 8 chương trình.
const ddv = byCode.get("DDV");
const ddvUrl = "https://ts.udn.vn/DHCD/Chinhquy/diemchuan/19567";
const ddvRulesUrl = "https://thi.tuyensinh247.com/thong-tin-tuyen-sinh-vien-nghien-cuu-va-dao-tao-viet-anh-dh-da-nang-2026-c24a89644.html";
const ddvPrograms = [
  ["7340120", "Kinh doanh quốc tế", "A01; A07; D01; D07; D09; D10", 15.1],
  ["7420201", "Công nghệ sinh học", "A00; B00; B03; B08; D01; D07", 16],
  ["7420204", "Khoa học y sinh", "A00; B00; B03; B08; D01; D07", 15.1],
  ["7480101CS", "Khoa học máy tính", "A00; A01; D01; X02; X06; X26", 15.3],
  ["7480101SE", "Khoa học máy tính - Chuyên ngành Công nghệ phần mềm", "A00; A01; D01; X02; X06; X26", 15.3],
  ["7480106", "Kỹ thuật máy tính", "A00; A01; D01; X02; X06; X26", 15.3],
  ["7510402", "Công nghệ vật liệu", "A00; A01; B00; C01; D01; X09", 15.1],
  ["7810201", "Quản trị khách sạn", "A01; A07; D01; D07; D09; D10", 15]
];
const ddvFormula = "Điểm trúng tuyển 2026 là mức điểm đã quy đổi tương đương giữa các phương thức về thang 30; điểm xét tuyển gốc được tính theo kết quả THPT, học bạ, HSA, V-ACT hoặc xét tuyển kết hợp + điểm cộng + điểm ưu tiên theo quy định.";
const ddvThptFormula = "Điểm xét tuyển THPT = tổng điểm 03 môn thi trong tổ hợp + điểm cộng + điểm ưu tiên sau quy đổi; thang điểm 30.";
const ddvHocBaFormula = "Điểm xét tuyển học bạ = tổng điểm trung bình cả năm lớp 10, 11 và 12 của 03 môn trong tổ hợp + điểm cộng + điểm ưu tiên; quy về thang 30.";
const ddvAssessmentFormula = "Điểm xét tuyển = điểm bài thi đánh giá năng lực được quy đổi tương đương về thang 30 + điểm cộng + điểm ưu tiên.";
const ddvCombinedFormula = "Điểm xét tuyển kết hợp = điểm kết quả học tập THPT hoặc V-SAT cùng thành phần/chứng chỉ theo đề án, quy đổi về thang 30 + điểm cộng + điểm ưu tiên.";
majors = majors.filter((major) => major.universityId !== ddv.id);
let ddvIndex = 0;
for (const [code, name, combination, score] of ddvPrograms) {
  ddvIndex += 1;
  majors.push({
    id: `${ddv.id}-${importTag}-${ddvIndex}`,
    universityId: ddv.id,
    code,
    nationalMajorCode: code.slice(0, 7),
    name,
    combination,
    combinationStatus: "verified",
    subjects: [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: "Mức điểm chung sau quy đổi tương đương giữa các phương thức tuyển sinh năm 2026",
    formula: "ddv-quy-doi-2026",
    formulaText: ddvFormula,
    formulaSourceUrl: ddvRulesUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "Đại học Đà Nẵng",
    sourceUrl: ddvUrl,
    importTag,
    cutoff: {
      year: 2026,
      score,
      scale: 30,
      scaleStatus: "reported",
      method: "Điểm trúng tuyển sau quy đổi",
      status: "verified",
      sourceName: "Đại học Đà Nẵng",
      sourceUrl: ddvUrl
    }
  });
}
setProfile("DDV", {
  status: "official_verified",
  url: ddvUrl,
  methods: ["THPT", "Học bạ", "ĐGNL HSA", "ĐGNL V-ACT", "Xét tuyển kết hợp", "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 8 chương trình, mã ngành, tổ hợp, công thức và điểm chuẩn chung sau quy đổi tương đương năm 2026."
});
ddv.admissions.sources = unique([...(ddv.admissions.sources || []), ddvRulesUrl]);
ddv.admissions.formulas = [
  { method: "THPT", text: ddvThptFormula, sourceUrl: ddvRulesUrl },
  { method: "Học bạ", text: ddvHocBaFormula, sourceUrl: ddvRulesUrl },
  { method: "ĐGNL HSA", text: ddvAssessmentFormula, sourceUrl: ddvRulesUrl },
  { method: "ĐGNL V-ACT", text: ddvAssessmentFormula, sourceUrl: ddvRulesUrl },
  { method: "Xét tuyển kết hợp", text: ddvCombinedFormula, sourceUrl: ddvRulesUrl }
];

// Hoàn chỉnh hồ sơ có đề án 2026 nhưng chưa có bảng điểm chuẩn 2026 đọc được công khai.
function replaceNotPublishedProfile({ code, programs, methods, formulas, sourceUrl, scoreUrl, note }) {
  const university = byCode.get(code);
  majors = majors.filter((major) => major.universityId !== university.id);
  let rowIndex = 0;
  for (const program of programs) {
    const [majorCode, name, academicCombination, programMethods = methods] = program;
    for (const method of programMethods) {
      rowIndex += 1;
      const combination = method === "ĐGNL HSA" ? "Q00 – Kết quả kỳ thi HSA"
        : method === "ĐGNL V-ACT" ? "Kết quả kỳ thi V-ACT"
          : method === "ĐGTD TSA" ? "Kết quả kỳ thi TSA"
            : method === "ĐGNL SPT" ? "Kết quả kỳ thi SPT"
              : method === "Thi riêng" ? "Kết quả kỳ thi riêng của trường"
                : academicCombination;
      majors.push({
        id: `${university.id}-${importTag}-${rowIndex}`,
        universityId: university.id,
        code: majorCode,
        nationalMajorCode: majorCode.slice(0, 7),
        name,
        combination,
        combinationStatus: "verified",
        subjects: [],
        method,
        methodDetails: method,
        formula: `${code.toLowerCase()}-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
        formulaText: formulas[method],
        formulaSourceUrl: sourceUrl,
        calculationVerified: false,
        dataStatus: "verified",
        sourceName: "Hồ sơ tuyển sinh 2026",
        sourceUrl,
        importTag,
        cutoff: {
          year: 2026,
          score: null,
          status: "not_published",
          method,
          sourceName: "Trang tra cứu điểm chuẩn",
          sourceUrl: scoreUrl
        }
      });
    }
  }
  setProfile(code, {
    status: "complete_score_not_published",
    url: sourceUrl,
    methods: unique(programs.flatMap((program) => program[3] || methods)),
    note
  });
  university.admissions.sources = unique([...(university.admissions.sources || []), scoreUrl]);
  university.admissions.formulas = Object.entries(formulas).map(([method, text]) => ({ method, text, sourceUrl }));
  return rowIndex;
}

const commonThptFormula = "Điểm xét tuyển THPT = M1 + M2 + M3 + điểm cộng + điểm ưu tiên sau quy đổi theo quy định; thang điểm 30.";
const commonHocBaFormula = "Điểm xét tuyển học bạ = tổng điểm kết quả học tập của 03 môn trong tổ hợp + điểm cộng + điểm ưu tiên sau quy đổi; thang điểm 30.";
const commonAssessmentFormula = "Điểm xét tuyển = điểm bài thi đánh giá năng lực/tư duy được quy đổi tương đương về thang 30 + điểm cộng + điểm ưu tiên.";
const commonCombinedFormula = "Điểm xét tuyển kết hợp = các thành phần học bạ, điểm thi hoặc chứng chỉ theo đề án + điểm cộng + điểm ưu tiên sau quy đổi; thang điểm 30.";

const ddaTech = "A00; A01; A02; A03; A05; A06; A07; A08; A09; A10; A11; C01; C02; C03; C14; D01; D07";
const ddaBusiness = `${ddaTech}; D10`;
const ddaLanguage = "C00; C01; C02; C03; C04; C14; C19; C20; D01; D04; D06; D14; D15; D66; D78; D83";
const ddaHealth = "A00; A02; A03; B00; B01; B02; B03; B04; B08; D07";
const ddaMethods = ["THPT", "Học bạ", "Xét tuyển kết hợp", "ĐGNL HSA", "ĐGTD TSA", "ĐGNL SPT"];
const ddaPrograms = [
  ["7480201", "Công nghệ thông tin", ddaTech],
  ["7480201", "Thiết kế đồ họa số", `${ddaTech}; H; V`],
  ["7480201", "Trí tuệ nhân tạo ứng dụng", ddaTech],
  ["7510301", "Công nghệ kỹ thuật điện, điện tử", ddaTech],
  ["7510301", "Công nghệ kỹ thuật bán dẫn", ddaTech],
  ["7510303", "Công nghệ kỹ thuật điều khiển và tự động hóa", ddaTech],
  ["7510205", "Công nghệ kỹ thuật ô tô", ddaTech],
  ["7510206", "Công nghệ kỹ thuật nhiệt (Nhiệt - Điện lạnh)", ddaTech],
  ["7510206", "Điện lạnh và điều hòa không khí", ddaTech],
  ["7510406", "Công nghệ kỹ thuật môi trường (Công nghệ nước)", ddaTech],
  ["7510202", "Công nghệ chế tạo máy", ddaTech],
  ["7510203", "Cơ điện tử", ddaTech],
  ["7580201", "Kỹ thuật xây dựng", ddaTech],
  ["7580101", "Kiến trúc", `${ddaTech}; H; V`],
  ["7580101", "Kiến trúc nội thất", `${ddaTech}; H; V`],
  ["7540101", "Công nghệ thực phẩm", `${ddaTech}; B00; D08`],
  ["7340301", "Kế toán", ddaBusiness],
  ["7340301", "Kế toán định hướng ACCA", ddaBusiness],
  ["7340201", "Tài chính - Ngân hàng", ddaBusiness],
  ["7340205", "Công nghệ tài chính", ddaBusiness],
  ["7340101", "Quản trị kinh doanh", ddaBusiness],
  ["7340101", "Quản trị kinh doanh thời trang", ddaBusiness],
  ["7340115", "Marketing", ddaBusiness],
  ["7340404", "Quản trị nhân lực", ddaBusiness],
  ["7510605", "Logistics và Quản lý chuỗi cung ứng", ddaBusiness],
  ["7380101", "Luật", ddaBusiness],
  ["7220201", "Ngôn ngữ Anh", ddaLanguage],
  ["7220204", "Ngôn ngữ Trung Quốc", ddaLanguage],
  ["7220210", "Ngôn ngữ Hàn Quốc", ddaLanguage],
  ["7220209", "Ngôn ngữ Nhật", ddaLanguage],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", ddaLanguage],
  ["7810201", "Quản trị khách sạn", ddaLanguage],
  ["7720201", "Dược học", ddaHealth],
  ["7720301", "Điều dưỡng", ddaHealth]
];
const ddaPendingRows = replaceNotPublishedProfile({
  code: "DDA",
  programs: ddaPrograms,
  methods: ddaMethods,
  formulas: {
    "THPT": commonThptFormula,
    "Học bạ": "Điểm học bạ = tổng điểm 03 môn cả năm lớp 12 hoặc trung bình tổng điểm 06 học kỳ + điểm cộng + điểm ưu tiên.",
    "Xét tuyển kết hợp": commonCombinedFormula,
    "ĐGNL HSA": commonAssessmentFormula,
    "ĐGTD TSA": commonAssessmentFormula,
    "ĐGNL SPT": commonAssessmentFormula
  },
  sourceUrl: "https://thi.tuyensinh247.com/thong-tin-tuyen-sinh-truong-dai-hoc-cong-nghe-dong-a-2026-c24a88519.html",
  scoreUrl: "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-cong-nghe-dong-a-DDA.html",
  note: "Đã cập nhật đủ 34 ngành/chuyên ngành, mã, tổ hợp, 6 phương thức và công thức năm 2026. Trang điểm chuẩn chưa hiển thị bảng điểm 2026 nên ghi rõ Chưa công bố."
});

const ukbGeneralMethods = ["THPT", "Học bạ", "ĐGNL HSA", "ĐGTD TSA"];
const ukbHealthMethods = [...ukbGeneralMethods, "Thi riêng"];
const ukbPrograms = [
  ["7220201", "Ngôn ngữ Anh", "D01; A01; D14; D66", ukbGeneralMethods],
  ["7340101", "Quản trị kinh doanh", "A00; D01; A01; D84", ukbGeneralMethods],
  ["7340301", "Kế toán", "A00; D01; A01; D84", ukbGeneralMethods],
  ["7480201", "Công nghệ thông tin", "A00; D01; A01; A10", ukbGeneralMethods],
  ["7720101", "Y khoa", "A00; A01; B00; D07; D08; D90", ukbHealthMethods],
  ["7720115", "Y học cổ truyền", "A00; A01; B00; D07; D08; D90", ukbHealthMethods],
  ["7720201", "Dược học", "A00; A01; B00; D07; D08; D90", ukbHealthMethods],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "A00; A01; D01; D14; D15; C00", ukbGeneralMethods]
];
const ukbPendingRows = replaceNotPublishedProfile({
  code: "UKB",
  programs: ukbPrograms,
  methods: ukbGeneralMethods,
  formulas: { "THPT": commonThptFormula, "Học bạ": commonHocBaFormula, "ĐGNL HSA": commonAssessmentFormula, "ĐGTD TSA": commonAssessmentFormula, "Thi riêng": "Điểm xét tuyển theo kết quả kỳ thi riêng của trường + điểm cộng + điểm ưu tiên theo đề án 2026." },
  sourceUrl: "https://diemthi.tuyensinh247.com/thong-tin-dai-hoc-kinh-bac-UKB.html",
  scoreUrl: "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-kinh-bac-UKB.html",
  note: "Đã cập nhật đủ 8 ngành, mã ngành, tổ hợp, phương thức và công thức năm 2026. Trang điểm chuẩn hiện chỉ hiển thị dữ liệu cũ nên ghi rõ Chưa công bố 2026."
});

const dbhPrograms = [
  ["7340101", "Quản trị kinh doanh", "A00; D01; C00; C14; C20"],
  ["7340201", "Tài chính - Ngân hàng", "A00; D01; C00; C14; C20"],
  ["7340301", "Kế toán", "A00; D01; C00; C14; C20"],
  ["7480201", "Công nghệ thông tin", "A00; A01; A02; A03; A04"],
  ["7520207", "Kỹ thuật điện tử - viễn thông", "A00; A01; A02; A03; A04"],
  ["7580201", "Kỹ thuật xây dựng", "A00; A01; A04; A06; D01"],
  ["7580205", "Kỹ thuật xây dựng công trình giao thông", "A00; A01; A04; A06; D01"],
  ["7580301", "Kinh tế xây dựng", "A00; A01; A04; A06; D01"]
];
const dbhPendingRows = replaceNotPublishedProfile({
  code: "DBH", programs: dbhPrograms, methods: ["THPT", "Học bạ"],
  formulas: { "THPT": commonThptFormula, "Học bạ": commonHocBaFormula },
  sourceUrl: "https://diemthi.tuyensinh247.com/thong-tin-dai-hoc-quoc-te-bac-ha-DBH.html",
  scoreUrl: "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-quoc-te-bac-ha-DBH.html",
  note: "Đã cập nhật đủ 8 ngành, mã ngành, tổ hợp, phương thức và công thức năm 2026; điểm chuẩn công khai chưa có bảng 2026."
});

const dfaCombination = "A00; A01; D01; D07; X06; X26; C14";
const dfaPrograms = [
  ["7310101", "Kinh tế", dfaCombination], ["7340101", "Quản trị kinh doanh", dfaCombination],
  ["7340120", "Kinh doanh quốc tế", dfaCombination], ["7340201", "Tài chính - Ngân hàng", dfaCombination],
  ["7340301", "Kế toán", dfaCombination], ["7340302", "Kiểm toán", dfaCombination],
  ["7340405", "Hệ thống thông tin quản lý", dfaCombination]
];
const dfaPendingRows = replaceNotPublishedProfile({
  code: "DFA", programs: dfaPrograms, methods: ["THPT", "Học bạ", "Xét tuyển kết hợp"],
  formulas: {
    "THPT": "Điểm xét tuyển = điểm thi M1 + M2 + M3 + điểm ưu tiên; chứng chỉ tiếng Anh có thể quy đổi thay môn Tiếng Anh nếu có lợi hơn.",
    "Học bạ": "Điểm xét tuyển = ĐTB cả năm lớp 10, 11, 12 môn 1 + môn 2 + môn 3 + điểm ưu tiên; thang 30.",
    "Xét tuyển kết hợp": "Điểm xét tuyển = điểm Toán cao nhất giữa thi THPT và học bạ + điểm học bạ cao nhất của nhóm môn quy định + điểm quy đổi thành tích/chứng chỉ + điểm ưu tiên."
  },
  sourceUrl: "https://thi.tuyensinh247.com/thong-tin-tuyen-sinh-dai-hoc-tai-chinh-quan-tri-kinh-doanh-2026-c24a88915.html",
  scoreUrl: "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-tai-chinh-quan-tri-kinh-doanh-DFA.html",
  note: "Đã cập nhật đủ 7 ngành, mã ngành, tổ hợp, 3 phương thức tính điểm và quy tắc ưu tiên năm 2026; bảng điểm chuẩn 2026 chưa hiển thị công khai."
});

const dvxPrograms = [
  ["7420201", "Công nghệ sinh học", "C08; B02; B00; D90"], ["7480201", "Công nghệ thông tin", "A00; A01; A16; D90"],
  ["7340301", "Kế toán", "A00; A01; D01; D90"], ["7580201", "Kỹ thuật xây dựng", "A00; A01; D07; C01"],
  ["7810201", "Quản trị du lịch khách sạn", "C00; D78; D96; C15"], ["7340101", "Quản trị kinh doanh", "A12; C01; D01; D90"],
  ["7340201", "Tài chính - Ngân hàng", "A00; A01; D01; D90"]
];
const dvxPendingRows = replaceNotPublishedProfile({
  code: "DVX", programs: dvxPrograms, methods: ["THPT", "Học bạ"],
  formulas: { "THPT": commonThptFormula, "Học bạ": "Điểm học bạ = tổng điểm trung bình 06 học kỳ của 03 môn trong tổ hợp (có Toán hoặc Ngữ văn) + điểm cộng + điểm ưu tiên." },
  sourceUrl: "https://diemthi.giaphugroup.com/diem-chuan/truong-dai-hoc-cong-nghe-van-xuan-dvx/",
  scoreUrl: "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-cong-nghe-van-xuan-DVX.html",
  note: "Đã cập nhật 7 chương trình tuyển sinh, mã ngành, tổ hợp, phương thức và công thức năm 2026; chưa có bảng điểm chuẩn 2026 công khai."
});

const ddgPendingRows = replaceNotPublishedProfile({
  code: "DDG", programs: [["7140206", "Giáo dục thể chất", "T00; T02; T03; T04"]], methods: ["THPT kết hợp năng khiếu"],
  formulas: { "THPT kết hợp năng khiếu": "Điểm xét tuyển = điểm các môn văn hóa theo tổ hợp + điểm thi năng khiếu theo hệ số trường quy định + điểm ưu tiên sau quy đổi." },
  sourceUrl: "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/khoa-giao-duc-the-chat-dai-hoc-da-nang-DDG.html",
  scoreUrl: "https://ts.udn.vn/DHCD/Chinhquy/diemchuan/19567",
  note: "Đã cập nhật ngành Giáo dục thể chất, mã ngành, tổ hợp năng khiếu, phương thức và công thức; bảng điểm chuẩn Đại học Đà Nẵng 2026 không liệt kê DDG nên ghi Chưa công bố."
});

// Đại học Quy Nhơn: bảng chính thức năm 2026 công bố 56 mức điểm chung sau quy đổi.
// Các dòng học bạ/ĐGNL sinh tự động trước đây chỉ lặp tổ hợp, chưa có mức điểm riêng nên được loại bỏ.
const dqn = byCode.get("DQN");
const dqnUrl = "https://qnu.edu.vn/Resources/Docs/SubDomain/HomePage/2026/Thang%208/Thong%20bao%20diem%20chuan%20tuyen%20sinh%20dai%20h%E1%BB%8Dc%20chinh%20quy%202026-signed-pages-2%20(1).pdf";
majors = majors.filter((major) => major.universityId !== dqn.id || major.cutoff?.status === "verified");
const dqnOfficialRows = majors.filter((major) => major.universityId === dqn.id).length;
setProfile("DQN", {
  status: "official_verified",
  url: dqnUrl,
  methods: ["THPT", "Học bạ", "ĐGNL HNUE", "ĐGNL V-ACT"],
  note: "Đã cập nhật đủ 56 mã xét tuyển và điểm trúng tuyển chính thức năm 2026. Mỗi mã chỉ hiển thị một mức điểm chung sau quy đổi; đã loại các dòng phương thức trùng không có điểm riêng."
});
dqn.admissions.formulas = [
  { method: "THPT", text: "Điểm xét tuyển = tổng điểm các môn thi tốt nghiệp THPT theo tổ hợp + điểm cộng + điểm ưu tiên sau quy đổi; thang điểm 30.", sourceUrl: dqnUrl },
  { method: "Học bạ", text: "Điểm xét tuyển = tổng điểm kết quả học tập THPT theo tổ hợp + điểm cộng + điểm ưu tiên, sau đó quy đổi tương đương về thang điểm chung.", sourceUrl: dqnUrl },
  { method: "ĐGNL HNUE", text: "Điểm bài thi đánh giá năng lực của Trường Đại học Sư phạm Hà Nội được quy đổi tương đương về thang điểm chung, cộng điểm cộng và điểm ưu tiên.", sourceUrl: dqnUrl },
  { method: "ĐGNL V-ACT", text: "Điểm kỳ thi V-ACT của ĐHQG TP.HCM được quy đổi tương đương về thang điểm chung, cộng điểm cộng và điểm ưu tiên.", sourceUrl: dqnUrl }
];

// Đại học Hải Phòng: trường dùng một mức điểm trúng tuyển chung cho mỗi mã sau khi quy đổi PT2-PT4 về PT1.
const thp = byCode.get("THP");
const thpInfoUrl = "https://dhhp.edu.vn/?p=20721";
const thpRulesUrl = "https://dhhp.edu.vn/post/thong-bao-ve-nguong-bao-dam-chat-luong-dau-vao-quy-tac-quy-doi-tuong-duong-diem-xet-tuyen-giua-cac-phuong-thuc-xet-tuyen-dai-hoc-chinh-quy-nam-2026-73810.html";
const thpScoreUrl = "https://thi.tuyensinh247.com/diem-chuan-dai-hoc-hai-phong-hpu-nam-2026-c24a91020.html";
const thpTableUrl = "https://career.gpo.vn/dai-hoc-hai-phong-dhhp-g75.html";
const thpPrograms = [
  ["731010120", "Logistics và vận tải đa phương thức (chất lượng cao)", "A00; A01; C01; C03; C04; D01", null],
  ["734010120", "Kinh doanh số và đổi mới sáng tạo (chất lượng cao)", "A00; A01; C01; C03; C04; D01", null],
  ["734010121", "Quản trị kinh doanh quốc tế (chất lượng cao)", "A00; A01; C01; C03; C04; D01", null],
  ["734030120", "Kế toán theo định hướng ACCA (chất lượng cao)", "A00; A01; C01; C02; D01; D07", null],
  ["748020120", "Thiết kế game và truyền thông số (chất lượng cao)", "A00; A01; C01; C02; D01; X26", null],
  ["751030120", "Công nghệ kỹ thuật điện tử và thiết kế vi mạch (chất lượng cao)", "A00; A01; A02; A10; C01; D01", null],
  ["738010101", "Luật", "A00; C03; C04; D01; X01", 21.75],
  ["734010101", "Quản trị kinh doanh", "A00; A01; C01; C03; C04; D01", 22],
  ["734010102", "Quản trị tài chính - kế toán", "A00; A01; C01; C03; C04; D01", 22.75],
  ["734011501", "Marketing số", "A00; A01; C01; C03; C04; D01", 22],
  ["734011502", "Marketing", "A00; A01; C01; C03; C04; D01", 22],
  ["734011503", "Truyền thông marketing", "A00; A01; C01; C03; C04; D01", 22],
  ["734012201", "Thương mại điện tử", "A00; A01; C01; C03; C04; D01", 22.75],
  ["734020102", "Tài chính doanh nghiệp", "A00; A01; C01; C02; D01; D07", 22.5],
  ["734030102", "Kế toán doanh nghiệp", "A00; A01; C01; C02; D01; D07", 21.25],
  ["734030103", "Kế toán - kiểm toán", "A00; A01; C01; C02; D01; D07", 21.75],
  ["722020101", "Ngôn ngữ Anh", "D01; D09; D10; D14; D15", 17.5],
  ["722020401", "Ngôn ngữ Trung Quốc", "D01; D04; D09; D14; D15; D45", 21],
  ["722903001", "Văn học", "C00; C03; C04; C19; C20; D15", 23],
  ["731010102", "Kinh tế ngoại thương", "A00; A01; C01; C03; C04; D01", 22.75],
  ["731010103", "Quản lý kinh tế", "A00; A01; C01; C03; C04; D01", 22.25],
  ["731010104", "Logistics và quản lý chuỗi cung ứng", "A00; A01; C01; C03; C04; D01", 23.25],
  ["731040101", "Tâm lý học giáo dục", "C00; C03; C04; D01; D15; X01", 22.25],
  ["731060801", "Nhật Bản học", "C00; D01; D04; D06; DD2", 17],
  ["776010101", "Công tác xã hội", "C00; C03; C04; D01; D15; X01", 21.5],
  ["781010301", "Quản trị dịch vụ du lịch và lữ hành", "C00; C03; C04; D01; D14; D15", 22.5],
  ["781010302", "Quản trị khách sạn", "C00; C03; C04; D01; D14; D15", 22.75],
  ["781010303", "Hướng dẫn du lịch", "C00; C03; C04; D01; D14; D15", 22.25],
  ["748020101", "Công nghệ thông tin", "A00; A01; C01; C02; D01; X26", 20],
  ["748020102", "Trí tuệ nhân tạo và khoa học dữ liệu", "A00; A01; C01; C02; D01; X26", 19.5],
  ["751010302", "Công nghệ kỹ thuật xây dựng dân dụng và công nghiệp", "A00; A01; A02; A10; C01; D01", 18.25],
  ["751020201", "Công nghệ chế tạo máy", "A00; A01; A02; A10; C01; D01", 19],
  ["751020301", "Công nghệ kỹ thuật cơ điện tử", "A00; A01; A02; A10; C01; D01", 20],
  ["751030102", "Công nghệ kỹ thuật điện công nghiệp và dân dụng", "A00; A01; A02; A10; C01; D01", 19.5],
  ["751030302", "Công nghệ kỹ thuật điện tự động công nghiệp", "A00; A01; A02; A10; C01; D01", 20.25],
  ["758010101", "Kiến trúc", "A00; A01; D01; V01", 18.25],
  ["714020101", "Giáo dục Mầm non", "M00; M01; M02; M03; M04", 21.75],
  ["714020201", "Giáo dục Tiểu học", "A01; C01; C02; C03; C04; D01", 25],
  ["714020601", "Giáo dục Thể chất", "T00; T01; T02", 21.5],
  ["714020901", "Sư phạm Toán học", "A00; A01; C01; C02; D07", 25.5],
  ["714021701", "Sư phạm Ngữ văn", "C00; C03; C04; D01; D14; D15", 25.5],
  ["714023101", "Sư phạm Tiếng Anh", "D01; D09; D10; D14; D15", 25.75]
];
const thpFormula = "Điểm trúng tuyển là mức điểm chung của từng mã tuyển sinh sau khi kết quả THPT, học bạ, xét tuyển kết hợp hoặc đánh giá năng lực/tư duy được quy đổi tương đương về phương thức THPT, cộng điểm cộng và điểm ưu tiên theo quy định.";
majors = majors.filter((major) => major.universityId !== thp.id);
for (const [index, [code, name, combination, score]] of thpPrograms.entries()) {
  const published = Number.isFinite(score);
  majors.push({
    id: `${thp.id}-${importTag}-${index + 1}`,
    universityId: thp.id,
    code,
    nationalMajorCode: code.slice(0, 7),
    name,
    combination,
    combinationStatus: "verified",
    subjects: [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: "Một mức điểm trúng tuyển chung cho mỗi mã tuyển sinh sau quy đổi tương đương giữa các phương thức",
    formula: "thp-quy-doi-2026",
    formulaText: thpFormula,
    formulaSourceUrl: thpRulesUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: published ? "TuyểnSinh247 và bảng đối chiếu tuyển sinh" : "Thông tin tuyển sinh Đại học Hải Phòng",
    sourceUrl: published ? thpScoreUrl : thpInfoUrl,
    importTag,
    cutoff: {
      year: 2026,
      score,
      ...(published ? { scale: 30, scaleStatus: "reported" } : {}),
      method: "Điểm trúng tuyển sau quy đổi",
      status: published ? "verified" : "not_published",
      sourceName: published ? "TuyểnSinh247" : "Đại học Hải Phòng",
      sourceUrl: published ? thpScoreUrl : thpInfoUrl
    }
  });
}
setProfile("THP", {
  status: "official_verified",
  url: thpInfoUrl,
  methods: ["THPT", "Học bạ", "Xét tuyển kết hợp", "ĐGNL/ĐGTD", "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 42 mã tuyển sinh, tổ hợp và công thức năm 2026; 36 mã có điểm trúng tuyển công khai, 6 chương trình chất lượng cao chưa đọc được mức điểm riêng nên ghi Chưa công bố."
});
thp.admissions.sources = unique([...(thp.admissions.sources || []), thpRulesUrl, thpScoreUrl, thpTableUrl]);
thp.admissions.formulas = [
  { method: "Điểm trúng tuyển sau quy đổi", text: thpFormula, sourceUrl: thpRulesUrl },
  { method: "THPT", text: "Điểm xét tuyển = tổng điểm 03 môn thi trong tổ hợp + điểm cộng + điểm ưu tiên theo quy định.", sourceUrl: thpRulesUrl },
  { method: "Học bạ", text: "Điểm xét tuyển học bạ được tính theo kết quả học tập THPT của các môn/thành phần trường quy định, cộng điểm cộng và điểm ưu tiên, rồi quy đổi về thang điểm THPT.", sourceUrl: thpRulesUrl },
  { method: "Xét tuyển kết hợp", text: "Các thành phần kết hợp được quy đổi theo bảng của trường về thang điểm THPT, cộng điểm cộng và điểm ưu tiên.", sourceUrl: thpRulesUrl },
  { method: "ĐGNL/ĐGTD", text: "Điểm đánh giá năng lực hoặc đánh giá tư duy được quy đổi tương đương về thang điểm THPT, cộng điểm cộng và điểm ưu tiên.", sourceUrl: thpRulesUrl }
];

// Đại học Quảng Bình: bảng chính thức công bố điểm THPT riêng cho từng tổ hợp của 17 ngành.
const dqb = byCode.get("DQB");
const dqbOfficialUrl = "https://qbu.edu.vn/wp-content/uploads/2026/08/QD-diem-trung-tuyen-2026-1.pdf";
const dqbScoreUrl = "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-quang-binh-DQB.html";
const dqbInfoUrl = "https://diemthi.tuyensinh247.com/thong-tin-dai-hoc-quang-binh-DQB.html";
const dqbRulesUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-quang-binh-DQB.html";
const dqbPrograms = [
  ["7140201", "Giáo dục Mầm non", [["M05", 22.35], ["M06", 21.75], ["M07", 21.25], ["M11", 21], ["M14", 20]]],
  ["7140202", "Giáo dục Tiểu học", [["C00", 23], ["A00", 22.65], ["D01", 22.15], ["A01", 20.9], ["C04", 22.4], ["B00", 22.9]]],
  ["7140206", "Giáo dục Thể chất", [["T01", 20.75], ["T00", 19.75], ["T03", 19], ["T04", 19.5], ["T05", 20.25], ["T06", 20.5], ["T07", 20.25]]],
  ["7140209", "Sư phạm Toán học", [["A00", 22.4], ["A01", 20.65], ["D01", 21.9], ["D07", 21.65], ["X25", 20.15]]],
  ["7140217", "Sư phạm Ngữ văn", [["C00", 23.1], ["X70", 23.1], ["D14", 22.85], ["D15", 21.75], ["X78", 21.75]]],
  ["7140247", "Sư phạm Khoa học tự nhiên", [["B00", 22], ["A00", 21.75], ["A01", 20], ["B08", 20.25], ["D07", 21]]],
  ["7140249", "Sư phạm Lịch sử - Địa lý", [["C03", 24.2], ["C00", 23.7], ["C04", 23.1], ["X70", 23.7], ["X74", 22.6]]],
  ["7140231", "Sư phạm Tiếng Anh", [["D14", 23], ["D01", 22.4], ["A01", 21.15], ["D09", 21.75], ["D10", 20.65], ["D15", 21.9]]],
  ["7140210", "Sư phạm Tin học", [["X10", 22.25], ["A00", 21.75], ["A01", 20], ["D01", 21.25], ["X06", 21.25], ["X26", 20.5], ["X79", 21.75]]],
  ["7220201", "Ngôn ngữ Anh", [["D14", 15], ["D01", 15], ["A01", 15], ["D09", 15], ["D10", 15], ["D15", 15]]],
  ["7220204", "Ngôn ngữ Trung Quốc", [["D14", 15], ["D01", 15], ["D04", 15], ["D15", 15], ["D45", 15], ["D65", 15], ["X78", 15], ["X90", 15]]],
  ["7340301", "Kế toán", [["C02", 15], ["A01", 15], ["D01", 15], ["D10", 15], ["X01", 15]]],
  ["7340101", "Quản trị kinh doanh", [["X01", 15], ["A01", 15], ["A03", 15], ["D01", 15], ["D10", 15]]],
  ["7480201", "Công nghệ thông tin", [["X10", 15], ["A00", 15], ["A01", 15], ["D01", 15], ["X06", 15], ["X26", 15], ["X79", 15]]],
  ["7620101", "Nông nghiệp", [["X04", 15], ["D01", 15], ["A02", 15], ["B08", 15], ["C02", 15], ["X02", 15], ["C03", 15], ["X01", 15], ["X17", 15], ["X21", 15]]],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", [["C03", 15], ["C00", 15], ["D01", 15], ["D15", 15], ["C04", 15]]],
  ["7850101", "Quản lý Tài nguyên và Môi trường", [["X04", 15], ["D01", 15], ["A02", 15], ["B08", 15], ["C02", 15], ["X02", 15], ["C03", 15], ["X01", 15], ["X17", 15], ["X21", 15]]]
];
const dqbThptFormula = "Điểm xét tuyển THPT = tổng điểm các môn trong tổ hợp + điểm ưu tiên; từ 22,50 điểm trở lên, điểm ưu tiên = [(30 - tổng điểm đạt được) / 7,50] × mức điểm ưu tiên.";
const dqbHocBaFormula = "Điểm xét tuyển học bạ = tổng điểm trung bình cả năm lớp 10, 11 và 12 của các môn trong tổ hợp + điểm ưu tiên; làm tròn đến hai chữ số thập phân.";
majors = majors.filter((major) => major.universityId !== dqb.id);
let dqbIndex = 0;
for (const [code, name, pairs] of dqbPrograms) {
  for (const [combination, score] of pairs) {
    dqbIndex += 1;
    majors.push({
      id: `${dqb.id}-${importTag}-thpt-${dqbIndex}`,
      universityId: dqb.id,
      code,
      nationalMajorCode: code,
      name,
      combination,
      combinationStatus: "verified",
      subjects: [],
      method: "THPT",
      methodDetails: "Điểm trúng tuyển đợt 1 năm 2026 được công bố riêng theo từng tổ hợp",
      formula: "dqb-thpt-2026",
      formulaText: dqbThptFormula,
      formulaSourceUrl: dqbRulesUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "Trường Đại học Quảng Bình",
      sourceUrl: dqbOfficialUrl,
      importTag,
      cutoff: { year: 2026, score, scale: 30, scaleStatus: "reported", method: "THPT", status: "verified", sourceName: "Trường Đại học Quảng Bình", sourceUrl: dqbOfficialUrl }
    });
  }
  dqbIndex += 1;
  majors.push({
    id: `${dqb.id}-${importTag}-hocba-${dqbIndex}`,
    universityId: dqb.id,
    code,
    nationalMajorCode: code,
    name,
    combination: pairs.map(([combination]) => combination).join("; "),
    combinationStatus: "verified",
    subjects: [],
    method: "Học bạ",
    methodDetails: "Xét kết quả học tập THPT theo đề án tuyển sinh 2026",
    formula: "dqb-hocba-2026",
    formulaText: dqbHocBaFormula,
    formulaSourceUrl: dqbRulesUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "Thông tin tuyển sinh 2026",
    sourceUrl: dqbInfoUrl,
    importTag,
    cutoff: { year: 2026, score: null, method: "Học bạ", status: "not_published", sourceName: "Trường Đại học Quảng Bình", sourceUrl: dqbInfoUrl }
  });
}
setProfile("DQB", {
  status: "official_verified",
  url: dqbOfficialUrl,
  methods: ["THPT", "Học bạ", "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 17 ngành, mã ngành, tổ hợp và 107 mức điểm THPT chính thức năm 2026. Phương thức học bạ đã có công thức nhưng chưa có bảng điểm 2026 riêng nên ghi Chưa công bố."
});
dqb.admissions.sources = unique([...(dqb.admissions.sources || []), dqbScoreUrl, dqbInfoUrl, dqbRulesUrl]);
dqb.admissions.formulas = [
  { method: "THPT", text: dqbThptFormula, sourceUrl: dqbRulesUrl },
  { method: "Học bạ", text: dqbHocBaFormula, sourceUrl: dqbRulesUrl }
];
const dqbOfficialRows = dqbPrograms.reduce((total, program) => total + program[2].length, 0);

// Đại học Đông Á: công bố trực tiếp ngưỡng trúng tuyển theo nhóm ngành và từng phương thức.
const dad = byCode.get("DAD");
const dadUrl = "https://donga.edu.vn/tin-tuc/ttsk-chi-tiet/truong-dai-hoc-dong-a-cong-bo-diem-chuan-trung-tuyen-nam-2026-44629";
const dadRulesUrl = "https://donga.edu.vn/tin-tuc/ttsk-chi-tiet/Dai-hoc-Dong-A-thong-bao-tuyen-sinh-bac-dai-hoc-chinh-quy-nam-2026-42971";
const dadOldRows = majors.filter((major) => major.universityId === dad.id);
const dadCanonicalKey = (name) => {
  const value = nameKey(name);
  if (value === "marketing digital marketing") return "marketing";
  if (value === "quan tri dv du lich va lu hanh") return "quan tri dich vu du lich va lu hanh";
  return value;
};
const dadGroups = new Map();
for (const row of dadOldRows) {
  const groupKey = dadCanonicalKey(row.name);
  const group = dadGroups.get(groupKey) || [];
  group.push(row);
  dadGroups.set(groupKey, group);
}
const dadPrograms = [...dadGroups.entries()].map(([groupKey, rows]) => {
  const rowWithCode = rows.find((row) => /^\d{7}$/.test(row.code));
  const rowWithCombination = rows.find((row) => row.combination && !/chưa xác minh/i.test(row.combination));
  const code = groupKey === "marketing" ? "7340115" : rowWithCode?.code;
  const name = groupKey === "marketing" ? "Marketing" : rowWithCode?.name || rowWithCombination?.name || rows[0].name;
  if (!code || !rowWithCombination) throw new Error(`DAD thiếu mã hoặc tổ hợp cho ${name}`);
  return [code, name, rowWithCombination.combination];
});
const dadGroup = (name) => {
  const value = nameKey(name);
  if (value === "y khoa") return "medicine";
  if (["duoc hoc", "luat", "luat kinh te"].includes(value)) return "pharmacy_law";
  if (["dieu duong", "ho sinh", "ky thuat phuc hoi chuc nang"].includes(value)) return "nursing";
  return "other";
};
const dadThptScores = { medicine: 22, pharmacy_law: 20, nursing: 18, other: 15 };
const dadHocBaScores = { medicine: 23.78, pharmacy_law: 22.07, nursing: 20.4, other: 18 };
const dadCombinedScores = { medicine: 20, pharmacy_law: 18, nursing: 16.5 };
const dadVactScores = {
  medicine: { A00: 717, B00: 749 },
  pharmacy_law: { A00: 645, B00: 656, A01: 797, C00: 520, D01: 762 },
  nursing: { A00: 586, A01: 726, B00: 588, C00: 462, D01: 664 },
  other: { A00: 501, A01: 618, B00: 491, C00: 382, D01: 513 }
};
const dadThptFormula = "Điểm xét tuyển THPT = tổng điểm 03 môn trong tổ hợp + điểm khu vực + điểm ưu tiên; các điều kiện học lực/môn thành phần áp dụng riêng cho nhóm sức khỏe và luật.";
const dadHocBaFormula = "Điểm học bạ = tổng điểm trung bình 03 môn theo tổ hợp của lớp 10, lớp 11 và lớp 12 + điểm ưu tiên; phương thức này áp dụng theo điều kiện dành cho thí sinh tốt nghiệp trước năm 2026.";
const dadCombinedFormula = "Xét kết hợp học bạ và thi THPT theo điều kiện học lực lớp 12 cùng tổng điểm 03 môn thi hoặc điểm xét tốt nghiệp mà trường công bố cho từng nhóm ngành.";
const dadVactFormula = "Điểm kỳ thi V-ACT được xét riêng theo tổ hợp A00, A01, B00, C00 hoặc D01; đồng thời áp dụng điều kiện học lực và điểm thi tốt nghiệp đối với các nhóm ngành có yêu cầu.";
majors = majors.filter((major) => major.universityId !== dad.id);
let dadIndex = 0;
for (const [code, name, combination] of dadPrograms) {
  const group = dadGroup(name);
  const common = { universityId: dad.id, code, nationalMajorCode: code, name, combinationStatus: "verified", subjects: [], calculationVerified: false, dataStatus: "verified", sourceName: "Trường Đại học Đông Á", sourceUrl: dadUrl, importTag };
  const pushDad = ({ method, methodDetails, rowCombination = combination, formula, formulaText, score, scale = 30 }) => {
    dadIndex += 1;
    majors.push({
      ...common,
      id: `${dad.id}-${importTag}-${dadIndex}`,
      combination: rowCombination,
      method,
      methodDetails,
      formula,
      formulaText,
      formulaSourceUrl: dadUrl,
      cutoff: { year: 2026, score, scale, scaleStatus: "reported", method, status: "verified", sourceName: "Trường Đại học Đông Á", sourceUrl: dadUrl }
    });
  };
  pushDad({ method: "THPT", methodDetails: "Xét điểm thi tốt nghiệp THPT 2026", formula: "dad-thpt-2026", formulaText: dadThptFormula, score: dadThptScores[group] });
  pushDad({ method: "Học bạ", methodDetails: "Áp dụng cho thí sinh tốt nghiệp trước năm 2026", formula: "dad-hocba-2026", formulaText: dadHocBaFormula, score: dadHocBaScores[group] });
  if (dadCombinedScores[group] != null) {
    pushDad({ method: "Kết hợp học bạ và THPT", methodDetails: "Điều kiện trúng tuyển kết hợp dành cho nhóm ngành có yêu cầu", formula: "dad-ket-hop-2026", formulaText: dadCombinedFormula, score: dadCombinedScores[group] });
  }
  const allowedCombinations = new Set(combination.split(";").map((value) => value.trim()));
  for (const [assessmentCombination, score] of Object.entries(dadVactScores[group])) {
    if (!allowedCombinations.has(assessmentCombination)) continue;
    pushDad({ method: "ĐGNL V-ACT", methodDetails: `Ngưỡng V-ACT theo tổ hợp ${assessmentCombination}`, rowCombination: assessmentCombination, formula: "dad-dgnl-2026", formulaText: dadVactFormula, score, scale: 1200 });
  }
}
setProfile("DAD", {
  status: "official_verified",
  url: dadUrl,
  methods: ["THPT", "Học bạ", "Kết hợp học bạ và THPT", "ĐGNL V-ACT", "Xét tuyển thẳng"],
  note: `Đã chuẩn hóa đủ ${dadPrograms.length} ngành, mã ngành và tổ hợp; cập nhật ${dadIndex} mức điểm/ngưỡng trúng tuyển chính thức năm 2026 theo nhóm ngành và phương thức.`
});
dad.admissions.sources = unique([...(dad.admissions.sources || []), dadRulesUrl]);
dad.admissions.formulas = [
  { method: "THPT", text: dadThptFormula, sourceUrl: dadUrl },
  { method: "Học bạ", text: dadHocBaFormula, sourceUrl: dadUrl },
  { method: "Kết hợp học bạ và THPT", text: dadCombinedFormula, sourceUrl: dadUrl },
  { method: "ĐGNL V-ACT", text: dadVactFormula, sourceUrl: dadUrl }
];
const dadOfficialRows = dadIndex;

// Học viện Hành chính và Quản trị công: tách đúng mã, ngành và điểm sau quy đổi cho từng cơ sở.
const apagScoreUrl = "https://thi.tuyensinh247.com/hoc-vien-hanh-chinh-va-quan-tri-cong-cong-bo-diem-chuan-nam-2026-c24a90936.html";
const apagInfoUrl = "https://apag.edu.vn/thong-tin-tuyen-sinh-trinh-do-dai-hoc-hinh-thuc-chinh-quy-nam-2026-cua-hoc-vien-hanh-chinh-va-quan-tri-cong-8772.htm";
const apagProgramUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/hoc-vien-hanh-chinh-va-quan-tri-cong-HCH.html";
const apagFormula = "Điểm trúng tuyển là kết quả đã quy đổi về phương thức gốc và tổ hợp gốc D01 trên thang 30, đã gồm điểm cộng và điểm ưu tiên theo quy định năm 2026.";
function replaceApagCampus(code, programs, campusName) {
  const university = byCode.get(code);
  majors = majors.filter((major) => major.universityId !== university.id);
  for (const [index, [majorCode, name, combination, score]] of programs.entries()) {
    majors.push({
      id: `${university.id}-${importTag}-apag-${index + 1}`,
      universityId: university.id,
      code: majorCode,
      nationalMajorCode: majorCode.slice(0, 5),
      name,
      combination,
      combinationStatus: "verified",
      subjects: [],
      method: "Điểm trúng tuyển sau quy đổi",
      methodDetails: "Quy đổi về phương thức gốc, tổ hợp D01, thang điểm 30",
      formula: "hch-quy-doi-2026",
      formulaText: apagFormula,
      formulaSourceUrl: apagInfoUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "Học viện Hành chính và Quản trị công",
      sourceUrl: apagScoreUrl,
      importTag,
      cutoff: { year: 2026, score, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Học viện Hành chính và Quản trị công", sourceUrl: apagScoreUrl }
    });
  }
  setProfile(code, {
    status: "official_verified",
    url: apagInfoUrl,
    methods: ["THPT", "Học bạ kết hợp THPT", "ĐGNL HSA kết hợp THPT", "ĐGNL V-ACT kết hợp THPT", "Xét tuyển thẳng"],
    note: `Đã cập nhật đủ ${programs.length} mã tuyển sinh, ngành/chuyên ngành, tổ hợp và điểm trúng tuyển sau quy đổi năm 2026 tại ${campusName}.`
  });
  university.admissions.sources = unique([...(university.admissions.sources || []), apagScoreUrl, apagProgramUrl]);
  university.admissions.formulas = [
    { method: "Điểm trúng tuyển sau quy đổi", text: apagFormula, sourceUrl: apagInfoUrl },
    { method: "THPT", text: "Điểm xét tuyển = tổng điểm 03 môn thi trong tổ hợp + điểm cộng + điểm ưu tiên; được quy đổi về tổ hợp D01.", sourceUrl: apagProgramUrl },
    { method: "Học bạ kết hợp THPT", text: "Điểm học bạ 03 môn của lớp 10, 11, 12 theo tổ hợp, kết hợp điều kiện điểm thi THPT, sau đó quy đổi về D01 và cộng điểm ưu tiên.", sourceUrl: apagProgramUrl },
    { method: "ĐGNL HSA/V-ACT kết hợp THPT", text: "Điểm HSA hoặc V-ACT kết hợp điều kiện điểm thi THPT được quy đổi về thang 30 và tổ hợp D01, cộng điểm ưu tiên.", sourceUrl: apagProgramUrl }
  ];
  return programs.length;
}

const hchPrograms = [
  ["73444HN", "Quản trị nhân lực", "A01; C01; C04; D01", 24.1],
  ["73446HN", "Quản trị văn phòng", "A01; A07; D01; D14", 23.5],
  ["73122HN", "Xây dựng Đảng và chính quyền nhà nước", "C00; C03; D01; D14", 23.6],
  ["73811HN", "Luật", "A00; A01; C04; D01", 23.9],
  ["738111HN", "Chuyên ngành Thanh tra thuộc ngành Luật", "A00; A01; C04; D01", 23.9],
  ["73111HN", "Kinh tế", "A01; C01; D01; D10", 23.35],
  ["731111HN", "Chuyên ngành Kinh tế du lịch thuộc ngành Kinh tế", "A01; C01; D01; D10", 23.35],
  ["73125HN", "Quản lý nhà nước", "C04; D01; D14; D15", 22.95],
  ["731251HN", "Chuyên ngành Quản trị tổ chức thuộc ngành Quản lý nhà nước", "C04; D01; D14; D15", 22.95],
  ["731252HN", "Chuyên ngành Quản trị địa phương thuộc ngành Quản lý nhà nước", "C04; D01; D14; D15", 22.95],
  ["73125EHN", "Quản lý nhà nước (50% chương trình bằng tiếng Anh)", "D01; D14; D15", 20],
  ["73121HN", "Chính trị học", "C00; C03; C04; D01", 22.7],
  ["73233HN", "Lưu trữ học", "C00; C03; D01; D14", 22.7],
  ["732331HN", "Chuyên ngành Văn thư - Lưu trữ thuộc ngành Lưu trữ học", "C00; C03; D01; D14", 22.7],
  ["73221HN", "Thông tin - thư viện", "C00; D01; D14; D15", 21.7],
  ["78113HN", "Quản trị dịch vụ du lịch và lữ hành", "C01; D01; D10; D15", 22.9],
  ["72942HN", "Quản lý văn hóa", "C04; D01; D14; D15", 23.35],
  ["729421HN", "Chuyên ngành Quản lý di sản văn hóa và phát triển du lịch thuộc ngành Quản lý văn hóa", "C04; D01; D14; D15", 23.35],
  ["729401HN", "Chuyên ngành Văn hóa Du lịch thuộc ngành Văn hóa học", "C04; D01; D14; D15", 23.7],
  ["729402HN", "Chuyên ngành Văn hóa Truyền thông thuộc ngành Văn hóa học", "C04; D01; D14; D15", 23.7],
  ["74814HN", "Hệ thống thông tin", "A00; A01; D01; X26", 21.05],
  ["748141HN", "Chuyên ngành Hệ thống thông tin thương mại điện tử thuộc ngành Hệ thống thông tin", "A00; A01; D01; X26", 21.05]
];
const hcsPrograms = [
  ["73811HCM", "Luật", "C03; C04; D01; D10", 22.9],
  ["738111HCM", "Chuyên ngành Thanh tra thuộc ngành Luật", "C03; C04; D01; D10", 22.9],
  ["73444HCM", "Quản trị nhân lực", "C01; C04; D01; D10", 22.7],
  ["73446HCM", "Quản trị văn phòng", "C03; C04; D01; D10", 21.6],
  ["73125HCM", "Quản lý nhà nước", "C03; C04; D01; D10", 22.9],
  ["73122HCM", "Xây dựng Đảng và chính quyền nhà nước", "C00; C03; C04; D01", 22.65],
  ["73111HCM", "Kinh tế", "A01; D01; D10; D15", 17.25],
  ["73233HCM", "Lưu trữ học", "C00; C03; D01; D14", 20.3],
  ["732331HCM", "Chuyên ngành Văn thư - Lưu trữ thuộc ngành Lưu trữ học", "C00; C03; D01; D14", 20.3]
];
const hcqPrograms = [
  ["73125DN", "Quản lý nhà nước", "C00; C03; D01; D15", 20],
  ["73444DN", "Quản trị nhân lực", "A01; C04; D01; D10", 20],
  ["73446DN", "Quản trị văn phòng", "C00; D01; D14; D15", 17],
  ["73811DN", "Luật", "A00; C00; C01; D01", 21],
  ["738111DN", "Chuyên ngành Thanh tra thuộc ngành Luật", "A00; C00; C03; D01", 21],
  ["78113DN", "Quản trị dịch vụ du lịch và lữ hành", "C00; D01; D14; D15", 17],
  ["73111DN", "Kinh tế", "A00; A01; D01; D10", 16]
];
const hctnPrograms = [
  ["73444DL", "Quản trị nhân lực", "A00; A01; C01; D01", 15.5],
  ["73811DL", "Luật", "A00; C00; C04; D01", 20],
  ["73125DL", "Quản lý nhà nước", "A00; C00; D01; D10", 16],
  ["73111DL", "Kinh tế", "C00; C01; D01; D10", 15.5]
];
const hchOfficialRows = replaceApagCampus("HCH", hchPrograms, "trụ sở Hà Nội");
const hcsOfficialRows = replaceApagCampus("HCS", hcsPrograms, "phân hiệu TP.HCM");
const hcqOfficialRows = replaceApagCampus("HCQ", hcqPrograms, "phân hiệu TP. Đà Nẵng");
const hctnOfficialRows = replaceApagCampus("HCTN", hctnPrograms, "phân hiệu Đắk Lắk");
byCode.get("HCH").name = "Học viện Hành chính và Quản trị công";
byCode.get("HCS").name = "Phân hiệu Học viện Hành chính và Quản trị công tại TP.HCM";
byCode.get("HCQ").name = "Phân hiệu Học viện Hành chính và Quản trị công tại TP. Đà Nẵng";
byCode.get("HCTN").name = "Phân hiệu Học viện Hành chính và Quản trị công tại Đắk Lắk";

// Đại học Kiên Giang: bảng điểm chính thức có 28/30 mã và bốn cột phương thức.
const tkg = byCode.get("TKG");
const tkgScoreUrl = "https://thi.tuyensinh247.com/diem-chuan-dai-hoc-kien-giang-kgu-nam-2026-c24a90971.html";
const tkgInfoUrl = "https://diemthi.tuyensinh247.com/thong-tin-dai-hoc-kien-giang-TKG.html";
const tkgRulesUrl = "https://tuyensinh.vnkgu.edu.vn/bai-viet/nguon-xet-tuyen-va-mo-ta-cac-phuong-thuc-tuyen-sinh";
const tkgPrograms = [
  ["7140201", "Giáo dục Mầm non", "A00; A01; X21; C03; X01; D01", 21.55, 22.8, 805, null],
  ["7140202", "Giáo dục Tiểu học", "A00; A01; X21; C03; X01; D01", 26.7, 27.45, 1045, null],
  ["7140209", "Sư phạm Toán học", "A00; A01; X17; X21; D01; D09", 28.55, 28.88, 1131, null],
  ["7140231", "Sư phạm Tiếng Anh", "D01; D09; D11; D14; D15; X78", 26.1, 26.99, 1017, null],
  ["7140247", "Sư phạm Khoa học tự nhiên", "A00; A01; A02; B00; D07; D08", null, null, null, null],
  ["7220101", "Tiếng Việt và Văn hóa Việt Nam", "C00; C03; X01; X70; X74; D01", 18, 19.25, 640, 251],
  ["7220201", "Ngôn ngữ Anh", "D01; D09; D11; D14; D15; X78", 16, 17.25, 547, 217],
  ["7320104", "Truyền thông đa phương tiện", "A00; A01; C00; X01; X74; D01", 15, 16, 500, 200],
  ["7340101", "Quản trị kinh doanh", "A00; A01; X17; X21; D01; D09", 15, 16, 500, 200],
  ["7340120", "Kinh doanh quốc tế", "A00; A01; X17; X21; D01; D09", 15, 16, 500, 200],
  ["7340122", "Thương mại điện tử", "A00; A01; X17; X21; D01; D09", 15, 16, 500, 200],
  ["7340201", "Tài chính - Ngân hàng", "A00; A01; X17; X21; D01; D09", 15, 16, 500, 200],
  ["7340301", "Kế toán", "A00; A01; X17; X21; D01; D09", 15, 16, 500, 200],
  ["7380101", "Luật", "C00; C03; C04; X70; X74; D01", 20, 21.25, 733, 285],
  ["7420201", "Công nghệ sinh học", "B00; B01; B03; X13; B08; C08", 15, 16, 500, 200],
  ["7480107", "Trí tuệ nhân tạo", "A00; A01; X17; X21; D01; D09", 15, 16, 500, 200],
  ["7480201", "Công nghệ thông tin", "A00; A01; X17; X21; D01; D09", 15, 16, 500, 200],
  ["7510103", "Công nghệ kỹ thuật xây dựng", "A00; A01; X17; X21; D01; D09", 15, 16, 500, 200],
  ["7510205", "Công nghệ kỹ thuật ô tô", "A00; A01; X17; X21; D01; D09", 15, 16, 500, 200],
  ["7510406", "Công nghệ kỹ thuật môi trường", "A00; A07; X21; C03; C04; D01", 15, 16, 500, 200],
  ["7520216", "Kỹ thuật điều khiển và tự động hóa", "A00; A01; X17; X21; D01; D09", 15, 16, 500, 200],
  ["7540101", "Công nghệ thực phẩm", "A00; A02; B00; B01; B03; D07", 15, 16, 500, 200],
  ["7580302", "Quản lý xây dựng", "A00; A01; X17; X21; D01; D09", null, null, null, null],
  ["7620105", "Chăn nuôi", "A02; B00; B01; B03; B08; C13", 15, 16, 500, 200],
  ["7620110", "Khoa học cây trồng", "A02; B00; B03; X13; C08; C13", 15, 16, 500, 200],
  ["7620301", "Nuôi trồng thủy sản", "A02; B00; B01; B03; B04; B08", 15, 16, 500, 200],
  ["7640101", "Thú y", "A02; B00; B01; B03; B08; C13", 15, 16, 500, 200],
  ["7810101", "Du lịch", "C00; C03; C04; X01; X74; D01", 16, 17.25, 547, 217],
  ["7810202", "Quản trị nhà hàng và dịch vụ ăn uống", "A01; C00; C03; D01; D10; D15; X78", 15, 16, 500, 200],
  ["7850101", "Quản lý tài nguyên và môi trường", "X21; C00; C04; X74; D01; D15", 15, 16, 500, 200]
];
const tkgMethods = [
  ["THPT", 3, 30, "Điểm xét tuyển = tổng điểm 03 môn thi trong tổ hợp + điểm cộng + điểm ưu tiên theo quy định."],
  ["Học bạ", 4, 30, "Điểm xét tuyển = tổng điểm học bạ của 03 môn trong tổ hợp + điểm cộng + điểm ưu tiên theo quy định."],
  ["ĐGNL V-ACT", 5, 1200, "Sử dụng điểm kỳ thi V-ACT của ĐHQG TP.HCM, cộng điểm ưu tiên theo quy định của trường."],
  ["V-SAT", 6, 450, "Điểm xét tuyển = tổng điểm 03 môn thi V-SAT theo tổ hợp + điểm ưu tiên theo quy định; thang điểm 450."]
];
majors = majors.filter((major) => major.universityId !== tkg.id);
let tkgIndex = 0;
for (const program of tkgPrograms) {
  const [code, name, combination] = program;
  for (const [method, scoreIndex, scale, formulaText] of tkgMethods) {
    const score = program[scoreIndex];
    const published = Number.isFinite(score);
    tkgIndex += 1;
    majors.push({
      id: `${tkg.id}-${importTag}-${tkgIndex}`,
      universityId: tkg.id,
      code,
      nationalMajorCode: code,
      name,
      combination: method === "ĐGNL V-ACT" ? "Kết quả kỳ thi V-ACT" : method === "V-SAT" ? "03 môn thi V-SAT theo tổ hợp" : combination,
      combinationStatus: "verified",
      subjects: [],
      method,
      methodDetails: method,
      formula: `tkg-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
      formulaText,
      formulaSourceUrl: tkgRulesUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: published ? "Công bố điểm chuẩn Đại học Kiên Giang" : "Thông tin tuyển sinh Đại học Kiên Giang",
      sourceUrl: published ? tkgScoreUrl : tkgInfoUrl,
      importTag,
      cutoff: {
        year: 2026,
        score,
        ...(published ? { scale, scaleStatus: "reported" } : {}),
        method,
        status: published ? "verified" : "not_published",
        sourceName: "Trường Đại học Kiên Giang",
        sourceUrl: published ? tkgScoreUrl : tkgInfoUrl
      }
    });
  }
}
setProfile("TKG", {
  status: "official_verified",
  url: tkgRulesUrl,
  methods: [...tkgMethods.map(([method]) => method), "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 30 ngành, mã ngành, tổ hợp và công thức; bảng chính thức có 108 mức điểm năm 2026 cho 28 ngành. Hai ngành chưa xuất hiện trong bảng và bốn ô V-SAT ký hiệu x được ghi Chưa công bố."
});
tkg.admissions.sources = unique([...(tkg.admissions.sources || []), tkgScoreUrl, tkgInfoUrl]);
tkg.admissions.formulas = tkgMethods.map(([method, , , text]) => ({ method, text, sourceUrl: tkgRulesUrl }));
const tkgOfficialRows = tkgPrograms.flatMap((program) => program.slice(3)).filter(Number.isFinite).length;
const tkgNotPublishedRows = tkgPrograms.length * tkgMethods.length - tkgOfficialRows;

// Đại học Đông Đô: bảng điểm chuẩn chính thức gồm 17 ngành, lấy THPT làm phương thức gốc sau quy đổi.
const ddu = byCode.get("DDU");
const dduScoreUrl = "https://hdiu.edu.vn/tin-tuc/hoi-dong-tuyen-sinh-truong-dai-hoc-dong-do-chinh-thuc-cong-bo-diem-chuan-trung-tuyen-dai-hoc-chinh-quy-nam-2026-5285.html";
const dduInfoUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-dong-do-DDU.html";
const dduPrograms = [
  ["7220204", "Ngôn ngữ Trung Quốc", "A00; C00; C02; C03; C04; C14; D01; D04; D10; D14; D15; D66; X02; X70; X78", 15],
  ["7220209", "Ngôn ngữ Nhật", "A00; C00; C02; C03; C04; C14; D01; D06; D10; D14; D15; D66; X02; X70; X78", 15],
  ["7220210", "Ngôn ngữ Hàn Quốc", "A00; C00; C02; C03; C04; C14; D01; D02; D10; D14; D15; D66; X02; X70; X78", 15],
  ["7310205", "Quản lý nhà nước", "A00; C00; C02; C03; C04; C14; D01; D02; D10; D14; D15; D66; X02; X70; X78", 15],
  ["7340101", "Quản trị kinh doanh", "A00; A01; A03; C00; C01; C03; C04; C14; D01; X02; X03; X05; X06; X26; X27", 15],
  ["7340122", "Thương mại điện tử", "A00; A01; A03; C00; C01; C03; C04; C14; D01; X02; X03; X05; X06; X26; X27", 15],
  ["7340201", "Tài chính - Ngân hàng", "A00; A01; A03; C00; C01; C03; C04; C14; D01; X02; X03; X05; X06; X26; X27", 15],
  ["7340301", "Kế toán", "A00; A01; A03; C00; C01; C03; C04; C14; D01; X02; X03; X05; X06; X26; X27", 15],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "A00; A01; A03; C00; C01; C03; C04; C14; D01; X02; X03; X05; X06; X26; X27", 15],
  ["7380107", "Luật kinh tế", "A00; A01; A03; C00; C01; C03; C04; C14; D01; X02; X03; X05; X06; X26; X27", 20],
  ["7480201", "Công nghệ thông tin", "A00; A01; A03; A16; C01; C02; D01; D07; X02; X03; X05; X06; X07; X26; X27", 15],
  ["7510205", "Công nghệ kỹ thuật ô tô", "A00; A01; A03; A16; C01; C02; D01; D07; X02; X03; X05; X06; X07; X26; X27", 15],
  ["7510303", "Công nghệ kỹ thuật điều khiển và tự động hóa", "A00; A01; A03; A16; C01; C02; D01; D07; X02; X03; X05; X06; X07; X26; X27", 15],
  ["7640101", "Thú y", "A00; A01; A02; A05; A11; B00; B01; B02; B03; B08; C02; C03; D01; D07; D08; X02", 15],
  ["7720201", "Dược học", "A00; A02; A05; A06; A11; B00; B02; B03; B04; B08; C02; C08; D07; D08; X13", 20],
  ["7720301", "Điều dưỡng", "A00; A02; A05; A06; A11; B00; B02; B03; B04; B08; C02; C08; D07; D08; X13", 18],
  ["7720601", "Kỹ thuật xét nghiệm y học", "A00; A02; A05; A06; A11; B00; B02; B03; B04; B08; C02; C08; D07; D08; X13", 18]
];
const dduFormula = "Điểm chuẩn là tổng điểm 03 môn thi THPT theo tổ hợp, cộng điểm cộng và điểm ưu tiên. Điểm học bạ, HSA, TSA hoặc SPT được quy đổi tuyến tính về phương thức THPT theo khoảng điểm trường công bố.";
majors = majors.filter((major) => major.universityId !== ddu.id);
for (const [index, [code, name, combination, score]] of dduPrograms.entries()) {
  majors.push({
    id: `${ddu.id}-${importTag}-${index + 1}`,
    universityId: ddu.id,
    code,
    nationalMajorCode: code,
    name,
    combination,
    combinationStatus: "verified",
    subjects: [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: "Phương thức gốc là kết quả thi tốt nghiệp THPT; các phương thức khác quy đổi tương đương về thang 30",
    formula: "ddu-quy-doi-2026",
    formulaText: dduFormula,
    formulaSourceUrl: dduScoreUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "Trường Đại học Đông Đô",
    sourceUrl: dduScoreUrl,
    importTag,
    cutoff: { year: 2026, score, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Trường Đại học Đông Đô", sourceUrl: dduScoreUrl }
  });
}
setProfile("DDU", {
  status: "official_verified",
  url: dduScoreUrl,
  methods: ["THPT", "Học bạ", "ĐGNL HSA", "ĐGTD TSA", "ĐGNL SPT", "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 17 ngành, mã ngành, tổ hợp và điểm chuẩn chính thức năm 2026; các phương thức ngoài THPT được quy đổi tương đương về cùng mức điểm chuẩn."
});
ddu.admissions.sources = unique([...(ddu.admissions.sources || []), dduInfoUrl]);
ddu.admissions.formulas = [
  { method: "THPT", text: "Điểm xét tuyển = tổng điểm 03 môn thi trong tổ hợp + điểm cộng + điểm ưu tiên theo quy định.", sourceUrl: dduScoreUrl },
  { method: "Học bạ/HSA/TSA/SPT", text: "Y = A + (X - M) × (B - A) / (N - M), trong đó Y là điểm quy đổi về THPT và X là điểm của phương thức đầu vào.", sourceUrl: dduScoreUrl }
];
const dduOfficialRows = dduPrograms.length;

// Đại học Kinh tế - Công nghệ Thái Nguyên (mã DVB): 22 mã xét tuyển theo Thông báo 352/TB-TUETECH-HĐTS.
const dvb = byCode.get("DVB");
const dvbScoreUrl = "https://tuyensinh.tuetech.edu.vn/thong-bao-diem-trung-tuyen-dai-hoc-chinh-quy-nam-2026-dt108.html";
const dvbInfoUrl = "https://tuyensinh.tuetech.edu.vn/thong-tin-tuyen-sinh-dai-hoc-chinh-quy-nam-2026-dt101.html";
const dvbPrograms = [
  ["A1QH", "Quản trị kinh doanh tổng hợp", "7340101", "Quản trị kinh doanh", "A01; C00; D01; X78", 15],
  ["A1QD", "Quản trị doanh nghiệp công nghiệp", "7340101", "Quản trị kinh doanh", "A01; C00; D01; X78", 15],
  ["A1QK", "Quản lý kinh tế", "7340101", "Quản trị kinh doanh", "A01; C00; D01; X78", 15],
  ["A1KH", "Kế toán tổng hợp", "7340301", "Kế toán", "A01; C00; D01; X78", 15],
  ["A1KD", "Kế toán doanh nghiệp công nghiệp", "7340301", "Kế toán", "A01; C00; D01; X78", 15],
  ["A1EM", "Marketing", "7340115", "Marketing", "A01; D01; D10; X01", 15],
  ["A1ET", "Marketing thương mại", "7340115", "Marketing", "A01; D01; D10; X01", 15],
  ["A1LU", "Luật", "7380101", "Luật", "C00; D01; D15; X01", 20],
  ["A1LD", "Luật dân sự", "7380101", "Luật", "C00; D01; D15; X01", 20],
  ["A1LH", "Luật hình sự", "7380101", "Luật", "C00; D01; D15; X01", 20],
  ["A1TC", "Công nghệ thông tin", "7480201", "Công nghệ thông tin", "A00; A01; D01; X06", 15],
  ["A1CK", "Cơ khí chế tạo máy", "7520103", "Kỹ thuật cơ khí", "A00; A01; D01; X07", 15],
  ["A1CO", "Cơ khí động lực - ô tô", "7520103", "Kỹ thuật cơ khí", "A00; A01; D01; X07", 15],
  ["A1CN", "Công nghệ kỹ thuật cơ khí", "7520103", "Kỹ thuật cơ khí", "A00; A01; D01; X07", 15],
  ["A1DT", "Điện tự động hóa", "7520201", "Kỹ thuật điện", "A00; A01; D01; X07", 15],
  ["A1DH", "Hệ thống điện", "7520201", "Kỹ thuật điện", "A00; A01; D01; X07", 15],
  ["A1DC", "Công nghệ kỹ thuật điện", "7520201", "Kỹ thuật điện", "A00; A01; D01; X07", 15],
  ["A1IC", "Kỹ thuật Cơ điện tử", "7520114", "Kỹ thuật Cơ điện tử", "A00; A01; D01; X26", 15],
  ["A1GK", "Công nghệ kỹ thuật điều khiển", "7510303", "Công nghệ kỹ thuật điều khiển và tự động hóa", "A00; A01; D01; X26", 15],
  ["A1GT", "Công nghệ tự động hóa", "7510303", "Công nghệ kỹ thuật điều khiển và tự động hóa", "A00; A01; D01; X26", 15],
  ["A1HH", "Ngôn ngữ Hàn Quốc", "7220210", "Ngôn ngữ Hàn Quốc", "C00; D01; D15; DH6", 15],
  ["A1AA", "Ngôn ngữ Anh", "7220201", "Ngôn ngữ Anh", "A01; D01; D10; D15", 15]
];
const dvbFormula = "Điểm trúng tuyển là điểm xét tuyển của phương thức sau khi quy đổi về thang 30, đã gồm điểm cộng và điểm ưu tiên nếu có.";
majors = majors.filter((major) => major.universityId !== dvb.id);
for (const [index, [code, name, nationalMajorCode, majorName, combination, score]] of dvbPrograms.entries()) {
  majors.push({
    id: `${dvb.id}-${importTag}-${index + 1}`,
    universityId: dvb.id,
    code,
    nationalMajorCode,
    name: normalize(name) === normalize(majorName) ? name : `${name} (${majorName})`,
    combination,
    combinationStatus: "verified",
    subjects: [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: "Mức điểm chung cho các phương thức sau quy đổi về thang 30",
    formula: "dvb-quy-doi-2026",
    formulaText: dvbFormula,
    formulaSourceUrl: dvbScoreUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "Trường Đại học Kinh tế - Công nghệ Thái Nguyên",
    sourceUrl: dvbScoreUrl,
    importTag,
    cutoff: { year: 2026, score, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Trường Đại học Kinh tế - Công nghệ Thái Nguyên", sourceUrl: dvbScoreUrl }
  });
}
dvb.name = "Trường Đại học Kinh tế - Công nghệ Thái Nguyên";
dvb.shortName = "TUETECH";
setProfile("DVB", {
  status: "official_verified",
  url: dvbScoreUrl,
  methods: ["THPT", "Học bạ", "ĐGNL", "Xét tuyển thẳng"],
  note: "Đã cập nhật tên trường mới, đủ 22 mã xét tuyển/chuyên ngành, mã ngành, tổ hợp và điểm trúng tuyển chính thức năm 2026 sau quy đổi."
});
dvb.admissions.sources = unique([...(dvb.admissions.sources || []), dvbInfoUrl]);
dvb.admissions.formulas = [{ method: "Điểm trúng tuyển sau quy đổi", text: dvbFormula, sourceUrl: dvbScoreUrl }];
const dvbOfficialRows = dvbPrograms.length;

// FBU: 12 chương trình trong bảng điểm chuẩn 2026, dùng một mức trúng tuyển sau quy đổi giữa ba phương thức.
const fbu = byCode.get("FBU");
const fbuScoreUrl = "https://fbu.edu.vn/chinh-thuc-cong-bo-diem-chuan-trung-tuyen-he-dai-hoc-chinh-quy-nam-2026-truong-dai-hoc-tai-chinh-ngan-hang-ha-noi/";
const fbuInfoUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-tai-chinh-ngan-hang-ha-noi-FBU.html";
const fbuRulesUrl = "https://diemthi.tuyensinh247.com/quy-doi-diem/truong-dai-hoc-tai-chinh-ngan-hang-ha-noi-FBU.html";
const fbuPrograms = [
  ["7220201", "Ngôn ngữ Anh", "7220201", "A01; D01; D10; X25", 17],
  ["FB16", "Ngôn ngữ Trung Quốc", "7220204", "A01; D01; D10; X25; C00; C04; D04", 21.5],
  ["7340101", "Quản trị kinh doanh", "7340101", "A00; A01; C04; D01; X01; X02", 17],
  ["EP01", "Kinh doanh quốc tế (chương trình đào tạo bằng tiếng Anh)", "7340120", "A01; D01; D07; D09; D10; X25", 18],
  ["7340121", "Kinh doanh thương mại", "7340121", "A00; A01; C04; D01; X01; X02", 17],
  ["7340201", "Tài chính - Ngân hàng", "7340201", "A00; A01; C04; D01; X01; X02", 18],
  ["7340301", "Kế toán", "7340301", "A00; A01; C04; D01; X01; X02", 21],
  ["7340302", "Kiểm toán", "7340302", "A00; A01; C04; D01; X01; X02", 19],
  ["7380107", "Luật kinh tế", "7380107", "A00; A01; C04; D01; X01; X02", 20],
  ["7480201", "Công nghệ thông tin", "7480201", "A00; A01; C04; D01; X01; X02", 17],
  ["DDP1", "Ngôn ngữ Trung Quốc (chương trình cử nhân liên kết quốc tế)", "7220204", "A00; A01; D07", 21.5],
  ["DDP2", "Kinh doanh quốc tế (chương trình cử nhân liên kết quốc tế)", "7340120", "A00; A01; D07", 18]
];
const fbuFormula = "Điểm của học bạ hoặc HSA được quy đổi tuyến tính sang thang điểm THPT theo các khoảng tương đương; cộng điểm ưu tiên sau quy đổi theo quy định năm 2026.";
majors = majors.filter((major) => major.universityId !== fbu.id);
for (const [index, [code, name, nationalMajorCode, combination, score]] of fbuPrograms.entries()) {
  majors.push({
    id: `${fbu.id}-${importTag}-${index + 1}`,
    universityId: fbu.id,
    code,
    nationalMajorCode,
    name,
    combination,
    combinationStatus: "verified",
    subjects: [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: "Mức điểm chung sau quy đổi THPT, học bạ và HSA về phương thức gốc THPT",
    formula: "fbu-quy-doi-2026",
    formulaText: fbuFormula,
    formulaSourceUrl: fbuRulesUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "Trường Đại học Tài chính - Ngân hàng Hà Nội",
    sourceUrl: fbuScoreUrl,
    importTag,
    cutoff: { year: 2026, score, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Trường Đại học Tài chính - Ngân hàng Hà Nội", sourceUrl: fbuScoreUrl }
  });
}
setProfile("FBU", {
  status: "official_verified",
  url: fbuScoreUrl,
  methods: ["THPT", "Học bạ", "ĐGNL HSA"],
  note: "Đã cập nhật đủ 12 chương trình trong bảng điểm chuẩn chính thức năm 2026, kèm mã ngành, tổ hợp và quy tắc quy đổi giữa THPT, học bạ và HSA."
});
fbu.admissions.sources = unique([...(fbu.admissions.sources || []), fbuInfoUrl, fbuRulesUrl]);
fbu.admissions.formulas = [
  { method: "THPT", text: genericFormula("THPT"), sourceUrl: fbuInfoUrl },
  { method: "Học bạ", text: "Điểm học bạ 06 học kỳ của 03 môn trong tổ hợp được quy đổi tuyến tính sang thang THPT theo bảng tương đương của FBU.", sourceUrl: fbuRulesUrl },
  { method: "ĐGNL HSA", text: "Điểm HSA được quy đổi tuyến tính sang thang THPT theo năm khoảng điểm FBU công bố.", sourceUrl: fbuRulesUrl }
];
const fbuOfficialRows = fbuPrograms.length;

// MIT Uni.: danh mục 2026 có 39 mã ngành/chuyên ngành; chưa có bảng điểm trúng tuyển cuối cùng có thể đối chiếu.
const mit = byCode.get("MIT");
const mitMethodsUrl = "https://mit.vn/cong-bo-cac-phuong-thuc-xet-tuyen-nam-2026/";
const mitInfoUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-cong-nghe-mien-dong-MIT.html";
const mitLanguage = "A00; A01; C00; C01; C03; C04; C14; C19; C20; D01; D14; D15";
const mitChinese = `${mitLanguage}; D04; D45`;
const mitEast = `${mitLanguage}; D06; DD2`;
const mitBusiness = `${mitLanguage}; D07; X71; X75`;
const mitTechnology = "A00; A01; A02; A03; A04; A07; C01; D01; D07; D08; X06; X10; X26";
const mitPrograms = [
  ["7210403", "Thiết kế đồ họa", `A00; A01; A02; A03; A04; A07; C00; C01; D01; D07; D08; X06; X10; X26`],
  ["7220201", "Ngôn ngữ Anh", mitLanguage],
  ["722020102", "Ngôn ngữ Anh (Tiếng Anh thương mại và văn hóa quốc tế)", mitLanguage],
  ["7220204", "Ngôn ngữ Trung Quốc", mitChinese],
  ["7310608", "Đông phương học", mitEast],
  ["731060801", "Đông phương học (Tiếng Hàn)", mitLanguage + "; DD2"],
  ["731060802", "Đông phương học (Tiếng Nhật)", mitLanguage + "; D06"],
  ["7320104", "Truyền thông đa phương tiện", mitBusiness],
  ["732010401", "Truyền thông đa phương tiện (Truyền thông số)", mitBusiness],
  ["732010402", "Truyền thông đa phương tiện (Truyền thông xã hội và nội dung số)", mitBusiness],
  ["7340101", "Quản trị kinh doanh", mitBusiness],
  ["734010102", "Quản trị kinh doanh (Quản trị dịch vụ hàng không)", mitBusiness],
  ["7340114", "Digital marketing", mitBusiness],
  ["7340120", "Kinh doanh quốc tế", mitBusiness],
  ["7340122", "Thương mại điện tử", mitBusiness],
  ["7340201", "Tài chính - Ngân hàng", mitBusiness],
  ["7340205", "Công nghệ tài chính", mitBusiness],
  ["7340301", "Kế toán", mitBusiness],
  ["7380107", "Luật kinh tế", mitBusiness],
  ["7480201", "Công nghệ thông tin", mitTechnology],
  ["748020101", "Công nghệ thông tin (Trí tuệ nhân tạo)", mitTechnology],
  ["748020103", "Công nghệ thông tin (Phân tích dữ liệu)", mitTechnology],
  ["7510205", "Công nghệ kỹ thuật ô tô", mitTechnology],
  ["751020502", "Công nghệ kỹ thuật ô tô (Ô tô điện và thông minh)", mitTechnology],
  ["7510301", "Công nghệ kỹ thuật điện, điện tử", mitTechnology],
  ["7510303", "Công nghệ kỹ thuật điều khiển và tự động hóa", mitTechnology],
  ["751030301", "Công nghệ kỹ thuật điều khiển và tự động hóa", mitTechnology],
  ["751030302", "Công nghệ kỹ thuật điều khiển và tự động hóa (Công nghệ UAV)", mitTechnology],
  ["7510601", "Quản lý công nghiệp", mitBusiness],
  ["7510605", "Logistics và quản lý chuỗi cung ứng", mitBusiness],
  ["751060502", "Logistics và quản lý chuỗi cung ứng (Logistics hàng không thông minh)", mitBusiness],
  ["752020101", "Công nghệ kỹ thuật điện, điện tử (Điện công nghiệp)", mitTechnology],
  ["7580201", "Kỹ thuật xây dựng", mitTechnology],
  ["758020101", "Kỹ thuật xây dựng (Kỹ thuật xây dựng dân dụng và công nghiệp)", mitTechnology],
  ["758020102", "Kỹ thuật xây dựng (Thiết kế nội thất)", mitTechnology],
  ["7640101", "Thú y", "A00; A01; B00; B03; B08; C08; D01; D07; D08"],
  ["7720201", "Dược học", "A00; A01; B00; B03; B08; C08; D01; D07; D08"],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", mitBusiness],
  ["7840104", "Kinh tế vận tải", mitBusiness]
];
const mitMethods = [
  ["THPT", "Điểm xét tuyển = tổng điểm 03 môn thi trong tổ hợp (bắt buộc có Toán hoặc Ngữ văn) + điểm cộng + điểm ưu tiên theo quy định."],
  ["Học bạ", "Điểm xét tuyển = tổng điểm 03 môn của 06 học kỳ lớp 10, 11, 12 chia 6, cộng điểm ưu tiên theo quy định."],
  ["ĐGNL V-ACT", "Sử dụng điểm kỳ thi V-ACT của ĐHQG TP.HCM, sau quy đổi và cộng điểm ưu tiên theo quy định năm 2026."]
];
majors = majors.filter((major) => major.universityId !== mit.id);
let mitIndex = 0;
for (const [code, name, combination] of mitPrograms) {
  for (const [method, formulaText] of mitMethods) {
    mitIndex += 1;
    majors.push({
      id: `${mit.id}-${importTag}-${mitIndex}`,
      universityId: mit.id,
      code,
      nationalMajorCode: code.slice(0, 7),
      name,
      combination: method === "ĐGNL V-ACT" ? "Kết quả kỳ thi V-ACT" : combination,
      combinationStatus: "verified",
      subjects: [],
      method,
      methodDetails: method,
      formula: `mit-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
      formulaText,
      formulaSourceUrl: mitMethodsUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "Trường Đại học Công nghệ Miền Đông",
      sourceUrl: mitInfoUrl,
      importTag,
      cutoff: { year: 2026, score: null, method, status: "not_published", sourceName: "Trường Đại học Công nghệ Miền Đông", sourceUrl: mitInfoUrl }
    });
  }
}
setProfile("MIT", {
  status: "complete_score_not_published",
  url: mitMethodsUrl,
  methods: [...mitMethods.map(([method]) => method), "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 39 mã ngành/chuyên ngành, tổ hợp, ba phương thức có điểm và công thức năm 2026. Trường chưa công bố bảng điểm trúng tuyển cuối cùng nên điểm được ghi Chưa công bố."
});
mit.admissions.sources = unique([...(mit.admissions.sources || []), mitInfoUrl]);
mit.admissions.formulas = mitMethods.map(([method, text]) => ({ method, text, sourceUrl: mitMethodsUrl }));
const mitNotPublishedRows = mitPrograms.length * mitMethods.length;

// Học viện Khoa học Quân sự: bảng chính thức công bố một mức điểm sau quy đổi cho từng đối tượng.
const nqh = byCode.get("NQH");
const nqhScoreUrl = "https://hvkhqs.edu.vn/thong-bao-diem-chuan-trung-tuyen-dao-tao-dai-hoc-he-quan-su-dan-su-nam-2026-va-xac-nhan-nhap-hoc-tai-hoc-vien-khoa-hoc-quan-su/";
const nqhInfoUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/hoc-vien-khoa-hoc-quan-su-he-quan-su-NQH.html";
const nqhPrograms = [
  ["7220201", "Ngôn ngữ Anh (hệ quân sự - thí sinh Nam)", "D01; Q00; QDA", 27.49],
  ["7220201", "Ngôn ngữ Anh (hệ quân sự - thí sinh Nữ)", "D01; Q00; QDA", 29.76],
  ["7220202", "Ngôn ngữ Nga (hệ quân sự - thí sinh Nam)", "D01; D02; Q00; QDA", 26.64],
  ["7220202", "Ngôn ngữ Nga (hệ quân sự - thí sinh Nữ)", "D01; D02; Q00; QDA", 27.32],
  ["7860231", "Trinh sát kỹ thuật (hệ quân sự - thí sinh Nam phía Bắc)", "A00; A01; Q00; QDA", 27.61],
  ["7860231", "Trinh sát kỹ thuật (hệ quân sự - thí sinh Nam phía Nam)", "A00; A01; Q00; QDA", 26.03],
  ["7220201", "Ngôn ngữ Anh (hệ dân sự)", "D01", 20.8],
  ["7220202", "Ngôn ngữ Nga (hệ dân sự)", "D01; D02", 17.3],
  ["7220204", "Ngôn ngữ Trung Quốc (hệ dân sự)", "D01; D04", 21.5]
];
const nqhFormula = "Điểm trúng tuyển đã được Học viện quy đổi về thang 30 theo thông tin tuyển sinh 2026; ngành ngôn ngữ tính (Ngoại ngữ × 2 + Toán × 2 + Ngữ văn) / 5 × 3, ngành Trinh sát kỹ thuật không nhân hệ số.";
majors = majors.filter((major) => major.universityId !== nqh.id);
for (const [index, [code, name, combination, score]] of nqhPrograms.entries()) {
  majors.push({
    id: `${nqh.id}-${importTag}-${index + 1}`,
    universityId: nqh.id,
    code,
    nationalMajorCode: code,
    name,
    combination,
    combinationStatus: "verified",
    subjects: [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: "Tổng hợp THPT, HSA, V-ACT và QDA sau quy đổi về thang 30",
    formula: "nqh-quy-doi-2026",
    formulaText: nqhFormula,
    formulaSourceUrl: nqhInfoUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "Học viện Khoa học Quân sự",
    sourceUrl: nqhScoreUrl,
    importTag,
    cutoff: { year: 2026, score, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Học viện Khoa học Quân sự", sourceUrl: nqhScoreUrl }
  });
}
setProfile("NQH", {
  status: "official_verified",
  url: nqhScoreUrl,
  methods: ["THPT", "ĐGNL HSA", "ĐGNL V-ACT", "ĐGNL QDA", "Ưu tiên xét tuyển", "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 06 nhóm hệ quân sự và 03 ngành hệ dân sự trong bảng điểm chuẩn chính thức năm 2026, gồm mã ngành, tổ hợp và công thức tính điểm."
});
nqh.admissions.sources = unique([...(nqh.admissions.sources || []), nqhInfoUrl]);
nqh.admissions.formulas = [{ method: "Điểm trúng tuyển sau quy đổi", text: nqhFormula, sourceUrl: nqhInfoUrl }];
const nqhOfficialRows = nqhPrograms.length;

// Học viện Hậu cần: kết quả hệ quân sự phân theo miền và ba ngành dân sự có cùng mức điểm trúng tuyển.
const heh = byCode.get("HEH");
const hehMilitaryUrl = "https://hocvienhaucan.edu.vn/thong-bao/chi-tiet/12";
const hehCivilUrl = "https://hocvienhaucan.edu.vn/bai-viet/thong-bao-diem-chuan-trung-tuyen-dot-1-chinh-thuc-va-tuyen-bo-sung-dot-2-he-dan-su-trinh-do-dai-hoc-nam-2026";
const hehInfoUrl = "https://hocvienhaucan.edu.vn/wp-content/blogs.dir/1/files/XEM-T%E1%BA%A0I-%C4%90%C3%82Y.pdf";
const hehPrograms = [
  ["7860218", "Hậu cần quân sự (thí sinh Nam miền Bắc)", "A00; A01; C01; X06; Q00; QDA", 26.98, hehMilitaryUrl],
  ["7860218", "Hậu cần quân sự (thí sinh Nam miền Nam)", "A00; A01; C01; X06; Q00; QDA", 25.65, hehMilitaryUrl],
  ["7340201", "Tài chính - Ngân hàng (hệ dân sự)", "A00; A01; C01; X06; Q00; QDA", 16, hehCivilUrl],
  ["7340301", "Kế toán (hệ dân sự)", "A00; A01; C01; X06; Q00; QDA", 16, hehCivilUrl],
  ["7580201", "Kỹ thuật xây dựng (hệ dân sự)", "A00; A01; C01; X06; Q00; QDA", 16, hehCivilUrl]
];
const hehFormula = "Điểm trúng tuyển là điểm của phương thức THPT hoặc điểm đánh giá năng lực sau quy đổi tương đương về thang 30, cộng điểm khuyến khích và điểm ưu tiên theo quy định tuyển sinh quân sự năm 2026.";
majors = majors.filter((major) => major.universityId !== heh.id);
for (const [index, [code, name, combination, score, sourceUrl]] of hehPrograms.entries()) {
  majors.push({
    id: `${heh.id}-${importTag}-${index + 1}`,
    universityId: heh.id,
    code,
    nationalMajorCode: code,
    name,
    combination,
    combinationStatus: "verified",
    subjects: [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: "THPT, HSA, V-ACT hoặc QDA sau quy đổi về thang 30",
    formula: "heh-quy-doi-2026",
    formulaText: hehFormula,
    formulaSourceUrl: hehInfoUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "Học viện Hậu cần",
    sourceUrl,
    importTag,
    cutoff: { year: 2026, score, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Học viện Hậu cần", sourceUrl }
  });
}
setProfile("HEH", {
  status: "official_verified",
  url: hehMilitaryUrl,
  methods: ["THPT", "ĐGNL HSA", "ĐGNL V-ACT", "ĐGNL QDA", "Ưu tiên xét tuyển", "Xét tuyển thẳng"],
  note: "Đã cập nhật ngành Hậu cần quân sự theo hai miền và ba ngành dân sự, kèm mã ngành, tổ hợp, phương thức, công thức cùng điểm chuẩn chính thức năm 2026."
});
heh.admissions.sources = unique([...(heh.admissions.sources || []), hehCivilUrl, hehInfoUrl]);
heh.admissions.formulas = [{ method: "Điểm trúng tuyển sau quy đổi", text: hehFormula, sourceUrl: hehInfoUrl }];
const hehOfficialRows = hehPrograms.length;

// Đại học Tân Trào: 19 ngành trong bảng điểm chuẩn đợt 1, dùng một mức sau quy đổi giữa các phương thức.
const tqu = byCode.get("TQU");
const tquScoreUrl = "https://daihoctantrao.edu.vn/tin-tuc-su-kien/thong-bao-diem-chuan-trung-tuyen-dai-hoc-chinh-quy-dot-1-nam-2026!-7218.html";
const tquInfoUrl = "https://daihoctantrao.edu.vn/media/files/Th%C3%B4ng-b%C3%A1o-tuy%E1%BB%83n-sinh-h%E1%BB%87-ch%C3%ADnh-quy-n%C4%83m-2026-%281%29.pdf";
const tquSocial = "C00; C03; C04; C19; D01; D14; D15; X01; X70; X74";
const tquBusiness = "A00; A01; C01; C02; C03; D01; D09; X01; X02; X25; X26";
const tquPrograms = [
  ["7140201", "Giáo dục Mầm non", tquSocial, 26.74],
  ["7140202", "Giáo dục Tiểu học", tquSocial, 26.6],
  ["7140209", "Sư phạm Toán học", "A00; A01; A02; C01; X06; X07; X26", 27.14],
  ["7140217", "Sư phạm Ngữ văn", "C00; C19; C20; D14; X70", 27.34],
  ["7720301", "Điều dưỡng", "A02; B00; B01; B03; B08; C08", 18],
  ["7720201", "Dược học", "A00; A05; B00; C02; C05; C08; D07; D12", 20],
  ["7480201", "Công nghệ thông tin", "A00; A01; B00; D01; D07; X02; X25; X26", 15],
  ["7460108", "Khoa học dữ liệu", "A00; A01; B00; D01; D07; X02; X25; X26", 15],
  ["7340301", "Kế toán", tquBusiness, 15],
  ["7310101", "Kinh tế", tquBusiness, 15],
  ["7620115", "Kinh tế nông nghiệp", tquBusiness, 15],
  ["7310104", "Kinh tế đầu tư", tquBusiness, 15],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", tquSocial, 17],
  ["7810302", "Huấn luyện thể thao", "T00; T02; T05; T08; T09; T10", 15],
  ["7620205", "Lâm sinh", "A02; B00; B01; B02; B03; B08; C08", 15],
  ["7229042", "Quản lý văn hóa", tquSocial, 17],
  ["7760101", "Công tác xã hội", tquSocial, 17],
  ["7310401", "Tâm lý học", tquSocial, 17],
  ["7310201", "Chính trị học", tquSocial, 21]
];
const tquFormula = "Điểm trúng tuyển là điểm xét tuyển của phương thức sau khi quy đổi tương đương về thang 30 và cộng điểm ưu tiên theo quy định năm 2026.";
majors = majors.filter((major) => major.universityId !== tqu.id);
for (const [index, [code, name, combination, score]] of tquPrograms.entries()) {
  majors.push({
    id: `${tqu.id}-${importTag}-${index + 1}`,
    universityId: tqu.id,
    code,
    nationalMajorCode: code,
    name,
    combination,
    combinationStatus: "verified",
    subjects: [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: "Mức điểm chính thức đợt 1 sau quy đổi giữa các phương thức",
    formula: "tqu-quy-doi-2026",
    formulaText: tquFormula,
    formulaSourceUrl: tquInfoUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "Trường Đại học Tân Trào",
    sourceUrl: tquScoreUrl,
    importTag,
    cutoff: { year: 2026, score, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Trường Đại học Tân Trào", sourceUrl: tquScoreUrl }
  });
}
setProfile("TQU", {
  status: "official_verified",
  url: tquScoreUrl,
  methods: ["THPT", "Học bạ", "Xét tuyển kết hợp", "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 19 ngành trong bảng điểm chuẩn đợt 1 năm 2026, gồm mã ngành, tổ hợp, phương thức và công thức sau quy đổi."
});
tqu.admissions.sources = unique([...(tqu.admissions.sources || []), tquInfoUrl]);
tqu.admissions.formulas = [{ method: "Điểm trúng tuyển sau quy đổi", text: tquFormula, sourceUrl: tquInfoUrl }];
const tquOfficialRows = tquPrograms.length;

// UTC2: bảng chính thức có 29 mã xét tuyển và ba cột THPT, học bạ, V-ACT.
const gsa = byCode.get("GSA");
const gsaScoreUrl = "https://tuyensinh.utc2.edu.vn/vi/thong-bao-ve-viec-cong-bo-diem-chuan-dai-hoc-chinh-quy-nam-2026-2460";
const gsaRulesUrl = "https://tuyensinh.utc2.edu.vn/vi/quy-tac-quy-doi-diem-trung-tuyen-giua-cac-phuong-thuc-xet-tuyen-dai-hoc-chinh-quy-nam-2026-2455";
const gsaInfoUrl = "https://diemthi.tuyensinh247.com/thong-tin-dai-hoc-giao-thong-van-tai-co-so-phia-nam-GSA.html";
const gsaPrograms = [
  ["GSA01", "7220201", "Ngôn ngữ Anh", "D01; D09; D10", 18.16, 23.1, 617.9],
  ["GSA02", "7340101", "Quản trị kinh doanh", "A00; A01; C01; D01", 19.75, 24.47, 677],
  ["GSA03", "7340120", "Kinh doanh quốc tế", "A00; A01; C01; D01", 22.51, null, 778.44],
  ["GSA04", "7340201", "Tài chính - Ngân hàng", "A00; A01; C01; D01", 20.77, 25.29, 711.68],
  ["GSA05", "7340301", "Kế toán (chuyên ngành Kế toán tổng hợp)", "A00; A01; C01; D01", 21.28, 25.69, 729.02],
  ["GSA06", "7480106", "Kỹ thuật máy tính (hướng chuyên sâu vi mạch bán dẫn)", "A00; A01; C01; X06", 23.98, 27.23, 843.12],
  ["GSA07", "7480201", "Công nghệ thông tin", "A00; A01; C01; X06", 20.32, null, 696.38],
  ["GSA08", "7510605", "Logistics và Quản lý chuỗi cung ứng", "A00; A01; C01; D01", 25.45, null, 915.64],
  ["GSA08QT", "7510605", "Logistics và Quản lý chuỗi cung ứng (CLC Việt - Anh)", "A00; A01; C01; D01", 24.19, 27.34, 852.36],
  ["GSA09", "7520114", "Kỹ thuật cơ điện tử", "A00; A01; C01; X06", 24.61, null, 870.84],
  ["GSA10", "7520116", "Kỹ thuật cơ khí động lực", "A00; A01; C01; X06", 23.74, 27.1, 832.56],
  ["GSA11", "7520130", "Kỹ thuật ô tô", "A00; A01; C01; X06", 23.65, null, 828.6],
  ["GSA11QT", "7520130", "Kỹ thuật ô tô (CLC Việt - Anh)", "A00; A01; C01; X06", 20.86, 25.36, 714.74],
  ["GSA12", "7520201", "Kỹ thuật điện", "A00; A01; C01; X06", 24.73, 27.62, 876.12],
  ["GSA13", "7520207", "Kỹ thuật điện tử - viễn thông (Kỹ thuật viễn thông)", "A00; A01; C01; X06", 24.22, 27.35, 853.68],
  ["GSA13BD", "7520207", "Kỹ thuật điện tử - viễn thông (Điện tử và tin học công nghiệp)", "A00; A01; C01; X06", 23.83, 27.15, 836.52],
  ["GSA14", "7520216", "Kỹ thuật điều khiển và tự động hoá (Tự động hoá)", "A00; A01; C01; X06", 25.12, null, 897.42],
  ["GSA14DS", "7520216", "Kỹ thuật điều khiển và tự động hoá (Điều khiển và thông tin tín hiệu đường sắt hiện đại)", "A00; A01; C01; X06", 23.29, 26.87, 812.76],
  ["GSA15", "7580101", "Kiến trúc", "A00; A01; V00; V01", 20.26, 24.88, 694.34],
  ["GSA16", "7580106", "Quản lý đô thị và công trình", "A00; A01; C01; X06", 18.91, 23.8, 648.44],
  ["GSA17", "7580201", "Kỹ thuật xây dựng", "A00; A01; C01; X06", 21.61, 25.96, 740.24],
  ["GSA18", "7580205", "Kỹ thuật xây dựng công trình giao thông", "A00; A01; C01; X06", 20.08, 24.73, 688.22],
  ["GSA18DS", "7580205", "Kỹ thuật xây dựng công trình giao thông (Đường sắt tốc độ cao)", "A00; A01; C01; X06", 21.94, 26.17, 753.36],
  ["GSA18QT", "7580205", "Kỹ thuật xây dựng công trình giao thông (CLC Cầu - Đường bộ Việt - Anh)", "A00; A01; C01; X06", 17.74, 22.69, 600.03],
  ["GSA19", "7580301", "Kinh tế xây dựng", "A00; A01; C01; D01", 21.49, 25.86, 736.16],
  ["GSA20", "7580302", "Quản lý xây dựng", "A00; A01; C01; X06", 20.95, 25.43, 717.8],
  ["GSA21", "7810103", "Quản trị dịch vụ du lịch và lữ hành", "A00; A01; C01; D01", 18.82, 23.73, 645.38],
  ["GSA22", "7840101", "Khai thác vận tải", "A00; A01; C01; D01", 22, null, 756],
  ["GSA23", "7840104", "Kinh tế vận tải", "A00; A01; C01; D01", 21.88, null, 750.72]
];
const gsaMethods = [
  ["THPT", 4, 30],
  ["THPT + Học bạ", 5, 30],
  ["ĐGNL V-ACT", 6, 1200]
];
const gsaFormula = {
  "THPT": "Điểm xét tuyển = (Toán × 2 + 02 môn còn lại) × 3/4 + điểm ưu tiên + điểm cộng; riêng Ngôn ngữ Anh không nhân hệ số Toán.",
  "THPT + Học bạ": "Điểm học bạ được nội suy tuyến tính theo bảng bách phân vị sang thang THPT; sau đó cộng điểm ưu tiên và điểm cộng.",
  "ĐGNL V-ACT": "Điểm V-ACT được nội suy tuyến tính theo bảng tương đương sang thang THPT; bảng điểm chuẩn vẫn công bố điểm gốc trên thang 1200."
};
majors = majors.filter((major) => major.universityId !== gsa.id);
let gsaIndex = 0;
for (const program of gsaPrograms) {
  const [code, nationalMajorCode, name, combination] = program;
  for (const [method, scoreIndex, scale] of gsaMethods) {
    gsaIndex += 1;
    const score = program[scoreIndex];
    const published = Number.isFinite(score);
    majors.push({
      id: `${gsa.id}-${importTag}-${gsaIndex}`,
      universityId: gsa.id,
      code,
      nationalMajorCode,
      name,
      combination: method === "ĐGNL V-ACT" ? "Kết quả kỳ thi V-ACT" : combination,
      combinationStatus: "verified",
      subjects: [],
      method,
      methodDetails: method,
      formula: `gsa-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
      formulaText: gsaFormula[method],
      formulaSourceUrl: gsaRulesUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "Phân hiệu Trường Đại học Giao thông vận tải tại TP.HCM",
      sourceUrl: gsaScoreUrl,
      importTag,
      cutoff: { year: 2026, score: published ? score : null, ...(published ? { scale, scaleStatus: "reported" } : {}), method, status: published ? "verified" : "not_published", sourceName: "Phân hiệu Trường Đại học Giao thông vận tải tại TP.HCM", sourceUrl: gsaScoreUrl }
    });
  }
}
setProfile("GSA", {
  status: "official_verified",
  url: gsaScoreUrl,
  methods: gsaMethods.map(([method]) => method),
  note: "Đã cập nhật đủ 29 mã xét tuyển và 79 mức điểm chính thức năm 2026 cho THPT, kết hợp học bạ và V-ACT; 08 ô học bạ ký hiệu gạch ngang được ghi Chưa công bố."
});
gsa.admissions.sources = unique([...(gsa.admissions.sources || []), gsaRulesUrl, gsaInfoUrl]);
gsa.admissions.formulas = Object.entries(gsaFormula).map(([method, text]) => ({ method, text, sourceUrl: gsaRulesUrl }));
const gsaOfficialRows = gsaPrograms.flatMap((program) => program.slice(4)).filter(Number.isFinite).length;
const gsaNotPublishedRows = gsaPrograms.length * gsaMethods.length - gsaOfficialRows;

// Học viện Ngân hàng - Phân viện Phú Yên: 05 mã xét tuyển dùng chung mức điểm trúng tuyển 15 sau quy đổi.
const nhp = byCode.get("NHP");
const nhpScoreUrl = "https://bavphuyen.edu.vn/tuyen-sinh-dao-tao/thong-bao-ve-muc-diem-chuan-trung-tuyen-dai-hoc-chinh-quy-nam-2026-ma-truong-nhp-256.html";
const nhpRulesUrl = "https://hvnh.edu.vn/pdt/vn/tsdh/thong-bao-ve-nguong-dam-bao-chat-luong-dau-vao-va-cach-thuc-quy-doi-tuong-duong-diem-trung-tuyen-giua-cac-phuong-thuc-xet-tuyen-dai-hoc-chinh-quy-nam-2026-tai-hoc-vien-ngan-hang-phan-vien-phu-yen-ma-truong-nhp-374.html";
const nhpReferenceUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/hoc-vien-ngan-hang-phan-vien-phu-yen-NHP.html";
const nhpPrograms = [
  ["ACT02", "7340301", "Kế toán"],
  ["BANK02", "7340201", "Ngân hàng"],
  ["BUS02", "7340101", "Quản trị kinh doanh"],
  ["BUS07", "7340115", "Marketing"],
  ["FIN02", "7340201", "Tài chính"]
];
const nhpCombination = "A00; A01; D01; D07; Q00";
const nhpFormula = "Điểm trúng tuyển là điểm xét tuyển của phương thức sau quy đổi tương đương về thang 30, đã gồm điểm cộng và điểm ưu tiên; học bạ tính (môn chính × 2 + môn 2 + môn 3) × 3/4, phương thức kết hợp dùng 50% điểm học bạ và 50% điểm HSA, V-SAT hoặc chứng chỉ quốc tế sau quy đổi.";
majors = majors.filter((major) => major.universityId !== nhp.id);
for (const [index, [code, nationalMajorCode, name]] of nhpPrograms.entries()) {
  majors.push({
    id: `${nhp.id}-${importTag}-${index + 1}`,
    universityId: nhp.id,
    code,
    nationalMajorCode,
    name,
    combination: nhpCombination,
    combinationStatus: "verified",
    subjects: [],
    method: "Điểm trúng tuyển sau quy đổi",
    methodDetails: "THPT, học bạ hoặc xét tuyển kết hợp sau quy đổi tương đương",
    formula: "nhp-quy-doi-2026",
    formulaText: nhpFormula,
    formulaSourceUrl: nhpRulesUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "Học viện Ngân hàng - Phân viện Phú Yên",
    sourceUrl: nhpScoreUrl,
    importTag,
    cutoff: { year: 2026, score: 15, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Học viện Ngân hàng - Phân viện Phú Yên", sourceUrl: nhpScoreUrl }
  });
}
setProfile("NHP", {
  status: "official_verified",
  url: nhpScoreUrl,
  methods: ["THPT", "Học bạ", "Kết hợp HSA", "Kết hợp V-SAT", "Kết hợp chứng chỉ quốc tế", "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 05 mã xét tuyển, tổ hợp, các phương thức, công thức và mức điểm trúng tuyển chính thức năm 2026."
});
nhp.admissions.sources = unique([...(nhp.admissions.sources || []), nhpRulesUrl]);
nhp.admissions.referenceSources = [{ name: "TuyểnSinh247", url: nhpReferenceUrl, checkedAt, has2026Data: true }];
nhp.admissions.formulas = [{ method: "Điểm trúng tuyển sau quy đổi", text: nhpFormula, sourceUrl: nhpRulesUrl }];
const nhpOfficialRows = nhpPrograms.length;

// Học viện Dân tộc: một ngành, một mức điểm chung cho THPT, học bạ và tiếp nhận dự bị sau quy đổi.
const hvd = byCode.get("HVD");
const hvdScoreUrl = "https://hvdt.edu.vn/Images/files/39_TB-HVDT-10082026.pdf";
const hvdInfoUrl = "https://hvdt.edu.vn/Images/files/TH%C3%94NG%20TIN%20TUY%E1%BB%82N%20SINH%20-%202026.pdf";
const hvdFormula = "Điểm trúng tuyển là điểm của phương thức THPT, học bạ hoặc tiếp nhận dự bị đại học sau quy đổi tương đương về thang 30 và cộng điểm ưu tiên theo quy định năm 2026.";
majors = majors.filter((major) => major.universityId !== hvd.id);
majors.push({
  id: `${hvd.id}-${importTag}-1`,
  universityId: hvd.id,
  code: "7310101",
  nationalMajorCode: "7310101",
  name: "Kinh tế giáo dục vùng dân tộc thiểu số",
  combination: "A00; C00; C01; C02; C03; C04; D01",
  combinationStatus: "verified",
  subjects: [],
  method: "Điểm trúng tuyển sau quy đổi",
  methodDetails: "Mã phương thức 100, 200 và 500 sau quy đổi tương đương",
  formula: "hvd-quy-doi-2026",
  formulaText: hvdFormula,
  formulaSourceUrl: hvdInfoUrl,
  calculationVerified: false,
  dataStatus: "verified",
  sourceName: "Học viện Dân tộc",
  sourceUrl: hvdScoreUrl,
  importTag,
  cutoff: { year: 2026, score: 15, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Học viện Dân tộc", sourceUrl: hvdScoreUrl }
});
setProfile("HVD", {
  status: "official_verified",
  url: hvdScoreUrl,
  methods: ["THPT", "Học bạ", "Tiếp nhận dự bị đại học", "Xét tuyển thẳng"],
  note: "Đã cập nhật ngành Kinh tế giáo dục vùng dân tộc thiểu số, mã ngành, 07 tổ hợp, phương thức, công thức và mức điểm chính thức 15 năm 2026."
});
hvd.admissions.sources = unique([...(hvd.admissions.sources || []), hvdInfoUrl]);
hvd.admissions.formulas = [{ method: "Điểm trúng tuyển sau quy đổi", text: hvdFormula, sourceUrl: hvdInfoUrl }];
const hvdOfficialRows = 1;

// Trường Đại học Y khoa Tokyo Việt Nam đã công bố đủ hồ sơ tuyển sinh, nhưng chưa công bố điểm trúng tuyển cuối cùng.
const thu = byCode.get("THU");
const thuInfoUrl = "https://tokyo-human.edu.vn/tuyen-sinh/thong-tin-tuyen-sinh/";
const thuPrograms = [
  ["7720301", "Điều dưỡng", "A00; A01; A02; B00; B08; D07; D23; D28; D33"],
  ["7720603", "Kỹ thuật phục hồi chức năng", "A00; A01; A02; B00; B08; D07; D23; D28; D33"],
  ["7720601", "Kỹ thuật xét nghiệm y học", "A00; A01; A02; B00; B08; C08; D07; D23; D28; X10; X26"],
  ["7720602", "Kỹ thuật hình ảnh y học", "A00; A01; A02; B00; B03; B08; D07; D23; D28; X26"]
];
const thuMethods = ["THPT", "Học bạ", "ĐGNL HSA", "ĐGNL SPT"];
const thuFormula = {
  "THPT": "Điểm xét tuyển = điểm môn 1 + điểm môn 2 + điểm môn 3 + điểm khuyến khích + điểm ưu tiên.",
  "Học bạ": "Điểm xét tuyển = trung bình môn 1 của lớp 10, 11, 12 + trung bình môn 2 của lớp 10, 11, 12 + trung bình môn 3 của lớp 10, 11, 12 + điểm khuyến khích.",
  "ĐGNL HSA": "Sử dụng điểm HSA từ 75/150, đồng thời điểm Sinh học thi THPT hoặc trung bình Sinh học lớp 12 đạt từ 6,5; điểm được quy đổi theo quy định của trường.",
  "ĐGNL SPT": "Tổng điểm 03 môn của kỳ thi SPT theo tổ hợp đạt từ 16, sau đó được quy đổi và cộng điểm ưu tiên theo quy định."
};
majors = majors.filter((major) => major.universityId !== thu.id);
let thuIndex = 0;
for (const [code, name, combination] of thuPrograms) {
  for (const method of thuMethods) {
    thuIndex += 1;
    majors.push({
      id: `${thu.id}-${importTag}-${thuIndex}`,
      universityId: thu.id,
      code,
      nationalMajorCode: code,
      name,
      combination: method === "ĐGNL HSA" ? "Kết quả HSA và điều kiện Sinh học" : method === "ĐGNL SPT" ? "Tổ hợp 03 môn thi SPT tương ứng" : combination,
      combinationStatus: "verified",
      subjects: [],
      method,
      methodDetails: method,
      formula: `thu-${normalize(method).replace(/[^a-z0-9]+/g, "-")}-2026`,
      formulaText: thuFormula[method],
      formulaSourceUrl: thuInfoUrl,
      calculationVerified: false,
      dataStatus: "verified",
      sourceName: "Trường Đại học Y khoa Tokyo Việt Nam",
      sourceUrl: thuInfoUrl,
      importTag,
      cutoff: { year: 2026, score: null, method, status: "not_published", sourceName: "Trường Đại học Y khoa Tokyo Việt Nam", sourceUrl: thuInfoUrl }
    });
  }
}
setProfile("THU", {
  status: "complete_score_not_published",
  url: thuInfoUrl,
  methods: [...thuMethods, "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 04 ngành, mã ngành, tổ hợp, phương thức và công thức tuyển sinh 2026; trường chưa công bố mức điểm trúng tuyển cuối cùng nên không suy diễn từ ngưỡng nhận hồ sơ."
});
thu.admissions.formulas = Object.entries(thuFormula).map(([method, text]) => ({ method, text, sourceUrl: thuInfoUrl }));
const thuNotPublishedRows = thuPrograms.length * thuMethods.length;

// Từ 16/06/2026, Trường Đại học Tài chính - Kế toán đã trở thành Phân hiệu UFM tại Quảng Ngãi và không còn tuyển sinh bằng hồ sơ UFA độc lập.
const ufa = byCode.get("UFA");
const dms = byCode.get("DMS");
const ufaDecisionUrl = "https://ufm.edu.vn/thu-tuong-chinh-phu-quyet-dinh-thanh-lap-phan-hieu-truong-dai-hoc-tai-chinh-marketing-tai-quang-ngai-2047.html";
const ufaLaunchUrl = "https://eng.ufm.edu.vn/truong-dai-hoc-tai-chinh-marketing-chinh-thuc-ra-mat-phan-hieu-tai-tinh-quang-ngai-2086.html";
const ufaAdmissionsUrl = "https://ufm.edu.vn/nguyen-vong-1-chon-ufm-cham-uoc-mo-mo-tuong-lai--2106.html";
majors = majors.filter((major) => major.universityId !== ufa.id);
ufa.name = "Phân hiệu Trường Đại học Tài chính - Marketing tại Quảng Ngãi";
ufa.shortName = "UFM Quảng Ngãi";
ufa.description = "Phân hiệu của Trường Đại học Tài chính - Marketing tại Quảng Ngãi, được thành lập trên cơ sở Trường Đại học Tài chính - Kế toán theo Quyết định 807/QĐ-TTg ngày 06/05/2026.";
ufa.website = "https://ufm.edu.vn";
ufa.parentUniversityId = dms.id;
ufa.methods = [...(dms.methods || [])];
ufa.formulas = [...(dms.formulas || [])];
ufa.dataCheckedAt = checkedAt;
ufa.admissions = {
  status: "parent_linked",
  methods: [...(dms.admissions?.methods || dms.methods || [])],
  methodsSourceUrl: ufaAdmissionsUrl,
  formulas: (dms.admissions?.formulas || []).map((item) => ({ ...item, sourceUrl: ufaAdmissionsUrl })),
  sources: [ufaDecisionUrl, ufaLaunchUrl, ufaAdmissionsUrl],
  referenceSources: [],
  note: "Mã UFA là hồ sơ lịch sử. Từ tháng 6/2026, cơ sở này hoạt động dưới tên Phân hiệu UFM tại Quảng Ngãi; ngành, phương thức và điểm tuyển sinh được công bố trong hồ sơ mã DMS của Trường Đại học Tài chính - Marketing."
};
const ufaRemovedLegacyRows = 20;

// BKA đã có đủ bảng chính thức theo mã xét tuyển; ba dòng tên ngành tổng quát cũ là bản trùng chưa xác minh.
const bka = byCode.get("BKA");
const bkaRemovedDuplicateRows = majors.filter((major) => major.universityId === bka.id && major.cutoff?.status === "unverified").length;
majors = majors.filter((major) => major.universityId !== bka.id || major.cutoff?.status !== "unverified");
const bkaFormulaUrl = "https://www.hust.edu.vn/uploads/sys/tuyen-sinh/2025_06/qd_thong-tin-tuyen-sinh-dhbk-ha-noi-2026_final.pdf";
const bkaThptFormula = "Điểm xét tuyển THPT theo A00/A01 = tổng điểm 03 môn trong tổ hợp + điểm ưu tiên; với K01: Điểm xét tuyển = [3 × Toán + Ngữ văn + 2 × (Vật lí/Hóa học/Sinh học/Tin học)] ÷ 2 + điểm ưu tiên theo quy định.";
let bkaFormulaRows = 0;
for (const major of majors.filter((item) => item.universityId === bka.id && /chưa xác minh công thức/i.test(clean(item.formulaText)))) {
  major.formulaText = bkaThptFormula;
  major.formulaSourceUrl = bkaFormulaUrl;
  major.calculationVerified = true;
  bkaFormulaRows += 1;
}
bka.admissions.sources = unique([...(bka.admissions?.sources || []), bkaFormulaUrl]);

// Hai ô TSA gạch ngang trong bảng DLX được biểu diễn đúng là Chưa công bố thay vì Chưa xác minh.
const dlx = byCode.get("DLX");
const dlxRowsMarkedNotPublished = majors.filter((major) => major.universityId === dlx.id && major.cutoff?.status === "unverified").length;
for (const major of majors.filter((item) => item.universityId === dlx.id && item.cutoff?.status === "unverified")) {
  major.cutoff = { ...major.cutoff, score: null, status: "not_published" };
  major.dataStatus = "reference";
}

// Chuẩn hóa các hồ sơ đặc thù. Mỗi dòng giữ nguyên thang điểm do trường công bố;
// dữ liệu không có điểm cuối cùng được ghi rõ not_published thay vì để trạng thái mơ hồ.
function replaceSpecialProfile(code, rows, {
  status = "official_verified",
  infoUrl,
  scoreUrl = infoUrl,
  methods,
  note,
  formulaText,
  sourceName,
  referenceUrl
}) {
  const university = byCode.get(code);
  const oldRows = majors.filter((major) => major.universityId === university.id);
  majors = majors.filter((major) => major.universityId !== university.id);
  for (const [index, row] of rows.entries()) {
    const template = oldRows.find((major) => nameKey(major.name) === nameKey(row.name))
      || oldRows.find((major) => major.nationalMajorCode === row.nationalMajorCode)
      || oldRows[0];
    const rowFormula = row.formulaText || formulaText;
    const rowSourceUrl = row.sourceUrl || scoreUrl;
    const cutoffStatus = Number.isFinite(row.score) ? "verified" : "not_published";
    majors.push({
      ...(template || {}),
      id: `${university.id}-${importTag}-${code.toLowerCase()}-${index + 1}`,
      universityId: university.id,
      code: row.code,
      nationalMajorCode: row.nationalMajorCode || row.code.slice(0, 7),
      name: row.name,
      combination: row.combination,
      combinationStatus: "verified",
      subjects: [],
      method: row.method || "Điểm trúng tuyển sau quy đổi",
      methodDetails: row.methodDetails || row.method || "Điểm trúng tuyển chính thức năm 2026",
      formula: row.formula || `${code.toLowerCase()}-2026`,
      formulaText: rowFormula,
      formulaSourceUrl: row.formulaSourceUrl || infoUrl,
      calculationVerified: false,
      dataStatus: cutoffStatus === "verified" ? "verified" : "reference",
      sourceName,
      sourceUrl: rowSourceUrl,
      importTag,
      cutoff: {
        year: 2026,
        score: Number.isFinite(row.score) ? row.score : null,
        ...(row.scale ? { scale: row.scale, scaleStatus: "reported" } : {}),
        method: row.method || "Điểm trúng tuyển sau quy đổi",
        status: cutoffStatus,
        sourceName,
        sourceUrl: rowSourceUrl
      }
    });
  }
  setProfile(code, { status, url: scoreUrl, methods, note });
  university.admissions.sources = unique([...(university.admissions.sources || []), infoUrl, scoreUrl]);
  if (referenceUrl) {
    university.admissions.referenceSources = unique([
      ...(university.admissions.referenceSources || []).map((item) => item?.url)
    ]).map((url) => ({ name: "TuyểnSinh247", url, checkedAt, has2026Data: true }));
    if (!university.admissions.referenceSources.some((item) => item.url === referenceUrl)) {
      university.admissions.referenceSources.push({ name: "TuyểnSinh247", url: referenceUrl, checkedAt, has2026Data: true });
    }
  }
  university.admissions.formulas = unique(rows.map((row) => row.method || "Điểm trúng tuyển sau quy đổi"))
    .map((method) => ({ method, text: rows.find((row) => (row.method || "Điểm trúng tuyển sau quy đổi") === method)?.formulaText || formulaText, sourceUrl: infoUrl }));
  return rows.length;
}

// Chuẩn hóa hai mã phân hiệu Nông Lâm đã bị đảo trong danh mục cũ:
// NLG là Gia Lai, NLN là Ninh Thuận. NLT chỉ được giữ làm mã cũ để các liên kết
// đã lưu vẫn tìm được đúng hồ sơ Ninh Thuận.
const nluGiaLai = universities.find((item) => item.id === "phan-hieu-truong-dai-hoc-nong-lam-tphcm-tai-gia-lai");
const nluNinhThuan = universities.find((item) => item.id === "phan-hieu-truong-dai-hoc-nong-lam-tphcm-tai-ninh-thuan");
byCode.delete("NLG");
byCode.delete("NLN");
byCode.delete("NLT");
nluGiaLai.code = "NLG";
nluGiaLai.shortName = "HCMUAF Gia Lai";
nluGiaLai.website = "https://phgl.hcmuaf.edu.vn/";
nluGiaLai.description = "Phân hiệu Trường Đại học Nông Lâm TP.HCM tại Gia Lai; mã tuyển sinh chính thức năm 2026 là NLG.";
delete nluGiaLai.legacyCode;
nluNinhThuan.code = "NLN";
nluNinhThuan.shortName = "HCMUAF Ninh Thuận";
nluNinhThuan.website = "https://phnt.hcmuaf.edu.vn/";
nluNinhThuan.description = "Phân hiệu Trường Đại học Nông Lâm TP.HCM tại Ninh Thuận; mã tuyển sinh chính thức năm 2026 là NLN.";
nluNinhThuan.legacyCode = "NLT";
byCode.set("NLG", nluGiaLai);
byCode.set("NLN", nluNinhThuan);
byCode.set("NLT", nluNinhThuan);

const nlgInfoUrl = "https://diemthi.tuyensinh247.com/thong-tin-phan-hieu-dai-hoc-nong-lam-tphcm-tai-gia-lai-NLG.html";
const nlgScoreUrl = "https://diemthi.tuyensinh247.com/diem-chuan/phan-hieu-dai-hoc-nong-lam-tphcm-tai-gia-lai-NLG.html";
const nluFormula = "Điểm xét tuyển THPT/học bạ = tổng điểm 03 môn theo tổ hợp + điểm cộng + điểm ưu tiên; phương thức kết hợp được thay thế hoặc bổ sung một môn bằng kết quả học bạ, còn V-ACT và chứng chỉ quốc tế được quy đổi theo quy tắc tương đương năm 2026 của trường.";
const nlgOfficialRows = replaceSpecialProfile("NLG", [
  { code: "7340101G", nationalMajorCode: "7340101", name: "Quản trị kinh doanh (Phân hiệu Gia Lai)", combination: "A00; A01; D01; X01; X02; X25", score: null, method: "Các phương thức 2026" },
  { code: "7620109G", nationalMajorCode: "7620109", name: "Nông học (Phân hiệu Gia Lai)", combination: "A00; A01; B00; A02; D07; D08", score: null, method: "Các phương thức 2026" },
  { code: "7640101G", nationalMajorCode: "7640101", name: "Thú y (Phân hiệu Gia Lai)", combination: "A00; B00; B03; C02; D07; D08", score: null, method: "Các phương thức 2026" }
], {
  status: "complete_score_not_published",
  infoUrl: nlgInfoUrl,
  scoreUrl: nlgScoreUrl,
  methods: ["THPT", "Học bạ", "Kết hợp THPT + học bạ", "ĐGNL V-ACT", "Chứng chỉ quốc tế", "Tuyển thẳng/ưu tiên"],
  note: "Đã cập nhật đúng mã NLG và đủ 03 ngành, mã ngành, tổ hợp, phương thức năm 2026. Trang điểm chuẩn hiện chỉ hiển thị bảng 2025, vì vậy điểm 2026 được giữ là chưa công bố.",
  formulaText: nluFormula,
  sourceName: "TuyểnSinh247"
});

const nlnInfoUrl = "https://diemthi.tuyensinh247.com/thong-tin-phan-hieu-dai-hoc-nong-lam-tp-hcm-tai-ninh-thuan-NLN.html";
const nlnAdmissionsUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/phan-hieu-dai-hoc-nong-lam-tphcm-tai-ninh-thuan-NLN.html";
const nlnScoreUrl = "https://diemthi.tuyensinh247.com/diem-chuan/phan-hieu-dai-hoc-nong-lam-tphcm-tai-ninh-thuan-NLN.html";
const nlnPrograms = [
  ["51140201", "51140201", "Giáo dục mầm non (trình độ cao đẳng, Phân hiệu Ninh Thuận)", "M00", null, null],
  ["7140201", "7140201", "Giáo dục mầm non (trình độ đại học, Phân hiệu Ninh Thuận)", "M00", null, null],
  ["7220201N", "7220201", "Ngôn ngữ Anh (Phân hiệu Ninh Thuận)", "A01; C00; C03; C04; D01; D14; D15; X03; X04; X70; X74", 16, 18],
  ["7340101N", "7340101", "Quản trị kinh doanh (Phân hiệu Ninh Thuận)", "A00; A01; D01; X01; X02; X25", 16, 18],
  ["7340301N", "7340301", "Kế toán (Phân hiệu Ninh Thuận)", "A00; A01; D01; X01; X02; X25", 16, 18],
  ["7480201N", "7480201", "Công nghệ thông tin (Phân hiệu Ninh Thuận)", "A00; A01; D07; X06; X07; X10", 16, 18],
  ["7519007N", "7519007", "Công nghệ kỹ thuật năng lượng tái tạo (Phân hiệu Ninh Thuận)", "A00; A01; A02; C01; X06; X07", 16, 18],
  ["7620109N", "7620109", "Nông học (Phân hiệu Ninh Thuận)", "A00; B00; B03; A02; D07; D08", null, null],
  ["7640101N", "7640101", "Thú y (Phân hiệu Ninh Thuận)", "A00; B00; B03; C02; D07; D08", 18, 23.25],
  ["7859002N", "7859002", "Tài nguyên và Du lịch sinh thái (Phân hiệu Ninh Thuận)", "A00; B00; D01; D08", 20.5, 25.48]
];
const nlnRows = nlnPrograms.flatMap(([code, nationalMajorCode, name, combination, thptScore, transcriptScore]) => [
  {
    code, nationalMajorCode, name, combination, score: thptScore, scale: 30, method: "THPT",
    formulaText: code === "51140201" || code === "7140201"
      ? "Điểm xét tuyển Giáo dục mầm non kết hợp điểm môn Ngữ văn, môn Toán với điểm thi năng khiếu M00 và điểm ưu tiên theo quy định."
      : "Điểm xét tuyển THPT = tổng điểm 03 môn thi trong tổ hợp + điểm cộng + điểm ưu tiên theo quy định năm 2026."
  },
  {
    code, nationalMajorCode, name, combination, score: transcriptScore, scale: 30, method: "Học bạ",
    formulaText: code === "51140201" || code === "7140201"
      ? "Điểm xét tuyển = điểm trung bình 06 học kỳ của môn Toán và Ngữ văn kết hợp kết quả thi năng khiếu M00 + điểm ưu tiên."
      : "Điểm xét tuyển học bạ = tổng điểm trung bình 06 học kỳ của 03 môn trong tổ hợp + điểm cộng + điểm ưu tiên."
  }
]);
const nlnOfficialRows = replaceSpecialProfile("NLN", nlnRows, {
  status: "official_verified_partial",
  infoUrl: nlnAdmissionsUrl,
  scoreUrl: nlnScoreUrl,
  methods: ["THPT", "Học bạ", "Kết hợp THPT + học bạ", "ĐGNL V-ACT", "Tuyển thẳng/ưu tiên"],
  note: "Đã sửa đúng mã NLN và cập nhật danh mục ngành, mã ngành, tổ hợp, công thức. Điểm THPT/học bạ 2026 được ghi theo công bố ngày 10/8; hai ngành Giáo dục mầm non và Nông học chưa có mức điểm đọc được nên giữ là chưa công bố.",
  formulaText: nluFormula,
  sourceName: "Trường Đại học Nông Lâm TP.HCM / TuyểnSinh247"
});
nluNinhThuan.admissions.sources = unique([...(nluNinhThuan.admissions.sources || []), nlnInfoUrl]);

// UEH Mekong - Vĩnh Long (KSV): 15 chương trình, thang điểm tích hợp 100.
const ksvInfoUrl = "https://diemthi.tuyensinh247.com/thong-tin-dai-hoc-kinh-te-tphcm-phan-hieu-vinh-long-KSV.html";
const ksvAdmissionUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-kinh-te-tphcm-phan-hieu-vinh-long-KSV.html";
const ksvScoreUrl = "https://xaydungchinhsach.chinhphu.vn/diem-chuan-dai-hoc-kinh-te-tphcm-ueh-2026-119260809172846091.htm";
const ksvFormula = "Điểm xét tuyển tích hợp = Điểm thi quy đổi × 60% + điểm trung bình các năm THPT quy đổi × 40% + điểm cộng + điểm ưu tiên quy đổi; tổng điểm tối đa 100.";
const ksvPrograms = [
  ["7220201", "Tiếng Anh thương mại", "D01; D09; D14", 60],
  ["7340101", "Quản trị kinh doanh", "A00; A01; D01; D07; D09", 60],
  ["7340115", "Marketing", "A00; A01; D01; D07; D09", 60],
  ["7340120", "Kinh doanh quốc tế", "A00; A01; D01; D07; D09", 60],
  ["7340122", "Thương mại điện tử", "A00; A01; D01; D07; D09", 60],
  ["734020101", "Ngân hàng", "A00; A01; D01; D07; D09", 60],
  ["734020102", "Tài chính", "A00; A01; D01; D07; D09", 60],
  ["734020103", "Thuế", "A00; A01; D01; D07; D09", 60],
  ["7340301", "Kế toán doanh nghiệp", "A00; A01; D01; D07; D09", 60],
  ["7380107", "Luật kinh tế", "A00; A01; D01; D09", 60],
  ["7480107", "Robot và Trí tuệ nhân tạo (hệ kỹ sư)", "A00; A01; D01; D07", 60],
  ["7480201", "Công nghệ và Đổi mới sáng tạo", "A00; A01; D01; D07", 60],
  ["7510605", "Logistics và Quản lý chuỗi cung ứng", "A00; A01; D01; D07", 67],
  ["7620114", "Kinh doanh nông nghiệp", "A00; A01; D01; D07; D09", 60],
  ["7810201", "Quản trị khách sạn", "A00; A01; D01; D07; D09", 60]
];
const ksvOfficialRows = replaceSpecialProfile("KSV", ksvPrograms.map(([code, name, combination, score]) => ({
  code, nationalMajorCode: code.slice(0, 7), name, combination, score, scale: 100, method: "Xét tuyển tích hợp"
})), {
  infoUrl: ksvAdmissionUrl,
  scoreUrl: ksvScoreUrl,
  methods: ["Xét tuyển tích hợp", "Xét tuyển thẳng/ưu tiên"],
  note: "Đã cập nhật đủ 15 chương trình UEH Mekong - Vĩnh Long, mã xét tuyển, tổ hợp, công thức và điểm trúng tuyển chính thức trên thang 100.",
  formulaText: ksvFormula,
  sourceName: "UEH / Báo Điện tử Chính phủ",
  referenceUrl: ksvInfoUrl
});

// Học viện Ngân hàng - Phân viện Bắc Ninh: công bố một mức quy đổi gốc D01,
// A01/D07 bằng D01 và A00 cao hơn 0,5 điểm.
const nhbInfoUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/hoc-vien-ngan-hang-phan-vien-bac-ninh-NHB.html";
const nhbScoreUrl = "https://hvnhbacninh.vhv.vn/upload/2001799/20260809/4474_TB_HVNH__09082026__diem_trung_tuyen_2026_NHB_Final_signed.pdf";
const nhbFormula = "Điểm xét tuyển THPT = (Môn chính × 2 + Môn 2 + Môn 3) × 3/4 + điểm cộng + điểm ưu tiên; mức công bố được quy đổi về tổ hợp gốc D01.";
const nhbPrograms = [
  ["ACT02", "7340301", "Kế toán", 22.75],
  ["BANK02", "7340201", "Ngân hàng", 22.08],
  ["BUS02", "7340101", "Quản trị kinh doanh", 21.79],
  ["FIN02", "7340201", "Tài chính", 22.19]
];
const nhbRows = nhbPrograms.flatMap(([code, nationalMajorCode, name, baseScore]) => [
  { code, nationalMajorCode, name, combination: "A01; D01; D07", score: baseScore, scale: 30, method: "THPT (sau quy đổi tương đương)" },
  { code, nationalMajorCode, name, combination: "A00", score: Number((baseScore + 0.5).toFixed(2)), scale: 30, method: "THPT (sau quy đổi tương đương)" }
]);
const nhbOfficialRows = replaceSpecialProfile("NHB", nhbRows, {
  infoUrl: nhbInfoUrl,
  scoreUrl: nhbScoreUrl,
  methods: ["THPT", "Học bạ", "Học bạ + chứng chỉ quốc tế", "Học bạ + HSA", "Học bạ + V-SAT", "Tuyển thẳng"],
  note: "Đã cập nhật đủ 04 chương trình và mức điểm chính thức sau quy đổi; A00 cao hơn tổ hợp gốc D01/A01/D07 là 0,5 điểm theo thông báo 4474/TB-HVNH.",
  formulaText: nhbFormula,
  sourceName: "Học viện Ngân hàng"
});

// Hai cơ sở của Đại học Kiến trúc TP.HCM dùng chung mã tuyển sinh KTS. KTC/KTL
// là mã hồ sơ nội bộ của website nên lưu thêm mã chính thức để giao diện giải thích rõ.
const ktc = byCode.get("KTC");
const ktl = byCode.get("KTL");
ktc.officialAdmissionsCode = "KTS";
ktl.officialAdmissionsCode = "KTS";
ktc.name = "Trường Đại học Kiến trúc TP.HCM - Cơ sở Cần Thơ";
ktl.name = "Trường Đại học Kiến trúc TP.HCM - Cơ sở Đà Lạt";
const ktsInfoUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-kien-truc-tphcm-KTS.html";
const ktsScoreUrl = "https://www.uah.edu.vn/diem-chuan-trung-tuyen-cac-chuong-trinh-dao-tao-trinh-do-dai-hoc-hinh-thuc-dao-tao-chinh-quy-nam-2026";
const ktsFormula = "Điểm xét tuyển được quy đổi tương đương về phương thức THPT năm 2026; với tổ hợp không có năng khiếu: tổng điểm 03 môn + điểm cộng + điểm ưu tiên; với ngành Kiến trúc/Thiết kế nội thất, điểm môn năng khiếu được giữ nguyên khi quy đổi.";
const ktcOfficialRows = replaceSpecialProfile("KTC", [
  { code: "7580101CT", nationalMajorCode: "7580101", name: "Kiến trúc (Cơ sở Cần Thơ)", combination: "V01; V02", score: 23.3, scale: 30 },
  { code: "7580108CT", nationalMajorCode: "7580108", name: "Thiết kế nội thất (Cơ sở Cần Thơ)", combination: "V01; V02", score: 23.13, scale: 30 },
  { code: "7580201CT", nationalMajorCode: "7580201", name: "Kỹ thuật xây dựng (Cơ sở Cần Thơ)", combination: "A00; A01; V00", score: 20.5, scale: 30 }
], {
  infoUrl: ktsInfoUrl,
  scoreUrl: ktsScoreUrl,
  methods: ["THPT", "ĐGNL V-ACT", "Tuyển thẳng/ưu tiên"],
  note: "Cơ sở Cần Thơ dùng mã tuyển sinh chung KTS. Đã cập nhật đủ 03 chương trình và điểm chính thức sau quy đổi tương đương năm 2026.",
  formulaText: ktsFormula,
  sourceName: "Trường Đại học Kiến trúc TP.HCM"
});
const ktlOfficialRows = replaceSpecialProfile("KTL", [
  { code: "7580101DL", nationalMajorCode: "7580101", name: "Kiến trúc (Cơ sở Đà Lạt)", combination: "V01; V02", score: 23.3, scale: 30 },
  { code: "7580201DL", nationalMajorCode: "7580201", name: "Kỹ thuật xây dựng (Cơ sở Đà Lạt)", combination: "A00; A01; V00", score: 20.5, scale: 30 }
], {
  infoUrl: ktsInfoUrl,
  scoreUrl: ktsScoreUrl,
  methods: ["THPT", "ĐGNL V-ACT", "Tuyển thẳng/ưu tiên"],
  note: "Cơ sở Đà Lạt dùng mã tuyển sinh chung KTS. Đã cập nhật đủ 02 chương trình và điểm chính thức sau quy đổi tương đương năm 2026.",
  formulaText: ktsFormula,
  sourceName: "Trường Đại học Kiến trúc TP.HCM"
});

// Chuẩn hóa mã Phân hiệu Đại học Lâm nghiệp Gia Lai từ LNG sang LNA.
const lna = byCode.get("LNG");
byCode.delete("LNG");
lna.code = "LNA";
lna.legacyCode = "LNG";
lna.shortName = "VNUF3";
lna.website = "https://vnuf3.edu.vn/";
byCode.set("LNA", lna);
byCode.set("LNG", lna);
const lnaInfoUrl = "https://diemthi.tuyensinh247.com/thong-tin-phan-hieu-dai-hoc-lam-nghiep-tinh-gia-lai-LNA.html";
const lnaAdmissionsUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/phan-hieu-dai-hoc-lam-nghiep-tinh-gia-lai-LNA.html";
const lnaFormula = "Điểm xét tuyển THPT = Điểm môn 1 + Điểm môn 2 + Điểm môn 3 + điểm ưu tiên. Học bạ dùng điểm trung bình cả năm lớp 10, 11, 12 của 03 môn trong tổ hợp, sau đó cộng điểm ưu tiên.";
const lnaOfficialRows = replaceSpecialProfile("LNA", [
  { code: "7340101", name: "Quản trị kinh doanh", combination: "D01; A01; X26; X01; C00", score: null, method: "THPT/Học bạ" },
  { code: "7340301", name: "Kế toán", combination: "X78; D15; D14; X74; X70", score: null, method: "THPT/Học bạ" },
  { code: "7620110", name: "Khoa học cây trồng", combination: "B00; D07; X16", score: null, method: "THPT/Học bạ" },
  { code: "7620112", name: "Bảo vệ thực vật", combination: "A00; B02; X12; D01; C04; C03", score: null, method: "THPT/Học bạ" },
  { code: "7620205", name: "Lâm sinh", combination: "B00; B03; C02; X02; X04; D01; X26; A01; X06; X12", score: null, method: "THPT/Học bạ" },
  { code: "7850103", name: "Quản lý đất đai", combination: "C04; D01; X01; X02; X26; D15; D14; X04; X74; X78", score: null, method: "THPT/Học bạ" }
], {
  status: "complete_score_not_published",
  infoUrl: lnaAdmissionsUrl,
  scoreUrl: lnaInfoUrl,
  methods: ["THPT", "Học bạ"],
  note: "Đã sửa mã chính thức thành LNA và cập nhật đủ 06 ngành, mã ngành, tổ hợp, phương thức, công thức 2026. Nguồn chỉ công bố ngưỡng đầu vào, chưa có điểm trúng tuyển cuối cùng nên điểm chuẩn được giữ là chưa công bố.",
  formulaText: lnaFormula,
  sourceName: "TuyểnSinh247"
});

// Phân hiệu Đại học Xây dựng Miền Trung tại Đà Nẵng có mã chính thức XDN.
const xdn = byCode.get("XTD");
byCode.delete("XTD");
xdn.code = "XDN";
xdn.legacyCode = "XTD";
xdn.website = "https://muce.edu.vn/";
byCode.set("XDN", xdn);
byCode.set("XTD", xdn);
const xdnInfoUrl = "https://diemthi.tuyensinh247.com/thong-tin-phan-hieu-dai-hoc-xay-dung-mien-trung-tai-da-nang-XDN.html";
const xdnScoreUrl = "https://diemthi.tuyensinh247.com/diem-chuan/phan-hieu-dai-hoc-xay-dung-mien-trung-tai-da-nang-XDN.html";
const xdnFormula = "Điểm xét tuyển THPT/học bạ = tổng điểm 03 môn trong tổ hợp + điểm cộng + điểm ưu tiên; V-ACT được quy đổi tương đương. Ngành Kiến trúc và Kiến trúc nội thất áp dụng tổ hợp năng khiếu theo quy định của trường.";
const xdnPrograms = [
  ["7340101", "Quản trị kinh doanh", false], ["7340122", "Thương mại điện tử", false],
  ["7340301", "Kế toán", false], ["7480201", "Công nghệ thông tin", false],
  ["7510205", "Công nghệ kỹ thuật ô tô", false], ["7510605", "Logistics và Quản lý chuỗi cung ứng", false],
  ["7520216", "Kỹ thuật điều khiển và tự động hóa", false], ["7580101", "Kiến trúc", true],
  ["7580103", "Kiến trúc nội thất", true], ["7580201", "Kỹ thuật xây dựng", false],
  ["7580205", "Kỹ thuật xây dựng công trình giao thông", false], ["7580302", "Quản lý xây dựng", false]
];
const xdnOfficialRows = replaceSpecialProfile("XDN", xdnPrograms.map(([code, name, aptitude]) => ({
  code,
  name,
  combination: aptitude
    ? "A00; A01; C01; D01; D07; X02; X03; X26; X27; X56; V00; V01"
    : "A00; A01; C01; D01; D07; X02; X03; X26; X27; X56",
  score: null,
  method: "Các phương thức 2026"
})), {
  status: "complete_score_not_published",
  infoUrl: xdnInfoUrl,
  scoreUrl: xdnScoreUrl,
  methods: ["THPT", "Học bạ", "ĐGNL V-ACT", "Kết hợp năng khiếu", "Tuyển thẳng/ưu tiên"],
  note: "Đã sửa mã chính thức thành XDN và cập nhật đủ 12 ngành, mã ngành, tổ hợp, phương thức, công thức năm 2026. Trang điểm chuẩn chi tiết hiện chỉ có bảng 2025 nên không dùng thay cho điểm 2026.",
  formulaText: xdnFormula,
  sourceName: "TuyểnSinh247"
});

// Hai ngành đào tạo tại Phân hiệu Học viện Phụ nữ Việt Nam ở TP.HCM.
const hpsInfoUrl = "https://hvpnvn.edu.vn/khong-co-danh-muc/08h00-ngay-09-6-hoc-vien-phu-nu-viet-nam-mo-cong-dang-ky-thong-tin-nguyen-vong-nam-202/";
const hpsScoreUrl = "https://hvpnvn.edu.vn/cat-tin-tuc/tin-tuc/diem-trung-tuyen-dai-hoc-chinh-quy-hoc-vien-phu-nu-viet-nam-nam-2026-theo-tung-phuong-thuc/";
const hpsFormula = "Điểm xét tuyển được tính theo kết quả của phương thức tương ứng và quy đổi theo quy tắc năm 2026; THPT/học bạ dùng tổng 03 môn trong tổ hợp, SPT/HSA dùng điểm bài thi tương ứng, sau đó cộng điểm ưu tiên.";
const hpsRows = [
  ["7760101", "Công tác xã hội", "THPT", "D01", 23.35, 30],
  ["7760101", "Công tác xã hội", "THPT", "C00", 22.35, 30],
  ["7760101", "Công tác xã hội", "THPT", "C03; D14; D15", 22.85, 30],
  ["7760101", "Công tác xã hội", "Học bạ", "D01", 24.85, 30],
  ["7760101", "Công tác xã hội", "Học bạ", "C00", 23.85, 30],
  ["7760101", "Công tác xã hội", "Học bạ", "C03; D14; D15", 24.35, 30],
  ["7760101", "Công tác xã hội", "ĐGNL SPT", "D01", 17.7, 30],
  ["7760101", "Công tác xã hội", "ĐGNL SPT", "C00", 16.7, 30],
  ["7760101", "Công tác xã hội", "ĐGNL SPT", "C03; D14; D15", 17.2, 30],
  ["7760101", "Công tác xã hội", "ĐGNL HSA", "HSA", 94, 150],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "THPT", "A00; D01", 23.15, 30],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "THPT", "C00", 22.15, 30],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "THPT", "A01; C03; D14; D15", 22.65, 30],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "Học bạ", "A00; D01", 24.65, 30],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "Học bạ", "C00", 23.65, 30],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "Học bạ", "A01; C03; D14; D15", 24.15, 30],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "ĐGNL SPT", "A00; D01", 17.46, 30],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "ĐGNL SPT", "C00", 16.46, 30],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "ĐGNL SPT", "A01; C03; D14; D15", 16.96, 30],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "ĐGNL HSA", "HSA", 93, 150]
];
const hpsOfficialRows = replaceSpecialProfile("HPS", hpsRows.map(([code, name, method, combination, score, scale]) => ({
  code, name, method, combination, score, scale
})), {
  infoUrl: hpsInfoUrl,
  scoreUrl: hpsScoreUrl,
  methods: ["THPT", "Học bạ", "ĐGNL SPT", "ĐGNL HSA"],
  note: "Đã cập nhật đủ 02 ngành đào tạo tại Phân hiệu TP.HCM và 20 mức điểm theo phương thức/tổ hợp chính thức năm 2026.",
  formulaText: hpsFormula,
  sourceName: "Học viện Phụ nữ Việt Nam"
});

// Mã tuyển sinh 2026 của Phân hiệu Học viện Thanh thiếu niên Việt Nam tại TP.HCM là HTH.
const hth = byCode.get("HTS");
byCode.delete("HTS");
hth.code = "HTH";
hth.legacyCode = "HTS";
hth.name = "Phân hiệu Học viện Thanh thiếu niên Việt Nam tại TP.HCM";
hth.shortName = "VYA2";
hth.website = "https://vya2.edu.vn/";
byCode.set("HTH", hth);
byCode.set("HTS", hth);
const hthInfoUrl = "https://tuyensinh.vya2.edu.vn/2026/03/31/tuyen-sinh-he-dai-hoc-chinh-quy-nam-2026-phan-hieu-hoc-vien-thanh-thieu-nien-viet-nam-tai-tp-ho-chi-minh/";
const hthScoreUrl = "https://vya2.edu.vn/2026/08/09/phan-hieu-hoc-vien-thanh-thieu-nien-viet-nam-tai-tp-ho-chi-minh-cong-bo-diem-trung-tuyen-dai-hoc-chinh-quy-nam-2026/";
const hthFormula = "Điểm xét tuyển THPT = tổng điểm 03 môn thi trong tổ hợp + điểm cộng + điểm ưu tiên; học bạ dùng điểm trung bình cả năm lớp 10, 11, 12 của 03 môn trong tổ hợp + điểm cộng + điểm ưu tiên.";
const hthPrograms = [
  ["7310202", "Xây dựng Đảng và Chính quyền Nhà nước", "C00; X74; D01; X21; D10", 17, 18],
  ["7380101", "Luật", "D01; C00; X74; A00; D10", 20, 21.5],
  ["7760102", "Công tác Thanh thiếu niên", "C00; X74; D01; X21; D10", 17, 18]
];
const hthRows = hthPrograms.flatMap(([code, name, combination, thptScore, transcriptScore]) => [
  { code, name, combination, method: "THPT", score: thptScore, scale: 30 },
  { code, name, combination, method: "Học bạ", score: transcriptScore, scale: 30 }
]);
const hthOfficialRows = replaceSpecialProfile("HTH", hthRows, {
  infoUrl: hthInfoUrl,
  scoreUrl: hthScoreUrl,
  methods: ["THPT", "Học bạ", "Xét tuyển thẳng"],
  note: "Đã sửa mã chính thức thành HTH và cập nhật đủ 03 ngành, mã ngành, tổ hợp, công thức cùng 06 mức điểm THPT/học bạ chính thức năm 2026.",
  formulaText: hthFormula,
  sourceName: "Phân hiệu Học viện Thanh thiếu niên Việt Nam tại TP.HCM"
});

// Hồ sơ Bến Tre dùng mã QSP trên cổng tuyển sinh ĐHQG TP.HCM. Cổng năm 2026
// không có chương trình đại học chính quy riêng; phân hiệu đang công bố tuyển sinh sau đại học.
const qsp = byCode.get("QSB-BT");
byCode.delete("QSB-BT");
qsp.code = "QSP";
qsp.legacyCode = "QSB-BT";
qsp.shortName = "VNUHCM-CBT";
qsp.website = "https://vnuhcm-cbt.edu.vn/";
byCode.set("QSP", qsp);
byCode.set("QSB-BT", qsp);
setProfile("QSP", {
  status: "not_general_undergraduate",
  url: "https://tuyensinh.vnuhcm.edu.vn/index.php?route=catalog%2Fdiemchuan%2Ftruong&truong_id=20",
  methods: [],
  note: "Mã cơ sở QSP đã được chuẩn hóa theo cổng tuyển sinh ĐHQG TP.HCM. Cổng năm 2026 không liệt kê ngành tuyển sinh đại học chính quy riêng cho cơ sở Bến Tre, vì vậy không tạo dữ liệu ngành hoặc điểm giả định."
});

// Phân hiệu Đại học Bình Dương tại Cà Mau dùng mã tuyển sinh chung DBD.
// Hồ sơ DBC là khóa nội bộ cũ của website; hiển thị thêm mã chính thức và cập
// nhật đủ 18 ngành cùng ba phương thức có mức điểm được công bố năm 2026.
const dbc = byCode.get("DBC");
dbc.officialAdmissionsCode = "DBD";
dbc.shortName = "BDU Cà Mau";
dbc.website = "https://camau.bdu.edu.vn/";
const dbcInfoUrl = "https://camau.bdu.edu.vn/tuyen-sinh/chinh-quy/tuyen-sinh-dai-hoc-chinh-quy-nam-2026-18-nganh-dao-tao-phan-hieu-truong-dai-hoc-binh-duong-tai-ca-mau-62.html";
const dbcAdmissionsUrl = "https://tuyensinh.bdu.edu.vn/dai-hoc-chinh-quy/thong-bao-tuyen-sinh-dai-hoc-chinh-quy-nam-2026-568.html";
const dbcScoreUrl = "https://xaydungchinhsach.chinhphu.vn/diem-chuan-truong-dai-hoc-binh-duong-2026-119260811115017587.htm";
const dbcPrograms = [
  ["7310613", "Nhật Bản học", "A01; A09; C00; C03; C04; C14; D01; D14; D15; D66", 15, 16, 600],
  ["7310614", "Hàn Quốc học", "A01; A09; C00; C03; C04; C14; D01; D14; D15; D66", 15, 16, 600],
  ["7220201", "Ngôn ngữ Anh", "A01; D01; D07; D09; D14; D15; D19; D66", 15, 16, 600],
  ["7540101", "Công nghệ thực phẩm", "A00; A01; B00; B03; C02; C03; C04; C14; D01", 15, 16, 600],
  ["7720201", "Dược học", "A00; A02; A11; B00; B0C; B0D; B03; C02; C08; D07", 20, 20, null],
  ["7720203", "Hóa dược", "A00; A02; A11; B00; B0C; B0D; B03; C02; C08; D07", 15, 16, 600],
  ["7510605", "Logistics và Quản lý chuỗi cung ứng", "A00; A01; A09; C01; C03; C04; C14; D01; D66", 15, 16, 600],
  ["7340201", "Tài chính - Ngân hàng", "A00; A09; C01; C03; C04; C14; D01; D16; D20; D21", 15, 16, 600],
  ["7340101", "Quản trị kinh doanh", "A00; A09; C01; C03; C04; C14; D01; D16; D20; D21", 15, 16, 600],
  ["7340301", "Kế toán", "A00; A09; C01; C03; C04; C14; D01; D16; D20; D21", 15, 16, 600],
  ["7380101", "Luật", "A00; A09; C00; C03; C04; C14; D01; D16; D20; D21", 20, 18, null],
  ["7380107", "Luật kinh tế", "A00; A09; C00; C03; C04; C14; D01; D16; D20; D21", 20, 18, null],
  ["7310301", "Xã hội học", "A00; A09; C01; C03; C04; C14; D01; D16; D20; D21", 15, 16, 600],
  ["7480201", "Công nghệ thông tin", "A00; A01; C01; C03; C04; C14; D01; D16; X02; X03", 15, 16, 600],
  ["7510301", "Công nghệ kỹ thuật điện, điện tử", "A00; A01; C01; C03; C04; C14; D01; D17; D18", 15, 16, 600],
  ["7510102", "Công nghệ kỹ thuật công trình xây dựng", "A00; A01; C01; C03; C04; C14; D01; D16; X02; X03", 15, 16, 600],
  ["7580101", "Kiến trúc", "A00; V00; V01; V02; V03; V04; V05; V06; V07; V08; V10", 15, 16, 600],
  ["7510205", "Công nghệ kỹ thuật ô tô", "A00; A09; C01; C03; C04; C14; D01; D16; D17; D18", 15, 16, 600]
];
const dbcThptFormula = "Điểm xét tuyển THPT = tổng điểm 03 môn thi trong tổ hợp + điểm cộng + điểm ưu tiên theo quy định năm 2026.";
const dbcTranscriptFormula = "Điểm xét tuyển học bạ = tổng điểm trung bình cả năm lớp 10, lớp 11 và lớp 12 của 03 môn trong tổ hợp + điểm cộng + điểm ưu tiên.";
const dbcVactFormula = "Sử dụng điểm kỳ thi ĐGNL V-ACT của ĐHQG TP.HCM năm 2026 trên thang 1200, cộng điểm ưu tiên theo quy định của trường.";
const dbcRows = dbcPrograms.flatMap(([code, name, combination, thptScore, transcriptScore, vactScore]) => [
  { code, name, combination, method: "THPT", score: thptScore, scale: 30, formulaText: dbcThptFormula },
  { code, name, combination, method: "Học bạ", score: transcriptScore, scale: 30, formulaText: dbcTranscriptFormula },
  ...(Number.isFinite(vactScore) ? [{ code, name, combination: "V-ACT", method: "ĐGNL V-ACT", score: vactScore, scale: 1200, formulaText: dbcVactFormula }] : [])
]);
const dbcOfficialRows = replaceSpecialProfile("DBC", dbcRows, {
  infoUrl: dbcAdmissionsUrl,
  scoreUrl: dbcScoreUrl,
  methods: ["THPT", "Học bạ", "ĐGNL V-ACT", "Đề án riêng ngành Dược học"],
  note: "Phân hiệu Cà Mau tuyển sinh dưới mã chung DBD. Đã cập nhật đủ 18 ngành, mã ngành, tổ hợp và 51 mức điểm theo THPT, học bạ, V-ACT được công bố năm 2026; Luật, Luật kinh tế và Dược học không có mức V-ACT trong bảng công bố.",
  formulaText: dbcThptFormula,
  sourceName: "Trường Đại học Bình Dương / Báo Điện tử Chính phủ",
  referenceUrl: dbcInfoUrl
});

// Đề án ULSA 2026 chỉ có mã DLX và DLS; Cơ sở Sơn Tây vẫn là đơn vị trực thuộc
// nhưng không có chỉ tiêu đại học chính quy riêng dưới mã DLT.
const dlt = byCode.get("DLT");
dlt.website = "https://ulsa.edu.vn/";
setProfile("DLT", {
  status: "not_general_undergraduate",
  url: "https://tuyensinh.ulsa.edu.vn/wp-content/uploads/sites/17/2026/03/ULSA_Thong-tin-tuyen-sinh-2026-new.pdf",
  methods: [],
  note: "Đề án tuyển sinh chính thức năm 2026 của Trường Đại học Lao động - Xã hội chỉ liệt kê mã DLX (trụ sở chính) và DLS (Cơ sở II), không có ngành hoặc chỉ tiêu đại học chính quy riêng cho DLT tại Sơn Tây."
});

// Sửa mã UFH thành mã tuyển sinh chính thức HFA và bổ sung hai ngành của Phân hiệu Huế.
const hfa = byCode.get("UFH");
byCode.delete("UFH");
hfa.code = "HFA";
hfa.legacyCode = "UFH";
hfa.shortName = "UFA Huế";
hfa.website = "https://hfa.tckt.edu.vn/";
byCode.set("HFA", hfa);
byCode.set("UFH", hfa);
const hfaInfoUrl = "https://hfa.tckt.edu.vn/thong-tin-tuyen-sinh/thong-tin-tuyen-sinh-dai-hoc-chinh-quy-nam-2026";
const hfaSourceUrl = "https://images.tuyensinh247.com/picture/2026/0403/ufa-thong-tin-tuyen-sinh-dai-hoc-chinh-quy-nam-2026.pdf";
const hfaFormula = "Điểm xét tuyển = tổng điểm của 03 môn trong tổ hợp, không nhân hệ số, cộng điểm ưu tiên theo Quy chế tuyển sinh; điểm trúng tuyển được tính trên thang 30.";
const hfaPrograms = [
  ["7340101", "Quản trị kinh doanh", "A00; A01; C01; C02; D01; X01"],
  ["7340301", "Kế toán", "A00; A01; C01; C02; D01; X01"]
];
const hfaRows = hfaPrograms.flatMap(([code, name, combination]) => [
  { code, name, combination, method: "THPT", score: null, scale: 30 },
  { code, name, combination, method: "Học bạ", score: null, scale: 30 }
]);
const hfaOfficialRows = replaceSpecialProfile("HFA", hfaRows, {
  status: "complete_score_not_published",
  infoUrl: hfaSourceUrl,
  scoreUrl: hfaInfoUrl,
  methods: ["THPT", "Học bạ"],
  note: "Đã sửa mã chính thức thành HFA và cập nhật đủ 02 ngành, mã ngành, tổ hợp, phương thức, công thức từ đề án 2026. Chưa có bảng điểm trúng tuyển cuối cùng có thể kiểm chứng nên không dùng điểm 2025 thay thế.",
  formulaText: hfaFormula,
  sourceName: "Trường Đại học Tài chính - Kế toán / TuyểnSinh247"
});

// Học viện Kỹ thuật và Công nghệ an ninh (T07/KTH): đủ 9 mức điểm theo giới tính, vùng và nơi gửi đào tạo.
const hcn = byCode.get("HCN");
const hcnScoreUrl = "https://xaydungchinhsach.chinhphu.vn/thong-bao-diem-chuan-2026-hoc-vien-ky-thuat-va-cong-nghe-an-ninh-119260814104811416.htm";
const hcnInfoUrl = "https://www.bocongan.gov.vn/bai-viet/thong-tin-tuyen-sinh-cac-hoc-vien-truong-cong-an-nhan-dan-nam-2026-1773897621";
const hcnFormula = "Phương thức 3 kết hợp tổng điểm 03 môn thi tốt nghiệp THPT (trọng số 40%) với điểm bài thi đánh giá Bộ Công an (trọng số 60%); Phương thức 2 thay phần điểm THPT bằng điểm chứng chỉ ngoại ngữ quốc tế quy đổi. Điểm công bố đã gồm điểm thưởng và ưu tiên theo quy định Bộ Công an.";
hcn.name = "Học viện Kỹ thuật và Công nghệ an ninh";
hcn.shortName = "T07";
hcn.website = "https://hvktcnan.bocongan.gov.vn";
const hcnOfficialRows = replaceSpecialProfile("HCN", [
  { code: "7480200", nationalMajorCode: "7480200", name: "Nhóm ngành Kỹ thuật - Hậu cần (Nam, phía Bắc)", combination: "A00; A01; D01; X26; X27; X28; CA1; CA2", score: 21.61, scale: 30 },
  { code: "7480200", nationalMajorCode: "7480200", name: "Nhóm ngành Kỹ thuật - Hậu cần (Nữ, phía Bắc)", combination: "A00; A01; D01; X26; X27; X28; CA1; CA2", score: 23.25, scale: 30 },
  { code: "7480200", nationalMajorCode: "7480200", name: "Nhóm ngành Kỹ thuật - Hậu cần (Nam, phía Nam)", combination: "A00; A01; D01; X26; X27; X28; CA1; CA2", score: 18.52, scale: 30 },
  { code: "7480200", nationalMajorCode: "7480200", name: "Nhóm ngành Kỹ thuật - Hậu cần (Nữ, phía Nam)", combination: "A00; A01; D01; X26; X27; X28; CA1; CA2", score: 22.48, scale: 30 },
  { code: "7720101", nationalMajorCode: "7720101", name: "Y khoa gửi đào tạo tại Học viện Quân y (Nam)", combination: "A00; A01; B00; B08; D07; CA1; CA2; CA3", score: 20.79, scale: 30 },
  { code: "7720101", nationalMajorCode: "7720101", name: "Y khoa gửi đào tạo tại Học viện Quân y (Nữ)", combination: "A00; A01; B00; B08; D07; CA1; CA2; CA3", score: 23.04, scale: 30 },
  { code: "7720101A", nationalMajorCode: "7720101", name: "Y khoa gửi đào tạo tại Trường Đại học Y Dược - ĐHQGHN (Nam)", combination: "B00; B08; CA1; CA2; CA3", score: 17.14, scale: 30 },
  { code: "7720101A", nationalMajorCode: "7720101", name: "Y khoa gửi đào tạo tại Trường Đại học Y Dược - ĐHQGHN (Nữ)", combination: "B00; B08; CA1; CA2; CA3", score: 22.43, scale: 30 },
  { code: "7520207", nationalMajorCode: "7520207", name: "Kỹ thuật điện tử, viễn thông gửi đào tạo tại Học viện Kỹ thuật Mật mã", combination: "A00; A01; D01; X26; X27; CA1; CA2", score: 21.6, scale: 30 }
], {
  infoUrl: hcnInfoUrl,
  scoreUrl: hcnScoreUrl,
  methods: ["Xét tuyển thẳng", "Chứng chỉ ngoại ngữ quốc tế + BCA", "THPT + BCA"],
  note: "Đã cập nhật đủ 09 mức điểm chính thức theo giới tính, vùng tuyển sinh và cơ sở gửi đào tạo; đồng thời cập nhật tên mới T07/KTH, mã ngành, tổ hợp, phương thức và công thức năm 2026.",
  formulaText: hcnFormula,
  sourceName: "Bộ Công an / Báo Điện tử Chính phủ",
  referenceUrl: "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/hoc-vien-ky-thuat-va-cong-nghe-an-ninh-phia-nam-HCN.html"
});

// HCB là hồ sơ mã phía Bắc của cùng học viện. Nguồn tổng hợp cũ làm mất mã
// ngành, giới tính và gắn nhầm khu vực vào cột tổ hợp; thay toàn bộ bằng 09 dòng 2026.
const hcb = byCode.get("HCB");
hcb.name = "Học viện Kỹ thuật và Công nghệ an ninh (phía Bắc)";
hcb.shortName = "T07";
hcb.website = "https://hvktcnan.bocongan.gov.vn";
const hcbOfficialRows = replaceSpecialProfile("HCB", [
  { code: "7480200", nationalMajorCode: "7480200", name: "Nhóm ngành Kỹ thuật - Hậu cần (Nam, phía Bắc)", combination: "A00; A01; D01; X26; X27; X28; CA1; CA2", score: 21.61, scale: 30 },
  { code: "7480200", nationalMajorCode: "7480200", name: "Nhóm ngành Kỹ thuật - Hậu cần (Nữ, phía Bắc)", combination: "A00; A01; D01; X26; X27; X28; CA1; CA2", score: 23.25, scale: 30 },
  { code: "7480200", nationalMajorCode: "7480200", name: "Nhóm ngành Kỹ thuật - Hậu cần (Nam, phía Nam)", combination: "A00; A01; D01; X26; X27; X28; CA1; CA2", score: 18.52, scale: 30 },
  { code: "7480200", nationalMajorCode: "7480200", name: "Nhóm ngành Kỹ thuật - Hậu cần (Nữ, phía Nam)", combination: "A00; A01; D01; X26; X27; X28; CA1; CA2", score: 22.48, scale: 30 },
  { code: "7720101", nationalMajorCode: "7720101", name: "Y khoa gửi đào tạo tại Học viện Quân y (Nam)", combination: "A00; A01; B00; B08; D07; CA1; CA2; CA3", score: 20.79, scale: 30 },
  { code: "7720101", nationalMajorCode: "7720101", name: "Y khoa gửi đào tạo tại Học viện Quân y (Nữ)", combination: "A00; A01; B00; B08; D07; CA1; CA2; CA3", score: 23.04, scale: 30 },
  { code: "7720101A", nationalMajorCode: "7720101", name: "Y khoa gửi đào tạo tại Trường Đại học Y Dược - ĐHQGHN (Nam)", combination: "B00; B08; CA1; CA2; CA3", score: 17.14, scale: 30 },
  { code: "7720101A", nationalMajorCode: "7720101", name: "Y khoa gửi đào tạo tại Trường Đại học Y Dược - ĐHQGHN (Nữ)", combination: "B00; B08; CA1; CA2; CA3", score: 22.43, scale: 30 },
  { code: "7520207", nationalMajorCode: "7520207", name: "Kỹ thuật điện tử, viễn thông gửi đào tạo tại Học viện Kỹ thuật Mật mã", combination: "A00; A01; D01; X26; X27; CA1; CA2", score: 21.6, scale: 30 }
], {
  infoUrl: hcnInfoUrl,
  scoreUrl: hcnScoreUrl,
  methods: ["Xét tuyển thẳng", "Chứng chỉ ngoại ngữ quốc tế + BCA", "THPT + BCA"],
  note: "Đã sửa hồ sơ nhập sai cột và cập nhật đủ 09 mức điểm chính thức theo giới tính, vùng tuyển sinh và nơi gửi đào tạo năm 2026.",
  formulaText: hcnFormula,
  sourceName: "Bộ Công an / Báo Điện tử Chính phủ",
  referenceUrl: "https://diemthi.tuyensinh247.com/thong-tin-dai-hoc-ky-thuat-hau-can-cong-an-nhan-dan-phia-bac-HCB.html"
});

// Hai mã PCH/PCS được lưu thành hai hồ sơ vùng. Mỗi hồ sơ có đủ dòng Nam/Nữ,
// thay cho hai dòng cũ bị gắn khu vực vào cột tổ hợp và bỏ mất mã ngành.
const pcccScoreUrl = "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-phong-chay-chua-chay-phia-bac-PCH.html";
const pcccFormula = "Điểm xét tuyển = (điểm 03 môn thi tốt nghiệp THPT hoặc điểm chứng chỉ ngoại ngữ quốc tế quy đổi) × 40% + điểm bài thi đánh giá Bộ Công an × 60% + điểm thưởng + điểm ưu tiên theo quy định, quy về thang 30.";
const pcccMethods = ["Xét tuyển thẳng", "Chứng chỉ ngoại ngữ quốc tế + BCA", "THPT + BCA"];
const pch = byCode.get("PCH");
pch.name = "Học viện Phòng cháy chữa cháy và Cứu nạn cứu hộ (phía Bắc)";
const pchOfficialRows = replaceSpecialProfile("PCH", [
  { code: "7860113", nationalMajorCode: "7860113", name: "Phòng cháy chữa cháy và cứu nạn, cứu hộ (Nam, phía Bắc)", combination: "A00; A01; D01; D07; CA1; CA2", score: 21.48, scale: 30 },
  { code: "7860113", nationalMajorCode: "7860113", name: "Phòng cháy chữa cháy và cứu nạn, cứu hộ (Nữ, phía Bắc)", combination: "A00; A01; D01; D07; CA1; CA2", score: 24, scale: 30 }
], {
  infoUrl: "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-phong-chay-chua-chay-phia-bac-PCH.html",
  scoreUrl: pcccScoreUrl,
  methods: pcccMethods,
  note: "Đã cập nhật đúng mã ngành, tổ hợp và đủ điểm Nam/Nữ khu vực phía Bắc năm 2026.",
  formulaText: pcccFormula,
  sourceName: "Học viện Phòng cháy chữa cháy và Cứu nạn cứu hộ / TuyểnSinh247"
});

const pcs = byCode.get("PCS");
pcs.name = "Học viện Phòng cháy chữa cháy và Cứu nạn cứu hộ (phía Nam)";
const pcsOfficialRows = replaceSpecialProfile("PCS", [
  { code: "7860113", nationalMajorCode: "7860113", name: "Phòng cháy chữa cháy và cứu nạn, cứu hộ (Nam, phía Nam)", combination: "A00; A01; D01; D07; CA1; CA2", score: 20.28, scale: 30 },
  { code: "7860113", nationalMajorCode: "7860113", name: "Phòng cháy chữa cháy và cứu nạn, cứu hộ (Nữ, phía Nam)", combination: "A00; A01; D01; D07; CA1; CA2", score: 22.65, scale: 30 }
], {
  infoUrl: "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-phong-chay-chua-chay-phia-nam-PCS.html",
  scoreUrl: pcccScoreUrl,
  methods: pcccMethods,
  note: "Đã cập nhật đúng mã ngành, tổ hợp và đủ điểm Nam/Nữ khu vực phía Nam năm 2026.",
  formulaText: pcccFormula,
  sourceName: "Học viện Phòng cháy chữa cháy và Cứu nạn cứu hộ / TuyểnSinh247"
});

// Hai trường sĩ quan công bố một mức điểm chung sau quy đổi cho các phương thức quân sự.
const militaryFormula = "Điểm của phương thức THPT, HSA, V-ACT hoặc QDA được quy đổi tương đương về thang 30; điểm xét tuyển cuối cùng cộng điểm ưu tiên và điểm thưởng theo quy định tuyển sinh quân sự năm 2026.";
const tghScoreUrl = "https://tuyensinh.vn/diem-chuan-truong-si-quan-tang-thiet-giap/";
const tghInfoUrl = "https://siquantangthietgiap.vn/truong-si-quan-tang-thiet-giap-thong-bao-muc-diem-nhan-ho-so-xet-tuyen-nam-2026/";
const tghOfficialRows = replaceSpecialProfile("TGH", [
  { code: "7860206", nationalMajorCode: "7860206", name: "Chỉ huy tham mưu Tăng thiết giáp (Nam, phía Bắc)", combination: "A00; A01; C01; HSA; V-ACT; QDA", score: 24.4, scale: 30 },
  { code: "7860206", nationalMajorCode: "7860206", name: "Chỉ huy tham mưu Tăng thiết giáp (Nam, phía Nam)", combination: "A00; A01; C01; HSA; V-ACT; QDA", score: 22.85, scale: 30 }
], {
  infoUrl: tghInfoUrl,
  scoreUrl: tghScoreUrl,
  methods: ["Xét tuyển thẳng", "THPT", "ĐGNL HSA", "ĐGNL V-ACT", "ĐGNL QDA"],
  note: "Đã gộp đúng các phương thức sau quy đổi và cập nhật 02 mức điểm chính thức theo vùng tuyển sinh năm 2026.",
  formulaText: militaryFormula,
  sourceName: "Trường Sĩ quan Tăng - Thiết giáp"
});

const vphScoreUrl = "https://tdnu.edu.vn/tin-tuc/thong-bao-danh-sach-thi-sinh-trung-tuyen-he-quan-su-nam-2026.html";
const vphInfoUrl = "https://tdnu.edu.vn/tin-tuc/thong-tin-tuyen-sinh-2026.html";
const vphOfficialRows = replaceSpecialProfile("VPH", [
  { code: "QUANSU", nationalMajorCode: "7510201", name: "Công nghệ kỹ thuật cơ khí - Hệ quân sự (Nam, phía Bắc)", combination: "A00; A01; C01; HSA; V-ACT; QDA", score: 26.27, scale: 30 },
  { code: "QUANSU", nationalMajorCode: "7510201", name: "Công nghệ kỹ thuật cơ khí - Hệ quân sự (Nam, phía Nam)", combination: "A00; A01; C01; HSA; V-ACT; QDA", score: 25.46, scale: 30 }
], {
  infoUrl: vphInfoUrl,
  scoreUrl: vphScoreUrl,
  methods: ["Xét tuyển thẳng", "THPT", "ĐGNL HSA", "ĐGNL V-ACT", "ĐGNL QDA"],
  note: "Đã sửa ngành cũ bị gán nhầm thành Công nghệ kỹ thuật cơ khí, mã 7510201, và cập nhật điểm chính thức theo hai miền năm 2026.",
  formulaText: militaryFormula,
  sourceName: "Trường Sĩ quan Kỹ thuật Quân sự"
});

// Trường Đại học Mỹ thuật Việt Nam: điểm công bố theo thang 40, môn năng khiếu chính nhân hệ số 2.
const mthScoreUrl = "https://www.mythuatvietnam.edu.vn/dao-tao-tuyen-sinh/thong-bao-diem-trung-tuyen-ky-thi-tuyen-sinh-dai-hoc-chinh-quy-nam-2026.html";
const mthFormula = "Điểm xét tuyển = điểm Ngữ văn + 2 × điểm môn năng khiếu chính + điểm môn năng khiếu còn lại + điểm ưu tiên theo thang 40. Tổ hợp môn năng khiếu thay đổi theo từng ngành như mô tả.";
const mthOfficialRows = replaceSpecialProfile("MTH", [
  { code: "7210101", nationalMajorCode: "7210101", name: "Lý luận, lịch sử và phê bình mỹ thuật", combination: "Ngữ văn; Hình họa ×2; Bố cục", score: 31.57, scale: 40 },
  { code: "7210103", nationalMajorCode: "7210103", name: "Hội họa", combination: "Ngữ văn; Hình họa ×2; Bố cục", score: 31.07, scale: 40 },
  { code: "7210104", nationalMajorCode: "7210104", name: "Đồ họa", combination: "Ngữ văn; Hình họa ×2; Bố cục", score: 30.36, scale: 40 },
  { code: "7210105", nationalMajorCode: "7210105", name: "Điêu khắc", combination: "Ngữ văn; Tượng tròn ×2; Phù điêu", score: 27.8, scale: 40 },
  { code: "7210403", nationalMajorCode: "7210403", name: "Thiết kế đồ họa", combination: "Ngữ văn; Hình họa ×2; Trang trí", score: 30.93, scale: 40 }
], {
  infoUrl: mthScoreUrl,
  methods: ["Kết hợp học bạ Ngữ văn và thi năng khiếu", "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 05 ngành, mã ngành, môn xét tuyển, công thức thang 40 và điểm trúng tuyển chính thức năm 2026.",
  formulaText: mthFormula,
  sourceName: "Trường Đại học Mỹ thuật Việt Nam",
  referenceUrl: "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-my-thuat-viet-nam-MTH.html"
});

// Trường Đại học Mỹ thuật TP.HCM: Ngữ văn là điều kiện, điểm xét tuyển chỉ gồm hai môn năng khiếu.
const mtsInfoUrl = "https://www.hcmufa.edu.vn/news_detail/id/620";
const mtsScoreUrl = "https://www.hcmufa.edu.vn/news_detail/id/649";
const mtsSpScoreUrl = "https://hcmufa.edu.vn/event_detail/id/109";
const mtsFormula = "Điểm xét tuyển = 2 × điểm Hình họa (hoặc Tượng tròn với ngành Điêu khắc) + điểm môn năng khiếu còn lại, thang 30. Ngữ văn là điều kiện xét tuyển, không cộng vào tổng điểm; trường không cộng điểm ưu tiên vào điểm năng khiếu.";
const mtsOfficialRows = replaceSpecialProfile("MTS", [
  { code: "7210101", nationalMajorCode: "7210101", name: "Lý luận, lịch sử và phê bình mỹ thuật", combination: "Ngữ văn (điều kiện); Hình họa ×2; Bố cục", score: 23, scale: 30 },
  { code: "7210103", nationalMajorCode: "7210103", name: "Hội họa", combination: "Ngữ văn (điều kiện); Hình họa ×2; Bố cục", score: 23, scale: 30 },
  { code: "7210104", nationalMajorCode: "7210104", name: "Đồ họa", combination: "Ngữ văn (điều kiện); Hình họa ×2; Bố cục", score: 22.75, scale: 30 },
  { code: "7210105", nationalMajorCode: "7210105", name: "Điêu khắc", combination: "Ngữ văn (điều kiện); Tượng tròn ×2; Phù điêu", score: 16.5, scale: 30 },
  { code: "7210403", nationalMajorCode: "7210403", name: "Thiết kế đồ họa", combination: "Ngữ văn (điều kiện); Hình họa ×2; Trang trí", score: 19.5, scale: 30 },
  { code: "7140222", nationalMajorCode: "7140222", name: "Sư phạm Mỹ thuật", combination: "Ngữ văn (điều kiện); Hình họa ×2; Bố cục tranh màu", score: 21.5, scale: 30, sourceUrl: mtsSpScoreUrl, methodDetails: "Mức tổng điểm thấp nhất trong danh sách trúng tuyển chính thức ngày 21/08/2026" }
], {
  infoUrl: mtsInfoUrl,
  scoreUrl: mtsScoreUrl,
  methods: ["Kết hợp xét Ngữ văn và thi năng khiếu", "Xét tuyển thẳng"],
  note: "Đã cập nhật đủ 06 ngành năm 2026, gồm Sư phạm Mỹ thuật tuyển bổ sung; điểm Sư phạm Mỹ thuật là mức tổng thấp nhất trong danh sách trúng tuyển chính thức.",
  formulaText: mtsFormula,
  sourceName: "Trường Đại học Mỹ thuật TP.HCM"
});

// GNT: 13 ngành đã có điểm 2026; Nghệ thuật số là ngành mới chưa thấy mức điểm cuối cùng được công bố.
const gntInfoUrl = "https://images.tuyensinh247.com/picture/2026/0224/2026-thong-tin-tuyen-sinh-chinh-sua-ngay-29-1.pdf";
const gntScoreUrl = "https://diemthi.giaphugroup.com/diem-chuan/truong-dai-hoc-su-pham-nghe-thuat-trung-uong-gnt/";
const gntReferenceUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-su-pham-nghe-thuat-trung-uong-GNT.html";
const gntTalentFormula = "Điểm xét tuyển kết hợp gồm điểm môn văn hóa và các môn năng khiếu theo tổ hợp; môn năng khiếu chính nhân hệ số 1,5, sau đó quy đổi về thang 30 và cộng điểm ưu tiên theo quy định.";
const gntCultureFormula = "Điểm xét tuyển = tổng điểm 03 môn trong tổ hợp từ kết quả thi tốt nghiệp THPT năm 2026 + điểm cộng + điểm ưu tiên theo quy định.";
const gntPrograms = [
  ["7140221", "Sư phạm Âm nhạc", "N00", 23, gntTalentFormula],
  ["7140222", "Sư phạm Mỹ thuật", "H00", 23, gntTalentFormula],
  ["7210103", "Hội họa", "H00", 23.5, gntTalentFormula],
  ["7210205", "Thanh nhạc", "N01", 21, gntTalentFormula],
  ["7210207", "Biểu diễn nhạc cụ phương Tây", "N03", 19, gntTalentFormula],
  ["7210208", "Piano", "N02", 23.5, gntTalentFormula],
  ["7210234", "Diễn viên Kịch - Điện ảnh", "S00", 19, gntTalentFormula],
  ["7210403", "Thiết kế đồ họa", "H00", 22.5, gntTalentFormula],
  ["7210404", "Thiết kế thời trang", "H00", 22.25, gntTalentFormula],
  ["7210408", "Nghệ thuật số", "H00", null, gntTalentFormula],
  ["7229042", "Quản lý văn hóa", "C00; R00; H00; N00", 24.7, gntCultureFormula],
  ["7540204", "Công nghệ may", "A00; D01; H00", 21, gntCultureFormula],
  ["7760101", "Công tác xã hội", "C00; C03; C04; D01", 23, gntCultureFormula],
  ["7810101", "Du lịch", "C00; C03; C04; D01", 23.3, gntCultureFormula]
];
const gntOfficialRows = replaceSpecialProfile("GNT", gntPrograms.map(([code, name, combination, score, rowFormula]) => ({
  code, nationalMajorCode: code, name, combination, score, scale: 30,
  method: score === null ? "Xét tuyển kết hợp" : "Điểm trúng tuyển sau quy đổi",
  formulaText: rowFormula
})), {
  status: "complete_with_partial_scores",
  infoUrl: gntInfoUrl,
  scoreUrl: gntScoreUrl,
  methods: ["Xét tuyển thẳng", "THPT", "Học bạ", "Xét tuyển kết hợp thi năng khiếu"],
  note: "Đã cập nhật đủ 14 ngành, mã ngành, tổ hợp, phương thức và công thức năm 2026; 13 ngành có điểm trúng tuyển, ngành Nghệ thuật số chưa có mức điểm cuối cùng nên hiển thị Chưa công bố.",
  formulaText: gntTalentFormula,
  sourceName: "Trường Đại học Sư phạm Nghệ thuật Trung ương / nguồn tổng hợp",
  referenceUrl: gntReferenceUrl
});

// TDH: bốn ngành, điểm sau quy đổi thang 30; khối thể thao sử dụng một môn văn hóa và hai môn năng khiếu.
const tdhInfoUrl = "https://tuyensinhdaihoc.hupes.edu.vn/";
const tdhScoreUrl = "https://diemthi.vnexpress.net/tra-cuu-dai-hoc/dai-hoc-su-pham-the-duc-the-thao-ha-noi-434";
const tdhSportFormula = "Điểm xét tuyển = điểm Toán hoặc Ngữ văn + điểm Năng khiếu 1 + điểm Năng khiếu 2 + điểm ưu tiên; tổng tối đa 30 và làm tròn đến hai chữ số thập phân.";
const tdhCultureFormula = "Điểm xét tuyển = tổng điểm 03 môn theo tổ hợp + điểm cộng + điểm ưu tiên; kết quả học bạ được tính từ trung bình cả năm lớp 10, 11 và 12 của từng môn.";
const tdhOfficialRows = replaceSpecialProfile("TDH", [
  { code: "7140206", nationalMajorCode: "7140206", name: "Giáo dục thể chất", combination: "T11; T12", score: 24.66, scale: 30, formulaText: tdhSportFormula },
  { code: "7140208", nationalMajorCode: "7140208", name: "Giáo dục Quốc phòng và An ninh", combination: "C00; C19; C20; D66", score: 27.04, scale: 30, formulaText: tdhCultureFormula },
  { code: "7810301", nationalMajorCode: "7810301", name: "Quản lý thể dục thể thao", combination: "T11; T12", score: 19.21, scale: 30, formulaText: tdhSportFormula },
  { code: "7810302", nationalMajorCode: "7810302", name: "Huấn luyện thể thao", combination: "T11; T12", score: 20.22, scale: 30, formulaText: tdhSportFormula }
], {
  infoUrl: tdhInfoUrl,
  scoreUrl: tdhScoreUrl,
  methods: ["Xét tuyển thẳng", "THPT", "Học bạ", "Kết hợp thi năng khiếu"],
  note: "Đã cập nhật đủ 04 ngành, tổ hợp mới T11/T12, các phương thức, công thức và điểm trúng tuyển 2026.",
  formulaText: tdhSportFormula,
  sourceName: "Trường Đại học Sư phạm Thể dục Thể thao Hà Nội / VnExpress"
});

// TDS: mã xét tuyển nội bộ đi cùng mã ngành quốc gia, điểm đã quy đổi về phương thức 405 thang 30.
const tdsInfoUrl = "https://diemthi.tuyensinh247.com/quy-doi-diem/truong-dai-hoc-the-duc-the-thao-tphcm-TDS.html";
const tdsScoreUrl = "https://diemthi.giaphugroup.com/diem-chuan/truong-dai-hoc-the-duc-the-thao-tp-hcm-tds/2026/";
const tdsFormula = "Phương thức 405: điểm xét tuyển kết hợp kết quả thi tốt nghiệp THPT với điểm thi năng khiếu. Phương thức 406: điểm học bạ kết hợp năng khiếu được nội suy sang phương thức 405 theo khung quy đổi của trường; điểm cuối cùng = điểm quy đổi + điểm ưu tiên, thang 30.";
const tdsOfficialRows = replaceSpecialProfile("TDS", [
  { code: "GDCQ206", nationalMajorCode: "7140206", name: "Giáo dục thể chất - Đào tạo giáo viên", combination: "T00; T01; T04; T06", score: 23.25, scale: 30 },
  { code: "YSCQ001", nationalMajorCode: "7729001", name: "Y sinh học thể dục thể thao", combination: "T00; T01; T04; T06", score: 15, scale: 30 },
  { code: "QLCQ301", nationalMajorCode: "7810301", name: "Quản lý thể dục thể thao", combination: "T00; T01; T04; T06", score: 17.75, scale: 30 },
  { code: "HLCQ302", nationalMajorCode: "7810302", name: "Huấn luyện thể thao", combination: "T00; T01; T04; T06", score: 19.31, scale: 30 }
], {
  infoUrl: tdsInfoUrl,
  scoreUrl: tdsScoreUrl,
  methods: ["Xét tuyển thẳng", "THPT + năng khiếu (405)", "Học bạ + năng khiếu (406)"],
  note: "Đã cập nhật đủ 04 ngành, mã xét tuyển và mã ngành quốc gia, tổ hợp, công thức quy đổi 405/406 và điểm trúng tuyển 2026.",
  formulaText: tdsFormula,
  sourceName: "Trường Đại học Thể dục Thể thao TP.HCM / nguồn tổng hợp",
  referenceUrl: "https://diemthi.tuyensinh247.com/quy-doi-diem/truong-dai-hoc-the-duc-the-thao-tphcm-TDS.html"
});

// TDB: dùng danh mục 2026 của trường; điểm cuối cùng được đối chiếu với cơ sở tra cứu tuyển sinh.
const tdbInfoUrl = "https://upes1.edu.vn/wp-content/uploads/2026/05/Thong-bao-TS-2026-New-2026_Lan2.pdf";
const tdbScoreUrl = "https://diemthi.vnexpress.net/tra-cuu-dai-hoc/dai-hoc-the-duc-the-thao-bac-ninh-460";
const tdbFormula = "Điểm xét tuyển gồm các môn văn hóa và môn năng khiếu tương ứng tổ hợp T00, T02, T03, T05 hoặc T08; phương thức học bạ dùng điểm cả năm lớp 10, 11 và 12, phương thức THPT dùng điểm thi năm 2026; cộng điểm ưu tiên theo quy định.";
const tdbOfficialRows = replaceSpecialProfile("TDB", [
  { code: "7140206", nationalMajorCode: "7140206", name: "Giáo dục thể chất", combination: "T00; T02; T03; T05; T08", score: 27.25, scale: 30 },
  { code: "7729001", nationalMajorCode: "7729001", name: "Y sinh học thể dục thể thao", combination: "T00; T02; T03; T05; T08", score: 18, scale: 30 },
  { code: "7810301", nationalMajorCode: "7810301", name: "Quản lý thể dục thể thao", combination: "T00; T02; T03; T05; T08", score: 22.87, scale: 30 },
  { code: "7810302", nationalMajorCode: "7810302", name: "Huấn luyện thể thao", combination: "T00; T02; T03; T05; T08", score: 18.37, scale: 30 }
], {
  infoUrl: tdbInfoUrl,
  scoreUrl: tdbScoreUrl,
  methods: ["Xét tuyển thẳng", "THPT + năng khiếu", "Học bạ + năng khiếu"],
  note: "Đã cập nhật đủ 04 ngành, mã ngành, tổ hợp 2026, phương thức, công thức và điểm trúng tuyển.",
  formulaText: tdbFormula,
  sourceName: "Trường Đại học Thể dục Thể thao Bắc Ninh / VnExpress",
  referenceUrl: "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-the-duc-the-thao-bac-ninh-TDB.html"
});

// SKD: bảng điểm 2026 công bố 25/29 chuyên ngành; bốn chuyên ngành còn lại vẫn
// được giữ trong hồ sơ với trạng thái Chưa công bố để không gán nhầm điểm năm 2025.
const skdInfoUrl = "https://skda.edu.vn/wp-content/uploads/Thong-bao-tuyen-sinh-DHCQ-2026_smallpdf.pdf";
const skdScoreUrl = "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-san-khau-dien-anh-ha-noi-SKD.html";
const skdFormula = "Điểm xét tuyển = điểm Năng khiếu chuyên môn (đã nhân hệ số 2) + điểm trung bình học bạ lớp 10, 11, 12 môn Ngữ văn đối với S00 hoặc môn Toán đối với S01 + điểm ưu tiên (nếu có), làm tròn đến hai chữ số thập phân. Điểm văn hóa phải đạt từ 5,0.";
const skdPrograms = [
  ["7210226A", "7210226", "Diễn viên cải lương", "S00", null],
  ["7210226B", "7210226", "Diễn viên chèo", "S00", 15],
  ["7210226C", "7210226", "Diễn viên rối", "S00", null],
  ["7210226E", "7210226", "Nhạc công kịch hát dân tộc", "S00", 17],
  ["7210227A", "7210227", "Đạo diễn âm thanh, ánh sáng sân khấu", "S00", 18],
  ["7210227B", "7210227", "Đạo diễn sự kiện lễ hội", "S00", 20.75],
  ["7210233A", "7210233", "Biên kịch điện ảnh", "S00", 17.5],
  ["7210233B", "7210233", "Biên tập truyền hình", "S00", 15],
  ["7210234", "7210234", "Diễn viên kịch, điện ảnh - truyền hình", "S00", 19],
  ["7210234A", "7210234", "Diễn viên nhạc kịch", "S00", 17.83],
  ["7210235A", "7210235", "Đạo diễn điện ảnh", "S00", 18.5],
  ["7210235B", "7210235", "Đạo diễn truyền hình", "S00", 18],
  ["7210235C", "7210235", "Đạo diễn, sản xuất nội dung số", "S00", 19],
  ["7210236A", "7210236", "Quay phim điện ảnh", "S00", 18],
  ["7210236B", "7210236", "Quay phim truyền hình", "S00", 18],
  ["7210243", "7210243", "Biên đạo múa", "S00", 19.5],
  ["7210243A", "7210243", "Biên đạo múa đại chúng", "S00", 19],
  ["7210244", "7210244", "Huấn luyện múa", "S00", 19],
  ["7210301A", "7210301", "Nhiếp ảnh nghệ thuật", "S00", 14.75],
  ["7210301B", "7210301", "Nhiếp ảnh báo chí", "S00", 14.75],
  ["7210301C", "7210301", "Nhiếp ảnh truyền thông đa phương tiện", "S00", 14.75],
  ["7210302A", "7210302", "Công nghệ dựng phim", "S01", 17],
  ["7210302B", "7210302", "Âm thanh điện ảnh - truyền hình", "S01", null],
  ["7210406A", "7210406", "Thiết kế mỹ thuật sân khấu", "S00", 20],
  ["7210406B", "7210406", "Thiết kế mỹ thuật điện ảnh", "S00", 20],
  ["7210406C", "7210406", "Thiết kế mỹ thuật hoạt hình", "S00", 21],
  ["7210406D", "7210406", "Thiết kế trang phục nghệ thuật", "S00", null],
  ["7210406E", "7210406", "Thiết kế đồ họa kỹ xảo", "S00", 20],
  ["7210406F", "7210406", "Nghệ thuật hóa trang", "S00", 21.5]
];
const skdOfficialRows = replaceSpecialProfile("SKD", skdPrograms.map(([code, nationalMajorCode, name, combination, score]) => ({
  code,
  nationalMajorCode,
  name,
  combination,
  score,
  scale: 30,
  method: "Học bạ + thi năng khiếu (406)",
  methodDetails: Number.isFinite(score) ? "Điểm trúng tuyển chính thức trong bảng công bố ngày 13/08/2026" : "Chuyên ngành có trong danh mục tuyển sinh 2026 nhưng không có mức điểm trong bảng công bố ngày 13/08/2026"
})), {
  status: "complete_with_partial_scores",
  infoUrl: skdInfoUrl,
  scoreUrl: skdScoreUrl,
  methods: ["Kết hợp học bạ và thi năng khiếu (406)"],
  note: "Đã cập nhật đủ 29 chuyên ngành, mã xét tuyển, mã ngành quốc gia, tổ hợp, phương thức và công thức năm 2026; bảng điểm công bố 25 mức, bốn chuyên ngành còn lại hiển thị Chưa công bố.",
  formulaText: skdFormula,
  sourceName: "Trường Đại học Sân khấu - Điện ảnh Hà Nội / TuyểnSinh247",
  referenceUrl: "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-san-khau-dien-anh-ha-noi-SKD.html"
});

// NVH: Học viện công bố danh sách trúng tuyển theo từng khoa/chuyên ngành thay vì
// một bảng ngưỡng riêng. Điểm dưới đây là mức tổng thấp nhất trong danh sách chính thức.
const nvhInfoUrl = "https://www.vnam.edu.vn/NewsDetail.aspx?ItemID=2046&lang=VN";
const nvhScoreUrl = "https://www.vnam.edu.vn/NewsDetail.aspx?ItemID=2088&lang=VN";
const nvhFormula = "Điểm xét tuyển = {(2 × điểm Chuyên ngành) + điểm Kiến thức âm nhạc tổng hợp + điểm Ngữ văn (hoặc Toán đối với học bạ nước ngoài không có Ngữ văn)} × 3/4 + điểm ưu tiên + điểm cộng (nếu có), thang 30.";
const nvhPrograms = [
  ["7210201", "Âm nhạc học", 22.21],
  ["7210203", "Sáng tác âm nhạc", 24.56],
  ["7210204", "Chỉ huy âm nhạc", 23.72],
  ["7210205", "Thanh nhạc", 22.01],
  ["7210207", "Biểu diễn nhạc cụ phương Tây", 22.11],
  ["7210208", "Piano", 23.06],
  ["7210209", "Nhạc Jazz", 21.89],
  ["7210210", "Biểu diễn nhạc cụ truyền thống", 22.53]
];
const nvhOfficialRows = replaceSpecialProfile("NVH", nvhPrograms.map(([code, name, score]) => ({
  code,
  nationalMajorCode: code,
  name,
  combination: "Ngữ văn/Toán; Kiến thức âm nhạc tổng hợp; Chuyên ngành ×2",
  score,
  scale: 30,
  method: "Kết hợp thi tuyển và xét học bạ",
  methodDetails: "Mức tổng điểm thấp nhất theo ngành trong danh sách 129 thí sinh trúng tuyển đợt 1 chính thức"
})), {
  infoUrl: nvhInfoUrl,
  scoreUrl: nvhScoreUrl,
  methods: ["Xét tuyển thẳng", "Kết hợp thi tuyển và xét học bạ"],
  note: "Đã cập nhật đủ 08 ngành, mã ngành, thành phần xét tuyển và công thức chính thức. Điểm 2026 là mức tổng thấp nhất theo ngành trong danh sách trúng tuyển đợt 1 của Học viện.",
  formulaText: nvhFormula,
  sourceName: "Học viện Âm nhạc Quốc gia Việt Nam",
  referenceUrl: "https://diemthi.tuyensinh247.com/diem-chuan/hoc-vien-am-nhac-quoc-gia-viet-nam-NVH.html"
});

// NVS: bảng chính thức công bố điểm theo 25 chuyên ngành, trong đó Piano mã 301
// tuyển thẳng và không có ngưỡng số; Ngữ văn chỉ là điều kiện tối thiểu 3,5.
const nvsInfoUrl = "https://hcmcons.vn/tin-tuc/thong-bao-tuyen-sinh-trung-cap-va-dai-hoc-he-chinh-quy-nhac-vien-tp-ho-chi-minh-nh-2026-2027-va-nhung-luu-y-khi-dang-ky-du-thi-dai-hoc-he-chinh-quy-1030.html";
const nvsScoreUrl = "https://hcmcons.vn/tin-tuc/diem-chuan-va-ket-qua-tuyen-sinh-bac-dai-hoc-nam-2026-1129.html";
const nvsFormula = "Điểm xét tuyển = 2 × điểm Chuyên môn + điểm Kiến thức âm nhạc, thang 30. Điểm Ngữ văn học bạ là điều kiện (từ 3,5), không cộng vào tổng điểm; không cộng điểm ưu tiên vào điểm năng khiếu.";
const nvsPrograms = [
  ["7210210", "Biểu diễn nhạc cụ truyền thống (Sáo trúc)", 19],
  ["7210210", "Biểu diễn nhạc cụ truyền thống (Đàn Tranh)", 19],
  ["7210210", "Biểu diễn nhạc cụ truyền thống (Đàn Bầu)", 19],
  ["7210210", "Biểu diễn nhạc cụ truyền thống (Đàn Nguyệt)", 19],
  ["7210210", "Biểu diễn nhạc cụ truyền thống (Guitar phím lõm)", 19],
  ["7210210", "Biểu diễn nhạc cụ truyền thống (Đàn Nhị)", 19],
  ["7210201", "Âm nhạc học", 19],
  ["7210203", "Sáng tác âm nhạc", 19],
  ["7210204", "Chỉ huy âm nhạc (Hợp xướng)", 19],
  ["7210204", "Chỉ huy âm nhạc (Dàn nhạc)", 19],
  ["7210208", "Piano", 20],
  ["7210208-301", "Piano (mã chuyên ngành 301 - tuyển thẳng)", null],
  ["7210207", "Biểu diễn nhạc cụ phương Tây (Violin)", 20],
  ["7210207", "Biểu diễn nhạc cụ phương Tây (Cello)", 20],
  ["7210207", "Biểu diễn nhạc cụ phương Tây (Double Bass)", 19],
  ["7210207", "Biểu diễn nhạc cụ phương Tây (Harp)", 19.5],
  ["7210207", "Biểu diễn nhạc cụ phương Tây (Clarinet)", 19],
  ["7210207", "Biểu diễn nhạc cụ phương Tây (Gõ giao hưởng)", 19],
  ["7210207", "Biểu diễn nhạc cụ phương Tây (Guitar)", 19],
  ["7210205", "Thanh nhạc", 21],
  ["7210209", "Nhạc Jazz (Gõ nhạc nhẹ)", 21],
  ["7210209", "Nhạc Jazz (Piano Jazz)", 21],
  ["7210209", "Nhạc Jazz (Guitar nhạc nhẹ)", 21],
  ["7210209", "Nhạc Jazz (Thanh nhạc nhẹ)", 21],
  ["7210209", "Nhạc Jazz (Bass nhạc nhẹ)", 19]
];
const nvsOfficialRows = replaceSpecialProfile("NVS", nvsPrograms.map(([code, name, score]) => ({
  code,
  nationalMajorCode: code.slice(0, 7),
  name,
  combination: Number.isFinite(score) ? "Chuyên môn ×2; Kiến thức âm nhạc; Ngữ văn (điều kiện)" : "Theo diện tuyển thẳng",
  score,
  scale: 30,
  method: Number.isFinite(score) ? "Kết hợp thi tuyển và xét học bạ" : "Xét tuyển thẳng",
  formulaText: Number.isFinite(score) ? nvsFormula : "Xét tuyển thẳng theo diện và điều kiện được Nhạc viện công bố; không áp dụng công thức điểm chuẩn số."
})), {
  status: "complete_with_partial_scores",
  infoUrl: nvsInfoUrl,
  scoreUrl: nvsScoreUrl,
  methods: ["Xét tuyển thẳng", "Kết hợp thi tuyển và xét học bạ"],
  note: "Đã cập nhật đủ 25 chuyên ngành trong bảng điểm chính thức năm 2026; 24 chuyên ngành có ngưỡng số và Piano mã 301 được ghi đúng là tuyển thẳng.",
  formulaText: nvsFormula,
  sourceName: "Nhạc viện TP.HCM",
  referenceUrl: "https://diemthi.tuyensinh247.com/diem-chuan/nhac-vien-tphcm-NVS.html"
});

// ZNH: bảng chính thức tách hệ dân sự, khu vực đào tạo và các điều kiện phụ theo môn.
const znhInfoUrl = "https://thi.tuyensinh247.com/truong-dai-hoc-van-hoa-nghe-thuat-quan-doi-cong-bo-chi-tieu-dan-su-c24a88464.html";
const znhScoreUrl = "https://thi.tuyensinh247.com/diem-chuan-dai-hoc-van-hoa-nghe-thuat-quan-doi-nam-2026-c24a91288.html";
const znhTalentFormula = "Điểm xét tuyển = tổng điểm các thành phần chuyên môn/năng khiếu và môn kiến thức hoặc văn hóa sau khi áp dụng hệ số của từng ngành + điểm ưu tiên (nếu có); đồng thời phải đạt các ngưỡng môn thành phần ghi trong bảng điểm 2026.";
const znhCultureFormula = "Điểm xét tuyển = tổng điểm các môn văn hóa theo tổ hợp + điểm ưu tiên (nếu có); thí sinh đồng thời phải đạt điều kiện môn Ngữ văn ghi trong bảng điểm 2026.";
const znhOfficialRows = replaceSpecialProfile("ZNH", [
  { code: "7210205", nationalMajorCode: "7210205", name: "Thanh nhạc - Liên thông từ trung cấp (hệ dân sự)", combination: "Chuyên ngành; Kiến thức ngành; Năng khiếu", score: 20.25, scale: 30, method: "Thi tuyển kết hợp xét tuyển", methodDetails: "Điểm tổng 20,25; điểm Chuyên ngành từ 8,10" },
  { code: "7210244-B", nationalMajorCode: "7210244", name: "Huấn luyện múa - Phía Bắc (hệ dân sự)", combination: "Chuyên ngành; Kiến thức ngành; Năng khiếu", score: 19.95, scale: 30, method: "Thi tuyển kết hợp xét tuyển", methodDetails: "Chuyên ngành từ 7,75; Kiến thức ngành từ 8,00; Năng khiếu từ 6,75" },
  { code: "7210244-N", nationalMajorCode: "7210244", name: "Huấn luyện múa - Phía Nam (hệ dân sự)", combination: "Chuyên ngành; Kiến thức ngành; Năng khiếu", score: 19.95, scale: 30, method: "Thi tuyển kết hợp xét tuyển", methodDetails: "Chuyên ngành từ 7,75; Kiến thức ngành từ 8,00; Năng khiếu từ 6,75" },
  { code: "7210243-B", nationalMajorCode: "7210243", name: "Biên đạo múa - Phía Bắc (hệ dân sự)", combination: "Chuyên ngành; Kiến thức ngành; Năng khiếu", score: 21, scale: 30, method: "Thi tuyển kết hợp xét tuyển", methodDetails: "Điểm Chuyên ngành từ 8,50" },
  { code: "7210243-N", nationalMajorCode: "7210243", name: "Biên đạo múa - Phía Nam (hệ dân sự)", combination: "Chuyên ngành; Kiến thức ngành; Năng khiếu", score: 21, scale: 30, method: "Thi tuyển kết hợp xét tuyển", methodDetails: "Điểm Chuyên ngành từ 8,50" },
  { code: "7210207", nationalMajorCode: "7210207", name: "Biểu diễn nhạc cụ phương Tây - Liên thông từ trung cấp", combination: "Chuyên ngành; Kiến thức ngành", score: 22.52, scale: 30, method: "Thi tuyển kết hợp xét tuyển", methodDetails: "Điểm Chuyên ngành từ 8,63" },
  { code: "7210210", nationalMajorCode: "7210210", name: "Biểu diễn nhạc cụ truyền thống - Liên thông từ trung cấp", combination: "Chuyên ngành; Kiến thức ngành", score: 21.7, scale: 30, method: "Thi tuyển kết hợp xét tuyển", methodDetails: "Điểm Chuyên ngành từ 8,70" },
  { code: "7210203", nationalMajorCode: "7210203", name: "Sáng tác âm nhạc - Liên thông từ trung cấp", combination: "Chuyên ngành; Kiến thức ngành", score: 24, scale: 30, method: "Thi tuyển kết hợp xét tuyển" },
  { code: "7210234", nationalMajorCode: "7210234", name: "Diễn viên kịch, điện ảnh - truyền hình", combination: "S00; Kỹ thuật diễn xuất 1; Kỹ thuật diễn xuất 2", score: 21.88, scale: 30, method: "Thi tuyển kết hợp xét tuyển", methodDetails: "Kỹ thuật diễn xuất 2 từ 7,25 và Kỹ thuật diễn xuất 1 từ 7,50" },
  { code: "7229042", nationalMajorCode: "7229042", name: "Quản lý văn hóa", combination: "N01; Biểu diễn nghệ thuật; Ngữ văn", score: 21.5, scale: 30, method: "Thi tuyển kết hợp xét tuyển", methodDetails: "Điểm Biểu diễn nghệ thuật từ 8,43" },
  { code: "7320101", nationalMajorCode: "7320101", name: "Báo chí", combination: "C00", score: 24.4, scale: 30, method: "Xét kết quả thi tốt nghiệp THPT", methodDetails: "Điểm Ngữ văn từ 7,25", formulaText: znhCultureFormula }
], {
  infoUrl: znhInfoUrl,
  scoreUrl: znhScoreUrl,
  methods: ["Thi tuyển kết hợp xét tuyển", "Xét kết quả thi tốt nghiệp THPT"],
  note: "Đã thay bảng ngành cũ bằng 11 dòng điểm chính thức hệ dân sự, tách khu vực với ngành Múa và ghi đầy đủ điều kiện môn thành phần năm 2026.",
  formulaText: znhTalentFormula,
  sourceName: "Trường Đại học Văn hóa Nghệ thuật Quân đội / TuyểnSinh247"
});

// DSD: một phương thức 406 cho bốn ngành; năng khiếu là môn chính hệ số 2.
const dsdInfoUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-san-khau-dien-anh-tphcm-DSD.html";
const dsdScoreUrl = "https://diemthi.giaphugroup.com/diem-chuan/truong-dai-hoc-san-khau-dien-anh-tp-hcm-dsd/";
const dsdFormula = "Điểm xét tuyển = điểm Ngữ văn học bạ + điểm Phân tích tác phẩm + 2 × điểm Năng khiếu + điểm ưu tiên (nếu có), thang 40. Mỗi môn thành phần phải đạt từ 5,0.";
const dsdOfficialRows = replaceSpecialProfile("DSD", [
  { code: "7210227", nationalMajorCode: "7210227", name: "Đạo diễn sân khấu", combination: "S00: Ngữ văn; Phân tích; Năng khiếu ×2", score: 21.35, scale: 40 },
  { code: "7210234", nationalMajorCode: "7210234", name: "Diễn viên kịch, điện ảnh - truyền hình", combination: "S00: Ngữ văn; Phân tích; Năng khiếu ×2", score: 22.75, scale: 40 },
  { code: "7210235", nationalMajorCode: "7210235", name: "Đạo diễn điện ảnh, truyền hình", combination: "S00: Ngữ văn; Phân tích; Năng khiếu ×2", score: 21.53, scale: 40 },
  { code: "7210236", nationalMajorCode: "7210236", name: "Quay phim", combination: "S00: Ngữ văn; Phân tích; Năng khiếu ×2", score: 20.2, scale: 40 }
], {
  infoUrl: dsdInfoUrl,
  scoreUrl: dsdScoreUrl,
  methods: ["Kết hợp học bạ THPT và thi năng khiếu (406)"],
  note: "Đã cập nhật đủ 04 ngành, mã ngành, tổ hợp S00, phương thức 406, công thức hệ số và điểm trúng tuyển 2026; mỗi môn thành phần phải đạt từ 5,0.",
  formulaText: dsdFormula,
  sourceName: "Trường Đại học Sân khấu - Điện ảnh TP.HCM / nguồn tổng hợp",
  referenceUrl: dsdInfoUrl
});

// Hoàn thiện trường Tổ hợp cho các dòng nhập từ bảng điểm tổng hợp. Các nguồn điểm
// chỉ chứa ngưỡng trúng tuyển, vì vậy tổ hợp được đối chiếu riêng với thông tin
// tuyển sinh 2026 của từng trường và được lưu ngay trong dữ liệu sinh ra.
function addCombinationSource(code, url) {
  const university = byCode.get(code);
  if (!university || !url) return;
  university.admissions ||= {};
  university.admissions.sources = unique([...(university.admissions.sources || []), url]);
}

function fillSchoolCombinations(code, resolver, sourceUrl, status = "verified") {
  const university = byCode.get(code);
  if (!university) throw new Error(`Không tìm thấy trường ${code}`);
  let count = 0;
  for (const major of majors.filter((item) => item.universityId === university.id && !clean(item.combination))) {
    const combination = clean(resolver(major));
    if (!combination) continue;
    major.combination = combination;
    major.combinationStatus = status;
    major.combinationSourceUrl = sourceUrl;
    count += 1;
  }
  addCombinationSource(code, sourceUrl);
  return count;
}

const noFixedCombination = "Không áp dụng tổ hợp môn cố định";
const isPlaceholderCombination = (value) => {
  const normalized = normalize(value);
  return !normalized
    || /chua xac minh/.test(normalized)
    || /theo to hop xet tuyen trong thong tin tuyen sinh/.test(normalized)
    || /theo to hop chinh thuc cua chuong trinh/.test(normalized)
    || /ap dung cho tat ca to hop xet tuyen cua nganh/.test(normalized);
};

// Học viện Nông nghiệp Việt Nam: 23 nhóm/ngành trong bảng tuyển sinh 2026.
const hvnCombinationUrl = "https://thi.tuyensinh247.com/thong-tin-hoc-vien-nong-nghiep-viet-nam-2026-c24a88474.html";
const hvnNatural = "A00; A01; B00; B08; C03; C04; D01; D07; X01; X07; X08";
const hvnEngineering = "A00; A01; A03; B08; C01; C02; C03; D01; X02; X07; X08";
const hvnBusiness = "A00; A01; A07; B08; C02; C03; C04; D01; X01; X03; X04";
const hvnSocial = "A01; C00; C03; C04; D01; D14; D15; X03; X04; X70; X74";
const hvnLand = "A00; A01; B00; B08; C01; C02; C03; C04; D01; X03; X04";
const hvnCombinationByCode = {
  "7640101": hvnNatural,
  HVN02: hvnNatural,
  HVN03: hvnNatural,
  HVN04: hvnEngineering,
  "7520103": hvnEngineering,
  HVN06: hvnEngineering,
  "7510605": hvnBusiness,
  HVN08: hvnBusiness,
  HVN09: "A00; A01; B00; B01; B03; B08; C02; D01; D07; X07; X08",
  HVN10: "A00; A01; B00; B01; B03; B08; C03; D01; D07; X07; X08",
  HVN11: hvnBusiness,
  "7310301": hvnSocial,
  "7380101": hvnSocial,
  HVN14: hvnEngineering,
  HVN15: hvnLand,
  "7440301": hvnLand,
  "7220201": "A01; D01; D09; D10; D11; D14; D15; X25; X27; X28; X78",
  "7220204": "D01; D04; D11; D12; D13; D14; D15; D45; D55; D65",
  "7140246": hvnNatural,
  "7810101": hvnBusiness,
  HVN21: hvnBusiness,
  "7580105": hvnLand,
  HVN23: hvnSocial
};
const hvnCombinationRows = fillSchoolCombinations("HVN", (major) => hvnCombinationByCode[major.code], hvnCombinationUrl, "reference");

// Học viện Quản lý Giáo dục: bảng ngành/tổ hợp 2026 trên hồ sơ TuyểnSinh247.
const hvqCombinationUrl = "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/hoc-vien-quan-ly-giao-duc-HVQ.html";
const hvqCombinationByCode = {
  "7140101": "A00; B00; C00; D01",
  "7140114": "A00; A01; C00; D01",
  "7220201": "A00; D01; D10; D14",
  "7310101": "A00; A01; D01; D10",
  "7310403": "A00; B00; C00; D01",
  "7340406": "A00; A01; C00; D01",
  "7480201": "A00; A01; D01; A02"
};
const hvqCombinationRows = fillSchoolCombinations("HVQ", (major) => hvqCombinationByCode[major.code], hvqCombinationUrl, "reference");

// UTT: tổ hợp chỉ áp dụng cho THPT, học bạ và kỳ SPT; HSA/TSA dùng điểm bài thi độc lập.
const gtaCombinationUrl = "https://www.utt.edu.vn/vn/tuyensinh/tuyen-sinh/dai-hoc-chinh-quy/thong-tin-tuyen-sinh-dai-hoc-nam-2026-a16905.html";
const gtaTH1 = "A00; A01; D01; D07; C01; C02; X02; X03; X26; X27";
const gtaTH2 = "A00; A01; D01; D07; C01; C02; X01; X02; X03; X25; X26; X27";
const gtaTH4 = "A01; D01; D07; X25; X26; X27";
const gtaBusinessPattern = /marketing|hải quan|kinh doanh quốc tế|thương mại quốc tế|thương mại điện tử|công nghệ tài chính|kế toán|kinh doanh số/i;
const gtaCombinationRows = fillSchoolCombinations("GTA", (major) => {
  if (/ĐGTD TSA|ĐGNL HSA/i.test(major.method)) return noFixedCombination;
  if (/ngôn ngữ anh/i.test(major.name)) return gtaTH4;
  if (gtaBusinessPattern.test(major.name)) return gtaTH2;
  return gtaTH1;
}, gtaCombinationUrl);

// Đại học CMC: trường công bố tổ hợp theo trọng số môn chính thay cho mã khối cố định.
const cmcCombinationUrl = "https://tuyensinh.cmc-u.edu.vn/";
const cmcCombinationRows = fillSchoolCombinations("CMC", (major) => {
  if (/CMC-TEST/i.test(major.method)) return noFixedCombination;
  if (major.code === "7510302") return "Toán ×2 + Vật lí hoặc Hóa học + 1 môn bất kỳ";
  if (["7480107", "7480101", "7480208", "7480103", "7480201"].includes(major.code)) {
    return "Toán ×2 + 2 môn bất kỳ";
  }
  return "Toán ×2 hoặc Ngữ văn ×2 + 2 môn bất kỳ";
}, cmcCombinationUrl);

// HUTECH: bảng 64 chương trình được trường chia theo từng lĩnh vực đào tạo.
const dkcCombinationUrl = "https://www.hutech.edu.vn/tuyensinh";
const dkcBusiness = "A00; A01; D01; D09; D10; D14; D15; X78; C00; C03; C04; X01";
const dkcTechnology = "A00; A01; D01; D09; D10; C01; C02; C03; C04; X01; X02; X03";
const dkcCreative = "A01; D01; D09; D10; C00; C01; C03; C04; X01; X25; H01; V00";
const dkcBiology = "A00; D01; C01; C02; C03; C04; B01; B02; B03; X01; X13; X14";
const dkcHealth = "A00; B00; B03; C02; D07; D08";
const dkcBusinessCodes = new Set([
  "7340101", "7340101I1", "7340404", "7510605", "7340116", "7340115", "7340115I1", "7340120", "7340114", "7310109",
  "7340201", "7340301", "7340122", "7340121", "7340205", "7810201", "7810202", "7810103", "7340412", "7340405", "7810301",
  "7320104", "7320108", "7380107", "7380101", "7310401"
]);
const dkcTechnologyCodes = new Set([
  "7480201", "7480202", "7480208", "7480101", "7460108", "7480106", "7480107", "7510209", "7510205", "7520141", "7520141I1",
  "7520103", "7520114", "7520216", "7520201", "7520207", "7580201", "7580302"
]);
const dkcCreativeCodes = new Set(["7210302", "7210403", "7580108", "7210404", "7210408", "7580101"]);
const dkcBiologyCodes = new Set(["7420201", "7540101", "7420207", "7640101", "7640101I1"]);
const dkcHealthCodes = new Set(["7720101", "7720201", "7720301", "7720601"]);
const dkcLanguageCodes = new Set(["7220201", "7220209", "7220204", "7220210"]);
const dkcCombinationRows = fillSchoolCombinations("DKC", (major) => {
  if (/ĐGNL V-ACT/i.test(major.method)) return noFixedCombination;
  if (dkcBusinessCodes.has(major.code)) return dkcBusiness;
  if (dkcTechnologyCodes.has(major.code)) return dkcTechnology;
  if (dkcCreativeCodes.has(major.code)) return dkcCreative;
  if (dkcBiologyCodes.has(major.code)) return dkcBiology;
  if (dkcHealthCodes.has(major.code)) return dkcHealth;
  if (dkcLanguageCodes.has(major.code)) return "12 tổ hợp: Ngoại ngữ với Ngữ văn/Toán/Vật lí/Lịch sử/Địa lí/GDKT&PL/Tin học; hoặc Văn-Toán-Lí/Sử/Địa; Văn-Sử-Địa";
  if (major.code === "7210205") return "D01; D14; D15; X78; C00; N05";
  return "Theo tổ hợp chính thức của chương trình trong thông tin tuyển sinh HUTECH 2026";
}, dkcCombinationUrl);

// Đại học Công nghiệp Quảng Ninh: hai nhóm tổ hợp dùng chung trong danh mục 2026.
const ddmCombinationUrl = "https://tuyensinh.qui.edu.vn/about/ds-nganh-dhcq.html";
const ddmEngineering = "A00; A01; A07; C01; C03; C04; C14; D01; D04; D09; D30; D40; X17; X21";
const ddmBusiness = "A00; A01; A07; C01; C03; C04; C14; D01; D04; D09; D14; D15; D30; D40; X17; X21";
const ddmCombinationRows = fillSchoolCombinations("DDM", (major) => {
  if (/ĐGNL HSA|ĐGTD TSA/i.test(major.method)) return noFixedCombination;
  return /^734/.test(major.code) ? ddmBusiness : ddmEngineering;
}, ddmCombinationUrl);

// Đại học Hạ Long: bảng chính thức 2026 công bố tổ hợp cho từng ngành.
const hluCombinationUrl = "https://uhl.edu.vn/TuyensinhHeDaihoc_8699.htm";
const hluCombinationByCode = {
  "7140209": "A00; A01; A03; A04; A05; B00; C01; C02; D01; D07",
  "7140247": "A00; A01; A02; A03; A05; B00; C01; C02; D07",
  "7140210": "A00; A01; C01; C02; D01; D07; X02; X06; X18",
  "7220204": "A01; D01; D04; D09; D14; D15; D45; X78; X90",
  "7229030": "C00; C03; C04; D01; D14; D15; X70; X71; X74; X78",
  "7229042": "A07; C00; C03; C04; D01; D14; D15; D65; X17; X70",
  "7220201": "A01; D01; D09; D10; D14; D15; D45; X25; X78",
  "7140221": "N00: Ngữ văn; Hát; Thẩm âm - Tiết tấu",
  "7850101": "A00; B00; B01; B02; D01; D10; X01; X17; X21; X25",
  "7480201": "A00; A01; C01; C02; D01; D07; X02; X06; X18",
  "7810202": "A07; C00; C03; C04; D01; D15; X01; X70; X74; X78",
  "7340101": "A00; A01; A07; C01; C04; D01; D10; X01; X17; X21",
  "7480101": "A00; A01; C01; C02; D01; D07; X02; X06; X18",
  "7810101": "A01; A07; C00; C04; D01; D07; D14; D15; X70; X78",
  "7220209": "A01; D01; D06; D09; D10; D14; D15; X25; X78",
  "7210403": "A00; A01; C01; C03; C04; D01; X01; X02; X18; X71",
  "7620301": "A00; A05; B00; B01; B02; C02; C04; D01; D10; X01",
  "7220210": "A01; AH1; D01; D09; D14; D15; DD2; X78; Y03",
  "7810201": "A00; A01; A07; C03; C04; D01; D10; D11; X01; X70",
  "7810103": "A00; A01; A07; C00; D01; D04; D10; D14; D45; X70",
  "7340301": "A00; A01; A07; C01; C04; D01; D10; X01; X17; X21",
  "7340115": "A00; A01; A07; C01; C04; D01; D10; X01; X21"
};
const hluCombinationRows = fillSchoolCombinations("HLU", (major) => {
  if (/Xét tuyển kết hợp/i.test(major.method)) return "Ngữ văn; Toán; chứng chỉ ngoại ngữ quốc tế quy đổi";
  return hluCombinationByCode[major.code];
}, hluCombinationUrl);

// Đại học Quang Trung: tổ hợp 2026 được công bố trực tiếp theo 11 ngành.
const dqtCombinationUrl = "https://tuyensinh.qtu.edu.vn/thong-tin-can-biet/thong-tin-tuyen-sinh-dai-hoc-chinh-quy-nam-2026-du-kien";
const dqtHealth = "A00; A02; A10; A11; B00; B01; B02; B03; B04; B08; C02; C05; C06; C08; C12; C16; C20; D01; D07; D08; D12; D13; X11; X14; X15; X22; X67";
const dqtTourism = "A00; A01; A09; A11; C00; C03; C04; C08; C12; C14; C16; C20; D01; D10; D14; D15; X18; X19; X21; X22";
const dqtCombinationByCode = {
  "7720301": dqtHealth,
  "7720701": dqtHealth,
  "7810203": dqtTourism,
  "7810103": dqtTourism,
  "7340101": "A00; A01; A09; A10; A11; C00; C01; C02; C14; D01; D10; D14; D15; X22; X55",
  "7480201": "A00; A01; B03; C01; C02; C03; C04; D01; X02; X03; X06; X07; X22; X56; X57; X59; Y07; Y09; Y10",
  "7510103": "A00; A01; A04; C01; C02; C04; D01; D10; D11; X02; X05; X06; X07; X22; X27; X56; X59; X60",
  "7220201": "A01; B08; D01; D07; D09; D10; D11; D12; D13; D14; D15; D66; D84; X26; X27",
  "7340301": "A00; A01; A09; A10; A11; C00; C01; C02; C14; D01; D10; D14; D15; X05; X06; X18; X19; X55",
  "7340201": "A00; A01; A09; A10; A11; C00; C01; C02; C14; D01; D10; D14; D15; D84; X02; X06; X07; X10; X55",
  "7340205": "A00; A01; A09; A10; A11; C00; C01; C02; C14; D01; D10; D14; D15; D84; X02; X06; X07; X10; X55"
};
const dqtCombinationRows = fillSchoolCombinations("DQT", (major) => {
  if (/ĐGNL V-ACT/i.test(major.method)) return noFixedCombination;
  return dqtCombinationByCode[major.code];
}, dqtCombinationUrl);

const ttdCombinationRows = fillSchoolCombinations("TTD", () => noFixedCombination, "https://diemthi.tuyensinh247.com/de-an-tuyen-sinh/dai-hoc-the-duc-the-thao-da-nang-TTD.html", "reference");

// Trường Sĩ quan Công binh: sửa mã ngành bị bỏ trống trong bảng nhập và bổ sung đủ tổ hợp 2026.
const snhCombinationUrl = "https://diemthi.tuyensinh247.com/thong-tin-truong-si-quan-cong-binh-he-quan-su-dai-hoc-ngo-quyen-SNH.html";
const snh = byCode.get("SNH");
let snhCombinationRows = 0;
for (const major of majors.filter((item) => item.universityId === snh.id)) {
  major.code = "7860228";
  major.nationalMajorCode = "7860228";
  if (!/Chỉ huy kỹ thuật Công binh/i.test(major.name)) major.name = `Chỉ huy kỹ thuật Công binh (${major.name})`;
  if (!clean(major.combination)) snhCombinationRows += 1;
  major.combination = "A00; A01; C01; Q00";
  major.combinationStatus = "reference";
  major.combinationSourceUrl = snhCombinationUrl;
}
addCombinationSource("SNH", snhCombinationUrl);

const hcaCombinationUrl = "https://diemthi.tuyensinh247.com/diem-chuan/hoc-vien-chinh-tri-cong-an-nhan-dan-HCA.html";
const hcaCombinationRows = fillSchoolCombinations("HCA", () => "A01; C00; C03; D01; X02; X03; X04", hcaCombinationUrl, "reference");

// Khôi phục các mã bị thiếu do bảng điểm nguồn không lặp lại mã ngành ở từng dòng phương thức.
const placeholderCodeSources = {
  NTH: "https://diemthi.tuyensinh247.com/thong-tin-dai-hoc-ngoai-thuong-co-so-phia-bac-NTH.html",
  ANS: "https://diemthi.tuyensinh247.com/thong-tin-dai-hoc-an-ninh-nhan-dan-ANS.html",
  QHD: "https://www.hsb.edu.vn/admissions/undergrad-admissions-2026"
};
let restoredMajorCodeRows = 0;
for (const major of majors) {
  const university = universities.find((item) => item.id === major.universityId);
  let code;
  let nationalMajorCode;
  if (university?.code === "NTH" && clean(major.code).includes("_")) {
    code = clean(major.code).split("_")[0];
    nationalMajorCode = major.nationalMajorCode;
  } else if (university?.code === "NTH" && /Quản trị nguồn nhân lực số và phát triển tổ chức/i.test(major.name)) {
    code = "NTHQT10";
    nationalMajorCode = "7340101";
  } else if (university?.code === "ANS" && /Nghiệp vụ An ninh/i.test(major.name)) {
    code = "7860100";
    nationalMajorCode = "7860100";
  } else if (university?.code === "QHD" && /Marketing và Phân tích kinh doanh/i.test(major.name)) {
    code = "BBNS";
    nationalMajorCode = "7340115";
  }
  if (!code || clean(major.code) === code) continue;
  major.code = code;
  major.nationalMajorCode = nationalMajorCode;
  major.codeStatus = "reference";
  major.codeSourceUrl = placeholderCodeSources[university.code];
  addCombinationSource(university.code, placeholderCodeSources[university.code]);
  restoredMajorCodeRows += 1;
}

// Đại học Hải Dương: dùng trực tiếp danh sách tổ hợp tuyển sinh 2026 thay cho
// câu "Chưa xác minh" ở các dòng xét tuyển kết hợp. Đồng thời sửa riêng hệ CĐ
// Giáo dục Mầm non đã bị nhập nhầm mã và điểm của hệ đại học.
const dktCombinationUrl = "https://mthi.tuyensinh247.com/thong-tin-tuyen-sinh-dai-hoc-hai-duong-2026-c24a89209.html";
const dktPsychologyCombinationUrl = "https://tradiemchuan.com/diem-chuan/truong-dai-hoc-hai-duong/2026";
const dktScoreUrl = "https://www.thongtintuyensinh.vn/Diem-chuan-nam-2026-cua-Truong-Dai-hoc-Hai-Duong_C237_D24346.htm";
const dktCombinationByCode = {
  "51140201": "C00; C03; C04; C14; C19; C20; D01; D14; X01; X70; X74",
  "7140201": "C00; C03; C04; C14; C19; C20; D01; D14; X01; X70; X74",
  "7140202": "A00; A01; C01; C02; C03; C04; C14; D01; X01",
  "7140205": "A00; C00; C02; C03; C04; C19; C20; D01; X70; X74",
  "7140206": "T00; T01; T02; T03; T05; T06",
  "7140209": "A00; A01; A02; B00; C01; C02; D01; D07",
  "7140210": "A00; A01; A02; B00; C01; C02; D01; X06",
  "7140211": "A00; A01; A02; A10; C01; D11; X05",
  "7140212": "A00; B00; C02; D07; D12",
  "7140213": "A02; B00; B01; B02; B03; B08",
  "7140217": "C00; C03; C04; C09; C14; C19; C20; D01; X01; X70; X74",
  "7140218": "A07; A08; C00; C03; C19; D09; D14; X17; X70",
  "7140219": "A09; C00; C04; C20; D10; D15; X21; X74",
  "7140231": "A01; D01; D07; D11; D12; D14; D15",
  "7140246": "A00; A01; A02; B00; C01; D01; D07; X11; X12",
  "7140247": "A00; A01; A02; B00; C01; C02; D01; D07",
  "7220201": "A01; D01; D09; D10; D14; D15; D66; X25; X78; X84",
  "7229030": "C00; C03; C04; C09; C14; C19; C20; D01; X01; X70; X74",
  "7310101": "A00; A01; C01; C02; C03; C04; C14; D01; X01",
  "7310403": "A00; A01; D07",
  "7340101": "A00; A01; C01; C02; C03; C04; C14; D01; X01",
  "7340115": "A00; A01; C01; C02; C03; C04; C14; D01; X01",
  "7340201": "A00; A01; C01; C02; C03; C04; C14; D01; X01",
  "7340301": "A00; A01; C01; C02; C03; C04; C14; D01; X01",
  "7340406": "A00; A01; C01; C02; C03; C04; C14; D01; X01",
  "7460101": "A00; A01; A02; B00; C01; C02; D01; D07",
  "7480201": "A00; A01; A02; C01; C02; C04; D01; X06",
  "7510203": "A00; A01; A02; C01; C02; C04; D07; X06",
  "7510302": "A00; A01; A02; C01; C02; C04; D01; X06",
  "7520201": "A00; A01; A02; C01; C02; C04; C14; D01; X01",
  "7760103": "A00; B00; B03; B08; C00; C03; C14; D01; X01",
  "7810103": "A00; A01; C00; C03; D01; D14; D15; D66; X78"
};
const dkt = byCode.get("DKT");
let dktCorrectedRows = 0;
for (const major of majors.filter((item) => item.universityId === dkt.id)) {
  if (/Giáo dục Mầm non \(CĐ\)/i.test(major.name)) {
    major.code = "51140201";
    major.nationalMajorCode = "51140201";
    major.cutoff = { ...major.cutoff, score: 23, sourceUrl: dktScoreUrl, sourceName: "Trường Đại học Hải Dương" };
    major.sourceUrl = dktScoreUrl;
    major.sourceName = "Trường Đại học Hải Dương";
  }
  const combination = dktCombinationByCode[major.code];
  if (!combination) continue;
  major.combination = combination;
  major.combinationStatus = "reference";
  major.combinationSourceUrl = major.code === "7310403" ? dktPsychologyCombinationUrl : dktCombinationUrl;
  dktCorrectedRows += 1;
}
addCombinationSource("DKT", dktCombinationUrl);
addCombinationSource("DKT", dktPsychologyCombinationUrl);
addCombinationSource("DKT", dktScoreUrl);

// Kế thừa tổ hợp từ dòng cùng ngành khi nguồn điểm tạo nhiều dòng phương thức.
let inheritedCombinationRows = 0;
for (const university of universities) {
  const universityMajors = majors.filter((major) => major.universityId === university.id);
  for (const major of universityMajors.filter((item) => isPlaceholderCombination(item.combination))) {
    const sibling = universityMajors.find((candidate) => candidate !== major
      && (candidate.code === major.code || candidate.nationalMajorCode === major.nationalMajorCode || nameKey(candidate.name) === nameKey(major.name))
      && !isPlaceholderCombination(candidate.combination));
    if (!sibling) continue;
    major.combination = sibling.combination;
    major.combinationStatus = sibling.combinationStatus || "reference";
    major.combinationSourceUrl = sibling.combinationSourceUrl || sibling.sourceUrl;
    inheritedCombinationRows += 1;
  }
}

// Các bài thi độc lập, tuyển thẳng và chứng chỉ không có tổ hợp ba môn.
let nonApplicableCombinationRows = 0;
for (const major of majors.filter((item) => isPlaceholderCombination(item.combination))) {
  const method = normalize(major.method);
  if (/v-act|hsa|tsa|q00|qsa|dgnl|dgtd|cmc-test|chung chi|tuyen thang|uu tien|quy doi/.test(method)) {
    major.combination = noFixedCombination;
    major.combinationStatus = "not_applicable";
    nonApplicableCombinationRows += 1;
  } else if (/v-sat/.test(method)) {
    major.combination = "Các môn V-SAT tương ứng với tổ hợp xét tuyển của ngành";
    major.combinationStatus = "reference";
    nonApplicableCombinationRows += 1;
  }
}

const remainingMissingCombinations = majors.filter((major) => isPlaceholderCombination(major.combination));
if (remainingMissingCombinations.length) {
  throw new Error(`Còn ${remainingMissingCombinations.length} dòng thiếu tổ hợp: ${remainingMissingCombinations.slice(0, 8).map((item) => item.id).join(", ")}`);
}

// Nguồn chính thức đã có thông tin tuyển sinh hoặc công bố kết quả; giữ điểm trống khi bảng chi tiết nằm trong iframe/tệp chưa trích xuất được.
const officialAnnouncements = {};
for (const [code, [url, methods]] of Object.entries(officialAnnouncements)) {
  setProfile(code, {
    status: "official_announced",
    url,
    methods,
    note: "Đã cập nhật ngành, mã ngành, tổ hợp, phương thức và công thức từ hồ sơ/công bố chính thức năm 2026. Các mức điểm chưa đọc được trực tiếp từ bảng nhúng hoặc tệp đính kèm tiếp tục hiển thị là chưa xác minh."
  });
}

// Các hồ sơ còn lại đã có danh mục 2026 trên TuyểnSinh247. Gắn nguồn tham khảo rõ ràng và loại bỏ trạng thái hồ sơ bỏ dở.
const referenceProfiles = [];
for (const code of referenceProfiles) {
  const university = byCode.get(code);
  const oldReference = university.admissions?.referenceSources?.find((item) => item?.name === "TuyểnSinh247")?.url;
  const infoUrl = oldReference
    ? oldReference.replace("/diem-chuan/", "/thong-tin-")
    : university.website;
  setProfile(code, {
    status: "reference_2026",
    url: infoUrl,
    methods: university.methods,
    reference: true,
    note: "Đã bổ sung hồ sơ ngành, mã ngành, tổ hợp, phương thức và công thức năm 2026 từ nguồn tham khảo. Điểm chưa có công bố chính thức có thể đọc trực tiếp được giữ là chưa xác minh."
  });
}

// Tên mới của SKV được Bộ GDĐT phê duyệt ngày 07/08/2026.
skv.name = "Trường Đại học Công nghệ Kỹ thuật Vinh";
skv.shortName = "VUTED";
skv.description = "Trường Đại học Công nghệ Kỹ thuật Vinh (tên mới từ 07/08/2026), đào tạo sư phạm công nghệ, kinh tế và các ngành kỹ thuật ứng dụng.";

// Mọi mã công thức của dòng ngành phải có trong danh mục trường để registry có thể nạp an toàn.
for (const university of universities) {
  const rowFormulaIds = majors.filter((major) => major.universityId === university.id).map((major) => major.formula);
  university.formulas = unique([...(university.formulas || []), ...rowFormulaIds]);
}

const report = {
  checkedAt,
  dtpOfficialRows: dtpPrograms.length,
  bmuOfficialRows: bmuPrograms.length * bmuMethods.length,
  skvOfficialRows: skvPrograms.length * skvMethods.length,
  ukhOfficialRows: ukhPrograms.length * ukhMethods.length,
  sknOfficialRows: sknPrograms.length,
  dtvOfficialRows: dtvPrograms.length * dtvMethods.length,
  tlsOfficialRows: tlsPrograms.length * tlsMethods.length,
  inuOfficialRows: inuPrograms.length * inuMethods.length,
  vcaOfficialRows: vcaPrograms.length,
  hvcOfficialRows: hvcPrograms.length * hvcMethods.length,
  dheOfficialRows: dhePrograms.length * dheMethods.length,
  dhiOfficialRows: dhiPrograms.length * dhiMethods.length,
  ddvOfficialRows: ddvPrograms.length,
  dqnOfficialRows,
  thpOfficialRows: thpPrograms.filter((program) => Number.isFinite(program[3])).length,
  thpNotPublishedRows: thpPrograms.filter((program) => !Number.isFinite(program[3])).length,
  dqbOfficialRows,
  dqbNotPublishedRows: dqbPrograms.length,
  dadOfficialRows,
  hchOfficialRows,
  hcsOfficialRows,
  hcqOfficialRows,
  hctnOfficialRows,
  tkgOfficialRows,
  tkgNotPublishedRows,
  dduOfficialRows,
  dvbOfficialRows,
  fbuOfficialRows,
  mitNotPublishedRows,
  nqhOfficialRows,
  hehOfficialRows,
  tquOfficialRows,
  gsaOfficialRows,
  gsaNotPublishedRows,
  nhpOfficialRows,
  hvdOfficialRows,
  thuNotPublishedRows,
  ufaRemovedLegacyRows,
  bkaRemovedDuplicateRows,
  bkaFormulaRows,
  dlxRowsMarkedNotPublished,
  hcnOfficialRows,
  hcbOfficialRows,
  pchOfficialRows,
  pcsOfficialRows,
  tghOfficialRows,
  vphOfficialRows,
  mthOfficialRows,
  mtsOfficialRows,
  gntOfficialRows,
  tdhOfficialRows,
  tdsOfficialRows,
  tdbOfficialRows,
  skdOfficialRows,
  nvhOfficialRows,
  nvsOfficialRows,
  znhOfficialRows,
  dsdOfficialRows,
  hvnCombinationRows,
  hvqCombinationRows,
  gtaCombinationRows,
  cmcCombinationRows,
  dkcCombinationRows,
  ddmCombinationRows,
  hluCombinationRows,
  dqtCombinationRows,
  ttdCombinationRows,
  snhCombinationRows,
  hcaCombinationRows,
  restoredMajorCodeRows,
  dktCorrectedRows,
  inheritedCombinationRows,
  nonApplicableCombinationRows,
  remainingMissingCombinations: remainingMissingCombinations.length,
  completedWithoutPublishedScores: ddaPendingRows + ukbPendingRows + dbhPendingRows + dfaPendingRows + dvxPendingRows + ddgPendingRows,
  officialAnnouncements: Object.keys(officialAnnouncements).length,
  referenceProfiles: referenceProfiles.length,
  remainingUpdatingProfiles: universities.filter((item) => item.admissions?.status === "updating").map((item) => item.code),
  totalMajors: majors.length
};

if (shouldWrite) {
  await Promise.all([
    writeFile(join(root, "data", "majors.json"), `${JSON.stringify(majors, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "universities.json"), `${JSON.stringify(universities, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "remaining-profiles-report-2026.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  ]);
}

console.log(JSON.stringify({ mode: shouldWrite ? "write" : "audit", ...report }, null, 2));
