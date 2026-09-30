import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAdmissionFormulaData } from "../lib/admissionFormulaData.js";
import { validateDataset } from "../lib/dataValidation.js";
import { createSchoolFormulaCatalogIndex } from "../lib/schoolFormulaCatalog.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = async (name) => JSON.parse(await readFile(join(root, "data", name), "utf8"));
const [universities, majors, combinations, admissionFormulas, schoolFormulaCatalog] = await Promise.all([
  load("universities.json"),
  load("majors.json"),
  load("combinations.json"),
  load("admission-formulas-2026.json"),
  load("school-formula-catalog-2026.json")
]);

const dataset = validateDataset({ universities, majors, combinations });
const formulas = validateAdmissionFormulaData(admissionFormulas, { universities, majors });
const errors = [...dataset.errors, ...formulas.errors];
const warnings = [...dataset.warnings, ...formulas.warnings];
try { createSchoolFormulaCatalogIndex(schoolFormulaCatalog, { universities, majors }); }
catch (error) { errors.push(error.message); }

console.log(`Universities: ${dataset.stats.universities}`);
console.log(`Majors: ${dataset.stats.majors}`);
console.log(`Combinations: ${dataset.stats.combinations}`);
console.log(`Verified formula schools: ${formulas.stats.mappedSchools}`);
console.log(`Verified school-method formulas: ${formulas.stats.verifiedSchoolMethods}`);
console.log(`Researched formula catalog: ${schoolFormulaCatalog.summary.schools} schools, ${schoolFormulaCatalog.summary.methods} methods`);
console.log(`Catalog statuses: ${JSON.stringify(schoolFormulaCatalog.summary.statuses)}`);
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
