import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { flightRecords, htmlTables, mentionedExams, parseAdmissionPlan, programsForTag } from "../scripts/lib/ts247-plans.mjs";

const flight = (value) => `<script>self.__next_f.push([1,${JSON.stringify(value)}])</script>`;
const row = (code, name, mark, year = 2026, group = "") => ({ code, name, mark_type: mark, year, group_name: group, block: "A00" });

test("Flight records preserve multiline Vietnamese HTML using byte lengths across chunks", () => {
  const text = "<p>Điều kiện</p>\n<p>Ngành Ngôn ngữ Anh</p>";
  const transport = `a:T${Buffer.byteLength(text).toString(16)},${text}b:${JSON.stringify({ body: "$a" })}\n`;
  const split = transport.indexOf("Ngành");
  assert.deepEqual(flightRecords(flight(transport.slice(0, split)) + flight(transport.slice(split))), [{ body: text }]);
});

test("admission research selects 2026 even when the overview has advanced to 2027", () => {
  const metadata = { school: { code: "TEST", name: "Trường thử" }, schoolInfo: { year: 2027 }, admissions: [{ id: 1, method: 1, method_name: "THPT", year: 2026 }, { id: 2, method: 3, method_name: "Học bạ", year: 2025 }], schoolMajors: [row("A", "Ngành năm 2026", "3, 1 "), row("B", "Ngành năm cũ", "1", 2025)] };
  const result = parseAdmissionPlan(flight(`0:${JSON.stringify(metadata)}\n`));
  assert.equal(result.pageYear, 2027);
  assert.deepEqual(result.methods.map((method) => method.label), ["THPT"]);
  assert.deepEqual(result.methods[0].programs.map((p) => p.code), ["A"]);
});

test("nested source sections do not mix the sibling method's program table", () => {
  const a = { className: "sub-content__method", id: "method-1", children: { dataSource: [row("A", "Ngành A", "10"), row("A", "Ngành A", "10"), row("A", "Ngành A", "10", 2026, "Phân hiệu")] } };
  const b = { className: "sub-content__method", id: "method-2", children: { dataSource: [row("B", "Ngành B", "10")] } };
  const metadata = { school: { code: "TEST", name: "Trường thử" }, admissions: [{ id: 1, method: 10, method_name: "Kết hợp 1", year: 2026 }, { id: 2, method: 10, method_name: "Kết hợp 2", year: 2026 }], tree: { className: "sub-content__method", id: "method-1", children: [a, b] } };
  const methods = parseAdmissionPlan(flight(`0:${JSON.stringify(metadata)}\n`)).methods;
  assert.deepEqual(methods[0].programs.map((p) => [p.code, p.group]), [["A", ""], ["A", "Phân hiệu"]]);
  assert.deepEqual(methods[1].programs.map((p) => p.code), ["B"]);
});

test("a generic combined method code cannot assign every variant's programs", () => {
  const metadata = { school: { code: "TEST", name: "Trường thử" }, admissions: [{ id: 1, method: 10, year: 2026 }, { id: 2, method: "10", year: 2026 }], schoolMajors: [row("A", "A", "10")] };
  assert.ok(parseAdmissionPlan(flight(`0:${JSON.stringify(metadata)}\n`)).methods.every((m) => m.programs.length === 0));
  assert.deepEqual(programsForTag([row("A", "A", "10.20"), row("B", "B", "10.2", 2025), row("C", "C", "10.21")], "10.2").map((p) => p.code), ["A"]);
});

test("official program matrices retain rowspanned method codes and column alignment", () => {
  assert.deepEqual(htmlTables('<table><tr><td rowspan="2">7340101</td><td>Quản trị kinh doanh</td><td rowspan="2">100,200</td><td>50</td></tr><tr><td>Kinh doanh số</td><td>20</td></tr><tr><th colspan="2">Nhóm mới</th><td>301</td><td>10</td></tr></table>')[0], [["7340101", "Quản trị kinh doanh", "100,200", "50"], ["7340101", "Kinh doanh số", "100,200", "20"], ["Nhóm mới", "Nhóm mới", "301", "10"]]);
});

test("domestic V-SAT and V-ACT are not classified as international SAT or ACT", () => {
  assert.deepEqual(mentionedExams("Điểm V-SAT hoặc V-ACT năm 2026"), ["V-ACT", "V-SAT"]);
  assert.deepEqual(mentionedExams("V-SAT và chứng chỉ SAT; V-ACT và chứng chỉ ACT"), ["V-ACT", "V-SAT", "SAT", "ACT"]);
});

test("research accounts for every school, preserves years and separates campus programs", async () => {
  const schools = JSON.parse(await fs.readFile(new URL("../data/universities.json", import.meta.url), "utf8"));
  const research = JSON.parse(await fs.readFile(new URL("../data/research/admission-methods-2026.json", import.meta.url), "utf8"));
  assert.deepEqual(research.schools.map((s) => s.code).sort(), schools.map((s) => s.code).sort());
  assert.equal(new Set(research.schools.map((s) => s.code)).size, schools.length);
  assert.ok(research.schools.flatMap((s) => s.methods).every((m) => m.year === 2026 && m.sourceUrl.startsWith("https://")));
  const hcs = research.schools.find((s) => s.code === "HCS");
  assert.ok(hcs.methods.length > 0 && hcs.methods.every((m) => m.programs.every((p) => p.group.includes("Hồ Chi Minh"))));
  assert.ok(research.schools.find((s) => s.code === "YHT").methods.every((m) => m.programs.every((p) => p.name.includes("Thanh Hóa"))));
  const iuq = research.schools.find((s) => s.code === "IUQ");
  assert.equal(iuq.methods.length, 2);
  assert.ok(iuq.methods.every((m) => m.programs.length === 6 && m.programs.every((p) => p.group === "Phân hiệu Quảng Ngãi")));
  const htn = research.schools.find((s) => s.code === "HTN");
  assert.ok(htn.methods.every((m) => m.programs.every((p) => p.group === "Hà Nội")));
  assert.equal(htn.methods.find((m) => m.methodCode === "200").programs.length, 7);
  const fpt = research.schools.find((s) => s.code === "FPT");
  assert.equal(fpt.status, "source_program_mapping_collected");
  assert.equal(fpt.methods.length, 3);
  assert.ok(fpt.methods.every((m) => m.programs.length === 39));
  assert.ok(fpt.methods[0].programs.some((p) => p.code === "7480201" && p.name.startsWith("Robot")));
  assert.equal(fpt.methods[0].programs.find((p) => p.code === "7480101").combinations, "Axx");
  const bvu = research.schools.find((s) => s.code === "BVU");
  assert.equal(bvu.methods.length, 6);
  assert.ok(bvu.methods.every((m) => m.programs.length === 60));
  assert.ok(bvu.methods.find((m) => m.methodCode === "BVU-407").programs.some((p) => p.displayCode === "7510605TN" && p.code === "7510605"));
  assert.ok(research.schools.find((s) => s.code === "QSP").sources.every((s) => s.year !== 2026));
  assert.ok(research.schools.flatMap((s) => s.methods).flatMap((m) => m.programs).every((p) => p.name && !/^Chỉ tiêu:/.test(p.name)));
});
