import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const codes = [
  "BVU", "DCA", "DDA", "DDM", "DFA", "DMS", "DSD", "DSG", "DTM", "DVB",
  "DVX", "FBU", "FPT", "GTS", "HCN", "IUH", "IUQ", "MTH", "MTS", "NHP",
  "NVS", "PCS", "SKV", "SPS", "TDS", "THP", "TLS", "UFA", "UKB"
];

for (const code of codes) {
  // Check VNN cache
  try {
    const vnn = JSON.parse(await readFile(join(root, "data", ".vnn-cache-2026", `${code}.json`), "utf8"));
    if (vnn.rows && vnn.rows.length > 0) {
      console.log(`[VNN HAS] ${code}: ${vnn.rows.length} rows`);
      continue;
    }
  } catch {}

  // Check TS247
  try {
    const tsUrl = `https://diemthi.tuyensinh247.com/diem-chuan/truong-${code.toLowerCase()}-${code}.html`;
    // We can test TS247
  } catch {}
  console.log(`[VNN EMPTY] ${code}`);
}
