import { Calculator } from "../calculator.js";
import { ACADEMIC_METHODS } from "../../formulas/hocba.js";
import { canonicalSubjectKey, combinationSubjectKeys, isStandardCombination } from "./subjectMatching.js";

function languageMatches(combination, languageLabel) {
  const keys = combinationSubjectKeys(combination);
  const languageKey = canonicalSubjectKey("foreignLanguage", languageLabel);
  return !keys.some((key) => key.startsWith("foreignLanguage:")) || keys.includes(languageKey);
}

function complete(combination, scores, columns) {
  return combination.subjectIds.every((id) => columns.every((column) => Number.isFinite(scores[id]?.[column.id])));
}

export function calculateAcademicCombinations({ combinations, scores, methodId, languageLabel, priorityContext = {}, multiplierEnabled = false, multiplierSubject = "" }) {
  const method = ACADEMIC_METHODS[methodId];
  if (!method) return { valid: false, errors: ["Phương thức học bạ không hợp lệ."], results: [] };
  if (multiplierEnabled && !multiplierSubject) return { valid: false, errors: ["Hãy chọn môn nhân hệ số 2."], results: [] };
  const rows = combinations.filter((combination) => isStandardCombination(combination) && languageMatches(combination, languageLabel) && complete(combination, scores, method.columns));
  const results = rows.flatMap((combination) => {
    const keys = combinationSubjectKeys(combination);
    if (multiplierEnabled && !keys.includes(multiplierSubject)) return [];
    const subjectMultipliers = {};
    if (multiplierEnabled) subjectMultipliers[combination.subjectIds[keys.indexOf(multiplierSubject)]] = 2;
    const subjectLabels = Object.fromEntries(combination.subjectIds.map((id, index) => [id, combination.subjects[index]]));
    const academicScores = Object.fromEntries(combination.subjectIds.map((id) => [id, scores[id]]));
    const result = Calculator.calculate({ formula: "hocba-example", method: methodId, academicScores, priorityContext, subjects: combination.subjectIds, subjectLabels, subjectMultipliers });
    return [{ combination, result }];
  }).sort((a, b) => b.result.total - a.result.total || a.combination.code.localeCompare(b.combination.code, "vi"));
  return { valid: true, errors: [], results, scale: multiplierEnabled ? 40 : 30 };
}
