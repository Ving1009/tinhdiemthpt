import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCertificateConversions } from "../lib/certificateConversion.js";
import { validateDataset } from "../lib/dataValidation.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = async (name) => JSON.parse(await readFile(join(root, "data", name), "utf8"));
const [universities, majors, combinations, certificateConversions] = await Promise.all([
  load("universities.json"),
  load("majors.json"),
  load("combinations.json"),
  load("certificate-conversions.json")
]);

const dataset = validateDataset({ universities, majors, combinations });
const certificates = validateCertificateConversions(certificateConversions, { universityIds: new Set(universities.map((item) => item.id)) });
const errors = [...dataset.errors, ...certificates.errors];
const warnings = [...dataset.warnings];

console.log(`Universities: ${dataset.stats.universities}`);
console.log(`Majors: ${dataset.stats.majors}`);
console.log(`Combinations: ${dataset.stats.combinations}`);
console.log("");
console.log("Cutoffs:");
console.log(`Verified: ${dataset.stats.cutoffs.verified}`);
console.log(`Reference: ${dataset.stats.cutoffs.reference}`);
console.log(`Unverified: ${dataset.stats.cutoffs.unverified}`);
console.log(`Not published: ${dataset.stats.cutoffs.not_published}`);
if (dataset.stats.cutoffs.other) console.log(`Other: ${dataset.stats.cutoffs.other}`);
console.log("");
console.log(`Errors: ${errors.length}`);
for (const message of errors.slice(0, 50)) console.log(`- ${message}`);
console.log(`Warnings: ${warnings.length}`);
for (const message of warnings.slice(0, 50)) console.log(`- ${message}`);
if (errors.length) process.exitCode = 1;

