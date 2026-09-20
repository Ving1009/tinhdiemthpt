import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTs247Admissions } from "./lib/ts247-parser.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const universitiesPath = join(root, "data", "universities.json");
const majorsPath = join(root, "data", "majors.json");
const reportPath = join(root, "tmp", "ts247-fresh-audit-2026.json");
const shouldWrite = process.argv.includes("--write");
const checkedAt = new Date().toISOString().slice(0, 10);
const INDEX_URL = "https://diemthi.tuyensinh247.com/diem-chuan.html";
const CODE_ALIASES = { UTH: "GTS", QSA: "TAG" };

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function pageCode(url) {
  const raw = clean(url).match(/-([A-Z0-9]+)\.html(?:\?.*)?$/)?.[1]?.toUpperCase() || "";
  return CODE_ALIASES[raw] || raw;
}

function methodGroup(value) {
  const method = normalize(value);
  if (method.includes("hoc ba")) return "hoc-ba";
  if (method.includes("thpt") || method.includes("tot nghiep")) return "thpt";
  if (method.includes("hsa")) return "hsa";
  if (method.includes("v act") || method.includes("dgnl hcm")) return "v-act";
  if (method.includes("dgnl") || method.includes("danh gia nang luc")) return "dgnl";
  if (method.includes("tsa") || method.includes("dgtd") || method.includes("danh gia tu duy")) return "dgtd";
  if (method.includes("v sat")) return "v-sat";
  if (method.includes("ket hop")) return "ket-hop";
  if (method.includes("chung chi") || method.includes("sat") || method.includes("act")) return "chung-chi";
  return method;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TinhDiemTHPT/1.0; admissions-data-audit)" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

const indexHtml = await fetchText(INDEX_URL);
const urls = [...new Set([...indexHtml.matchAll(/href=["']([^"']*\/diem-chuan\/[^"']+\.html)["']/gi)]
  .map((match) => new URL(match[1], INDEX_URL).href))].sort();
const results = [];
let cursor = 0;

async function worker() {
  while (cursor < urls.length) {
    const index = cursor++;
    const url = urls[index];
    try {
      const html = await fetchText(url);
      results[index] = { url, code: pageCode(url), rows: parseTs247Admissions(html, 2026) };
    } catch (error) {
      results[index] = { url, code: pageCode(url), rows: [], error: error.name === "AbortError" ? "timeout" : error.message };
    }
    if ((index + 1) % 25 === 0 || index + 1 === urls.length) process.stdout.write(`\rĐã kiểm tra ${index + 1}/${urls.length} trang`);
  }
}

await Promise.all(Array.from({ length: 6 }, () => worker()));
process.stdout.write("\n");

const universities = JSON.parse(await readFile(universitiesPath, "utf8"));
const majors = JSON.parse(await readFile(majorsPath, "utf8"));
const byCode = new Map(universities.map((university) => [clean(university.code).toUpperCase(), university]));
const majorsByUniversity = new Map();
for (const major of majors) {
  const list = majorsByUniversity.get(major.universityId) || [];
  list.push(major);
  majorsByUniversity.set(major.universityId, list);
}

let referencesAdded = 0;
let referencesRefreshed = 0;
const unmatchedRows = [];
const pendingScoreCandidates = [];
const scoreConflicts = [];

for (const result of results.filter(Boolean)) {
  const university = byCode.get(result.code);
  if (!university) continue;
  university.admissions ||= {};
  university.admissions.referenceSources ||= [];
  let reference = university.admissions.referenceSources.find((source) => source.name === "TuyểnSinh247");
  if (!reference) {
    reference = { name: "TuyểnSinh247", url: result.url };
    university.admissions.referenceSources.push(reference);
    referencesAdded += 1;
  } else referencesRefreshed += 1;
  reference.url = result.url;
  reference.checkedAt = checkedAt;
  reference.has2026Data = result.rows.length > 0;
  university.dataCheckedAt = checkedAt;

  const currentRows = majorsByUniversity.get(university.id) || [];
  for (const row of result.rows) {
    const candidates = currentRows.filter((major) => normalize(major.code) === normalize(row.code)
      && normalize(major.name) === normalize(row.name)
      && methodGroup(`${major.method} ${major.cutoff?.method || ""}`) === methodGroup(row.method));
    if (!candidates.length) {
      unmatchedRows.push({ universityCode: university.code, university: university.name, sourceUrl: result.url, ...row });
      continue;
    }
    const sameScore = candidates.some((major) => Number(major.cutoff?.score) === Number(row.score));
    if (sameScore) continue;
    const pending = candidates.filter((major) => major.cutoff?.score == null);
    if (pending.length === 1) {
      pendingScoreCandidates.push({
        universityCode: university.code,
        id: pending[0].id,
        code: row.code,
        name: row.name,
        method: row.method,
        score: row.score,
        scale: row.scale,
        sourceUrl: result.url
      });
    } else {
      scoreConflicts.push({
        universityCode: university.code,
        code: row.code,
        name: row.name,
        method: row.method,
        sourceScore: row.score,
        currentScores: candidates.map((major) => ({ id: major.id, score: major.cutoff?.score, status: major.cutoff?.status, sourceUrl: major.sourceUrl }))
      });
    }
  }
}

const report = {
  checkedAt,
  source: INDEX_URL,
  pagesFound: urls.length,
  pagesFetched: results.filter((item) => item && !item.error).length,
  pagesFailed: results.filter((item) => item?.error).map(({ code, url, error }) => ({ code, url, error })),
  pagesWith2026Data: results.filter((item) => item?.rows.length).length,
  rows2026: results.reduce((sum, item) => sum + (item?.rows.length || 0), 0),
  referencesAdded,
  referencesRefreshed,
  pendingScoreCandidates,
  unmatchedRows,
  scoreConflicts
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (shouldWrite) await writeFile(universitiesPath, `${JSON.stringify(universities, null, 2)}\n`);

console.log(JSON.stringify({
  mode: shouldWrite ? "write" : "audit",
  pagesFound: report.pagesFound,
  pagesFetched: report.pagesFetched,
  pagesFailed: report.pagesFailed.length,
  pagesWith2026Data: report.pagesWith2026Data,
  rows2026: report.rows2026,
  referencesAdded,
  referencesRefreshed,
  pendingScoreCandidates: pendingScoreCandidates.length,
  unmatchedRows: unmatchedRows.length,
  scoreConflicts: scoreConflicts.length,
  reportPath
}, null, 2));
