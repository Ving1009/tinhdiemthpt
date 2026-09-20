import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const universitiesUrl = new URL("data/universities.json", root);
const majorsUrl = new URL("data/majors.json", root);
const universities = JSON.parse(await readFile(universitiesUrl, "utf8"));
const majors = JSON.parse(await readFile(majorsUrl, "utf8"));
const university = universities.find((item) => item.code === "DVP");

if (!university) throw new Error("Không tìm thấy hồ sơ DVP.");

const cutoffSource = "https://tv-uni.edu.vn/diem-chuan-truong-dai-hoc-trung-vuong-nam-2026/";
const formulaSource = "https://tv-uni.edu.vn/qd-quy-che-tuyen-sinh-truong-dai-hoc-trung-vuong/";
const methods = ["THPT", "Học bạ", "ĐGTD TSA", "ĐGNL HSA", "Xét tuyển thẳng"];
let updated = 0;

university.methods = methods;
university.admissions.status = "official_verified";
university.admissions.methods = methods;
university.admissions.methodsSourceUrl = formulaSource;

for (const major of majors) {
  if (major.universityId !== university.id) continue;
  major.dataStatus = "verified";
  major.sourceName = "Trường Đại học Trưng Vương";
  major.sourceUrl = cutoffSource;
  major.formulaSourceUrl = formulaSource;
  major.cutoff = {
    ...major.cutoff,
    year: 2026,
    status: "verified",
    sourceName: "Trường Đại học Trưng Vương",
    sourceUrl: cutoffSource
  };
  updated += 1;
}

if (updated !== 32) throw new Error(`Số dòng DVP ngoài dự kiến: ${updated}/32.`);
await Promise.all([
  writeFile(universitiesUrl, `${JSON.stringify(universities, null, 2)}\n`),
  writeFile(majorsUrl, `${JSON.stringify(majors, null, 2)}\n`)
]);
console.log(`Đã nâng ${updated} dòng DVP sang nguồn chính thức năm 2026.`);
