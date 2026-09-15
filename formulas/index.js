import { thptFormula } from "./thpt.js";
import { hocBaFormula } from "./hocba.js";
import { dgnlFormula } from "./dgnl.js";
import { dgtFormula } from "./dgt.js";
import { universityExampleFormula } from "./universities/university-example.js";
import { technologySampleDgnlFormula, technologySampleThptFormula } from "./universities/technology-sample.js";
import { technicalCollegeThptFormula } from "./universities/technical-college-sample.js";
import { generatedSchoolFormulas } from "./universities/generated-school-formulas.js";

// Registry là "điểm nối" giữa dữ liệu và các module công thức.
// Khi thêm công thức mới: import tại đây và thêm vào mảng, không sửa UI.
export const formulaList = [thptFormula, hocBaFormula, dgnlFormula, dgtFormula, universityExampleFormula, technologySampleThptFormula, technologySampleDgnlFormula, technicalCollegeThptFormula];
export const formulaRegistry = new Map([...formulaList, ...generatedSchoolFormulas].map((formula) => [formula.id, formula]));

export function getFormula(id) {
  return formulaRegistry.get(id);
}
