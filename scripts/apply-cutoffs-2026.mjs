import { readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, "data", ".vnn-cache-2026");
const YEAR = 2026;
const STOP = new Set(["va", "and", "nganh", "chuyen", "ct", "cntt", "dai", "hoc", "truong"]);

const normalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .replace(/Đ/g, "d")
  .toLowerCase()
  .replace(/cntt\s*:/g, " ")
  .replace(/\(.*?\)/g, " ")
  .replace(/[-/]/g, " ")
  .replace(/\b(chuong trinh|tien tien|chat luong cao|clc|lien ket|quoc te|dai tra|chinh quy|tang cuong tieng anh)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const tokens = (value) => new Set(normalize(value).split(" ").filter((token) => token.length > 1 && !STOP.has(token)));

const jaccard = (a, b) => {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / new Set([...left, ...right]).size;
};

const parseScore = (value) => {
  const score = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(score) ? score : null;
};

const isThpt30 = (row) => /điểm chuẩn\s*-?\s*thpt/i.test(row.note || "") && /thang điểm:\s*30/i.test(row.note || "") && !/kết hợp|tương đương/i.test(row.note || "");
const isHocBa30 = (row) => /điểm chuẩn\s+học bạ/i.test(row.note || "") && /thang điểm:\s*30/i.test(row.note || "") && !/kết hợp|tương đương/i.test(row.note || "");

const isAdvanced = (name) => /tiên tiến|clc|chất lượng cao|global|liên kết/i.test(name);

const pickRow = (major, rows) => {
  const ranked = rows.map((row) => {
    const local = normalize(major.name);
    const official = normalize(row.name);
    let score = jaccard(major.name, row.name) * 100;
    if (local && official && (local === official)) score = 100;
    if (String(row.code || "").toUpperCase() === String(major.code || "").toUpperCase() && major.code.length <= 8) score += 20;
    if (String(row.subjectGroup || "").toUpperCase() === String(major.combination || "").toUpperCase()) score += 4;
    if (!isAdvanced(major.name) && isAdvanced(row.name)) score -= 18;
    const extra = Math.max(0, tokens(row.name).size - tokens(major.name).size);
    score -= extra * 3;
    return { row, score };
  }).filter((item) => item.score >= 72)
    .sort((a, b) => b.score - a.score);
  return ranked[0] || null;
};

const report = JSON.parse(await readFile(join(root, "data", "cutoff-update-2026-report.json"), "utf8"));
const universities = JSON.parse(await readFile(join(root, "data", "universities.json"), "utf8"));
const majors = JSON.parse(await readFile(join(root, "data", "majors.json"), "utf8"));
const byId = new Map(majors.map((major) => [major.id, major]));
for (const sample of report.changedSamples || []) {
  const major = byId.get(sample.id);
  if (major) major.cutoff = { year: YEAR, score: sample.from };
}

const caches = new Map();
for (const file of await readdir(cacheDir)) {
  if (!file.endsWith(".json")) continue;
  const payload = JSON.parse(await readFile(join(cacheDir, file), "utf8"));
  caches.set(file.replace(/\.json$/, ""), payload);
}

let updated = 0;
let unmatched = 0;
const changed = [];
const schoolsWithSource = [];
for (const university of universities) {
  const payload = caches.get(university.code);
  const thptRows = (payload?.rows || []).filter(isThpt30);
  if (thptRows.length) schoolsWithSource.push(university.code);
  for (const major of majors.filter((item) => item.universityId === university.id)) {
    const rows = (payload?.rows || []).filter(major.method === "Học bạ" ? isHocBa30 : isThpt30);
    const picked = pickRow(major, rows);
    const score = picked ? parseScore(picked.row.score) : null;
    if (score != null && score > 0 && score <= 30.5) {
      if (major.cutoff.score !== score) {
        changed.push({
          id: major.id,
          from: major.cutoff.score,
          to: score,
          official: picked.row.name,
          combination: picked.row.subjectGroup,
          note: picked.row.note,
          match: Number(picked.score.toFixed(1))
        });
      }
      major.cutoff = { year: YEAR, score };
      updated += 1;
    } else if (major.method === "THPT") {
      unmatched += 1;
    }
  }
}

await writeFile(join(root, "data", "majors.json"), `${JSON.stringify(majors, null, 2)}\n`);
await writeFile(join(root, "data", "cutoff-update-2026-report.json"), `${JSON.stringify({
  year: YEAR,
  source: "VietnamNet UniversityDetail/GetDetail 2026",
  schoolsWithThptSource: schoolsWithSource.length,
  updated,
  unmatchedThpt: unmatched,
  changedCount: changed.length,
  changedSamples: changed.slice(0, 50)
}, null, 2)}\n`);

console.log(JSON.stringify({
  schoolsWithThptSource: schoolsWithSource.length,
  updated,
  unmatchedThpt: unmatched,
  changed: changed.length
}, null, 2));
console.log(changed.slice(0, 15));
