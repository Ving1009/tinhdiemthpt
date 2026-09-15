import universities from "../../data/universities.json" with { type: "json" };
import { dgnlFormula } from "../dgnl.js";
import { dgtFormula } from "../dgt.js";
import { hocBaFormula } from "../hocba.js";
import { thptFormula } from "../thpt.js";

const schoolFormulaIds = [...new Set(universities.flatMap((university) => university.formulas || []))];

function sourceFormulaFor(id) {
  if (/hocba|hoc-ba/i.test(id)) return hocBaFormula;
  if (/dgnl/i.test(id)) return dgnlFormula;
  if (/tsa|dgt|vsat|testas|sat|nangkhieu|phongvan|hoso|schoolrank|bocongan|tienganh|ket-hop|huyen/i.test(id)) return dgtFormula;
  return thptFormula;
}

function labelFor(id) {
  return id.replace(/-2026$/, "").replaceAll("-", " ").toLocaleUpperCase("vi");
}

/**
 * Các mã công thức trong danh mục trường được tạo từ một khung tính theo loại
 * phương thức. Điều kiện riêng, hệ số và ngưỡng của từng đề án vẫn cần được
 * bổ sung trước khi hiển thị kết quả xét tuyển chính thức theo ngành.
 */
export const generatedSchoolFormulas = schoolFormulaIds.map((id) => {
  const source = sourceFormulaFor(id);
  return {
    ...source,
    id,
    verified: false,
    name: `Công thức khung ${labelFor(id)}`,
    description: "Công thức khung theo phương thức đã khai báo; cần đối chiếu đề án tuyển sinh 2026 của trường.",
    example: "Kết quả chỉ có giá trị tham khảo đến khi trường cập nhật điều kiện và hệ số riêng."
  };
});
