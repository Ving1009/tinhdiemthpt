import { thptFormula } from "./thpt.js";
import { hocBaFormula } from "./hocba.js";
import { dgnlFormula } from "./dgnl.js";
import { dgtFormula } from "./dgt.js";
import { bkaThptFormula } from "./universities/bka-thpt.js";

// Public registry only contains reusable formulas whose rules are explicit.
// School-specific formulas are added here only after their complete rule is verified.
export const formulaList = [thptFormula, hocBaFormula, dgnlFormula, dgtFormula, bkaThptFormula];
export const formulaRegistry = new Map(formulaList.map((formula) => [formula.id, formula]));

export function getFormula(id) {
  return formulaRegistry.get(id);
}

export function getThptFormulaForYear(year) {
  return formulaList.find((formula) => formula.type === "Thi THPT" && formula.year === Number(year) && formula.generic === true);
}
