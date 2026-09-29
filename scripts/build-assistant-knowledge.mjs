import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const defaultOutput = join(root, "public", "data", "assistant-knowledge.json");

async function readJson(name) {
  return JSON.parse(await readFile(join(root, "data", name), "utf8"));
}

function publicScore(cutoff = {}) {
  return ["verified", "reference"].includes(cutoff.status) && Number.isFinite(cutoff.score)
    ? cutoff.score
    : null;
}

export async function buildAssistantKnowledge(outputPath = defaultOutput) {
  const [universities, majors, combinations] = await Promise.all([
    readJson("universities.json"),
    readJson("majors.json"),
    readJson("combinations.json")
  ]);
  const schools = universities.map((item) => [
    item.id,
    item.officialAdmissionsCode || item.code || "",
    item.name || "",
    item.shortName || "",
    item.region || "",
    item.description || "",
    item.admissions?.status || "",
    ""
  ]);
  const grouped = new Map();
  for (const major of majors) {
    const key = `${major.universityId}|${major.code}|${major.name}`;
    let program = grouped.get(key);
    if (!program) {
      program = [major.id, major.universityId, major.code || "", major.name || "", [], new Set()];
      grouped.set(key, program);
    }
    const cutoff = major.cutoff || {};
    const method = [
      major.method || "",
      major.combination || "",
      Number(cutoff.year) || null,
      publicScore(cutoff),
      Number(cutoff.scale) || null,
      cutoff.status || "",
      major.formulaText || ""
    ];
    const methodKey = JSON.stringify(method);
    if (!program[5].has(methodKey)) {
      program[5].add(methodKey);
      program[4].push(method);
    }
  }
  const programs = [...grouped.values()].map((item) => item.slice(0, 5));
  const catalog = combinations.map((item) => [item.code || "", item.subjectText || (item.subjects || []).join("; ")]);
  const checkedAt = universities.map((item) => item.dataCheckedAt).filter(Boolean).sort().at(-1) || null;
  const payload = {
    v: 1,
    y: Math.max(...universities.map((item) => Number(item.year) || 0)),
    c: checkedAt,
    s: schools,
    p: programs,
    t: catalog
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload));
  return { outputPath, schools: schools.length, programs: programs.length };
}

const directRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (directRun) {
  const result = await buildAssistantKnowledge(process.argv[2] ? join(process.cwd(), process.argv[2]) : defaultOutput);
  console.info(`Kho trợ lý: ${result.schools} trường, ${result.programs} ngành -> ${result.outputPath}`);
}
