import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeMajor, sanitizePublicValue, sanitizeUniversity } from "../lib/dataValidation.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, ".cloudflare", "public");
const workerData = join(output, "_worker-data");
const vendor = join(output, "vendor");
const require = createRequire(import.meta.url);

async function readJson(name) {
  return JSON.parse(await readFile(join(root, "data", name), "utf8"));
}

async function writeJson(name, value) {
  await writeFile(join(workerData, name), JSON.stringify(value));
}

async function copyFileFromPackage(packageName, source, destination) {
  const packageRoot = dirname(require.resolve(`${packageName}/package.json`));
  await mkdir(dirname(join(output, destination)), { recursive: true });
  await cp(join(packageRoot, source), join(output, destination));
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}

await rm(join(root, ".cloudflare"), { recursive: true, force: true });
await mkdir(workerData, { recursive: true });
await cp(join(root, "public"), output, { recursive: true });

const [universities, majors, combinations, subjects, formulas, transcriptSubjects] = await Promise.all([
  readJson("universities.json"),
  readJson("majors.json"),
  readJson("combinations.json"),
  readJson("subjects.json"),
  readJson("admission-formulas-2026.json"),
  readJson("transcript-subjects.json")
]);
await Promise.all([
  writeJson("universities.json", universities.map(sanitizeUniversity)),
  writeJson("majors.json", majors.map(sanitizeMajor)),
  writeJson("combinations.json", combinations.map(sanitizePublicValue)),
  writeJson("subjects.json", subjects.map(sanitizePublicValue)),
  writeJson("admission-formulas-2026.json", formulas),
  writeFile(join(workerData, "README.txt"), "Generated public API data. Requests to this directory are blocked by the Worker.\n"),
  mkdir(join(vendor, "tesseract"), { recursive: true }),
  mkdir(join(vendor, "tesseract-core"), { recursive: true }),
  mkdir(join(vendor, "tesseract-lang"), { recursive: true })
]);

await Promise.all([
  copyFileFromPackage("tesseract.js", "dist/tesseract.esm.min.js", "vendor/tesseract/tesseract.esm.min.js"),
  copyFileFromPackage("tesseract.js", "dist/worker.min.js", "vendor/tesseract/worker.min.js"),
  cp(dirname(require.resolve("tesseract.js-core/package.json")), join(vendor, "tesseract-core"), { recursive: true }),
  copyFileFromPackage("@tesseract.js-data/vie", "4.0.0_best_int/vie.traineddata.gz", "vendor/tesseract-lang/vie.traineddata.gz"),
  copyFileFromPackage("@tesseract.js-data/eng", "4.0.0_best_int/eng.traineddata.gz", "vendor/tesseract-lang/eng.traineddata.gz"),
  writeFile(join(vendor, "transcript-subjects.json"), JSON.stringify(transcriptSubjects)),
  writeFile(join(output, "_headers"), [
    "/index.html",
    "  Cache-Control: no-cache",
    "/*.html",
    "  Cache-Control: no-cache",
    "/*.css",
    "  Cache-Control: no-cache",
    "/*.js",
    "  Cache-Control: no-cache",
    "/assets/logos/*",
    "  Cache-Control: public, max-age=604800",
    "/vendor/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    ""
  ].join("\n"))
]);

const files = await listFiles(output);
const fileStats = await Promise.all(files.map(async (path) => ({ path, size: (await stat(path)).size })));
const tooLarge = fileStats.filter((file) => file.size > 25 * 1024 * 1024);
if (tooLarge.length) throw new Error(`Static asset vượt 25 MiB: ${tooLarge.map((file) => relative(output, file.path)).join(", ")}`);
if (files.length > 20_000) throw new Error(`Có ${files.length} static assets, vượt giới hạn gói miễn phí 20.000 tệp.`);
const totalBytes = fileStats.reduce((sum, file) => sum + file.size, 0);
console.info(`Cloudflare build: ${files.length} tệp, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB; ${universities.length} trường, ${majors.length} dòng ngành.`);
