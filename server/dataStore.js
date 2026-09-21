import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDataStore, normalizeSearch } from "./dataStoreCore.js";

const DATA_ROOT = fileURLToPath(new URL("../data/", import.meta.url));
const readJson = (name) => JSON.parse(readFileSync(new URL(name, new URL("../data/", import.meta.url)), "utf8"));

export { createDataStore, normalizeSearch };

export const defaultDataStore = createDataStore({
  universities: readJson("universities.json"),
  majors: readJson("majors.json"),
  combinations: readJson("combinations.json"),
  subjects: readJson("subjects.json"),
  admissionFormulas: readJson("admission-formulas-2026.json"),
  dataRoot: DATA_ROOT
});
