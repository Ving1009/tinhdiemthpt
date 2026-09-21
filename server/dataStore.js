import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chooseBestCombination, comparisonCompatibility, comparisonContextKey, sortComparedMajors } from "../lib/majorComparison.js";
import { majorHasCombination, parseCombinationCodes } from "../lib/majorCombination.js";
import { sanitizeMajor, sanitizeUniversity } from "../lib/dataValidation.js";
import { normalizeAdmissionMethodCode } from "../lib/admissionMethod.js";
import { createAdmissionFormulaIndex } from "../lib/admissionFormulaData.js";

const DATA_ROOT = fileURLToPath(new URL("../data/", import.meta.url));
const readJson = (name) => JSON.parse(readFileSync(new URL(name, new URL("../data/", import.meta.url)), "utf8"));

export function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .replace(/\s+/g, " ")
    .trim();
}

function page(items, requestedPage, requestedSize, { defaultSize = 24, maxSize = 200 } = {}) {
  const pageSize = Math.max(1, Math.min(maxSize, Number(requestedSize) || defaultSize));
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.max(1, Math.min(pages, Number(requestedPage) || 1));
  return {
    items: items.slice((current - 1) * pageSize, current * pageSize),
    pagination: { page: current, pageSize, pages, total: items.length }
  };
}

function searchRank(entry, term) {
  if (entry.code === term) return 0;
  if (entry.code.startsWith(term)) return 1;
  if (entry.text.includes(term)) return 2;
  const words = term.split(/\s+/).filter(Boolean);
  return words.length && words.every((word) => entry.text.includes(word)) ? 3 : null;
}

export function createDataStore({ universities, majors, combinations, subjects, admissionFormulas } = {}) {
  const allUniversities = universities || readJson("universities.json");
  const allMajors = majors || readJson("majors.json");
  const allCombinations = combinations || readJson("combinations.json");
  const allSubjects = subjects || readJson("subjects.json");
  const usesInjectedCatalog = Boolean(universities || majors || combinations || subjects);
  const allAdmissionFormulas = admissionFormulas || (usesInjectedCatalog
    ? { schemaVersion: 1, year: 2026, verifiedAt: null, schools: [] }
    : readJson("admission-formulas-2026.json"));
  const universitiesById = new Map(allUniversities.map((item) => [item.id, item]));
  const majorsById = new Map(allMajors.map((item) => [item.id, item]));
  const admissionFormulaIndex = createAdmissionFormulaIndex(allAdmissionFormulas, { universities: allUniversities, majors: allMajors });
  const majorsByUniversity = new Map();
  const validCombinationCodes = new Set(allCombinations.map((item) => item.code.toLocaleUpperCase("vi")));
  const indexedMajors = allMajors.map((major) => {
    const methodCode = normalizeAdmissionMethodCode(major.method);
    if (!Object.hasOwn(major, "methodCode")) Object.defineProperty(major, "methodCode", { value: methodCode, enumerable: false });
    return {
      major, methodCode,
      text: normalizeSearch(`${major.name} ${major.code} ${major.method} ${major.combination}`),
      combinationCodes: parseCombinationCodes(major.combination, validCombinationCodes)
    };
  });
  for (const indexed of indexedMajors) {
    const list = majorsByUniversity.get(indexed.major.universityId) || [];
    list.push(indexed);
    majorsByUniversity.set(indexed.major.universityId, list);
  }
  const universitySummaries = allUniversities.map((university) => {
    const rows = majorsByUniversity.get(university.id) || [];
    const programCount = new Set(rows.map(({ major }) => `${major.code}|${major.name}`)).size;
    const cutoffCount = rows.filter(({ major }) => ["verified", "reference"].includes(major.cutoff?.status) && Number.isFinite(major.cutoff?.score)).length;
    return {
      id: university.id,
      name: university.name,
      shortName: university.shortName,
      code: university.code,
      officialAdmissionsCode: university.officialAdmissionsCode,
      logo: university.logo,
      description: university.description,
      website: university.website,
      year: university.year,
      region: university.region,
      logoStatus: university.logoStatus,
      admissionsStatus: university.admissions?.status,
      admissionsNote: university.admissions?.note,
      dataCheckedAt: university.dataCheckedAt,
      programCount,
      majorRowCount: rows.length,
      cutoffCount,
      verifiedRowCount: rows.filter(({ major }) => major.dataStatus === "verified").length,
      informationalRowCount: rows.filter(({ major }) => major.dataStatus === "reference").length,
      calculableCount: rows.filter(({ major }) => major.calculationVerified === true).length,
      verifiedFormulaCount: admissionFormulaIndex.get(university.id)?.methods.length || 0
    };
  });
  const summaryById = new Map(universitySummaries.map((item) => [item.id, item]));
  const publicInitialData = {
    universities: universitySummaries.map(sanitizeUniversity),
    combinations: allCombinations.map(sanitizeUniversity),
    subjects: allSubjects.map(sanitizeUniversity),
    metadata: {
      admissionsYear: Math.max(...allUniversities.map((item) => Number(item.year) || 0)),
      dataCheckedAt: allUniversities.map((item) => item.dataCheckedAt).filter(Boolean).sort().at(-1) || null,
      universityCount: allUniversities.length,
      majorRowCount: allMajors.length,
      quality: {
        profileStatusCounts: [...new Set(allUniversities.map((item) => item.admissions?.status || "unknown"))].sort().map((status) => ({ status, count: allUniversities.filter((item) => (item.admissions?.status || "unknown") === status).length })),
        cutoffStatusCounts: [...new Set(allMajors.map((item) => item.cutoff?.status || "missing"))].sort().map((status) => ({ status, count: allMajors.filter((item) => (item.cutoff?.status || "missing") === status).length })),
        calculableRows: allMajors.filter((item) => item.calculationVerified === true).length,
        verifiedFormulaSchools: admissionFormulaIndex.size,
        verifiedSchoolMethodFormulas: [...admissionFormulaIndex.values()].reduce((total, school) => total + school.methods.length, 0)
      }
    }
  };
  const schoolSearch = universitySummaries.map((item) => ({
    type: "school",
    id: item.id,
    code: normalizeSearch(item.officialAdmissionsCode || item.code),
    text: normalizeSearch(`${item.name} ${item.shortName} ${item.officialAdmissionsCode || ""} ${item.code}`),
    item
  }));
  const majorSearch = indexedMajors.map(({ major, text }) => ({
    type: "major",
    id: major.id,
    code: normalizeSearch(major.code),
    text,
    item: major
  }));
  const combinationSearch = allCombinations.map((item) => ({
    type: "combination",
    id: item.id,
    code: normalizeSearch(item.code),
    text: normalizeSearch(`${item.code} ${item.subjectText} ${(item.sourceCodes || []).join(" ")}`),
    item
  }));
  function toPublicMajor(major) {
    return { ...sanitizeMajor(major), methodCode: major.methodCode || normalizeAdmissionMethodCode(major.method) };
  }

  function listUniversities(query = {}) {
    const term = normalizeSearch(query.q);
    const region = String(query.region || "");
    const filtered = universitySummaries.filter((item) =>
      (!region || region === "all" || item.region === region) &&
      (!term || normalizeSearch(`${item.name} ${item.shortName} ${item.officialAdmissionsCode || ""} ${item.code}`).includes(term))
    );
    const result = page(filtered, query.page, query.pageSize, { defaultSize: 24, maxSize: 500 });
    return { ...result, items: result.items.map(sanitizeUniversity) };
  }

  function getUniversity(id) {
    const university = universitiesById.get(id);
    if (!university) return null;
    return sanitizeUniversity({ ...university, ...summaryById.get(id) });
  }

  function listUniversityMajors(id, query = {}) {
    if (!universitiesById.has(id)) return null;
    const term = normalizeSearch(query.q);
    const method = String(query.method || "");
    const requestedMethodCode = normalizeAdmissionMethodCode(method);
    const allRows = majorsByUniversity.get(id) || [];
    const rows = allRows.filter(({ text, methodCode }) => (!term || text.includes(term)) && (!requestedMethodCode || methodCode === requestedMethodCode));
    const requestedSize = Math.max(1, Math.min(100, Number(query.pageSize) || 25));
    let requestedPage = query.page;
    if (query.targetId) {
      const targetIndex = rows.findIndex(({ major }) => major.id === query.targetId);
      if (targetIndex >= 0) requestedPage = Math.floor(targetIndex / requestedSize) + 1;
    }
    const result = page(rows, requestedPage, requestedSize, { defaultSize: 25, maxSize: 100 });
    return {
      ...result,
      items: result.items.map(({ major }) => toPublicMajor(major)),
      facets: { methods: [...new Set(allRows.map(({ major }) => major.method).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")) }
    };
  }

  function listUniversityMajorOptions(id) {
    if (!universitiesById.has(id)) return null;
    return (majorsByUniversity.get(id) || []).map(({ major }) => {
      const clean = toPublicMajor(major);
      return {
        id: clean.id, universityId: clean.universityId, code: clean.code, nationalMajorCode: clean.nationalMajorCode,
        name: clean.name, programId: clean.programId, programType: clean.programType, campusId: clean.campusId, campus: clean.campus,
        method: clean.method, methodCode: clean.methodCode, admissionMethodCodes: clean.admissionMethodCodes,
        methodDetails: clean.methodDetails, combination: clean.combination, formula: clean.formula,
        formulaText: clean.formulaText, calculationVerified: clean.calculationVerified, comparisonRules: clean.comparisonRules,
        cutoff: clean.cutoff, dataStatus: clean.dataStatus
      };
    });
  }

  function listAdmissionFormulas(id) {
    const university = universitiesById.get(id);
    if (!university) return null;
    const rows = majorsByUniversity.get(id) || [];
    const school = admissionFormulaIndex.get(id);
    const methods = (school?.methods || []).map((method) => {
      const programs = [...new Map(method.applicableRows.map((major) => [
        `${major.code}|${major.name}`,
        { id: major.id, code: major.code, name: major.name, method: major.method }
      ])).values()];
      const combinations = [...new Set(method.applicableRows.flatMap((major) => parseCombinationCodes(major.combination, validCombinationCodes)))];
      return {
        id: method.id,
        label: method.label,
        status: method.status,
        expression: method.expression,
        scale: method.scale,
        conditions: method.conditions || [],
        priority: method.priority || "",
        conversion: method.conversion || "",
        combinationNote: method.combinationNote || "",
        combinations,
        programs,
        programCount: programs.length,
        autoCalculate: method.autoCalculate === true,
        formulaModuleId: method.formulaModuleId || "",
        applicabilityNote: method.applicability?.note || "",
        officialLink: {
          label: method.source.title,
          url: method.source.url,
          checkedAt: method.source.verifiedAt
        }
      };
    });
    const formulaByRepositoryMethod = new Map();
    for (const method of school?.methods || []) {
      for (const label of method.repositoryMethods || []) formulaByRepositoryMethod.set(label, method);
    }
    const methodLabels = [...new Set([
      ...(university.methods || []),
      ...rows.map(({ major }) => major.method)
    ].filter(Boolean))];
    const methodOptions = methodLabels.map((label) => {
      const formula = formulaByRepositoryMethod.get(label);
      const matchingRows = rows.filter(({ major }) => major.method === label).map(({ major }) => major);
      const programs = new Set(matchingRows.map((major) => `${major.code}|${major.name}`));
      const verifiedPrograms = formula ? new Set(formula.applicableRows.map((major) => `${major.code}|${major.name}`)) : null;
      return {
        label,
        formulaId: formula?.id || "",
        verified: Boolean(formula),
        programCount: verifiedPrograms?.size ?? programs.size
      };
    });
    return {
      available: methods.length > 0,
      year: allAdmissionFormulas.year,
      verifiedAt: allAdmissionFormulas.verifiedAt,
      message: methods.length ? "Chỉ hiển thị các công thức được nguồn chính thức nêu trực tiếp." : "Chưa có công thức chính thức được xác minh.",
      methodOptions,
      methods
    };
  }

  function listMajors(query = {}) {
    const term = normalizeSearch(query.q);
    const statuses = new Set(String(query.status || "").split(",").filter(Boolean));
    const ids = new Set(String(query.ids || "").split(",").filter(Boolean));
    const year = query.year ? Number(query.year) : null;
    const minScore = query.minScore === undefined || query.minScore === "" ? null : Number(query.minScore);
    const maxScore = query.maxScore === undefined || query.maxScore === "" ? null : Number(query.maxScore);
    const comparisonScore = query.score === undefined || query.score === "" ? null : Number(query.score);
    const comparisonScale = query.scale === undefined || query.scale === "" ? null : Number(query.scale);
    const cutoffScale = query.cutoffScale === undefined || query.cutoffScale === "" ? null : Number(query.cutoffScale);
    const method = String(query.method || "");
    const requestedMethodCode = normalizeAdmissionMethodCode(method);
    const combination = String(query.combination || "").toLocaleUpperCase("vi");
    const universityId = String(query.universityId || "");
    const region = String(query.region || "");
    const filtered = indexedMajors.filter(({ major, text, combinationCodes, methodCode }) => {
      const university = universitiesById.get(major.universityId);
      const score = major.cutoff?.score;
      return (!ids.size || ids.has(major.id)) &&
        (!term || text.includes(term)) &&
        (!universityId || major.universityId === universityId) &&
        (!region || region === "all" || university?.region === region) &&
        (!requestedMethodCode || methodCode === requestedMethodCode) &&
        (!year || major.cutoff?.year === year) &&
        (!statuses.size || statuses.has(major.cutoff?.status)) &&
        (!combination || combinationCodes.includes(combination)) &&
        (cutoffScale === null || major.cutoff?.scale === cutoffScale) &&
        (minScore === null || (Number.isFinite(score) && score >= minScore)) &&
        (maxScore === null || (Number.isFinite(score) && score <= maxScore));
    });
    const compared = filtered.map(({ major }) => {
      const clean = toPublicMajor(major);
      const check = comparisonScore === null ? null : comparisonCompatibility(major, {
          score: comparisonScore,
          scale: comparisonScale,
          year: year || 2026,
          method,
          methodCode: requestedMethodCode,
          combination,
          ruleId: query.ruleId
      }, validCombinationCodes);
      if (check?.compatible) {
        const difference = Number((comparisonScore - major.cutoff.score).toFixed(2));
        clean.comparison = {
          compatible: true, difference, direction: difference >= 0 ? "above" : "below", confidence: check.confidence,
          userScore: comparisonScore, scale: comparisonScale, combination, year: year || 2026, method, ruleId: String(query.ruleId || "")
        };
      } else if (comparisonScore !== null) {
        clean.comparison = {
          compatible: false, reason: check?.reason || "Chưa đủ ngữ cảnh để so sánh.",
          userScore: comparisonScore, scale: comparisonScale, combination, year: year || 2026, method, ruleId: String(query.ruleId || "")
        };
      }
      clean.university = sanitizeUniversity(summaryById.get(major.universityId));
      return clean;
    });
    return page(sortComparedMajors(compared, query.sort || "school"), query.page, query.pageSize, { defaultSize: 24, maxSize: 100 });
  }

  function findBestMajorCombinations(input = {}) {
    const rawContexts = Array.isArray(input.results) ? input.results.slice(0, 20) : [];
    const contexts = rawContexts.map((item) => ({
      combination: String(item.combination || "").toLocaleUpperCase("vi"),
      score: Number(item.score),
      scale: Number(item.scale),
      year: Number(item.year || input.year || 2026),
      method: String(item.method || "THPT"),
      methodCode: normalizeAdmissionMethodCode(item.method || "THPT"),
      ruleId: String(item.ruleId || "")
    })).filter((item) => item.combination && Number.isFinite(item.score) && Number.isFinite(item.scale) && item.scale > 0 && item.score >= 0 && item.score <= item.scale);
    if (!contexts.length) return { items: [], pagination: { page: 1, pageSize: 24, pages: 1, total: 0 } };
    const wantedCodes = new Set(contexts.map((item) => item.combination));
    const statuses = new Set(String(input.status || "verified,reference").split(",").filter(Boolean));
    const term = normalizeSearch(input.q);
    const maxScore = input.maxScore === "" || input.maxScore === undefined ? null : Number(input.maxScore);
    const cutoffScale = input.cutoffScale === "" || input.cutoffScale === undefined ? null : Number(input.cutoffScale);
    const groups = new Map();
    for (const { major, text, combinationCodes, methodCode } of indexedMajors) {
      const university = universitiesById.get(major.universityId);
      if (!combinationCodes.some((code) => wantedCodes.has(code))) continue;
      if (term && !text.includes(term)) continue;
      if (input.universityId && major.universityId !== input.universityId) continue;
      if (input.region && input.region !== "all" && university?.region !== input.region) continue;
      if (methodCode !== "thpt" || Number(major.cutoff?.year) !== Number(input.year || 2026)) continue;
      if (statuses.size && !statuses.has(major.cutoff?.status)) continue;
      if (Number.isFinite(maxScore) && (Number(major.cutoff?.scale) !== cutoffScale || Number(major.cutoff?.score) > maxScore)) continue;
      const chosen = chooseBestCombination(major, contexts, validCombinationCodes, combinationCodes);
      const comparison = chosen.best?.compatible ? {
        compatible: true,
        difference: chosen.best.difference,
        direction: chosen.best.difference >= 0 ? "above" : "below",
        confidence: chosen.best.confidence
      } : { compatible: false, reason: chosen.best?.reason || "Chưa đủ căn cứ để so sánh." };
      const key = comparisonContextKey(major);
      const current = groups.get(key);
      const candidate = { major, combinationMatch: chosen.best, alternativeCombinations: chosen.alternatives, comparison };
      if (!current) { groups.set(key, candidate); continue; }
      const replace = comparison.compatible && (!current.comparison.compatible || comparison.difference > current.comparison.difference);
      const winner = replace ? candidate : current;
      const merged = new Map([...current.alternativeCombinations, ...candidate.alternativeCombinations].map((item) => [item.combination, item]));
      winner.alternativeCombinations = [...merged.values()].sort((a, b) => Number(b.compatible) - Number(a.compatible) || (b.difference ?? -Infinity) - (a.difference ?? -Infinity) || a.combination.localeCompare(b.combination, "vi"));
      groups.set(key, winner);
    }
    const publicGroups = [...groups.values()].map((candidate) => {
      const clean = toPublicMajor(candidate.major);
      clean.university = sanitizeUniversity(summaryById.get(candidate.major.universityId));
      clean.combinationMatch = candidate.combinationMatch;
      clean.alternativeCombinations = candidate.alternativeCombinations;
      clean.comparison = candidate.comparison;
      return clean;
    });
    const sorted = sortComparedMajors(publicGroups, input.sort);
    return page(sorted, input.page, input.pageSize, { defaultSize: 24, maxSize: 100 });
  }

  function search(query, requestedLimit = 25) {
    const term = normalizeSearch(query);
    if (!term) return [];
    const limit = Math.max(1, Math.min(30, Number(requestedLimit) || 25));
    const seen = new Set();
    const ranked = [...combinationSearch, ...schoolSearch, ...majorSearch]
      .map((entry) => ({ entry, rank: searchRank(entry, term) }))
      .filter((item) => item.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.entry.code.localeCompare(b.entry.code, "vi"))
      .filter(({ entry }) => {
        const key = entry.type === "major" ? `major|${entry.item.universityId}|${entry.item.code}|${entry.item.name}` : `${entry.type}|${entry.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
    return ranked
      .map(({ entry }) => {
        if (entry.type === "school") return { type: "school", item: sanitizeUniversity(entry.item) };
        if (entry.type === "combination") return { type: "combination", item: sanitizeUniversity(entry.item) };
        const school = summaryById.get(entry.item.universityId);
        return { type: "major", item: { id: entry.item.id, universityId: entry.item.universityId, code: entry.item.code, name: entry.item.name, method: entry.item.method, methodCode: normalizeAdmissionMethodCode(entry.item.method), combination: entry.item.combination }, university: sanitizeUniversity(school) };
      });
  }

  return {
    dataRoot: DATA_ROOT,
    universities: allUniversities,
    majors: allMajors,
    combinations: allCombinations,
    subjects: allSubjects,
    publicCombinations: allCombinations.map(sanitizeUniversity),
    publicSubjects: allSubjects.map(sanitizeUniversity),
    universitiesById,
    majorsById,
    validCombinationCodes,
    publicInitialData,
    listUniversities,
    getUniversity,
    listUniversityMajors,
    listUniversityMajorOptions,
    listAdmissionFormulas,
    listMajors,
    findBestMajorCombinations,
    search,
    majorHasCombination: (major, code) => majorHasCombination(major, code, validCombinationCodes)
  };
}

export const defaultDataStore = createDataStore();
