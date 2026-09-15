import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shouldWrite = process.argv.includes("--write");
const universities = JSON.parse(await readFile(join(root, "data", "universities.json"), "utf8"));
const currentMajors = JSON.parse(await readFile(join(root, "data", "majors.json"), "utf8"));
const combinations = JSON.parse(await readFile(join(root, "data", "combinations.json"), "utf8"));
const CHECKED_AT = "2026-09-10";
const IMPORT_TAG = "curated-external-profile-2026";

const subjectByCombination = new Map(combinations.filter((item) => item.code).map((item) => [item.code.toUpperCase(), item.subjectIds || []]));
const universityById = new Map(universities.map((university) => [university.id, university]));

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function subjectsFor(combination) {
  for (const code of String(combination || "").toUpperCase().split(/[;,/|\s]+/).filter(Boolean)) {
    if (subjectByCombination.has(code)) return subjectByCombination.get(code);
  }
  return [];
}

function sourceRecord(name, url, has2026Data = true) {
  return { name, url, checkedAt: CHECKED_AT, has2026Data };
}

function formulaSlug(value) {
  return String(value || "khac").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function row({ universityId, index, code, name, combination = "", method, methodDetails = "", score = null, scale = 30, sourceUrl, sourceName = "Nguồn chính thức của trường", formulaText, dataStatus = "verified", cutoffStatus, formulaId }) {
  const formula = formulaId || `${universityById.get(universityId)?.code.toLowerCase()}-${formulaSlug(method)}-2026`;
  return {
    id: `${universityId}-${IMPORT_TAG}-${index}`,
    universityId,
    code,
    ...(/^\d{7}$/.test(code) ? { nationalMajorCode: code } : {}),
    name,
    combination,
    combinationStatus: combination ? "verified" : "not_provided",
    subjects: subjectsFor(combination),
    method,
    ...(methodDetails ? { methodDetails } : {}),
    formula,
    formulaText,
    formulaSourceUrl: sourceUrl,
    calculationVerified: false,
    dataStatus,
    sourceName,
    sourceUrl,
    importTag: IMPORT_TAG,
    cutoff: {
      year: 2026,
      score,
      scale,
      method: methodDetails || method,
      status: cutoffStatus || (Number.isFinite(score) ? (dataStatus === "verified" ? "verified" : "reference") : "not_published"),
      sourceName,
      sourceUrl
    }
  };
}

const curated = [];

function addSchoolProfile(id, profile, programRows) {
  const university = universityById.get(id);
  if (!university) throw new Error(`Không tìm thấy trường ${id}`);
  const rows = programRows.map((item, index) => row({ universityId: id, index: index + 1, ...item }));
  curated.push(...rows);
  university.methods = unique([...(university.methods || []), ...(profile.methods || []), ...rows.map((item) => item.method)]);
  university.formulas = unique([...(university.formulas || []), ...rows.map((item) => item.formula)]);
  university.dataCheckedAt = CHECKED_AT;
  university.admissions = {
    ...(university.admissions || {}),
    ...profile,
    methods: unique(profile.methods || rows.map((item) => item.method)),
    sources: unique(profile.sources || []),
    referenceSources: profile.referenceSources || []
  };
}

const hpuAdmissionUrl = "https://hpu.edu.vn/blogs/thong-tin-tuyen-sinh/thong-bao-tuyen-sinh-he-dai-hoc-chinh-quy-nam-2026-hpu";
const hpuCutoffUrl = "https://hpu.edu.vn/blogs/thong-tin-tuyen-sinh/diem-trung-tuyen-dai-hoc-chinh-quy-dot-1-nam-2026-dai-hoc-hpu";
const hpuPrograms = [
  ["7480201", "Công nghệ thông tin", "Toán và 02 môn tự chọn", 16, 19.67],
  ["7510301", "Công nghệ kỹ thuật điện, điện tử", "Toán và 02 môn tự chọn", 18, 23],
  ["7520320", "Kỹ thuật môi trường", "Toán và 02 môn tự chọn", 15, 18],
  ["7340101", "Quản trị kinh doanh", "Toán và 02 môn tự chọn", 18.5, 23.83],
  ["7310630", "Việt Nam học", "Ngữ văn và 02 môn tự chọn", 16, 19.67],
  ["7220201", "Ngôn ngữ Anh", "Ngoại ngữ và 02 môn tự chọn (có Toán hoặc Ngữ văn)", 15, 18],
  ["7220204", "Ngôn ngữ Trung Quốc", "Ngoại ngữ và 02 môn tự chọn (có Toán hoặc Ngữ văn)", 16, 19.67]
];
addSchoolProfile("truong-dai-hoc-quan-ly-va-cong-nghe-hai-phong", {
  status: "official_verified",
  methods: ["THPT", "Học bạ", "Xét tuyển thẳng"],
  methodsSourceUrl: hpuAdmissionUrl,
  sources: [hpuAdmissionUrl, hpuCutoffUrl],
  note: "Đã cập nhật đủ 7 ngành tuyển sinh cùng điểm trúng tuyển đợt 1 theo kết quả thi THPT và học bạ năm 2026.",
  formulas: [
    { method: "THPT", text: "Tổng điểm 03 môn thi tốt nghiệp THPT thuộc nhóm môn xét tuyển, cộng điểm ưu tiên theo quy định.", sourceUrl: hpuAdmissionUrl },
    { method: "Học bạ", text: "Tổng điểm trung bình chung các môn xét tuyển trong các năm lớp 10, 11 và 12, sau đó áp dụng quy đổi tương đương và điểm ưu tiên theo quy định.", sourceUrl: hpuAdmissionUrl }
  ],
  referenceSources: [sourceRecord("TuyểnSinh247", "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-quan-ly-va-cong-nghe-hai-phong-HPU.html")]
}, hpuPrograms.flatMap(([code, name, combination, thpt, hocba]) => [
  { code, name, combination, method: "THPT", methodDetails: "Điểm thi tốt nghiệp THPT", score: thpt, sourceUrl: hpuCutoffUrl, formulaText: "Tổng điểm 03 môn thi tốt nghiệp THPT thuộc nhóm môn xét tuyển + điểm ưu tiên theo quy định.", formulaId: "hpu-thpt-2026" },
  { code, name, combination, method: "Học bạ", methodDetails: "Kết quả học tập THPT", score: hocba, sourceUrl: hpuCutoffUrl, formulaText: "Tổng điểm trung bình chung các môn xét tuyển của lớp 10, 11 và 12 + điểm ưu tiên; trường áp dụng bảng quy đổi tương đương.", formulaId: "hpu-hocba-2026" }
]));

const ddbAdmissionUrl = "https://thanhdong.edu.vn/thong-bao-xet-tuyen-dai-hoc-nam-2026-tai-truong-dai-hoc-thanh-dong%3A-1810-chi-tieu-28-nganh-dao-tao-850-suat-hoc-bong-den-100-trieu-dong-n1702.html";
const ddbProgramUrl = "https://tuyensinh.thanhdong.edu.vn/Khoa/thong-bao-tuyen-sinh-2026.html";
const ddbCutoffUrl = "https://www.thanhdong.edu.vn/truong-dai-hoc-thanh-dong-cong-bo-diem-trung-tuyen-dai-hoc-chinh-quy-nam-2026-n1734.html";
const ddbReferenceUrl = "https://giaoduc.net.vn/truong-dai-hoc-thanh-dong-cong-bo-diem-chuan-29-nganh-dao-tao-nam-2026-post262052.gd";
const ddbPrograms = [
  ["7510203", "Công nghệ kỹ thuật cơ điện tử", "A00; A01; A07; C03; C04; C14; D01; D09"],
  ["7520216", "Kỹ thuật điều khiển và tự động hóa", "A00; A01; A07; C03; C04; C14; D01; D09"],
  ["7510301", "Công nghệ kỹ thuật điện, điện tử", "A00; A01; A07; C03; C04; C14; D01; D09"],
  ["7510201", "Công nghệ kỹ thuật cơ khí", "A00; A01; A07; B02; C04; D10; X06; X07"],
  ["7480201", "Công nghệ thông tin", "A00; A01; D01; X01; D07; D08; D10; D90"],
  ["7480107", "Trí tuệ nhân tạo", "A00; A01; D01; X01; D07; D08; D10; D90"],
  ["7510103", "Công nghệ kỹ thuật xây dựng", "A00; A01; A03; C01; C04; C09; X06; X21"],
  ["7340116", "Bất động sản", "A04; A06; A07; B02; C04; D10; X01; X21"],
  ["7340101", "Quản trị kinh doanh", "A00; A01; C01; C02; C03; C04; D01; D07"],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", "A01; C03; C04; D01; D14; D15; D66; X01"],
  ["7810201", "Quản trị khách sạn", "A01; C03; C04; D01; D14; D15; D66; X01"],
  ["7380101", "Luật", "A00; A01; A09; C00; C19; C20; D01; D14"],
  ["7340122", "Thương mại điện tử", "A00; A01; C01; C02; C03; C04; D01; D07"],
  ["7440221", "Biến đổi khí hậu", "A06; B02; C02; C04; D10; D15; X01; X21"],
  ["7220201", "Ngôn ngữ Anh", "A01; D01; D07; D09; D10; D14; D15; X78"],
  ["7580108", "Thiết kế nội thất", "A00; A03; A04; C01; C04; X21; V00; V01"],
  ["7510205", "Công nghệ kỹ thuật ô tô", "A00; A01; C01; C02; C04; D01; X06; X07"],
  ["7340301", "Kế toán", "A00; A01; C01; C02; C03; C04; D01; D07"],
  ["7340201", "Tài chính - Ngân hàng", "A00; A01; C01; C02; C03; C04; D01; D07"],
  ["7380107", "Luật kinh tế", "A00; A01; A09; C00; C19; C20; D01; D14"],
  ["7310205", "Quản lý nhà nước", "A00; A01; C00; C03; C04; C14; D01; D14"],
  ["7850103", "Quản lý đất đai", "A04; A06; A07; B02; C04; D10; X01; X21"],
  ["7720115", "Y học cổ truyền", "A01; A05; B00; B02; B03; B04; D07; X10"],
  ["7720201", "Dược học", "A00; A05; A11; B00; B02; B03; D07; X10"],
  ["7720301", "Điều dưỡng", "A01; A05; B00; B02; B03; B04; D07; X10"],
  ["7720601", "Kỹ thuật xét nghiệm y học", "A01; A05; B00; B02; B03; B04; D07; X10"],
  ["7720602", "Kỹ thuật hình ảnh y học", "A01; A05; B00; B02; B03; B04; D07; X10"],
  ["7220204", "Ngôn ngữ Trung Quốc", "C00; D01; D04; D07; D09; D14; D15; D66"],
  ["7220210", "Ngôn ngữ Hàn Quốc", "D01; D07; D09; D10; D14; D15; C00; X78"]
];
function ddbThptScore(code) {
  if (["7720115", "7720201", "7380101", "7380107"].includes(code)) return 20;
  if (["7720301", "7720601", "7720602"].includes(code)) return 18;
  return 15;
}
function ddbHocBaScore(code) {
  if (["7720115", "7720201"].includes(code)) return 22.5;
  if (["7380101", "7380107"].includes(code)) return 21;
  return 18;
}
addSchoolProfile("truong-dai-hoc-thanh-dong", {
  status: "official_verified",
  methods: ["THPT", "Học bạ", "Xét tuyển thẳng"],
  methodsSourceUrl: ddbAdmissionUrl,
  sources: [ddbAdmissionUrl, ddbProgramUrl, ddbCutoffUrl],
  note: "Đã cập nhật 29 ngành, tổ hợp và điểm trúng tuyển 2026 theo thông báo tuyển sinh và công bố điểm của trường.",
  formulas: [
    { method: "THPT", text: "Tổng điểm 03 môn trong tổ hợp + điểm ưu tiên; từ năm 2026 môn Toán hoặc Ngữ văn chiếm tối thiểu 1/3 trọng số tổ hợp.", sourceUrl: ddbAdmissionUrl },
    { method: "Học bạ", text: "Tổng điểm trung bình các môn thuộc tổ hợp xét tuyển trong ba năm lớp 10, 11 và 12 + điểm ưu tiên theo quy định.", sourceUrl: ddbAdmissionUrl }
  ],
  referenceSources: [sourceRecord("Giáo dục Việt Nam", ddbReferenceUrl), sourceRecord("TuyểnSinh247", "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-thanh-dong-DDB.html", false)],
  referenceNote: "Bảng điểm được đối chiếu thêm với bài tổng hợp ngày 11/08/2026 của Giáo dục Việt Nam."
}, ddbPrograms.flatMap(([code, name, combination]) => [
  { code, name, combination, method: "THPT", methodDetails: "Điểm thi tốt nghiệp THPT", score: ddbThptScore(code), sourceUrl: ddbCutoffUrl, formulaText: "Tổng điểm 03 môn trong tổ hợp + điểm ưu tiên; Toán hoặc Ngữ văn chiếm tối thiểu 1/3 trọng số.", formulaId: "ddb-thpt-2026" },
  { code, name, combination, method: "Học bạ", methodDetails: "Kết quả học tập THPT", score: ddbHocBaScore(code), sourceUrl: ddbCutoffUrl, formulaText: "Tổng điểm trung bình các môn thuộc tổ hợp trong ba năm lớp 10, 11 và 12 + điểm ưu tiên.", formulaId: "ddb-hocba-2026" }
]));

const dhvOfficialUrl = "https://tuyensinh.dhv.edu.vn/";
const dhvCutoffUrl = "https://dhv.edu.vn/truong-dai-hoc-hung-vuong-tp-ho-chi-minh-cong-bo-diem-trung-tuyen-dai-hoc-he-chinh-quy-dot-1-nam-2026/";
const dhvReferenceUrl = "https://diemthi.tuyensinh247.com/diem-chuan/dai-hoc-hung-vuong-tphcm-DHV.html";
const dhvPrograms = [
  ["7220201", "Ngôn ngữ Anh", 15], ["7220201O1", "Giảng dạy Tiếng Anh", 15], ["7220204", "Ngôn ngữ Trung Quốc", 15],
  ["7220209", "Ngôn ngữ Nhật", 15], ["7220210", "Ngôn ngữ Hàn Quốc", 15], ["7310106", "Kinh tế quốc tế", 15],
  ["7310401", "Tâm lý học", 20], ["7340101", "Quản trị kinh doanh", 15], ["7340101O1", "Quản trị logistics", 15],
  ["7340115", "Marketing", 15], ["7340115O1", "Truyền thông và Quan hệ công chúng", 15], ["7340122", "Thương mại điện tử", 15],
  ["7340201", "Tài chính - Ngân hàng", 15], ["7340205", "Công nghệ tài chính", 15], ["7340301", "Kế toán", 15],
  ["7380101", "Luật", 20], ["7380107", "Luật kinh tế", 20], ["7480106", "Kỹ thuật máy tính", 15],
  ["7480107", "Trí tuệ nhân tạo", 15], ["7480201", "Công nghệ thông tin", 15], ["7720802", "Quản lý bệnh viện", 15],
  ["7810103", "Quản trị dịch vụ du lịch và lữ hành", 15], ["7810201", "Quản trị khách sạn", 15]
];
addSchoolProfile("truong-dai-hoc-hung-vuong-tphcm", {
  status: "official_verified",
  methods: ["THPT", "Học bạ", "ĐGNL V-ACT", "H-SCA kết hợp học bạ", "Xét bằng trung cấp"],
  methodsSourceUrl: dhvOfficialUrl,
  sources: [dhvOfficialUrl, dhvCutoffUrl],
  note: "Đã cập nhật 23 ngành/chương trình, phương thức và điểm trúng tuyển 2026 theo công bố chính thức của trường.",
  formulas: [
    { method: "THPT", text: "Tổng điểm 03 môn thi tốt nghiệp THPT theo tổ hợp do trường quy định + điểm ưu tiên.", sourceUrl: dhvOfficialUrl },
    { method: "Học bạ", text: "Cách 1: Toán hoặc Ngữ văn + (điểm trung bình cả năm THPT x 2). Cách 2: xét theo tổ hợp môn của ngành.", sourceUrl: dhvOfficialUrl },
    { method: "ĐGNL V-ACT", text: "Dùng kết quả kỳ thi ĐGNL của ĐHQG TP.HCM; ngưỡng nhận hồ sơ dự kiến từ 600 điểm.", sourceUrl: dhvOfficialUrl }
  ],
  referenceSources: [sourceRecord("TuyểnSinh247", dhvReferenceUrl)],
  referenceNote: "Bảng điểm được đối chiếu thêm với trang tổng hợp TuyểnSinh247."
}, dhvPrograms.map(([code, name, score]) => ({
  code, name, combination: "Toán hoặc Ngữ văn + 02 môn theo tổ hợp trường quy định", method: "THPT", methodDetails: "Điểm thi tốt nghiệp THPT", score,
  sourceUrl: dhvCutoffUrl, sourceName: "Trường Đại học Hùng Vương TP.HCM", dataStatus: "verified", cutoffStatus: "verified", formulaText: "Tổng điểm 03 môn thi tốt nghiệp THPT theo tổ hợp + điểm ưu tiên.", formulaId: "dhv-thpt-2026"
})));

const hvaAdmissionUrl = "https://hocvienamnhachue.edu.vn/vi/dao-tao-tuyen-sinh/tuyen-sinh-dao-tao-tuyen-sinh/thong-tin-tuyen-sinh/";
const hvaCutoffUrl = "https://hocvienamnhachue.edu.vn/vi/quyet-dinh-cong-bo-diem-trung-tuyen-ky-thi-tuyen-sinh-dai-hoc-dot-1-tai-hoc-vien-nhac-hue-nam-2026/";
const hvaPrograms = [
  ["7210201", "Âm nhạc học", 21], ["7210203", "Sáng tác âm nhạc", 21], ["7210205", "Thanh nhạc", 20],
  ["7210207", "Biểu diễn nhạc cụ phương Tây", 20], ["7210208", "Piano", 21], ["7210210", "Biểu diễn nhạc cụ truyền thống", 20]
];
addSchoolProfile("hoc-vien-am-nhac-hue", {
  status: "official_verified",
  methods: ["Kết hợp thi năng khiếu và xét Ngữ văn", "Xét tuyển thẳng"],
  methodsSourceUrl: hvaAdmissionUrl,
  sources: [hvaAdmissionUrl, hvaCutoffUrl],
  note: "Đã cập nhật 6 ngành có chỉ tiêu cùng điểm trúng tuyển đợt 1 năm 2026 từ quyết định của Học viện.",
  formulas: [{ method: "Kết hợp", text: "Xét điểm Ngữ văn và kết quả các môn thi năng khiếu/chuyên ngành theo yêu cầu riêng của từng ngành.", sourceUrl: hvaAdmissionUrl }],
  referenceSources: [sourceRecord("TuyểnSinh247", "https://diemthi.tuyensinh247.com/thong-tin-hoc-vien-am-nhac-hue-HVA.html")]
}, hvaPrograms.map(([code, name, score]) => ({
  code, name, combination: "Ngữ văn + môn năng khiếu theo ngành", method: "Kết hợp", methodDetails: "Thi năng khiếu kết hợp xét/thi Ngữ văn", score,
  sourceUrl: hvaCutoffUrl, formulaText: "Điểm Ngữ văn kết hợp điểm thi năng khiếu/chuyên ngành; điều kiện chi tiết theo thông báo của Học viện.", formulaId: "hva-nangkhieu-2026"
})));

function noCutoffPrograms({ id, programs, sourceUrl, methodsSourceUrl = sourceUrl, note, formulaText, codes = [], methods = ["Xét tuyển hồ sơ"] }) {
  addSchoolProfile(id, {
    status: "official_announced",
    methods,
    methodsSourceUrl,
    sources: unique([sourceUrl, methodsSourceUrl]),
    note,
    formulas: [{ method: methods[0], text: formulaText, sourceUrl: methodsSourceUrl }],
    referenceSources: []
  }, programs.map((name, index) => ({
    code: codes[index] || "Không công bố mã riêng", name, combination: "Không dùng tổ hợp cố định", method: methods[0], methodDetails: "Tiêu chí đầu vào riêng của chương trình", score: null,
    sourceUrl, formulaText, formulaId: `${universityById.get(id).code.toLowerCase()}-hoso-2026`
  })));
}

noCutoffPrograms({
  id: "truong-dai-hoc-vinuni",
  sourceUrl: "https://admissions.vinuni.edu.vn/undergraduate/key-dates/",
  methodsSourceUrl: "https://admissions.vinuni.edu.vn/undergraduate/apply-to-vinuni/first-year-applicants/",
  note: "VinUni tuyển sinh 2026-2027 theo quy trình đánh giá hồ sơ toàn diện; trường không công bố một mức điểm chuẩn chung theo thang 30 cho từng chương trình.",
  formulaText: "Đánh giá toàn diện hồ sơ học thuật, thành tích ngoài học thuật, bài luận, thư giới thiệu và mức độ phù hợp với chương trình; điểm số chỉ là một thành phần.",
  programs: [
    "Quản trị kinh doanh - Tài chính", "Quản trị kinh doanh - Marketing", "Quản trị kinh doanh - Quản trị chuỗi cung ứng và vận hành", "Quản trị kinh doanh - Quản trị khách sạn và du lịch", "Quản trị kinh doanh - Khởi nghiệp", "Quản trị kinh doanh - Phân tích kinh doanh",
    "Kỹ thuật điện", "Kỹ thuật cơ khí", "Khoa học máy tính", "Khoa học dữ liệu", "Bác sĩ Y khoa", "Điều dưỡng", "Truyền thông đa phương tiện", "Tâm lý học", "Kinh tế học"
  ]
});

noCutoffPrograms({
  id: "truong-dai-hoc-anh-quoc-viet-nam",
  sourceUrl: "https://www.buv.edu.vn/undergraduate/",
  note: "BUV công bố chương trình và điều kiện nhập học riêng theo đơn vị cấp bằng; không có bảng điểm chuẩn THPT chung theo thang 30.",
  formulaText: "Đối chiếu văn bằng, kết quả học tập và năng lực tiếng Anh theo yêu cầu của từng chương trình và đơn vị cấp bằng.",
  programs: [
    "Kinh doanh số và Đổi mới công nghệ", "Khoa học dữ liệu và Phân tích kinh doanh", "Kế toán và Tài chính", "Kinh doanh và Quản lý", "Kinh tế và Quản lý", "Quản trị kinh doanh quốc tế", "Tài chính", "Digital & Social Media Marketing", "Ngân hàng và Tài chính", "Quản lý Du lịch", "Quản lý Sự kiện", "Tài chính và Kinh tế", "Quản trị Khách sạn quốc tế", "Khoa học máy tính", "Thiết kế và Lập trình trò chơi máy tính", "Nghệ thuật trò chơi", "Khoa học dữ liệu và Trí tuệ nhân tạo", "Kỹ thuật phần mềm", "Khoa học máy tính - Đổi mới trò chơi", "Minh họa và Hoạt hình", "Thiết kế đồ họa", "Thực hành sáng tạo đương đại", "Truyền thông chuyên nghiệp", "Sản xuất phim và truyền thông"
  ]
});

const rmitPrograms = ["Kinh doanh", "Kế toán", "Kinh tế và Tài chính", "Quản trị nguồn nhân lực", "Kinh doanh toàn cầu", "Quản trị", "Logistics và Quản lý chuỗi cung ứng", "Kinh doanh số", "Digital Marketing", "Quản trị Du lịch và Khách sạn", "Thiết kế Truyền thông số", "Nghiên cứu Thiết kế", "Thiết kế Trò chơi", "Phim và Video kỹ thuật số", "Truyền thông chuyên nghiệp", "Kinh doanh Thời trang", "Tâm lý học", "Quản lý Hàng không", "Công nghệ thông tin", "Kỹ thuật phần mềm", "Kỹ thuật Robot và Cơ điện tử", "Kỹ thuật Hệ thống Điện tử và Máy tính", "Công nghệ Thực phẩm và Dinh dưỡng", "Nghiên cứu Quốc tế", "Khoa học Máy tính"];
const rmitCodes = Array(rmitPrograms.length).fill("Theo trang chương trình");
rmitCodes[rmitPrograms.indexOf("Công nghệ thông tin")] = "BP162";
noCutoffPrograms({
  id: "truong-dai-hoc-rmit-viet-nam",
  sourceUrl: "https://www.rmit.edu.vn/study-at-rmit/undergraduate-programs",
  methodsSourceUrl: "https://www.rmit.edu.vn/study-at-rmit/undergraduate-programs/apply-for-undergraduate-programs",
  note: "RMIT Việt Nam công bố hơn 17 chương trình và xét điều kiện học thuật, tiếng Anh theo từng chương trình; không dùng một bảng điểm chuẩn THPT chung.",
  formulaText: "Đối chiếu điều kiện học thuật của chương trình (thường gồm bằng THPT và GPA lớp 12) cùng yêu cầu tiếng Anh; một số chương trình có môn tiên quyết hoặc hồ sơ sáng tạo.",
  programs: rmitPrograms,
  codes: rmitCodes
});

noCutoffPrograms({
  id: "truong-dai-hoc-fulbright-viet-nam",
  sourceUrl: "https://fulbright.edu.vn/vi/nganh-hoc/",
  methodsSourceUrl: "https://fulbright.edu.vn/vi/apply-to-us/",
  note: "Fulbright tuyển khóa 2030 bằng hồ sơ chung; sinh viên khám phá học thuật trước khi chọn ngành vào cuối năm hai nên không có điểm chuẩn theo từng ngành.",
  formulaText: "Hội đồng tuyển sinh đánh giá hồ sơ học thuật, hoạt động và thành tích, thông tin bổ sung và các yêu cầu tiếng Anh; không quy đổi thành một điểm chuẩn ngành thang 30.",
  programs: ["Nghiên cứu Truyền thông và Nghệ thuật", "Kinh tế học", "Văn học", "Lịch sử", "Tâm lý học", "Nghiên cứu Xã hội", "Việt Nam học", "Khoa học Tích hợp", "Khoa học Máy tính", "Toán Ứng dụng", "Kỹ thuật Vị nhân sinh"]
});

const explicitBranchSources = [
  { target: "phan-hieu-truong-dai-hoc-y-ha-noi-tai-thanh-hoa", parent: "truong-dai-hoc-y-ha-noi", pattern: /thanh hóa/i },
  { target: "phan-hieu-truong-dai-hoc-luat-ha-noi-tai-dak-lak", parent: "truong-dai-hoc-luat-ha-noi", pattern: /đắk lắk/i },
  { target: "phan-hieu-truong-dai-hoc-ngoai-thuong-tai-quang-ninh", parent: "truong-dai-hoc-ngoai-thuong", pattern: /quảng ninh/i },
  { target: "phan-hieu-dai-hoc-thai-nguyen-tai-ha-giang", parent: null, pattern: /hà giang/i },
  { target: "phan-hieu-dai-hoc-can-tho-tai-hau-giang", parent: "truong-dai-hoc-can-tho", pattern: /hậu giang/i },
  { target: "phan-hieu-dai-hoc-can-tho-tai-soc-trang", parent: "truong-dai-hoc-can-tho", pattern: /sóc trăng/i },
  { target: "phan-hieu-truong-dai-hoc-nong-lam-tphcm-tai-ninh-thuan", parent: "truong-dai-hoc-nong-lam-tp-hcm", pattern: /ninh thuận/i },
  { target: "phan-hieu-truong-dai-hoc-cong-nghiep-tphcm-tai-quang-ngai", parent: "truong-dai-hoc-cong-nghiep-tp-hcm", pattern: /quảng ngãi/i }
];

const retainedMajors = currentMajors.filter((major) => major.importTag !== IMPORT_TAG);
const branchRows = [];
for (const config of explicitBranchSources) {
  const target = universityById.get(config.target);
  if (!target) continue;
  const matches = retainedMajors.filter((major) => (!config.parent || major.universityId === config.parent) && config.pattern.test(`${major.name} ${major.methodDetails || ""} ${major.cutoff?.method || ""}`));
  matches.forEach((major, index) => branchRows.push({ ...major, id: `${config.target}-${IMPORT_TAG}-branch-${index + 1}`, universityId: config.target, importTag: IMPORT_TAG }));
  if (matches.length) {
    target.formulas = unique([...(target.formulas || []), ...matches.map((major) => major.formula)]);
    target.methods = unique([...(target.methods || []), ...matches.map((major) => major.method)]);
    target.dataCheckedAt = CHECKED_AT;
    target.parentUniversityId = config.parent || "dai-hoc-thai-nguyen";
    target.admissions = {
      ...(target.admissions || {}), status: matches.some((major) => major.cutoff?.status === "verified") ? "official_verified" : "reference_2026",
      methods: unique(matches.map((major) => major.method)), methodsSourceUrl: matches[0].sourceUrl,
      sources: unique(matches.map((major) => major.sourceUrl)),
      note: `Đã tách ${matches.length} dòng ngành/phương thức có ghi rõ địa điểm đào tạo tại phân hiệu từ bảng 2026 của đơn vị chủ quản.`,
      referenceSources: []
    };
  }
}

const memberSystems = {
  "dai-hoc-quoc-gia-ha-noi": "Đại học hệ thống; tuyển sinh đại học được công bố tại các trường và đơn vị thành viên trong danh sách.",
  "dai-hoc-quoc-gia-tp-hcm": "Đại học hệ thống; tuyển sinh đại học được công bố tại các trường và đơn vị thành viên trong danh sách.",
  "dai-hoc-thai-nguyen": "Đại học vùng; ngành và điểm được công bố theo từng trường, khoa và phân hiệu thành viên.",
  "dai-hoc-hue": "Đại học vùng; ngành và điểm được công bố theo từng trường, khoa và phân hiệu thành viên.",
  "dai-hoc-da-nang": "Đại học vùng; ngành và điểm được công bố theo từng trường và đơn vị đào tạo thành viên."
};
for (const [id, note] of Object.entries(memberSystems)) {
  const university = universityById.get(id);
  if (!university) continue;
  university.dataCheckedAt = CHECKED_AT;
  university.admissions = { ...(university.admissions || {}), status: "member_units", methods: [], methodsSourceUrl: university.website, sources: [university.website], note, referenceSources: [] };
}

const linkedBranches = {
  "phan-hieu-dhqg-tphcm-tai-ben-tre": "dai-hoc-quoc-gia-tp-hcm",
  "phan-hieu-dai-hoc-kinh-te-tphcm-tai-vinh-long": "truong-dai-hoc-kinh-te-tp-hcm",
  "phan-hieu-truong-dai-hoc-nong-lam-tphcm-tai-gia-lai": "truong-dai-hoc-nong-lam-tp-hcm",
  "phan-hieu-truong-dai-hoc-lam-nghiep-tai-gia-lai": "truong-dai-hoc-lam-nghiep",
  "phan-hieu-truong-dai-hoc-kien-truc-tphcm-tai-can-tho": "truong-dai-hoc-kien-truc-tp-hcm",
  "phan-hieu-truong-dai-hoc-kien-truc-tphcm-tai-da-lat": "truong-dai-hoc-kien-truc-tp-hcm",
  "phan-hieu-truong-dai-hoc-xay-dung-mien-trung-tai-da-nang": "truong-dai-hoc-xay-dung-mien-trung",
  "phan-hieu-truong-dai-hoc-binh-duong-tai-ca-mau": "truong-dai-hoc-binh-duong",
  "phan-hieu-hoc-vien-ngan-hang-tai-bac-ninh": "hoc-vien-ngan-hang",
  "phan-hieu-truong-dai-hoc-lao-dong-xa-hoi-co-so-son-tay": "truong-dai-hoc-lao-dong-xa-hoi",
  "phan-hieu-truong-dai-hoc-tai-chinh-ke-toan-tai-thua-thien-hue": "truong-dai-hoc-tai-chinh-ke-toan",
  "phan-hieu-hoc-vien-phu-nu-viet-nam-tai-tphcm": "hoc-vien-phu-nu-viet-nam",
  "phan-hieu-hoc-vien-thanh-thieu-nien-viet-nam-tai-tphcm": "hoc-vien-thanh-thieu-nien-viet-nam",
  "phan-hieu-hoc-vien-hanh-chinh-quoc-gia-tai-quang-nam": "hoc-vien-hanh-chinh-quoc-gia",
  "phan-hieu-hoc-vien-hanh-chinh-quoc-gia-tai-tay-nguyen": "hoc-vien-hanh-chinh-quoc-gia"
};
for (const [id, parentId] of Object.entries(linkedBranches)) {
  const university = universityById.get(id);
  const parent = universityById.get(parentId);
  if (!university || !parent) continue;
  university.parentUniversityId = parentId;
  university.dataCheckedAt = CHECKED_AT;
  university.admissions = {
    ...(university.admissions || {}), status: "parent_linked", methods: [], methodsSourceUrl: university.website,
    sources: unique([university.website, parent.website]),
    note: `Hồ sơ thuộc ${parent.name}. Chưa tìm thấy bảng điểm 2026 tách riêng cho cơ sở này; xem nguồn của phân hiệu và hồ sơ trường chủ quản để tránh dùng nhầm điểm của cơ sở khác.`,
    referenceSources: []
  };
}

const specialProfiles = {
  "hoc-vien-mua-viet-nam": ["special_admissions", "Tuyển sinh nghệ thuật theo kỳ thi và yêu cầu năng khiếu riêng; hồ sơ 2026 cần theo thông báo trực tiếp của Học viện."],
  "hoc-vien-chinh-tri-quoc-gia-ho-chi-minh": ["not_general_undergraduate", "Cơ sở đào tạo, bồi dưỡng cán bộ lãnh đạo và lý luận chính trị; không có bảng tuyển sinh đại học chính quy từ THPT độc lập để tra cứu như trường đại học thông thường."],
  "hoc-vien-khoa-hoc-va-cong-nghe": ["graduate_only", "Cơ sở tập trung đào tạo sau đại học; không có danh mục tuyển sinh cử nhân từ kết quả THPT năm 2026."],
  "hoc-vien-khoa-hoc-xa-hoi": ["graduate_only", "Cơ sở tập trung đào tạo sau đại học; không có danh mục tuyển sinh cử nhân từ kết quả THPT năm 2026."],
  "hoc-vien-quoc-phong": ["special_admissions", "Tuyển sinh, đào tạo theo đối tượng và quy định riêng của Bộ Quốc phòng; không có bảng ngành đại học dân sự dùng chung cho thí sinh THPT."],
  "hoc-vien-chinh-tri-bo-quoc-phong": ["special_admissions", "Tuyển sinh quân sự theo sơ tuyển và quy định riêng của Bộ Quốc phòng; cần theo thông báo tuyển sinh quân sự chính thức."],
  "hoc-vien-luc-quan": ["special_admissions", "Tuyển sinh quân sự theo sơ tuyển và quy định riêng; không dùng hồ sơ xét tuyển dân sự thông thường."],
  "hoc-vien-phat-giao-viet-nam-tai-ha-noi": ["special_admissions", "Tuyển sinh Phật học theo điều kiện tôn giáo và hồ sơ riêng của Học viện."],
  "hoc-vien-phat-giao-viet-nam-tai-tphcm": ["special_admissions", "Tuyển sinh Phật học theo điều kiện tôn giáo và hồ sơ riêng của Học viện."],
  "hoc-vien-phat-giao-viet-nam-tai-hue": ["special_admissions", "Tuyển sinh Phật học theo điều kiện tôn giáo và hồ sơ riêng của Học viện."],
  "hoc-vien-phat-giao-nam-tong-khmer-can-tho": ["special_admissions", "Tuyển sinh Phật học theo điều kiện tôn giáo và hồ sơ riêng của Học viện."]
};
for (const [id, [status, note]] of Object.entries(specialProfiles)) {
  const university = universityById.get(id);
  if (!university) continue;
  university.dataCheckedAt = CHECKED_AT;
  university.admissions = { ...(university.admissions || {}), status, methods: [], methodsSourceUrl: university.website, sources: [university.website], note, referenceSources: [] };
}

const majors = [...retainedMajors, ...curated, ...branchRows];
const majorsByUniversity = new Map();
for (const major of majors) majorsByUniversity.set(major.universityId, (majorsByUniversity.get(major.universityId) || 0) + 1);
const emptyProfiles = universities.filter((university) => !majorsByUniversity.get(university.id));
const unresolved = emptyProfiles.filter((university) => !university.admissions?.status || university.admissions.status === "updating");
const report = {
  checkedAt: CHECKED_AT,
  curatedUniversities: new Set(curated.map((major) => major.universityId)).size,
  curatedRows: curated.length,
  branchUniversitiesWithExplicitRows: new Set(branchRows.map((major) => major.universityId)).size,
  branchRows: branchRows.length,
  totalMajorsAfterImport: majors.length,
  profilesWithRows: universities.length - emptyProfiles.length,
  profilesWithoutRowsButClassified: emptyProfiles.length - unresolved.length,
  unresolvedEmptyProfiles: unresolved.map((university) => ({ id: university.id, code: university.code, name: university.name }))
};

if (shouldWrite) {
  await Promise.all([
    writeFile(join(root, "data", "majors.json"), `${JSON.stringify(majors, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "universities.json"), `${JSON.stringify(universities, null, 2)}\n`, "utf8"),
    writeFile(join(root, "data", "external-profile-report-2026.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  ]);
}

console.log(JSON.stringify({ mode: shouldWrite ? "write" : "audit", ...report }, null, 2));
