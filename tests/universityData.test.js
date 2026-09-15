import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formulaRegistry } from "../formulas/index.js";

const loadJson = async (file) => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url), "utf8"));

test("dữ liệu trường có đủ ba miền và không công bố điểm 2026 thiếu nguồn", async () => {
  const [universities, majors] = await Promise.all([loadJson("universities.json"), loadJson("majors.json")]);
  const universityIds = new Set(universities.map((university) => university.id));
  const majorIds = new Set();

  assert.deepEqual(new Set(universities.map((university) => university.region)), new Set(["north", "central", "south"]));
  for (const university of universities) {
    for (const formulaId of university.formulas) assert.ok(formulaRegistry.has(formulaId), `${university.id} thiếu công thức ${formulaId}`);
  }
  for (const major of majors) {
    assert.ok(!majorIds.has(major.id), `${major.id} bị trùng mã bản ghi`);
    majorIds.add(major.id);
    assert.ok(universityIds.has(major.universityId), `${major.id} chưa có trường chủ quản`);
    assert.equal(major.cutoff?.year, 2026, `${major.id} thiếu trạng thái điểm chuẩn 2026`);
    if (["verified", "reference"].includes(major.cutoff?.status)) {
      assert.ok(Number.isFinite(major.cutoff.score), `${major.id} có điểm chuẩn không hợp lệ`);
      assert.ok(Number.isFinite(major.cutoff.scale), `${major.id} thiếu thang điểm`);
      assert.ok(major.cutoff.score <= major.cutoff.scale, `${major.id} vượt thang điểm`);
      assert.match(major.cutoff.sourceUrl, /^https?:\/\//, `${major.id} thiếu nguồn điểm chuẩn`);
    } else {
      assert.equal(major.cutoff?.score, null, `${major.id} đang hiển thị điểm chưa xác minh`);
    }
    assert.ok(formulaRegistry.has(major.formula), `${major.id} thiếu công thức ${major.formula}`);
    if (major.calculationVerified) {
      assert.ok(universities.find((university) => university.id === major.universityId)?.formulas.includes(major.formula), `${major.id} chưa được liên kết công thức của trường`);
      assert.match(major.formulaSourceUrl, /^https?:\/\//, `${major.id} thiếu nguồn công thức`);
    }
  }
  assert.ok(majors.some((major) => major.dataStatus === "verified"), "thiếu ngành đã xác minh");
  assert.ok(majors.some((major) => major.dataStatus === "reference"), "thiếu ngành từ nguồn tham khảo");
  assert.equal(majors.filter((major) => major.cutoff?.status === "unverified").length, 0, "vẫn còn điểm chuẩn ở trạng thái chưa xác minh");
});

test("logo trường chỉ được đánh dấu xác minh khi tệp cục bộ tồn tại", async () => {
  const universities = await loadJson("universities.json");
  for (const university of universities) {
    assert.ok(["verified", "clear_local", "updating"].includes(university.logoStatus), `${university.id} thiếu trạng thái logo`);
    if (university.logoStatus !== "updating") {
      const relative = `../public/${university.logo.replace(/^\.\//, "")}`;
      await assert.doesNotReject(() => readFile(new URL(relative, import.meta.url)), `${university.id} thiếu tệp logo public`);
    }
  }
});

test("logo đang hiển thị có định dạng thật khớp phần mở rộng và bản public tồn tại", async () => {
  const universities = await loadJson("universities.json");
  const typeOf = (bytes) => {
    if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
    if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
    if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return ".ico";
    if (bytes.subarray(0, 500).toString("utf8").includes("<svg")) return ".svg";
    return "unknown";
  };
  for (const university of universities.filter((item) => item.logoStatus !== "updating")) {
    const publicCopy = await readFile(new URL(`../public/${university.logo.replace(/^\.\//, "")}`, import.meta.url));
    const expected = university.logo.toLowerCase().endsWith(".jpeg") ? ".jpg" : university.logo.slice(university.logo.lastIndexOf(".")).toLowerCase();
    assert.equal(typeOf(publicCopy), expected, `${university.code} có phần mở rộng logo public sai`);
  }
});

test("hồ sơ bổ sung có đủ dữ liệu đại diện và mọi hồ sơ trống đều được phân loại", async () => {
  const [universities, majors] = await Promise.all([loadJson("universities.json"), loadJson("majors.json")]);
  const majorsByUniversity = new Map();
  for (const major of majors) {
    const rows = majorsByUniversity.get(major.universityId) || [];
    rows.push(major);
    majorsByUniversity.set(major.universityId, rows);
  }

  const classifiedEmptyStatuses = new Set(["member_units", "parent_linked", "special_admissions", "graduate_only", "not_general_undergraduate"]);
  for (const university of universities.filter((item) => !majorsByUniversity.has(item.id))) {
    assert.ok(classifiedEmptyStatuses.has(university.admissions?.status), `${university.code} vẫn là hồ sơ trống chưa được phân loại`);
    assert.ok(university.admissions?.note, `${university.code} thiếu giải thích trạng thái hồ sơ`);
  }

  const findRow = (universityId, code, method) => majors.find((major) => major.universityId === universityId && major.code === code && major.method === method);
  assert.equal(findRow("truong-dai-hoc-quan-ly-va-cong-nghe-hai-phong", "7480201", "THPT")?.cutoff.score, 16);
  assert.equal(findRow("truong-dai-hoc-quan-ly-va-cong-nghe-hai-phong", "7480201", "Học bạ")?.cutoff.score, 19.67);
  assert.equal(findRow("truong-dai-hoc-thanh-dong", "7720115", "THPT")?.cutoff.score, 20);
  assert.equal(findRow("truong-dai-hoc-thanh-dong", "7720115", "Học bạ")?.cutoff.score, 22.5);
  assert.equal(new Set((majorsByUniversity.get("truong-dai-hoc-thanh-dong") || []).map((major) => `${major.code}|${major.name}`)).size, 29);
  assert.equal(findRow("truong-dai-hoc-hung-vuong-tphcm", "7310401", "THPT")?.cutoff.status, "verified");
  assert.equal(findRow("truong-dai-hoc-hung-vuong-tphcm", "7310401", "THPT")?.cutoff.score, 20);
  assert.equal(findRow("hoc-vien-am-nhac-hue", "7210208", "Kết hợp")?.cutoff.score, 21);

  const explicitBranchIds = [
    "phan-hieu-truong-dai-hoc-y-ha-noi-tai-thanh-hoa",
    "phan-hieu-truong-dai-hoc-luat-ha-noi-tai-dak-lak",
    "phan-hieu-truong-dai-hoc-ngoai-thuong-tai-quang-ninh",
    "phan-hieu-dai-hoc-thai-nguyen-tai-ha-giang",
    "phan-hieu-dai-hoc-can-tho-tai-hau-giang",
    "phan-hieu-dai-hoc-can-tho-tai-soc-trang",
    "phan-hieu-truong-dai-hoc-nong-lam-tphcm-tai-ninh-thuan",
    "phan-hieu-truong-dai-hoc-cong-nghiep-tphcm-tai-quang-ngai"
  ];
  for (const id of explicitBranchIds) {
    const rows = majorsByUniversity.get(id) || [];
    assert.ok(rows.length > 0, `${id} thiếu dòng ngành ghi rõ địa điểm phân hiệu`);
    assert.ok(rows.every((major) => ["curated-external-profile-2026", "remaining-profiles-2026"].includes(major.importTag)), `${id} có dòng phân hiệu chưa truy vết được nguồn nhập`);
  }
});

test("các bảng điểm chính thức bổ sung năm 2026 có đủ ngành, phương thức và nguồn", async () => {
  const [universities, majors] = await Promise.all([loadJson("universities.json"), loadJson("majors.json")]);
  const universityId = (code) => universities.find((item) => item.code === code)?.id;
  const rows = (code) => majors.filter((major) => major.universityId === universityId(code));
  const find = (code, majorCode, method) => rows(code).find((major) => major.code === majorCode && major.method === method);

  assert.equal(rows("FPT").length, 8);
  assert.match(find("FPT", "7480201", "Xét tuyển kết hợp")?.formulaText || "", /ĐXT = ĐKH \+ ĐKK \+ ĐƯT/);

  assert.equal(find("BVU", "7720201", "THPT")?.cutoff.score, 20);
  assert.equal(find("BVU", "7480201", "THPT")?.cutoff.score, 15);
  assert.equal(find("DKT", "7140201", "THPT")?.cutoff.score, 24.63);
  assert.equal(find("DKT", "51140201", "THPT")?.cutoff.score, 23);
  assert.equal(find("DQN", "7140209", "THPT")?.cutoff.score, 25.5);
  assert.equal(rows("DQN").length, 56);
  assert.ok(rows("DQN").every((major) => major.cutoff.status === "verified"));

  assert.equal(rows("DSG").length, 100);
  assert.equal(find("DSG", "7380107", "THPT")?.cutoff.score, 20);
  assert.equal(find("DSG", "7380107", "ĐGNL V-ACT")?.cutoff.score, 720);

  assert.equal(rows("UMT").length, 50);
  assert.equal(find("UMT", "7480201", "V-SAT")?.cutoff.score, 225);
  assert.equal(find("UMT", "7480201", "V-SAT")?.cutoff.scale, 450);

  assert.equal(rows("DTP").length, 12);
  assert.equal(find("DTP", "7140202", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 23.75);
  assert.equal(find("DTP", "7220204", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 21.8);
  assert.equal(find("DTP", "7640101", "Điểm trúng tuyển sau quy đổi")?.combination, "B03; C01; C02; D01; D04");
  assert.equal(find("DTP", "7480201", "Điểm trúng tuyển sau quy đổi")?.combination, "A00; A01; D01; D04; D07; X06; X26");

  assert.equal(rows("BMU").length, 28);
  assert.equal(find("BMU", "7720101", "THPT")?.cutoff.score, 22);
  assert.equal(find("BMU", "7720101", "Học bạ")?.cutoff.score, 24.37);
  assert.equal(find("BMU", "7720101", "ĐGNL V-ACT")?.cutoff.score, 738);
  assert.equal(find("BMU", "7720101", "ĐGNL HSA")?.cutoff.score, 75);

  assert.equal(rows("SKV").length, 42);
  assert.equal(find("SKV", "7510303", "THPT")?.cutoff.score, 22.5);
  assert.equal(find("SKV", "7510303", "Học bạ")?.cutoff.score, 24.5);
  assert.equal(find("SKV", "7510303", "ĐGNL HSA/SPT quy đổi")?.cutoff.score, 18.03);

  assert.equal(rows("UKH").length, 63);
  assert.equal(find("UKH", "7140209", "THPT")?.cutoff.score, 24.88);
  assert.equal(find("UKH", "7140209", "Học bạ")?.cutoff.score, 30);
  assert.equal(find("UKH", "7140209", "ĐGNL V-ACT")?.cutoff.score, 887);

  assert.equal(rows("SKN").length, 16);
  assert.equal(find("SKN", "7480101", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 25);
  assert.equal(find("SKN", "75103012", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 22);

  assert.equal(rows("DTV").length, 22);
  assert.equal(find("DTV", "7720115", "THPT")?.cutoff.score, 20);
  assert.equal(find("DTV", "7720115", "Học bạ")?.cutoff.score, 22);
  assert.equal(find("DTV", "7720603", "Học bạ")?.cutoff.score, 20);

  assert.equal(rows("TLS").length, 40);
  assert.equal(find("TLS", "TLS407", "THPT")?.cutoff.score, 21.5);
  assert.equal(find("TLS", "TLS407", "Kết hợp học bạ")?.cutoff.score, 24.6);
  assert.match(find("TLS", "TLS203", "Kết hợp học bạ")?.formulaText || "", /× 3\/5/);

  assert.equal(rows("INU").length, 70);
  assert.equal(find("INU", "7380107", "THPT")?.cutoff.score, 20);
  assert.equal(find("INU", "7380107", "ĐGNL HSA")?.cutoff.score, 70);
  assert.equal(find("INU", "7340101", "ĐGNL V-ACT")?.cutoff.score, 480);
  assert.equal(find("INU", "7340101", "ĐGTD TSA")?.cutoff.score, 37.01);

  assert.equal(rows("VCA").length, 2);
  assert.equal(find("VCA", "7380101", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 22.69);
  assert.deepEqual(rows("VCA").map((major) => major.cutoff.score).sort(), [21.48, 22.69]);

  assert.equal(rows("HVC").length, 15);
  assert.equal(find("HVC", "7380101", "THPT")?.cutoff.score, 24.8);
  assert.equal(find("HVC", "7380101", "Học bạ")?.cutoff.score, 26.84);
  assert.equal(find("HVC", "7380101", "ĐGNL V-ACT")?.cutoff.score, 937);
  assert.match(find("HVC", "7310205", "ĐGNL V-ACT")?.formulaText || "", /30\/1200/);

  assert.equal(rows("DHE").length, 24);
  const dheChip = rows("DHE").filter((major) => major.name.includes("vi mạch"));
  assert.equal(dheChip.find((major) => major.method === "THPT/Kết hợp")?.cutoff.score, 23);
  assert.equal(dheChip.find((major) => major.method === "Học bạ/Kết hợp")?.cutoff.score, 24.36);
  assert.equal(dheChip.find((major) => major.method === "ĐGNL V-ACT")?.cutoff.score, 800);
  assert.match(dheChip.find((major) => major.method === "THPT/Kết hợp")?.methodDetails || "", /7,5/);

  assert.equal(rows("DHI").length, 9);
  assert.equal(find("DHI", "7310206", "THPT")?.cutoff.score, 18.5);
  assert.equal(find("DHI", "7320104", "Học bạ")?.cutoff.score, 24.81);
  assert.equal(find("DHI", "7850102", "Kết hợp")?.cutoff.score, 16.5);
  assert.match(find("DHI", "7850102", "Kết hợp")?.formulaText || "", /chứng chỉ ngoại ngữ/);

  assert.equal(rows("DDV").length, 8);
  assert.equal(find("DDV", "7340120", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 15.1);
  assert.equal(find("DDV", "7420201", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 16);
  assert.equal(find("DDV", "7480101SE", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 15.3);
  assert.match(find("DDV", "7480101SE", "Điểm trúng tuyển sau quy đổi")?.formulaText || "", /quy đổi tương đương/);

  assert.equal(rows("THP").length, 42);
  assert.equal(find("THP", "714023101", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 25.75);
  assert.equal(find("THP", "731010104", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 23.25);
  assert.equal(find("THP", "748020120", "Điểm trúng tuyển sau quy đổi")?.cutoff.status, "not_published");
  assert.equal(rows("THP").filter((major) => major.cutoff.status === "verified").length, 36);
  assert.equal(rows("THP").filter((major) => major.cutoff.status === "not_published").length, 6);
  assert.ok(rows("THP").every((major) => major.code !== "Chưa xác minh" && major.formulaText));

  assert.equal(rows("DQB").length, 124);
  assert.equal(find("DQB", "7140201", "THPT")?.cutoff.score, 22.35);
  assert.equal(rows("DQB").find((major) => major.code === "7140249" && major.combination === "C03")?.cutoff.score, 24.2);
  assert.equal(rows("DQB").filter((major) => major.cutoff.status === "verified").length, 107);
  assert.equal(rows("DQB").filter((major) => major.cutoff.status === "not_published").length, 17);
  assert.ok(rows("DQB").every((major) => major.code !== "Chưa xác minh" && major.combination !== "Chưa xác minh"));

  assert.equal(new Set(rows("DAD").map((major) => `${major.code}|${major.name}`)).size, 42);
  assert.ok(rows("DAD").every((major) => major.cutoff.status === "verified"));
  assert.equal(find("DAD", "7720101", "THPT")?.cutoff.score, 22);
  assert.equal(find("DAD", "7720201", "Học bạ")?.cutoff.score, 22.07);
  assert.equal(rows("DAD").find((major) => major.code === "7720301" && major.method === "ĐGNL V-ACT" && major.combination === "B00")?.cutoff.score, 588);
  assert.equal(find("DAD", "7340115", "THPT")?.name, "Marketing");

  assert.equal(rows("HCH").length, 22);
  assert.equal(find("HCH", "73444HN", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 24.1);
  assert.equal(find("HCH", "748141HN", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 21.05);
  assert.equal(rows("HCS").length, 9);
  assert.equal(find("HCS", "73811HCM", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 22.9);
  assert.equal(rows("HCQ").length, 7);
  assert.equal(find("HCQ", "73811DN", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 21);
  assert.equal(rows("HCTN").length, 4);
  assert.equal(find("HCTN", "73111DL", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 15.5);
  for (const code of ["HCH", "HCS", "HCQ", "HCTN"]) assert.ok(rows(code).every((major) => major.cutoff.status === "verified"));

  assert.equal(rows("TKG").length, 120);
  assert.equal(find("TKG", "7140209", "THPT")?.cutoff.score, 28.55);
  assert.equal(find("TKG", "7140202", "Học bạ")?.cutoff.score, 27.45);
  assert.equal(find("TKG", "7140231", "ĐGNL V-ACT")?.cutoff.score, 1017);
  assert.equal(find("TKG", "7380101", "V-SAT")?.cutoff.score, 285);
  assert.equal(find("TKG", "7140247", "THPT")?.cutoff.status, "not_published");
  assert.equal(rows("TKG").filter((major) => major.cutoff.status === "verified").length, 108);
  assert.equal(rows("TKG").filter((major) => major.cutoff.status === "not_published").length, 12);

  assert.equal(rows("DDU").length, 17);
  assert.equal(find("DDU", "7380107", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 20);
  assert.equal(find("DDU", "7720301", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 18);
  assert.ok(rows("DDU").every((major) => major.cutoff.status === "verified"));

  assert.equal(rows("DVB").length, 22);
  assert.equal(find("DVB", "A1LU", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 20);
  assert.equal(find("DVB", "A1IC", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 15);
  assert.equal(universities.find((item) => item.code === "DVB")?.name, "Trường Đại học Kinh tế - Công nghệ Thái Nguyên");
  assert.ok(rows("DVB").every((major) => major.cutoff.status === "verified"));

  assert.equal(rows("FBU").length, 12);
  assert.equal(find("FBU", "FB16", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 21.5);
  assert.equal(find("FBU", "7340301", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 21);
  assert.equal(find("FBU", "DDP2", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 18);
  assert.ok(rows("FBU").every((major) => major.cutoff.status === "verified"));

  assert.equal(rows("MIT").length, 117);
  assert.equal(find("MIT", "7220204", "THPT")?.cutoff.status, "not_published");
  assert.equal(find("MIT", "7220204", "Học bạ")?.cutoff.score, null);
  assert.ok(rows("MIT").every((major) => major.code !== "Chưa xác minh" && major.combination !== "Chưa xác minh"));
  assert.ok(rows("MIT").every((major) => major.formulaText && major.cutoff.status === "not_published"));

  assert.equal(rows("NQH").length, 9);
  assert.equal(rows("NQH").find((major) => major.code === "7220201" && major.name.includes("Nữ") && major.name.includes("quân sự"))?.cutoff.score, 29.76);
  assert.equal(rows("NQH").find((major) => major.code === "7860231" && major.name.includes("phía Nam"))?.cutoff.score, 26.03);
  assert.equal(rows("NQH").find((major) => major.code === "7220204")?.cutoff.score, 21.5);

  assert.equal(rows("HEH").length, 5);
  assert.equal(rows("HEH").find((major) => major.code === "7860218" && major.name.includes("miền Bắc"))?.cutoff.score, 26.98);
  assert.equal(rows("HEH").find((major) => major.code === "7340201")?.cutoff.score, 16);

  assert.equal(rows("TQU").length, 19);
  assert.equal(find("TQU", "7140217", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 27.34);
  assert.equal(find("TQU", "7310201", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 21);

  assert.equal(rows("GSA").length, 87);
  assert.equal(find("GSA", "GSA08", "THPT")?.cutoff.score, 25.45);
  assert.equal(find("GSA", "GSA08", "ĐGNL V-ACT")?.cutoff.score, 915.64);
  assert.equal(find("GSA", "GSA03", "THPT + Học bạ")?.cutoff.status, "not_published");
  assert.equal(rows("GSA").filter((major) => major.cutoff.status === "verified").length, 79);
  assert.equal(rows("GSA").filter((major) => major.cutoff.status === "not_published").length, 8);

  assert.equal(rows("NHP").length, 5);
  assert.equal(find("NHP", "ACT02", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 15);
  assert.equal(find("NHP", "BANK02", "Điểm trúng tuyển sau quy đổi")?.nationalMajorCode, "7340201");
  assert.ok(rows("NHP").every((major) => major.combination === "A00; A01; D01; D07; Q00" && major.cutoff.status === "verified"));

  assert.equal(rows("HVD").length, 1);
  assert.equal(find("HVD", "7310101", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 15);
  assert.match(find("HVD", "7310101", "Điểm trúng tuyển sau quy đổi")?.combination || "", /C00/);

  assert.equal(rows("THU").length, 16);
  assert.equal(find("THU", "7720301", "THPT")?.cutoff.status, "not_published");
  assert.match(find("THU", "7720603", "ĐGNL HSA")?.formulaText || "", /75\/150/);
  assert.ok(rows("THU").every((major) => major.code !== "Chưa xác minh" && major.combination !== "Chưa xác minh"));

  assert.equal(rows("UFA").length, 0);
  const ufaProfile = universities.find((item) => item.code === "UFA");
  assert.equal(ufaProfile?.admissions?.status, "parent_linked");
  assert.equal(ufaProfile?.parentUniversityId, universityId("DMS"));
  assert.match(ufaProfile?.name || "", /Phân hiệu.*Tài chính - Marketing.*Quảng Ngãi/);

  assert.ok(rows("BKA").every((major) => major.cutoff.status !== "unverified"));
  assert.ok(rows("DLX").every((major) => major.cutoff.status !== "unverified"));

  assert.equal(rows("DDA").length, 204);
  assert.equal(rows("UKB").length, 35);
  assert.equal(rows("DBH").length, 16);
  assert.equal(rows("DFA").length, 21);
  assert.equal(rows("DVX").length, 14);
  assert.equal(rows("DDG").length, 1);
  for (const code of ["DDA", "UKB", "DBH", "DFA", "DVX", "DDG"]) {
    assert.ok(rows(code).every((major) => major.cutoff.status === "not_published"));
    assert.ok(rows(code).every((major) => major.code && major.code !== "Chưa xác minh"));
    assert.ok(rows(code).every((major) => major.combination && major.combination !== "Chưa xác minh"));
    assert.ok(rows(code).every((major) => major.formulaText));
  }
  assert.equal(find("DBH", "7520207", "THPT")?.name, "Kỹ thuật điện tử - viễn thông");
  assert.match(find("DFA", "7340301", "Xét tuyển kết hợp")?.formulaText || "", /điểm Toán cao nhất/);

  assert.equal(rows("SKD").length, 29);
  assert.equal(rows("SKD").filter((major) => major.cutoff.status === "verified").length, 25);
  assert.equal(rows("SKD").filter((major) => major.cutoff.status === "not_published").length, 4);
  assert.equal(rows("SKD").find((major) => major.code === "7210227B")?.cutoff.score, 20.75);
  assert.equal(rows("SKD").find((major) => major.code === "7210302A")?.combination, "S01");
  assert.match(rows("SKD")[0]?.formulaText || "", /hệ số 2/);

  assert.equal(rows("NVH").length, 8);
  assert.ok(rows("NVH").every((major) => major.cutoff.status === "verified"));
  assert.equal(rows("NVH").find((major) => major.code === "7210209")?.cutoff.score, 21.89);
  assert.equal(rows("NVH").find((major) => major.code === "7210203")?.cutoff.score, 24.56);
  assert.match(rows("NVH")[0]?.formulaText || "", /3\/4/);

  assert.equal(rows("NVS").length, 25);
  assert.equal(rows("NVS").filter((major) => major.cutoff.status === "verified").length, 24);
  assert.equal(rows("NVS").filter((major) => major.cutoff.status === "not_published").length, 1);
  assert.equal(rows("NVS").find((major) => major.name.includes("Harp"))?.cutoff.score, 19.5);
  assert.equal(rows("NVS").find((major) => major.name.includes("Thanh nhạc nhẹ"))?.cutoff.score, 21);
  assert.match(rows("NVS")[0]?.formulaText || "", /2 × điểm Chuyên môn/);

  assert.equal(rows("ZNH").length, 11);
  assert.equal(rows("ZNH").find((major) => major.code === "7210207")?.cutoff.score, 22.52);
  assert.equal(rows("ZNH").find((major) => major.code === "7320101")?.cutoff.score, 24.4);
  assert.equal(rows("ZNH").filter((major) => major.nationalMajorCode === "7210244").length, 2);
  assert.ok(rows("ZNH").every((major) => major.cutoff.status === "verified"));

  assert.equal(rows("DSD").length, 4);
  assert.equal(rows("DSD").find((major) => major.code === "7210234")?.cutoff.score, 22.75);
  assert.equal(rows("DSD").find((major) => major.code === "7210236")?.cutoff.scale, 40);
  assert.match(rows("DSD")[0]?.formulaText || "", /2 × điểm Năng khiếu/);
  assert.ok(rows("DSD").every((major) => major.cutoff.status === "verified"));

  const placeholderCombination = /chưa xác minh|theo tổ hợp xét tuyển trong thông tin tuyển sinh|theo tổ hợp chính thức của chương trình|áp dụng cho tất cả tổ hợp xét tuyển của ngành/i;
  assert.ok(majors.every((major) => major.combination?.trim() && !placeholderCombination.test(major.combination)), "vẫn còn dòng ngành thiếu tổ hợp cụ thể");
  assert.ok(majors.every((major) => major.code?.trim() && !/chưa công bố|chưa xác minh/i.test(major.code)), "vẫn còn dòng ngành dùng mã tạm");
  assert.match(rows("HVN").find((major) => major.code === "7640101")?.combination || "", /B08.*X07/);
  assert.equal(rows("GTA").find((major) => major.method === "ĐGNL HSA")?.combination, "Không áp dụng tổ hợp môn cố định");
  assert.match(rows("CMC").find((major) => major.code === "7510302" && major.method === "THPT")?.combination || "", /Toán ×2.*Vật lí/);
  assert.match(rows("DKC").find((major) => major.code === "7210205" && major.method === "THPT")?.combination || "", /N05/);
  assert.match(rows("DDM").find((major) => major.code === "7340301" && major.method === "THPT")?.combination || "", /D14/);
  assert.match(rows("HLU").find((major) => major.code === "7140221")?.combination || "", /N00/);
  assert.match(rows("DQT").find((major) => major.code === "7720301" && major.method === "THPT")?.combination || "", /X67/);
  assert.ok(rows("SNH").every((major) => major.code === "7860228" && /Q00/.test(major.combination)));
  assert.match(rows("HCA")[0]?.combination || "", /A01.*X04/);
  assert.equal(rows("HCB").length, 9);
  assert.equal(rows("HCB").find((major) => /Kỹ thuật - Hậu cần \(Nữ, phía Bắc\)/.test(major.name))?.cutoff.score, 23.25);
  assert.equal(rows("PCH").find((major) => /Nữ, phía Bắc/.test(major.name))?.cutoff.score, 24);
  assert.equal(rows("PCS").find((major) => /Nữ, phía Nam/.test(major.name))?.cutoff.score, 22.65);
  assert.ok(rows("PCH").every((major) => major.code === "7860113" && /A00.*D07/.test(major.combination)));
  assert.ok(rows("PCS").every((major) => major.code === "7860113" && /A00.*D07/.test(major.combination)));
  assert.ok(rows("ANS").every((major) => major.code === "7860100"));
  assert.ok(rows("NTH").filter((major) => /Quản trị nguồn nhân lực số/.test(major.name)).every((major) => major.code === "NTHQT10"));
  assert.equal(rows("QHD").find((major) => /Marketing và Phân tích kinh doanh/.test(major.name))?.code, "BBNS");
  assert.equal(find("DKT", "7310403", "Các phương thức sau quy đổi")?.combination, "A00; A01; D07");

  assert.ok(["NLT", "LNG", "XTD", "HTS", "UFH", "QSB-BT"].every((code) => !universities.some((item) => item.code === code)), "vẫn còn mã trường/phân hiệu cũ trong danh mục chính");
  assert.equal(rows("NLG").length, 3);
  assert.ok(rows("NLG").every((major) => major.cutoff.status === "not_published"));
  assert.equal(rows("NLN").length, 20);
  assert.equal(find("NLN", "7859002N", "THPT")?.cutoff.score, 20.5);
  assert.equal(find("NLN", "7859002N", "Học bạ")?.cutoff.score, 25.48);
  assert.equal(rows("KSV").length, 15);
  assert.equal(find("KSV", "7510605", "Xét tuyển tích hợp")?.cutoff.score, 67);
  assert.equal(find("KSV", "7510605", "Xét tuyển tích hợp")?.cutoff.scale, 100);
  assert.equal(rows("NHB").length, 8);
  assert.equal(rows("NHB").find((major) => major.code === "ACT02" && major.combination === "A00")?.cutoff.score, 23.25);
  assert.equal(rows("NHB").find((major) => major.code === "ACT02" && major.combination.includes("D01"))?.cutoff.score, 22.75);
  assert.equal(rows("KTC").length, 3);
  assert.equal(find("KTC", "7580108CT", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 23.13);
  assert.equal(rows("KTL").length, 2);
  assert.equal(find("KTL", "7580201DL", "Điểm trúng tuyển sau quy đổi")?.cutoff.score, 20.5);
  assert.equal(rows("LNA").length, 6);
  assert.ok(rows("LNA").every((major) => major.cutoff.status === "not_published"));
  assert.equal(rows("XDN").length, 12);
  assert.ok(rows("XDN").every((major) => major.cutoff.status === "not_published"));
  assert.equal(rows("HPS").length, 20);
  assert.equal(find("HPS", "7760101", "ĐGNL HSA")?.cutoff.score, 94);
  assert.equal(find("HPS", "7810103", "THPT")?.cutoff.score, 23.15);
  assert.equal(rows("HTH").length, 6);
  assert.equal(find("HTH", "7380101", "THPT")?.cutoff.score, 20);
  assert.equal(find("HTH", "7380101", "Học bạ")?.cutoff.score, 21.5);
  assert.equal(rows("DBC").length, 51);
  assert.equal(find("DBC", "7720201", "THPT")?.cutoff.score, 20);
  assert.equal(find("DBC", "7380107", "Học bạ")?.cutoff.score, 18);
  assert.equal(find("DBC", "7480201", "ĐGNL V-ACT")?.cutoff.score, 600);
  assert.equal(rows("HFA").length, 4);
  assert.ok(rows("HFA").every((major) => major.cutoff.status === "not_published"));
  assert.equal(rows("DLT").length, 0);
  assert.equal(universities.find((item) => item.code === "DLT")?.admissions?.status, "not_general_undergraduate");
  assert.equal(universities.find((item) => item.code === "QSP")?.admissions?.status, "not_general_undergraduate");
  assert.equal(universities.find((item) => item.code === "TAG")?.officialAdmissionsCode, "QSA");
  assert.equal(universities.find((item) => item.code === "DPD")?.website, "https://phuongdong.edu.vn");

  assert.ok(majors.every((major) => major.formulaText?.trim()), "vẫn còn dòng ngành thiếu công thức hiển thị");
  assert.ok(majors.every((major) => !/chưa xác minh công thức|chưa công bố công thức/i.test(major.formulaText)), "vẫn còn dòng ngành dùng công thức tạm");
  assert.match(find("BKA", "7480101", "THPT")?.formulaText || "", /3 × Toán.*Ngữ văn/);
  assert.equal(universities.filter((item) => item.admissions?.status === "updating").length, 0);
});

test("công cụ tính riêng của từng trường trả về đúng thang điểm", () => {
  const calculate = ({ formula, ...data }) => {
    const formulaModule = formulaRegistry.get(formula);
    assert.ok(formulaModule, `thiếu công thức ${formula}`);
    return formulaModule.calculate(data);
  };
  const scores = { math: 8, literature: 7.5, foreignLanguage: 8.5 };
  const priorityContext = { area: "KV3", group: "Không thuộc diện ưu tiên" };

  const technologyThpt = calculate({ formula: "ctm-thpt-2026", scores, priorityContext, subjects: Object.keys(scores) });
  assert.equal(technologyThpt.total, 24);
  assert.equal(technologyThpt.maxScore, 30);

  const technologyDgnl = calculate({ formula: "ctm-dgnl-2026", assessmentScore: 880 });
  assert.equal(technologyDgnl.total, 880);
  assert.equal(technologyDgnl.maxScore, 1200);

  const collegeThpt = calculate({ formula: "ktm-thpt-2026", scores, priorityContext, subjects: Object.keys(scores) });
  assert.equal(collegeThpt.total, 24);
  assert.equal(collegeThpt.maxScore, 30);
});
