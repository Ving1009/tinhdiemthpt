import { getFormula } from "../formulas/index.js";

/**
 * Calculator Engine
 * UI only passes a formula id and input data. The engine resolves the module,
 * so adding a formula never requires changing the main interface.
 */
export const Calculator = {
  calculate({ formula, ...data }) {
    const formulaModule = getFormula(formula);
    if (!formulaModule) throw new Error(`Không tìm thấy công thức: ${formula}`);
    const result = formulaModule.calculate(data);
    return { ...result, formula: formulaModule, formulaId: formulaModule.id };
  },
  getFormula(id) { return getFormula(id); }
};
