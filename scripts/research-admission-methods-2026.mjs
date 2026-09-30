import fs from "node:fs/promises";
import { parseAdmissionPlan } from "./lib/ts247-plans.mjs";

const cache = "tmp/admissions-plans-2026";
const refresh = process.argv.includes("--refresh");
await fs.mkdir(cache, { recursive: true });
const schools = JSON.parse(await fs.readFile("data/universities.json", "utf8"));
const urls = new Set();
try {
  const notes = JSON.parse(await fs.readFile("data/research/admission-methods-2026-notes.json", "utf8"));
  for (const url of Object.values(notes.additionalPlanUrls || {})) urls.add(url);
} catch (error) { if (error.code !== "ENOENT") throw error; }
for (const school of schools) {
  for (const value of [school.admissions?.methodsSourceUrl, ...(school.admissions?.referenceSources || []).map((x) => typeof x === "string" ? x : x.url)]) {
    if (/diemthi\.tuyensinh247\.com\/(diem-chuan|de-an-tuyen-sinh)\//.test(value || "")) urls.add(value.replace("/diem-chuan/", "/de-an-tuyen-sinh/"));
  }
}
const results = [], errors = [];
const queue = [...urls];
async function runner() {
  while (queue.length) {
    const url = queue.shift();
    const name = new URL(url).pathname.split("/").pop();
    const path = `${cache}/${name}`;
    try {
      let html;
      try { if (refresh) throw new Error("Refresh requested"); html = await fs.readFile(path, "utf8"); }
      catch {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "TinhDiemTHPT admissions research" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        html = await response.text();
        await fs.writeFile(path, html);
      }
      const plan = parseAdmissionPlan(html);
      if (!plan) throw new Error("Không có dữ liệu đề án trong trang");
      results.push({ url, ...plan });
    } catch (error) { errors.push({ url, error: error.message }); }
    if ((results.length + errors.length) % 25 === 0) console.log(`Đã đọc ${results.length + errors.length}/${urls.size} trang; lỗi ${errors.length}`);
  }
}
await Promise.all(Array.from({ length: 4 }, runner));
results.sort((a, b) => a.code.localeCompare(b.code));
await fs.writeFile(`${cache}/raw-plans.json`, JSON.stringify({ checkedAt: new Date().toISOString(), pages: results, errors }, null, 2));
console.log(JSON.stringify({ pages: results.length, methods: results.reduce((n, x) => n + x.methods.length, 0), without2026: results.filter((x) => !x.methods.length).map((x) => x.code), errors }, null, 2));
