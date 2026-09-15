import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createReportStore } from "../server/reportStore.js";

const dataUrl = new URL("../data/", import.meta.url);
const loadJson = async (name) => JSON.parse(await readFile(new URL(name, dataUrl), "utf8"));
const args = process.argv.slice(2);
const command = args[0] || "overview";
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
};
const countBy = (items, getter) => Object.fromEntries([...items.reduce((counts, item) => {
  const key = String(getter(item) || "unknown");
  counts.set(key, (counts.get(key) || 0) + 1);
  return counts;
}, new Map())].sort(([a], [b]) => a.localeCompare(b, "vi")));

const reportStore = createReportStore();

if (command === "overview") {
  const [universities, majors, reports] = await Promise.all([
    loadJson("universities.json"),
    loadJson("majors.json"),
    reportStore.list({ limit: 5000 })
  ]);
  const majorCounts = new Map();
  for (const major of majors) majorCounts.set(major.universityId, (majorCounts.get(major.universityId) || 0) + 1);
  const withoutRows = universities.filter((university) => !majorCounts.has(university.id)).map((university) => ({
    id: university.id,
    code: university.officialAdmissionsCode || university.code,
    name: university.name,
    classification: university.admissions?.status || "unknown"
  }));
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    totals: { universities: universities.length, majors: majors.length, reports: reports.length },
    universityProfileStatuses: countBy(universities, (item) => item.admissions?.status),
    majorDataStatuses: countBy(majors, (item) => item.dataStatus),
    cutoffStatuses: countBy(majors, (item) => item.cutoff?.status),
    reportStatuses: countBy(reports, (item) => item.status),
    universitiesWithoutMajorRows: withoutRows
  }, null, 2));
} else if (command === "reports") {
  const status = option("--status");
  const limit = option("--limit") || 100;
  const reports = await reportStore.list({ status, limit });
  console.log(JSON.stringify({ count: reports.length, status: status || "all", reports }, null, 2));
} else if (command === "review") {
  const id = args[1];
  const status = option("--status");
  const note = option("--note");
  if (!id || !status) throw new Error("Cách dùng: npm.cmd run admin:data -- review <id> --status <in_review|resolved|rejected> [--note \"...\"]");
  const result = await reportStore.updateStatus(id, status, note);
  console.log(JSON.stringify(result, null, 2));
} else if (command === "sync-reports") {
  const result = await reportStore.syncPending({ limit: option("--limit") || 100 });
  console.log(JSON.stringify(result, null, 2));
} else {
  throw new Error("Lệnh không hợp lệ. Dùng overview, reports, review hoặc sync-reports.");
}
