import { getThptFormulaForYear } from "../../formulas/index.js";
import { validateScore } from "../utils.js";
import { combinationSubjectKeys, isStandardCombination, subjectLabelForKey } from "./subjectMatching.js";

export function validateSubjectEntries(entries, expectedCount = 4) {
  const errors = [];
  if (!Array.isArray(entries) || entries.length !== expectedCount) errors.push(`Cần nhập đúng ${expectedCount} môn.`);
  const keys = entries?.map((item) => item.subjectKey).filter(Boolean) || [];
  if (keys.length !== expectedCount) errors.push("Hãy chọn đủ môn.");
  if (new Set(keys).size !== keys.length) errors.push("Không được chọn trùng môn.");
  const normalized = (entries || []).map((item, index) => {
    const score = validateScore(item.score);
    if (!score.valid) errors.push(`Môn ${index + 1}: ${score.message}`);
    return { subjectKey: item.subjectKey, score: score.valid ? score.value : null };
  });
  return { valid: errors.length === 0, errors, entries: normalized };
}

export function findMatchingCombinations(entries, combinations) {
  const selected = new Set(entries.map((item) => item.subjectKey));
  return combinations.filter((combination) => isStandardCombination(combination) && combinationSubjectKeys(combination).every((key) => selected.has(key)));
}

export function calculateCombination(combination, entries, { year = 2026, priorityContext = {} } = {}) {
  const formula = getThptFormulaForYear(year);
  if (!formula) throw new Error(`Công thức THPT ${year} đang được cập nhật.`);
  const scoreMap = new Map(entries.map((item) => [item.subjectKey, Number(item.score)]));
  const keys = combinationSubjectKeys(combination);
  const scores = Object.fromEntries(keys.map((key) => [key, scoreMap.get(key)]));
  const labels = Object.fromEntries(keys.map((key) => [key, subjectLabelForKey(key)]));
  return formula.calculate({ scores, priorityContext, subjects: keys, subjectLabels: labels });
}

export function calculateAutomaticCombinations({ entries, combinations, year = 2026, priorityContext = {} }) {
  const input = validateSubjectEntries(entries, 4);
  if (!input.valid) return { valid: false, errors: input.errors, results: [] };
  const results = findMatchingCombinations(input.entries, combinations)
    .map((combination) => ({ combination, result: calculateCombination(combination, input.entries, { year, priorityContext }) }))
    .sort((a, b) => b.result.total - a.result.total || a.combination.code.localeCompare(b.combination.code, "vi"));
  return { valid: true, errors: [], results };
}

