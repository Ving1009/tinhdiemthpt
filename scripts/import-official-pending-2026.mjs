import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shouldWrite = process.argv.includes("--write");
const checkedAt = "2026-09-11";
const importTag = "official-pending-2026";
const universities = JSON.parse(await readFile(join(root, "data", "universities.json"), "utf8"));
let majors = JSON.parse(await readFile(join(root, "data", "majors.json"), "utf8"));
const universityByCode = new Map(universities.map((item) => [item.code.toUpperCase(), item]));
const universityById = new Map(universities.map((item) => [item.id, item]));

const unique = (values) => [...new Set(values.filter(Boolean))];
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalize = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
const key = (value) => normalize(value).replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

function source(name, url, has2026Data = true) {
  return { name, url, checkedAt, has2026Data };
}

function updateProfile(code, profile) {
  const university = universityByCode.get(code);
  if (!university) throw new Error(`Không tìm thấy trường ${code}`);
  const existing = university.admissions || {};
  university.methods = unique([...(university.methods || []), ...(profile.methods || [])]);
  university.dataCheckedAt = checkedAt;
  university.admissions = {
    ...existing,
    ...profile,
    methods: unique(profile.methods || existing.methods || university.methods || []),
    sources: unique([...(existing.sources || []), ...(profile.sources || [])]),
    referenceSources: uniqueSources([...(existing.referenceSources || []), ...(profile.referenceSources || [])])
  };
}

function uniqueSources(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = typeof item === "string" ? item : item?.url;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function genericFormula(method) {
  const value = normalize(method);
  if (value.includes("hoc ba")) return "Tổng điểm kết quả học tập THPT theo tổ hợp hoặc thành phần trường công bố, sau quy đổi và cộng điểm ưu tiên theo quy định.";
  if (value.includes("thpt")) return "Tổng điểm các môn thi tốt nghiệp THPT theo tổ hợp hoặc thành phần trường công bố, sau quy đổi và cộng điểm ưu tiên theo quy định.";
  if (value.includes("dgnl") || value.includes("danh gia nang luc")) return "Điểm kỳ thi đánh giá năng lực được quy đổi về thang điểm xét tuyển của trường, cộng điểm ưu tiên theo quy định.";
  if (value.includes("dgtd") || value.includes("tu duy")) return "Điểm kỳ thi đánh giá tư duy được quy đổi về thang điểm xét tuyển của trường, cộng điểm ưu tiên theo quy định.";
  return "Điểm các thành phần được quy đổi và kết hợp theo quy định tuyển sinh năm 2026 của trường.";
}

function enrichRows(code, sourceUrl, formulaByMethod = {}) {
  const university = universityByCode.get(code);
  let count = 0;
  majors = majors.map((major) => {
    if (major.universityId !== university?.id) return major;
    count += 1;
    const text = formulaByMethod[major.method] || major.formulaText || genericFormula(major.method);
    return {
      ...major,
      formulaText: text,
      formulaSourceUrl: major.formulaSourceUrl || sourceUrl,
      sourceUrl: major.sourceUrl || sourceUrl,
      cutoff: { ...(major.cutoff || {}), year: 2026, sourceUrl: major.cutoff?.sourceUrl || sourceUrl }
    };
  });
  return count;
}

// FPT: danh mục ngành, mã ngành, phương thức và công thức đều lấy từ Quy chế 2026.
const fptUrl = "https://daihoc.fpt.edu.vn/quy-che-tuyen-sinh-2026/";
const fpt = universityByCode.get("FPT");
const fptFormula = "ĐXT = ĐKH + ĐKK + ĐƯT; trong đó ĐKH = (điểm thi THPT + điểm trung bình lớp 12 × 3) / 2. ĐXT tối đa 30 và làm tròn đến hàng phần trăm.";
const fptPrograms = [
  ["7480201", "Công nghệ thông tin", "Axx: Toán + 02 môn thi khác"],
  ["7480101", "Khoa học máy tính", "Axx: Toán + 02 môn thi khác"],
  ["7340101", "Quản trị kinh doanh", "Axx: Toán + 02 môn; hoặc Cxx: Ngữ văn + 02 môn"],
  ["7320106", "Công nghệ truyền thông", "Axx: Toán + 02 môn; hoặc Cxx: Ngữ văn + 02 môn"],
  ["7380101", "Luật", "Axx: Toán + 02 môn; hoặc Cxx: Ngữ văn + 02 môn"],
  ["7220201", "Ngôn ngữ Anh", "Axx: Toán + 02 môn; hoặc Cxx: Ngữ văn + 02 môn"],
  ["7220210", "Ngôn ngữ Hàn Quốc", "Axx: Toán + 02 môn; hoặc Cxx: Ngữ văn + 02 môn"],
  ["7220204", "Ngôn ngữ Trung Quốc", "Axx: Toán + 02 môn; hoặc Cxx: Ngữ văn + 02 môn"]
];
majors = majors.filter((major) => major.universityId !== fpt.id);
for (const [index, [code, name, combination]] of fptPrograms.entries()) {
  majors.push({
    id: `${fpt.id}-${importTag}-${index + 1}`,
    universityId: fpt.id,
    code,
    nationalMajorCode: code,
    name,
    combination,
    combinationStatus: "verified",
    subjects: [],
    method: "Xét tuyển kết hợp",
    methodDetails: "Kết hợp kết quả thi tốt nghiệp THPT và điểm trung bình lớp 12",
    formula: "fpt-ket-hop-2026",
    formulaText: fptFormula,
    formulaSourceUrl: fptUrl,
    calculationVerified: false,
    dataStatus: "verified",
    sourceName: "Trường Đại học FPT",
    sourceUrl: fptUrl,
    importTag,
    cutoff: { year: 2026, score: null, scale: 30, method: "Xét tuyển kết hợp", status: "not_published", sourceName: "Trường Đại học FPT", sourceUrl: fptUrl }
  });
}
updateProfile("FPT", {
  status: "official_announced",
  methods: ["Xét tuyển kết hợp", "Xét tuyển thẳng"],
  methodsSourceUrl: fptUrl,
  sources: [fptUrl],
  note: "Đã cập nhật đủ 8 ngành, mã ngành và công thức theo Quy chế tuyển sinh 2026; trường chưa công bố điểm trúng tuyển theo từng ngành.",
  formulas: [{ method: "Xét tuyển kết hợp", text: fptFormula, sourceUrl: fptUrl }]
});
fpt.formulas = unique([...(fpt.formulas || []), "fpt-ket-hop-2026"]);

// BVU: công bố một mức điểm cho từng nhóm ngành và cho cả hai phương thức.
const bvuUrl = "https://bvu.edu.vn/truong-dai-hoc-ba-ria-vung-tau-cong-bo-diem-trung-tuyen-dai-hoc-chinh-quy-va-xet-tuyen-bo-sung-nam-2026/";
const bvuMethodsUrl = "https://bvu.edu.vn/tuyen-sinh-2026-thi-sinh-chuan-bi-gi-truoc-khi-dang-ky-nguyen-vong-vao-ngay-02-7-2026/";
const bvuCodes = [
  ["ngon ngu anh", "7220201"], ["ngon ngu trung quoc", "7220204"], ["tam ly hoc", "7310401"], ["dong phuong hoc", "7310608"],
  ["truyen thong da phuong tien", "7320104"], ["quan he cong chung", "7320108"], ["quan tri kinh doanh", "7340101"], ["marketing", "7340115"],
  ["kinh doanh quoc te", "7340120"], ["thuong mai dien tu", "7340122"], ["tai chinh ngan hang", "7340201"], ["ke toan", "7340301"],
  ["luat", "7380101"], ["cong nghe thong tin", "7480201"], ["cong nghe ky thuat cong trinh xay dung", "7510102"],
  ["cong nghe ky thuat co khi", "7510201"], ["cong nghe ky thuat o to", "7510205"], ["cong nghe ky thuat dien dien tu", "7510301"],
  ["logistics va quan ly chuoi cung ung", "7510605"], ["duoc hoc", "7720201"], ["dieu duong", "7720301"],
  ["quan tri dich vu du lich va lu hanh", "7810103"], ["quan tri khach san", "7810201"], ["khai thac van tai", "7840101"], ["kinh te van tai", "7840104"]
];
const bvuFormula = {
  "THPT": "Tổng điểm 03 môn thi tốt nghiệp theo tổ hợp xét tuyển hoặc Toán + Ngữ văn + 01 môn khác, cộng điểm ưu tiên theo quy định.",
  "Học bạ": "Điểm học bạ theo tổ hợp hoặc thành phần BVU quy định, sau quy đổi và cộng điểm ưu tiên theo quy định."
};
let bvuUpdated = 0;
majors = majors.map((major) => {
  if (major.universityId !== universityByCode.get("BVU").id || !["THPT", "Học bạ"].includes(major.method)) return major;
  const nameKey = key(major.name);
  const code = bvuCodes.find(([label]) => nameKey.startsWith(label))?.[1] || major.code;
  const isPharmacy = nameKey.startsWith("duoc hoc");
  const isNursing = nameKey.startsWith("dieu duong");
  const isLaw = nameKey.startsWith("luat") || nameKey.includes(" luat");
  const score = isPharmacy || isLaw ? 20 : isNursing ? 18 : major.method === "Học bạ" ? 18 : 15;
  bvuUpdated += 1;
  return {
    ...major,
    code,
    ...(/^\d{7}$/.test(code) ? { nationalMajorCode: code } : {}),
    formulaText: bvuFormula[major.method],
    formulaSourceUrl: bvuUrl,
    dataStatus: "verified",
    sourceName: "Trường Đại học Bà Rịa - Vũng Tàu",
    sourceUrl: bvuUrl,
    cutoff: { ...(major.cutoff || {}), year: 2026, score, scale: 30, scaleStatus: "reported", method: major.method, status: "verified", sourceName: "Trường Đại học Bà Rịa - Vũng Tàu", sourceUrl: bvuUrl }
  };
});
updateProfile("BVU", {
  status: "official_verified",
  methods: ["THPT", "Học bạ", "ĐGNL", "Xét tuyển tổng hợp", "Xét tuyển thẳng"],
  methodsSourceUrl: bvuMethodsUrl,
  sources: [bvuUrl, bvuMethodsUrl],
  note: `Đã cập nhật điểm trúng tuyển 2026 cho ${bvuUpdated} dòng ngành/chuyên ngành theo hai phương thức THPT và học bạ.`,
  formulas: Object.entries(bvuFormula).map(([method, text]) => ({ method, text, sourceUrl: bvuUrl }))
});

// Trường Đại học Hải Dương: bảng chính thức công bố 32 mã ngành trên cùng thang 30 sau quy đổi.
const dktUrl = "https://uhd.edu.vn/tin-tuc/thong-bao-diem-trung-tuyen-trinh-do-dai-hoc-trinh-do-cao-dang-nganh-giao-duc-mam-non-chinh-quy-dot-1-nam-2026-postB8PrXm1YDdcVDzV3OoQR";
const dktPrograms = [
  ["7140201", "Giáo dục Mầm non (ĐH)", 24.63], ["7140202", "Giáo dục Tiểu học", 25.17], ["7140205", "Giáo dục Chính trị", 25.33],
  ["7140206", "Giáo dục Thể chất", 22], ["7140209", "Sư phạm Toán học", 25.17], ["7140210", "Sư phạm Tin học", 23.25],
  ["7140217", "Sư phạm Ngữ văn", 25.73], ["7140218", "Sư phạm Lịch sử", 25.88], ["7140219", "Sư phạm Địa lí", 25.73],
  ["7140231", "Sư phạm Tiếng Anh", 25.5], ["7140247", "Sư phạm Khoa học tự nhiên", 23.96], ["7140211", "Sư phạm Vật lí", 24.4],
  ["7140212", "Sư phạm Hóa học", 24.44], ["7140213", "Sư phạm Sinh học", 22.6], ["7140246", "Sư phạm Công nghệ", 22.14],
  ["51140201", "Giáo dục Mầm non (CĐ)", 23], ["7220201", "Ngôn ngữ Anh", 18.75], ["7229030", "Văn học", 21.82],
  ["7310101", "Kinh tế", 15], ["7340101", "Quản trị kinh doanh", 15], ["7340115", "Marketing", 15], ["7340201", "Tài chính - Ngân hàng", 15],
  ["7340301", "Kế toán", 15], ["7340406", "Quản trị văn phòng", 15], ["7460101", "Toán học", 21.25], ["7480201", "Công nghệ thông tin", 15],
  ["7510203", "Công nghệ kỹ thuật cơ điện tử", 15], ["7510302", "Công nghệ kỹ thuật điện tử - viễn thông", 15], ["7520201", "Kỹ thuật điện", 15],
  ["7760103", "Hỗ trợ Giáo dục người khuyết tật", 15], ["7810103", "Quản trị dịch vụ du lịch và lữ hành", 15], ["7310403", "Tâm lý học giáo dục", 15]
];
const dktFormula = "Điểm xét tuyển = điểm của 03 bài thi/môn học theo tổ hợp tương ứng đã quy đổi + điểm ưu tiên khu vực, đối tượng; áp dụng thang 30.";
function dktMatch(name) {
  const value = key(name).replace(/ diem da quy doi.*$/, "");
  if (value.startsWith("giao duc mam non cd")) return dktPrograms.find(([code]) => code === "51140201");
  if (value.startsWith("giao duc mam non dh")) return dktPrograms.find(([code]) => code === "7140201");
  return dktPrograms.find(([, label]) => {
    const official = key(label);
    return value.startsWith(official) || official.startsWith(value) || value.replace("vat ly", "vat li").replace("hoa hoc", "hoa hoc").replace("dia ly", "dia li").replace("co dien tu", "co dien tu").startsWith(official);
  });
}
let dktUpdated = 0;
majors = majors.map((major) => {
  if (major.universityId !== universityByCode.get("DKT").id) return major;
  const match = dktMatch(major.name);
  if (!match) return major;
  const [code, , score] = match;
  dktUpdated += 1;
  return {
    ...major,
    code,
    nationalMajorCode: code,
    formulaText: dktFormula,
    formulaSourceUrl: dktUrl,
    dataStatus: "verified",
    sourceName: "Trường Đại học Hải Dương",
    sourceUrl: dktUrl,
    cutoff: { ...(major.cutoff || {}), year: 2026, score, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Trường Đại học Hải Dương", sourceUrl: dktUrl }
  };
});
const dktId = universityByCode.get("DKT").id;
if (!majors.some((major) => major.universityId === dktId && major.nationalMajorCode === "7310403")) {
  majors.push({
    id: `${dktId}-${importTag}-7310403`, universityId: dktId, code: "7310403", nationalMajorCode: "7310403", name: "Tâm lý học giáo dục",
    combination: "Áp dụng cho tất cả tổ hợp xét tuyển của ngành", combinationStatus: "verified", subjects: [], method: "Các phương thức sau quy đổi",
    methodDetails: "Điểm trúng tuyển chung sau quy đổi về thang điểm thi tốt nghiệp THPT", formula: "dkt-quy-doi-2026", formulaText: dktFormula,
    formulaSourceUrl: dktUrl, calculationVerified: false, dataStatus: "verified", sourceName: "Trường Đại học Hải Dương", sourceUrl: dktUrl, importTag,
    cutoff: { year: 2026, score: 15, scale: 30, scaleStatus: "reported", method: "Điểm trúng tuyển sau quy đổi", status: "verified", sourceName: "Trường Đại học Hải Dương", sourceUrl: dktUrl }
  });
  dktUpdated += 1;
}
updateProfile("DKT", {
  status: "official_verified",
  methods: ["THPT", "Học bạ", "Xét tuyển kết hợp"], methodsSourceUrl: dktUrl, sources: [dktUrl],
  note: `Đã gắn mã ngành, công thức và điểm trúng tuyển sau quy đổi cho ${dktUpdated} dòng hồ sơ; bảng chính thức có 32 mã ngành.`,
  formulas: [{ method: "Các phương thức sau quy đổi", text: dktFormula, sourceUrl: dktUrl }]
});

// Đại học Quy Nhơn: thay phần THPT cũ bằng đủ 56 mã xét tuyển trong bảng điểm chính thức.
const dqnUrl = "https://qnu.edu.vn/Resources/Docs/SubDomain/HomePage/2026/Thang%208/Thong%20bao%20diem%20chuan%20tuyen%20sinh%20dai%20h%E1%BB%8Dc%20chinh%20quy%202026-signed-pages-2%20(1).pdf";
const dqnPrograms = [
  ["7140114", "Quản lý Giáo dục", 22.6], ["7140201", "Giáo dục mầm non", 22.3], ["7140202", "Giáo dục Tiểu học", 20.55],
  ["7140205", "Giáo dục chính trị", 23.48], ["7140206", "Giáo dục thể chất", 21.8], ["7140209", "Sư phạm Toán học", 25.5],
  ["7140210", "Sư phạm Tin học", 22.75], ["7140211", "Sư phạm Vật lý", 25.3], ["7140212", "Sư phạm Hóa học", 25.5],
  ["7140213", "Sư phạm Sinh học", 23.3], ["7140217", "Sư phạm Ngữ văn", 25.15], ["7140218", "Sư phạm Lịch sử", 25.35],
  ["7140219", "Sư phạm Địa lý", 24.6], ["7140231", "Sư phạm Tiếng Anh", 25.1], ["7140247", "Sư phạm Khoa học tự nhiên", 24.5],
  ["7140249", "Sư phạm Lịch sử Địa lý", 24.8], ["7220201", "Ngôn ngữ Anh", 21.75], ["7220204", "Ngôn ngữ Trung Quốc", 22.3],
  ["7229030", "Văn học", 22.9], ["7310101", "Kinh tế", 19.9], ["7310205", "Quản lý nhà nước", 21.9],
  ["7310403", "Tâm lý học giáo dục", 22.2], ["7310608", "Đông phương học", 20.53], ["7310630", "Việt Nam học", 21.15],
  ["7340101", "Quản trị kinh doanh", 19.25], ["7340201", "Tài chính - Ngân hàng", 20.5], ["7340301", "Kế toán", 20.2],
  ["7340301AC", "Kế toán ACCA", 15], ["7340302", "Kiểm toán", 19], ["7380101", "Luật", 20.6], ["7440112", "Hóa học", 22.65],
  ["7460108", "Khoa học dữ liệu", 17.25], ["7460112", "Toán ứng dụng", 22.6], ["7480103", "Kỹ thuật phần mềm", 16],
  ["7480107", "Trí tuệ nhân tạo", 17.5], ["7480201", "Công nghệ thông tin", 18.2], ["7510205", "Công nghệ kỹ thuật ô tô", 19.7],
  ["7510401", "Công nghệ kỹ thuật hóa học", 21.05], ["7510605", "Logistics và quản lý chuỗi cung ứng", 21.3],
  ["7520116", "Kỹ thuật cơ khí động lực", 19.51], ["7520201", "Kỹ thuật điện", 20.3], ["7520207", "Kỹ thuật điện tử - viễn thông", 16.7],
  ["7520216", "Kỹ thuật điều khiển và Tự động hóa", 21.35], ["7520401", "Vật lý kỹ thuật", 16], ["7540101", "Công nghệ thực phẩm", 18.8],
  ["7580201", "Kỹ thuật xây dựng", 15.7], ["7620109", "Nông học", 15.45], ["7760101", "Công tác xã hội", 22],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", 20.65], ["7810201", "Quản trị khách sạn", 20.3],
  ["7850101", "Quản lý tài nguyên và môi trường", 15], ["7850103", "Quản lý đất đai", 15.8], ["7310109", "Kinh tế số", 16],
  ["7520201TA", "Kỹ thuật điện (giảng dạy bằng tiếng Anh)", 20.3], ["7340201TA", "Tài chính - Ngân hàng (giảng dạy bằng tiếng Anh)", 20.5],
  ["7480201TA", "Công nghệ thông tin (giảng dạy bằng tiếng Anh)", 18.2]
];
const dqnId = universityByCode.get("DQN").id;
const dqnOldThpt = majors.filter((major) => major.universityId === dqnId && major.method === "THPT");
function dqnTemplate(name) {
  const plain = key(name);
  const aliases = [plain.replace(" giang day bang tieng anh", ""), plain.replace(" acca", ""), plain === "kinh te so" ? "kinh te" : plain];
  return dqnOldThpt.find((major) => aliases.includes(key(major.name))) || dqnOldThpt.find((major) => aliases.some((alias) => key(major.name).startsWith(alias)));
}
const dqnFormula = "Điểm xét tuyển THPT là tổng điểm các môn theo tổ hợp xét tuyển sau quy đổi (nếu có), cộng điểm ưu tiên theo quy định tuyển sinh năm 2026.";
majors = majors.filter((major) => major.universityId !== dqnId || major.method !== "THPT");
for (const [index, [code, name, score]] of dqnPrograms.entries()) {
  const template = dqnTemplate(name);
  majors.push({
    ...(template || {}), id: `${dqnId}-${importTag}-thpt-${index + 1}`, universityId: dqnId, code, nationalMajorCode: code, name,
    combination: template?.combination || "Theo các tổ hợp xét tuyển được Đại học Quy Nhơn công bố cho ngành",
    combinationStatus: template?.combination ? (template.combinationStatus || "reference") : "not_provided", subjects: template?.subjects || [],
    method: "THPT", methodDetails: "Xét điểm thi tốt nghiệp THPT năm 2026", formula: "dqn-thpt-2026", formulaText: dqnFormula,
    formulaSourceUrl: dqnUrl, calculationVerified: false, dataStatus: "verified", sourceName: "Trường Đại học Quy Nhơn", sourceUrl: dqnUrl, importTag,
    cutoff: { year: 2026, score, scale: 30, scaleStatus: "reported", method: "THPT", status: "verified", sourceName: "Trường Đại học Quy Nhơn", sourceUrl: dqnUrl }
  });
}
updateProfile("DQN", {
  status: "official_proposed_methods_with_published_results", methods: ["THPT", "Học bạ", "ĐGNL HNUE", "ĐGNL V-ACT"], methodsSourceUrl: dqnUrl, sources: [dqnUrl],
  note: "Đã cập nhật đủ 56 mã xét tuyển và điểm chuẩn phương thức thi tốt nghiệp THPT năm 2026; các bảng học bạ và đánh giá năng lực tiếp tục giữ trạng thái đối chiếu.",
  formulas: [{ method: "THPT", text: dqnFormula, sourceUrl: dqnUrl }]
});

// STU: 20 ngành và 5 phương thức được công bố chung trong cùng bảng điểm đợt 1.
const dsgUrl = "https://tuyensinhdaihoc.stu.edu.vn/2026/08/12/stu-cong-bo-diem-chuan-trung-tuyen-dai-hoc-chinh-quy-nam-2026-dot-1/";
const dsgId = universityByCode.get("DSG").id;
const dsgOldRows = majors.filter((major) => major.universityId === dsgId);
const dsgPrograms = [
  ["7210402", "Thiết kế công nghiệp"], ["7340101", "Quản trị kinh doanh"], ["7340115", "Marketing"],
  ["7340120", "Kinh doanh quốc tế"], ["7340201", "Tài chính - Ngân hàng"], ["7510605", "Logistics và Quản lý chuỗi cung ứng"],
  ["7810101", "Du lịch"], ["7380107", "Luật kinh tế"], ["7480106", "Kỹ thuật máy tính"], ["7480201", "Công nghệ thông tin"],
  ["7510201", "Công nghệ kỹ thuật cơ khí"], ["7510203", "Công nghệ kỹ thuật cơ điện tử"],
  ["7510301", "Công nghệ kỹ thuật điện, điện tử"], ["7510302", "Công nghệ kỹ thuật điện tử - viễn thông"],
  ["7540101", "Công nghệ thực phẩm"], ["7540106", "Đảm bảo chất lượng và an toàn thực phẩm"],
  ["7580201", "Kỹ thuật xây dựng"], ["7580302", "Quản lý xây dựng"], ["7580101", "Kiến trúc"],
  ["7580205", "Kỹ thuật xây dựng công trình giao thông"]
];
const dsgMethods = [
  ["Học bạ (Điểm trung bình 3 năm)", "Điểm trung bình kết quả học tập của 03 năm THPT, cộng điểm ưu tiên theo quy định.", 17, 21, 30],
  ["Học bạ (Tổ hợp 3 môn)", "Điểm trung bình 03 năm học của 03 môn thuộc tổ hợp xét tuyển, cộng điểm ưu tiên theo quy định.", 17, 21, 30],
  ["THPT", "Tổng điểm thi tốt nghiệp THPT theo tổ hợp xét tuyển, cộng điểm ưu tiên theo quy định.", 15, 20, 30],
  ["ĐGNL V-ACT", "Điểm kỳ thi đánh giá năng lực của ĐHQG TP.HCM theo thang 1.200 điểm.", 550, 720, 1200],
  ["Xét tuyển kết hợp", "Kết hợp điểm thi tốt nghiệp THPT với điểm trung bình kết quả học tập THPT theo quy định của STU.", 19, 24, 30]
];
function dsgTemplate(name) {
  const wanted = key(name).replace(/^cong nghe ky thuat /, "");
  return dsgOldRows.find((major) => {
    const current = key(major.name).replace(/^cnkt /, "").replace(/^cong nghe ky thuat /, "");
    return current === wanted || current.startsWith(wanted) || wanted.startsWith(current);
  });
}
majors = majors.filter((major) => major.universityId !== dsgId);
let dsgIndex = 0;
for (const [code, name] of dsgPrograms) {
  const template = dsgTemplate(name);
  for (const [method, formulaText, normalScore, lawScore, scale] of dsgMethods) {
    const score = code === "7380107" ? lawScore : normalScore;
    dsgIndex += 1;
    majors.push({
      ...(template || {}), id: `${dsgId}-${importTag}-${dsgIndex}`, universityId: dsgId, code, nationalMajorCode: code, name,
      combination: template?.combination && template.combination !== "Chưa xác minh" ? template.combination : "Theo tổ hợp/điều kiện của phương thức STU công bố",
      combinationStatus: template?.combination && template.combination !== "Chưa xác minh" ? (template.combinationStatus || "reference") : "not_provided",
      subjects: template?.subjects || [], method, methodDetails: method, formula: `dsg-${formulaSlug(method)}-2026`, formulaText, formulaSourceUrl: dsgUrl,
      calculationVerified: false, dataStatus: "verified", sourceName: "Trường Đại học Công nghệ Sài Gòn", sourceUrl: dsgUrl, importTag,
      cutoff: { year: 2026, score, scale, scaleStatus: "reported", method, status: "verified", sourceName: "Trường Đại học Công nghệ Sài Gòn", sourceUrl: dsgUrl }
    });
  }
}
updateProfile("DSG", {
  status: "official_verified", methods: dsgMethods.map(([method]) => method), methodsSourceUrl: dsgUrl, sources: [dsgUrl],
  note: "Đã cập nhật đủ 20 ngành, mã ngành và điểm trúng tuyển đợt 1 năm 2026 cho 5 phương thức (100 dòng).",
  formulas: dsgMethods.map(([method, text]) => ({ method, text, sourceUrl: dsgUrl }))
});

// UMT: bảng ảnh chính thức công bố 10 ngành và 5 phương thức với cùng mức điểm theo từng cột.
const umtUrl = "https://www.umt.edu.vn/tin-tuc/truong-dai-hoc-quan-ly-va-cong-nghe-tp-hcm-umt-cong-bo-diem-trung-tuyen-dot-chinh-thuc-nam-2026";
const umtId = universityByCode.get("UMT").id;
const umtOldRows = majors.filter((major) => major.universityId === umtId);
const umtPrograms = [
  ["7480201", "Công nghệ thông tin"], ["7480101", "Khoa học máy tính"], ["7480202", "An toàn thông tin"],
  ["7320104", "Truyền thông đa phương tiện"], ["7210403", "Thiết kế đồ họa"], ["7340115", "Marketing"],
  ["7810301", "Quản lý thể dục thể thao"], ["7340101", "Quản trị kinh doanh"], ["7340120", "Kinh doanh quốc tế"],
  ["7510605", "Logistics và Quản lý chuỗi cung ứng"]
];
const umtMethods = [
  ["THPT", "Tổng điểm các môn trong tổ hợp xét tuyển, không nhân hệ số, đã gồm điểm ưu tiên và điểm cộng.", 15, 30],
  ["Học bạ", "Tổng điểm học bạ theo tổ hợp xét tuyển, không nhân hệ số, đã gồm điểm ưu tiên và điểm cộng.", 18, 30],
  ["ĐGNL V-ACT quy đổi", "Điểm ĐGNL ĐHQG TP.HCM được quy đổi về thang 30 theo quy định UMT.", 15, 30],
  ["V-SAT", "Tổng điểm 03 môn thi V-SAT theo tổ hợp xét tuyển, thang điểm 450.", 225, 450],
  ["Trình độ tương đương", "Điểm xét theo điều kiện trình độ tương đương (trung cấp) do UMT quy định.", 18, 30]
];
function umtTemplate(name) {
  const wanted = key(name);
  const aliases = wanted === "khoa hoc may tinh" || wanted === "an toan thong tin" ? [wanted, "cong nghe thong tin"] : [wanted];
  return umtOldRows.find((major) => aliases.includes(key(major.name)));
}
majors = majors.filter((major) => major.universityId !== umtId);
let umtIndex = 0;
for (const [code, name] of umtPrograms) {
  const template = umtTemplate(name);
  for (const [method, formulaText, score, scale] of umtMethods) {
    umtIndex += 1;
    majors.push({
      ...(template || {}), id: `${umtId}-${importTag}-${umtIndex}`, universityId: umtId, code, nationalMajorCode: code, name,
      combination: template?.combination && template.combination !== "Chưa xác minh" ? template.combination : "Theo tổ hợp/điều kiện của phương thức UMT công bố",
      combinationStatus: template?.combination && template.combination !== "Chưa xác minh" ? (template.combinationStatus || "reference") : "not_provided",
      subjects: template?.subjects || [], method, methodDetails: method, formula: `umt-${formulaSlug(method)}-2026`, formulaText, formulaSourceUrl: umtUrl,
      calculationVerified: false, dataStatus: "verified", sourceName: "Trường Đại học Quản lý và Công nghệ TP.HCM", sourceUrl: umtUrl, importTag,
      cutoff: { year: 2026, score, scale, scaleStatus: "reported", method, status: "verified", sourceName: "Trường Đại học Quản lý và Công nghệ TP.HCM", sourceUrl: umtUrl }
    });
  }
}
updateProfile("UMT", {
  status: "official_verified", methods: umtMethods.map(([method]) => method), methodsSourceUrl: umtUrl, sources: [umtUrl],
  note: "Đã cập nhật đủ 10 ngành, mã ngành và điểm trúng tuyển chính thức năm 2026 cho 5 phương thức (50 dòng).",
  formulas: umtMethods.map(([method, text]) => ({ method, text, sourceUrl: umtUrl }))
});

function formulaSlug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Những trường đã có nguồn chính thức 2026; giữ nguyên điểm tham khảo nếu bảng chi tiết được nhập từ nguồn tổng hợp.
const officialProfiles = {
  HCH: {
    url: "https://apag.edu.vn/thong-tin-tuyen-sinh-trinh-do-dai-hoc-hinh-thuc-chinh-quy-nam-2026-cua-hoc-vien-hanh-chinh-va-quan-tri-cong-8772.htm",
    methods: ["THPT", "Kết hợp học bạ và THPT", "ĐGNL", "Xét tuyển thẳng"],
    note: "Đã đối chiếu thông tin chính thức: 4.200 chỉ tiêu, 22 chương trình và 4 phương thức tuyển sinh năm 2026. Điểm theo từng dòng đang tiếp tục đối chiếu công bố kết quả."
  },
  CMC: { url: "https://tuyensinh.cmc-u.edu.vn/", methods: ["CMC-TEST", "Học bạ", "THPT"], note: "Đã có thông tin tuyển sinh chính thức và đã bổ sung bảng điểm 2026 ở mức tham khảo theo từng ngành/phương thức." },
  HVN: { url: "https://vnua.edu.vn/tin-tuc-su-kien/dao-tao/diem-", methods: ["Học bạ", "THPT"], note: "Đã tìm thấy công bố điểm chính thức 2026; bảng ngành/phương thức hiện được nhập từ nguồn tổng hợp và gắn trạng thái tham khảo để tiếp tục đối chiếu." },
  SPS: { url: "https://tuyensinh.hcmue.edu.vn/index.php?Itemid=9677&catid=4069%3Atin-tc&id=27828%3Athong-bao-kt-qu-xet-tuyn-cac-nganh-ao-to-trinh-i-hc-nganh-giao-dc-mm-non-trinh-cao-ng-h-chinh-quy-nm-2026&lang=vi&option=com_content&site=183&view=article", methods: ["THPT", "Xét tuyển kết hợp"], note: "Đã có công bố kết quả chính thức 2026; đã bổ sung các dòng điểm từ nguồn tổng hợp và đang đối chiếu lần cuối với bảng quy đổi của trường." },
  DDM: { url: "https://tuyensinh.qui.edu.vn/tuyen-sinh-dai-hoc/thong-bao-diem-chuan-trung-tuyen-dai-hoc-chinh-quy-dot-1-nam-2026-1123.html", methods: ["THPT", "Học bạ", "ĐGNL HSA", "ĐGTD TSA", "Xét tuyển kết hợp"], note: "Đã có công bố điểm chính thức 2026; đã bổ sung 60 dòng tham khảo và giữ rõ nguồn để tiếp tục đối chiếu theo từng phương thức." },
  HLU: { url: "https://uhl.edu.vn/TruongDaihocHaLongcongbodiemtrungtuyenDaihocchinhquydotnam_11929.htm", methods: ["THPT", "Học bạ", "ĐGNL SPT", "Xét tuyển kết hợp"], note: "Đã có công bố điểm chính thức 2026; đã bổ sung 64 dòng tham khảo theo từng ngành/phương thức." }
};
for (const [code, item] of Object.entries(officialProfiles)) {
  enrichRows(code, item.url);
  updateProfile(code, {
    status: "official_proposed_methods_with_published_results", methods: item.methods, methodsSourceUrl: item.url, sources: [item.url], note: item.note,
    formulas: unique(item.methods).map((method) => ({ method, text: genericFormula(method), sourceUrl: item.url }))
  });
}

// Các nguồn tuyển sinh/kết quả chính thức đã tìm thấy, dùng để hoàn thiện công thức và trạng thái hồ sơ trong khi điểm từng dòng còn được đối chiếu.
const announced = {
  DAD: ["https://donga.edu.vn/tin-tuc/ttsk-chi-tiet/truong-dai-hoc-dong-a-cong-bo-diem-chuan-trung-tuyen-nam-2026-44629", ["THPT", "Học bạ", "ĐGNL V-ACT"]],
  FBU: ["https://fbu.edu.vn/thong-bao-diem-trung-tuyen-he-dai-hoc-chinh-quy-truong-dai-hoc-tai-chinh-ngan-hang-ha-noi-nam-2026/", ["THPT", "Học bạ", "Xét tuyển kết hợp"]],
  DDU: ["https://www.hdiu.edu.vn/tin-tuc/truong-dai-hoc-dong-do-cong-bo-nguong-dam-bao-chat-luong-dau-vao-dai-hoc-he-chinh-quy-nam-2026-5216.html", ["THPT", "Học bạ", "Xét tuyển kết hợp"]],
  TQU: ["https://daihoctantrao.edu.vn/media/files/Th%C3%B4ng-b%C3%A1o-tuy%E1%BB%83n-sinh-h%E1%BB%87-ch%C3%ADnh-quy-n%C4%83m-2026-%281%29.pdf", ["THPT", "Học bạ", "Xét tuyển kết hợp"]],
  DVB: ["https://tuyensinh.tuetech.edu.vn/thong-bao-diem-trung-tuyen-dai-hoc-chinh-quy-nam-2026-dt108.html", ["THPT", "Học bạ", "ĐGNL"]],
  THP: ["https://dhhp.edu.vn/?p=20721", ["THPT", "Học bạ", "ĐGNL", "ĐGTD", "Xét tuyển kết hợp"]],
  DQB: ["https://qbu.edu.vn/2026/08/diem-trung-tuyen-theo-diem-thi-thpt-doi-voi-cac-nganh-dao-tao-trinh-do-dai-hoc-nam-2026-dot-1/", ["THPT", "Học bạ", "Xét tuyển kết hợp"]]
};
for (const [code, [url, methods]] of Object.entries(announced)) {
  enrichRows(code, url);
  updateProfile(code, {
    status: "official_announced", methods, methodsSourceUrl: url, sources: [url],
    note: "Đã tìm thấy công bố tuyển sinh/kết quả chính thức năm 2026 và bổ sung công thức cho hồ sơ hiện có; điểm từng dòng chưa xác minh vẫn được hiển thị đúng trạng thái đang đối chiếu.",
    formulas: methods.map((method) => ({ method, text: genericFormula(method), sourceUrl: url }))
  });
}

// Hồ sơ đại học hệ thống, phân hiệu và tuyển sinh đặc thù cần hiển thị phương thức đã có ở hồ sơ gốc.
for (const university of universities) {
  const status = university.admissions?.status;
  if (!["member_units", "parent_linked", "special_admissions"].includes(status)) continue;
  if ((university.admissions.methods || []).length || !(university.methods || []).length) continue;
  university.admissions.methods = [...university.methods];
  university.admissions.formulas = university.methods.map((method) => ({
    method,
    text: status === "special_admissions"
      ? "Áp dụng điều kiện, sơ tuyển hoặc kỳ thi riêng theo thông báo của đơn vị."
      : "Ngành, công thức và điểm được công bố trong hồ sơ của trường hoặc đơn vị đào tạo trực tiếp.",
    sourceUrl: university.admissions.methodsSourceUrl || university.website
  }));
}

const report = {
  checkedAt,
  fptRows: majors.filter((major) => major.universityId === fpt.id).length,
  bvuRowsUpdated: bvuUpdated,
  dktRowsUpdated: dktUpdated,
  dqnOfficialThptRows: dqnPrograms.length,
  dsgOfficialRows: dsgPrograms.length * dsgMethods.length,
  umtOfficialRows: umtPrograms.length * umtMethods.length,
  officialProfilesAdded: Object.keys(officialProfiles).length,
  announcedProfilesAdded: Object.keys(announced).length,
  totalMajors: majors.length
};

if (shouldWrite) {
  await Promise.all([
    writeFile(join(root, "data", "majors.json"), `${JSON.stringify(majors, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "universities.json"), `${JSON.stringify(universities, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "official-pending-report-2026.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  ]);
}

console.log(JSON.stringify({ mode: shouldWrite ? "write" : "audit", ...report }, null, 2));
