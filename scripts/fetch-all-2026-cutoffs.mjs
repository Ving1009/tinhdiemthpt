import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vneDir = join(root, "data", ".vne-cache-2026");
const tsDir = join(root, "data", ".ts247-cache-2026");

await mkdir(vneDir, { recursive: true });
await mkdir(tsDir, { recursive: true });

const fileExists = async (p) => {
  try { await access(p); return true; } catch { return false; }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchVne = async () => {
  const { matched } = JSON.parse(await readFile(join(root, "scripts", "vne-mapping.json"), "utf8"));
  console.log(`[VnExpress] Fetching 2026 benchmark for ${matched.length} universities...`);

  let fetched = 0;
  let cached = 0;
  let failed = 0;

  for (let i = 0; i < matched.length; i++) {
    const item = matched[i];
    const code = item.uni.code;
    const vneId = item.vne.id;
    const cacheFile = join(vneDir, `${code}.json`);

    if (await fileExists(cacheFile)) {
      cached++;
      continue;
    }

    try {
      const url = `https://diemthi.vnexpress.net/tra-cuu-dai-hoc/loadbenchmark/id/${vneId}/year/2026/sortby/1/block_name/all`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `https://diemthi.vnexpress.net/tra-cuu-dai-hoc/${vneId}`
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await writeFile(cacheFile, JSON.stringify({
        uniCode: code,
        uniName: item.uni.name,
        vneId,
        html: json.html || '',
        fetchedAt: new Date().toISOString()
      }));
      fetched++;
      process.stdout.write(`[VNE ${i + 1}/${matched.length}] OK: ${code} (${item.uni.name})\n`);
    } catch (e) {
      failed++;
      console.error(`[VNE ${i + 1}/${matched.length}] FAILED: ${code} - ${e.message}`);
    }
    await sleep(120);
  }
  console.log(`[VnExpress] Done! Fetched: ${fetched}, Cached: ${cached}, Failed: ${failed}`);
};

const fetchTs247 = async () => {
  const { found } = JSON.parse(await readFile(join(root, "scripts", "unmatched-resolved.json"), "utf8"));
  const tsList = found.filter(f => f.source === 'ts247');
  console.log(`[Tuyensinh247] Fetching 2026 benchmark for ${tsList.length} universities...`);

  let fetched = 0;
  let cached = 0;
  let failed = 0;

  for (let i = 0; i < tsList.length; i++) {
    const item = tsList[i];
    const code = item.uni.code;
    const cacheFile = join(tsDir, `${code}.json`);

    if (await fileExists(cacheFile)) {
      cached++;
      continue;
    }

    try {
      const res = await fetch(item.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      await writeFile(cacheFile, JSON.stringify({
        uniCode: code,
        uniName: item.uni.name,
        url: item.url,
        slug: item.slug,
        html,
        fetchedAt: new Date().toISOString()
      }));
      fetched++;
      process.stdout.write(`[TS247 ${i + 1}/${tsList.length}] OK: ${code} (${item.uni.name})\n`);
    } catch (e) {
      failed++;
      console.error(`[TS247 ${i + 1}/${tsList.length}] FAILED: ${code} - ${e.message}`);
    }
    await sleep(150);
  }
  console.log(`[Tuyensinh247] Done! Fetched: ${fetched}, Cached: ${cached}, Failed: ${failed}`);
};

await fetchVne();
await fetchTs247();
