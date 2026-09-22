import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import { validateAdmissionFormulaData } from "../lib/admissionFormulaData.js";
import { sanitizeMajor, sanitizePublicValue, sanitizeUniversity } from "../lib/dataValidation.js";
import { createDataStore } from "../server/dataStoreCore.js";
import { defaultDataStore } from "../server/dataStore.js";

const execFileAsync = promisify(execFile);
const loadJson = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"));

test("bộ công thức công khai chỉ chứa sáu phương thức có nguồn chính thức trực tiếp", async () => {
  const [dataset, universities, majors] = await Promise.all([
    loadJson("admission-formulas-2026.json"),
    loadJson("universities.json"),
    loadJson("majors.json")
  ]);
  const result = validateAdmissionFormulaData(dataset, { universities, majors });
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.deepEqual(result.stats, { mappedSchools: 4, verifiedSchoolMethods: 6, applicableMajorRows: 61 });
  assert.ok(dataset.schools.every((school) => school.methods.every((method) => method.status === "official_verified")));
  assert.ok(dataset.schools.every((school) => school.methods.every((method) => method.source.kind === "official_primary" && method.source.verifiedAt === "2026-09-21")));
  assert.equal(new Set(dataset.schools.flatMap((school) => school.methods.map((method) => method.expression.replace(/\s+/g, " ")))).size, 6);
});

test("API công thức giữ rõ trạng thái chưa xác minh và phạm vi ngành", () => {
  const bka = defaultDataStore.listAdmissionFormulas("dai-hoc-bach-khoa-ha-noi");
  assert.equal(bka.available, true);
  assert.equal(bka.methods.length, 1);
  assert.equal(bka.methods[0].programCount, 3);
  assert.equal(bka.methods[0].autoCalculate, true);
  assert.match(bka.methods[0].officialLink.url, /^https:\/\/hust\.edu\.vn\//);
  assert.equal(bka.stats.coveredRows, bka.stats.totalRows);
  assert.ok(bka.profileFormulas.some((method) => method.status === "reference"));

  const qhl = defaultDataStore.listAdmissionFormulas("khoa-luat-dhqg-ha-noi");
  assert.equal(qhl.available, false);
  assert.equal(qhl.methods.length, 0);
  assert.equal(qhl.profileAvailable, true);
  assert.equal(qhl.stats.coveredRows, qhl.stats.totalRows);
  assert.ok(qhl.profileFormulas.length > 0);
  assert.ok(qhl.profileFormulas.every((method) => method.status === "reference"));
  assert.ok(qhl.methodOptions.length > 0);
  assert.ok(qhl.methodOptions.every((method) => method.verified === false));
  assert.ok(qhl.methodOptions.every((method) => method.hasFormula === true));
});

test("API phủ công thức và nguồn cho toàn bộ dòng ngành của mọi hồ sơ", async () => {
  const [universities, majors] = await Promise.all([
    loadJson("universities.json"),
    loadJson("majors.json")
  ]);
  const majorsByUniversity = new Map();
  for (const major of majors) {
    const rows = majorsByUniversity.get(major.universityId) || [];
    rows.push(major);
    majorsByUniversity.set(major.universityId, rows);
  }

  for (const university of universities) {
    const rows = majorsByUniversity.get(university.id) || [];
    const result = defaultDataStore.listAdmissionFormulas(university.id);
    assert.ok(result, `${university.code}: API công thức không trả dữ liệu`);
    if (!rows.length) {
      assert.equal(result.stats.totalRows, 0, `${university.code}: thống kê dòng ngành sai`);
      assert.ok(result.emptyReason, `${university.code}: thiếu lý do không áp dụng công thức`);
      continue;
    }
    const coveredIds = new Set(result.profileFormulas.flatMap((formula) => formula.rowIds || []));
    assert.equal(result.stats.coveredRows, rows.length, `${university.code}: thống kê độ phủ công thức sai`);
    assert.ok(rows.every((major) => coveredIds.has(major.id)), `${university.code}: còn dòng ngành chưa được liên kết công thức`);
    assert.ok(result.profileFormulas.every((formula) => formula.expression?.trim()), `${university.code}: có công thức trống`);
    assert.ok(rows.every((major) => /^https?:\/\//.test(major.formulaSourceUrl || "")), `${university.code}: dữ liệu nội bộ có công thức thiếu nguồn`);
    assert.ok(result.methods.every((formula) => /^https?:\/\//.test(formula.officialLink?.url || "")), `${university.code}: công thức chính thức thiếu liên kết`);
    assert.ok(result.profileFormulas.filter((formula) => formula.status === "reference").every((formula) => !formula.officialLink && !formula.sourceLink), `${university.code}: API làm lộ metadata nguồn tham khảo`);
  }
});

test("gói dữ liệu Cloudflare giữ bằng chứng nội bộ để phủ công thức nhưng không công khai metadata", async () => {
  const [universities, majors, combinations, subjects, admissionFormulas] = await Promise.all([
    loadJson("universities.json"),
    loadJson("majors.json"),
    loadJson("combinations.json"),
    loadJson("subjects.json"),
    loadJson("admission-formulas-2026.json")
  ]);
  const workerMajors = majors.map((major) => ({
    ...sanitizeMajor(major),
    formulaEvidenceAvailable: Boolean(major.formulaText?.trim() && /^https?:\/\//.test(major.formulaSourceUrl || ""))
  }));
  const workerStore = createDataStore({
    universities: universities.map(sanitizeUniversity),
    majors: workerMajors,
    combinations: combinations.map(sanitizePublicValue),
    subjects: subjects.map(sanitizePublicValue),
    admissionFormulas
  });
  const qhl = workerStore.listAdmissionFormulas("khoa-luat-dhqg-ha-noi");
  assert.equal(qhl.stats.coveredRows, qhl.stats.totalRows);
  assert.ok(qhl.profileFormulas.length > 0);
  const publicRow = workerStore.listUniversityMajors("khoa-luat-dhqg-ha-noi", { pageSize: 1 }).items[0];
  assert.equal(Object.hasOwn(publicRow, "formulaEvidenceAvailable"), false);
  assert.equal(Object.hasOwn(publicRow, "formulaSourceUrl"), false);
});

test("script audit đối chiếu đủ trường, ngành, phương thức và phát hiện ba nhãn quá mức", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["scripts/audit-admission-formulas.mjs", "--json"], {
    cwd: new URL("../", import.meta.url),
    maxBuffer: 4 * 1024 * 1024
  });
  const report = JSON.parse(stdout);
  assert.equal(report.valid, true, report.criticalErrors.join("\n"));
  assert.equal(report.document.mappedSchools, 326);
  assert.equal(report.document.majorRowsInTables, 17617);
  assert.equal(report.repository.schoolMethodPairs, 1218);
  assert.equal(report.document.methodSections, 1221);
  assert.equal(report.integration.verifiedSchoolMethodFormulas, 6);
  assert.equal(report.integration.skippedRepositorySchoolMethodPairs, 1212);
  assert.deepEqual(report.integration.excludedOfficialNumericCandidates.map((item) => `${item.schoolCode}|${item.method}`), [
    "QHL|THPT",
    "QHL|Xét tuyển kết hợp",
    "KMA|THPT"
  ]);
  assert.equal(report.document.markdown.missingAnchorTargets.length, 0);
  assert.equal(report.document.duplicateFormulas.officialDuplicateGroups, 0);
});
