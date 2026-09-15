import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { unmatched } = JSON.parse(await readFile(join(root, "scripts", "vne-mapping.json"), "utf8"));

const normalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .replace(/Đ/g, "d")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
for (const u of unmatched) {
  const code = u.code;
  const slug = normalize(u.name.replace(/^(Trường\s+)?(Đại học|Học viện)\s+/i, ""));
  const fullSlug = normalize(u.name);

  // Try TS247
  let tsFound = false;
  for (const s of [slug, fullSlug, `dai-hoc-${slug}`, `hoc-vien-${slug}`]) {
    const url = `https://diemthi.tuyensinh247.com/diem-chuan/${s}-${code}.html`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('<table')) {
          results.push({ uni: u, source: 'ts247', url, slug: `${s}-${code}` });
          tsFound = true;
          break;
        }
      }
    } catch {}
    await sleep(60);
  }

  if (!tsFound) {
    // Check VietnamNet cache
    const vnnPath = join(root, "data", ".vnn-cache-2026", `${code}.json`);
    try {
      const vnn = JSON.parse(await readFile(vnnPath, "utf8"));
      if (vnn.rows && vnn.rows.length > 0) {
        results.push({ uni: u, source: 'vnn', code });
        continue;
      }
    } catch {}
    results.push({ uni: u, source: 'none' });
  }
}

const found = results.filter(r => r.source !== 'none');
const missing = results.filter(r => r.source === 'none');
console.log(`Matched additional: ${found.length}/${unmatched.length}`);
console.log(`Remaining: ${missing.length}/${unmatched.length}`);
console.log('Remaining samples:', missing.map(m => ({ code: m.uni.code, name: m.uni.name })));
await writeFile(join(root, "scripts", "unmatched-resolved.json"), JSON.stringify({ found, missing }, null, 2));
