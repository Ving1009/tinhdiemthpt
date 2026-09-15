import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const url = "https://diemthi.tuyensinh247.com/diem-chuan/truong-dai-hoc-giao-thong-van-tai-tphcm-UTH.html";
const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
if (res.ok) {
  const html = await res.text();
  console.log("UTH fetched, length:", html.length);
  await writeFile(join(root, "data", ".ts247-cache-2026", "GTS.json"), JSON.stringify({
    uniCode: "GTS",
    uniName: "Trường Đại học Giao thông vận tải TP.HCM (UTH)",
    url,
    slug: "truong-dai-hoc-giao-thong-van-tai-tphcm-UTH",
    html,
    fetchedAt: new Date().toISOString()
  }));
  console.log("Saved GTS.json!");
}
