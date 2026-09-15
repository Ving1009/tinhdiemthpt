import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const universities = JSON.parse(await readFile(join(root, "data", "universities.json"), "utf8"));
const vneDir = join(root, "data", ".vne-cache-2026");
const tsDir = join(root, "data", ".ts247-cache-2026");
const vnnDir = join(root, "data", ".vnn-cache-2026");

const fileExists = async (p) => {
  try {
    await import("node:fs/promises").then(f => f.access(p));
    return true;
  } catch {
    return false;
  }
};

const vneFiles = new Set(await readdir(vneDir));
const tsFiles = new Set(await readdir(tsDir));
const vnnFiles = new Set(await readdir(vnnDir));

let fromVne = 0;
let fromTs = 0;
let fromVnn = 0;
let missing = [];

for (const u of universities) {
  const code = u.code;
  let source = null;

  if (vneFiles.has(`${code}.json`)) {
    const data = JSON.parse(await readFile(join(vneDir, `${code}.json`), "utf8"));
    if (data.html && data.html.length > 300) {
      source = "vne";
      fromVne++;
    }
  }

  if (!source && tsFiles.has(`${code}.json`)) {
    const data = JSON.parse(await readFile(join(tsDir, `${code}.json`), "utf8"));
    if (data.html && data.html.includes("<table")) {
      source = "ts247";
      fromTs++;
    }
  }

  if (!source && vnnFiles.has(`${code}.json`)) {
    const data = JSON.parse(await readFile(join(vnnDir, `${code}.json`), "utf8"));
    if (data.rows && data.rows.length > 0) {
      source = "vnn";
      fromVnn++;
    }
  }

  if (!source) {
    missing.push(u);
  }
}

console.log(`Universities with direct cache:`);
console.log(`  From VnExpress: ${fromVne}`);
console.log(`  From Tuyensinh247: ${fromTs}`);
console.log(`  From VietnamNet: ${fromVnn}`);
console.log(`  Total resolved directly: ${fromVne + fromTs + fromVnn} / ${universities.length}`);
console.log(`  Missing: ${missing.length}`);
console.log('Missing list:', missing.map(m => ({ id: m.id, code: m.code, name: m.name })));
