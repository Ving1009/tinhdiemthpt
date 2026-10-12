import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContentPages, renderGuidePreview, renderRobots, renderSitemap } from "../lib/contentPages.js";

const root = fileURLToPath(new URL("../public/", import.meta.url));

export async function buildEditorialContent() {
  const pages = buildContentPages();
  for (const [path, html] of pages) {
    const target = join(root, path.slice(1), "index.html");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
  }
  await writeFile(join(root, "sitemap.xml"), renderSitemap());
  await writeFile(join(root, "robots.txt"), renderRobots());
  const indexPath = join(root, "index.html");
  const index = await readFile(indexPath, "utf8");
  const markers = /<!-- guide-preview:start -->[\s\S]*?<!-- guide-preview:end -->/;
  if (!markers.test(index)) throw new Error("Missing guide preview markers");
  await writeFile(indexPath, index.replace(markers, `<!-- guide-preview:start -->${renderGuidePreview()}<!-- guide-preview:end -->`));
  return pages.size;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.info(`Content build: ${await buildEditorialContent()} trang HTML, sitemap và robots.txt.`);
}
