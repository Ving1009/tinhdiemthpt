import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, "data", ".vnn-cache-2026");
const API = "https://vietnamnet.vn/newsapi-edu/UniversityDetail/GetDetail";
const PAGE_ID = "49ff289efde0446f9ae2f5c385595744";
const COMPONENT = "COMPONENT002302";
const YEAR = 2026;
const PAGE_SIZE = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .replace(/Đ/g, "d")
  .toLowerCase()
  .replace(/cntt\s*:/g, " ")
  .replace(/\(.*?\)/g, " ")
  .replace(/\b(chuong trinh|ct tien tien|tien tien|chat luong cao|clc|lien ket|quoc te|dai tra|chinh quy)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const parseScore = (value) => {
  const score = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(score) ? score : null;
};

const isThpt30 = (row) => /điểm chuẩn\s*-\s*thpt/i.test(row.note || "") && /thang điểm:\s*30/i.test(row.note || "");
const isHocBa30 = (row) => /học bạ/i.test(row.note || "") && /thang điểm:\s*30/i.test(row.note || "") && !/tương đương/i.test(row.note || "");

const fetchJson = async (url, attempt = 1) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; cutoff-updater/1.0)",
      Accept: "application/json",
      Referer: "https://vietnamnet.vn/giao-duc/diem-thi/tra-cuu-diem-chuan-cd-dh"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  if (!json.status) {
    if (attempt < 5) {
      await sleep(400 * attempt);
      return fetchJson(url, attempt + 1);
    }
    throw new Error(json.messages?.join(", ") || "API status false");
  }
  return json.data?.model || json.data;
};

const fetchSchool = async (keyword) => {
  const cachePath = join(cacheDir, `${keyword}.json`);
  try {
    return JSON.parse(await readFile(cachePath, "utf8"));
  } catch {}

  const firstUrl = `${API}?componentId=${COMPONENT}&keyword=${encodeURIComponent(keyword)}&pageId=${PAGE_ID}&pageIndex=0&pageSize=${PAGE_SIZE}&subjectGroup=&typeOfTraining=0&year=${YEAR}`;
  const first = await fetchJson(firstUrl);
  const school = first.universitySchool?.[0] || null;
  const totalPage = Number(first.totalPage) || 1;
  const rows = [...(first.schoolScores || [])];
  for (let page = 1; page < totalPage; page += 1) {
    await sleep(180);
    const next = await fetchJson(`${API}?componentId=${COMPONENT}&keyword=${encodeURIComponent(keyword)}&pageId=${PAGE_ID}&pageIndex=${page}&pageSize=${PAGE_SIZE}&subjectGroup=&typeOfTraining=0&year=${YEAR}`);
    rows.push(...(next.schoolScores || []));
  }
  const payload = { keyword, school, rows, fetchedAt: new Date().toISOString() };
  await writeFile(cachePath, JSON.stringify(payload));
  return payload;
};

const nameScore = (localName, officialName) => {
  const local = normalize(localName);
  const official = normalize(officialName);
  if (!local || !official) return 0;
  if (local === official) return 100;
  if (official.startsWith(local) || local.startsWith(official)) return 90;
  if (official.includes(local) || local.includes(official)) return 80;
  const localTokens = new Set(local.split(" ").filter(Boolean));
  const officialTokens = official.split(" ").filter(Boolean);
  if (!localTokens.size) return 0;
  const overlap = officialTokens.filter((token) => localTokens.has(token)).length;
  return (overlap / Math.max(localTokens.size, officialTokens.length)) * 70;
};

const pickRow = (major, rows) => {
  const ranked = rows
    .map((row) => {
      let score = nameScore(major.name, row.name);
      if (String(row.code || "").toUpperCase() === String(major.code || "").toUpperCase()) score += 25;
      if (String(row.subjectGroup || "").toUpperCase() === String(major.combination || "").toUpperCase()) score += 8;
      const official = normalize(row.name);
      const local = normalize(major.name);
      if (!/tien tien|clc/.test(local) && /tien tien|clc/.test(official)) score -= 12;
      return { row, score };
    })
    .filter((item) => item.score >= 70)
    .sort((a, b) => b.score - a.score || Math.abs(parseScore(a.row.score) - 25) - Math.abs(parseScore(b.row.score) - 25));
  return ranked[0] || null;
};

const universities = JSON.parse(await readFile(join(root, "data", "universities.json"), "utf8"));
const majors = JSON.parse(await readFile(join(root, "data", "majors.json"), "utf8"));
await mkdir(cacheDir, { recursive: true });

const sourceByCode = new Map();
const missingSchools = [];
for (const [index, university] of universities.entries()) {
  process.stdout.write(`[${index + 1}/${universities.length}] ${university.code} ${university.name}\n`);
  try {
    const payload = await fetchSchool(university.code);
    if (!payload.rows.length) missingSchools.push({ id: university.id, code: university.code, reason: "empty" });
    sourceByCode.set(university.code, payload);
  } catch (error) {
    missingSchools.push({ id: university.id, code: university.code, reason: String(error.message) });
  }
  await sleep(120);
}

let updated = 0;
let unmatched = 0;
const samples = [];
for (const major of majors) {
  const university = universities.find((item) => item.id === major.universityId);
  const payload = university ? sourceByCode.get(university.code) : null;
  const rows = (payload?.rows || []).filter(major.method === "Học bạ" ? isHocBa30 : isThpt30);
  const picked = pickRow(major, rows);
  const score = picked ? parseScore(picked.row.score) : null;
  if (score != null && score > 0 && score <= 30.5) {
    if (major.cutoff.score !== score) {
      samples.push({
        id: major.id,
        from: major.cutoff.score,
        to: score,
        official: picked.row.name,
        combination: picked.row.subjectGroup,
        note: picked.row.note
      });
    }
    major.cutoff = { year: YEAR, score };
    updated += 1;
  } else if (major.method === "THPT") {
    unmatched += 1;
  }
}

await writeFile(join(root, "data", "majors.json"), `${JSON.stringify(majors, null, 2)}\n`);
await writeFile(join(root, "data", "cutoff-update-2026-report.json"), `${JSON.stringify({
  year: YEAR,
  source: "VietnamNet UniversityDetail/GetDetail 2026",
  universities: universities.length,
  majors: majors.length,
  updated,
  unmatchedThpt: unmatched,
  missingSchools,
  changedSamples: samples.slice(0, 40),
  changedCount: samples.length
}, null, 2)}\n`);

console.log(JSON.stringify({
  updated,
  unmatchedThpt: unmatched,
  changed: samples.length,
  missingSchools: missingSchools.length
}, null, 2));
