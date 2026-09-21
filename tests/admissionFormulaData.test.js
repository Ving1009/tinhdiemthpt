import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import { validateAdmissionFormulaData } from "../lib/admissionFormulaData.js";
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

  const qhl = defaultDataStore.listAdmissionFormulas("khoa-luat-dhqg-ha-noi");
  assert.equal(qhl.available, false);
  assert.equal(qhl.methods.length, 0);
  assert.match(qhl.message, /Chưa có công thức chính thức được xác minh/);
  assert.ok(qhl.methodOptions.length > 0);
  assert.ok(qhl.methodOptions.every((method) => method.verified === false));
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
