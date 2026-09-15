import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pageIdentity, parseTs247Admissions } from "./lib/ts247-parser.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, "data", ".ts247-cache-2026");
const files = (await readdir(cacheDir)).filter((file) => file.endsWith(".json")).sort();
const report = [];

for (const file of files) {
  const cached = JSON.parse(await readFile(join(cacheDir, file), "utf8"));
  const rows = parseTs247Admissions(cached.html, 2026);
  const years = [...String(cached.html).matchAll(/year\\?\"?:\s*(20\d{2})/g)].map((match) => Number(match[1]));
  const identity = pageIdentity(cached.html);
  report.push({
    file,
    code: cached.uniCode,
    university: cached.uniName,
    rows2026: rows.length,
    years: [...new Set(years)].sort(),
    title: identity.title,
    canonical: identity.canonical || cached.url,
    fetchedAt: cached.fetchedAt
  });
}

const usable = report.filter((item) => item.rows2026 > 0);
console.log(JSON.stringify({
  cacheFiles: report.length,
  pagesWith2026Rows: usable.length,
  rows2026: usable.reduce((sum, item) => sum + item.rows2026, 0),
  usable,
  pagesWithout2026Rows: report.filter((item) => item.rows2026 === 0).map(({ code, university, years, canonical }) => ({ code, university, years, canonical }))
}, null, 2));
