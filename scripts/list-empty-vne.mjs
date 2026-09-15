import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vneDir = join(root, "data", ".vne-cache-2026");

const parseVne = (html) => {
  const trs = html.split('<tr class="university__benchmark').slice(1);
  const rows = [];
  for (const tr of trs) {
    const nameMatch = tr.match(/<strong><a[^>]*>([\s\S]*?)<\/a><\/strong>/);
    const codeMatch = tr.match(/<span style="display: block;">([\s\S]*?)<\/span>/);
    if (!nameMatch || !codeMatch) continue;
    const tds = tr.match(/<td[\s\S]*?<\/td>/g) || [];
    const scoreThptRaw = tds[2]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "";
    const scoreThpt = Number(scoreThptRaw.replace(",", "."));
    if (Number.isFinite(scoreThpt) && scoreThpt > 0) {
      rows.push(nameMatch[1].trim());
    }
  }
  return rows;
};

const vneFiles = await readdir(vneDir);
const emptySchools = [];
for (const f of vneFiles) {
  const data = JSON.parse(await readFile(join(vneDir, f), "utf8"));
  const rows = parseVne(data.html);
  if (rows.length === 0) {
    emptySchools.push({ code: data.uniCode, name: data.uniName, vneId: data.vneId, htmlLen: data.html?.length });
  }
}
console.log('Empty VNE schools count:', emptySchools.length);
console.log('Empty VNE schools:', JSON.stringify(emptySchools, null, 2));
