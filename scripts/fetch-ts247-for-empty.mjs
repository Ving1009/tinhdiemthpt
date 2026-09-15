import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const universities = JSON.parse(await import("node:fs").then(fs => fs.readFileSync(join(root, "data", "universities.json"), "utf8")));

const codes = [
  "BVU", "DCA", "DDA", "DFA", "DSD", "DSG", "DTM", "DVB", "DVX",
  "FBU", "FPT", "GTS", "HCN", "IUH", "IUQ", "MTH", "MTS", "NHP",
  "NVS", "PCS", "SKV", "TDS", "THP", "TLS", "UFA", "UKB"
];

const normalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .replace(/Đ/g, "d")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const found = [];
for (const code of codes) {
  const uni = universities.find(u => u.code === code);
  if (!uni) continue;
  const nameSlug = normalize(uni.name.replace(/^(Trường\s+)?(Đại học|Học viện)\s+/i, ""));
  const fullSlug = normalize(uni.name);

  let success = false;
  for (const s of [nameSlug, fullSlug, `dai-hoc-${nameSlug}`, `truong-dai-hoc-${nameSlug}`]) {
    const url = `https://diemthi.tuyensinh247.com/diem-chuan/${s}-${code}.html`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.ok) {
        const text = await res.text();
        if (text.includes("<table")) {
          console.log(`[TS247 FOUND] ${code} -> ${url}`);
          await writeFile(join(root, "data", ".ts247-cache-2026", `${code}.json`), JSON.stringify({
            uniCode: code,
            uniName: uni.name,
            url,
            slug: `${s}-${code}`,
            html: text,
            fetchedAt: new Date().toISOString()
          }));
          found.push(code);
          success = true;
          break;
        }
      }
    } catch {}
    await sleep(80);
  }
  if (!success) {
    console.log(`[TS247 NOT FOUND] ${code}`);
  }
}

console.log(`Total newly found in TS247: ${found.length}/${codes.length}`);
