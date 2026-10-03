import { calculateAdmissionPriority, rounded } from '../utils.js';

export function validSchoolFormulaRanges(field, maxScore) {
  if (field.ranges == null) return true;
  if (field.lookup || !Array.isArray(field.ranges) || !field.ranges.length || field.ranges.some((range) => !range || typeof range !== 'object')) return false;
  const ranges = [...field.ranges].sort((a, b) => a.min - b.min);
  return ranges.every((range, i) => [range.min, range.max, range.minOutput, range.maxOutput].every(Number.isFinite) &&
    range.min >= field.min && range.max <= field.max && range.min < range.max && range.minOutput >= 0 &&
    range.minOutput <= range.maxOutput && range.maxOutput <= maxScore && (!i || ranges[i - 1].max <= range.min));
}

export function validateSchoolFormulaValue(raw, field) {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (!text) return { valid: false, message: 'Vui lòng nhập điểm.' };
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return { valid: false, message: 'Hãy nhập một số hợp lệ.' };
  const value = Number(text);
  if (!Number.isFinite(value) || value < field.min || value > field.max) return { valid: false, message: `Điểm phải từ ${field.min} đến ${field.max}.` };
  if ((text.split('.')[1] || '').length > 2) return { valid: false, message: 'Dùng tối đa 2 chữ số thập phân.' };
  if (field.lookup && !Object.hasOwn(field.lookup, String(value))) return { valid: false, message: 'Điểm này chưa có trong bảng quy đổi đã xác minh.' };
  if (field.ranges && (!Array.isArray(field.ranges) || !field.ranges.some((range) => value > range?.min && value <= range?.max))) return { valid: false, message: 'Điểm này nằm ngoài các khoảng quy đổi đã xác minh.' };
  return { valid: true, value };
}

export function calculateSchoolFormula(rule, rawValues, context = {}) {
  if (rule?.type !== 'weighted_sum' || !Array.isArray(rule.inputs) || !rule.inputs.length || !Number.isFinite(rule.maxScore) || rule.maxScore <= 0 || !Number.isFinite(rule.divisor) || rule.divisor <= 0) throw new Error('Quy tắc tính điểm chưa được hỗ trợ.');
  const values = rule.inputs.map((field) => {
    if (![field.min, field.max, field.weight].every(Number.isFinite) || field.min > field.max || field.weight < 0 || !validSchoolFormulaRanges(field, rule.maxScore)) throw new Error('Cấu hình ô nhập không hợp lệ.');
    const result = validateSchoolFormulaValue(rawValues[field.key], field);
    if (!result.valid) throw new Error(`${field.label}: ${result.message}`);
    const range = field.ranges?.find((range) => result.value > range.min && result.value <= range.max);
    // Published intervals use a < x <= b and round the converted score before weighting.
    const converted = range ? rounded(range.minOutput + (result.value - range.min) / (range.max - range.min) * (range.maxOutput - range.minOutput)) : field.lookup ? field.lookup[String(result.value)] : result.value;
    if (!Number.isFinite(converted) || converted < 0) throw new Error('Bảng quy đổi chưa hợp lệ.');
    return { field, value: result.value, converted };
  });
  const multiplier = rule.multiplier ?? 1;
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error('Hệ số công thức không hợp lệ.');
  const base = values.reduce((sum, { field, converted }) => sum + field.weight * converted, 0) * multiplier / rule.divisor;
  if (base < 0 || base > rule.maxScore + 1e-8) throw new Error('Điểm sau trọng số vượt thang điểm. Bạn hãy kiểm tra lại điểm đã nhập.');
  const bonusResult = rule.bonus ? validateSchoolFormulaValue(rawValues.bonus ?? '0', rule.bonus) : { valid: true, value: 0 };
  if (!bonusResult.valid) throw new Error(bonusResult.message);
  const priorityBasis = Math.min(rule.maxScore, base + (rule.priorityIncludesBonus ? bonusResult.value : 0));
  const priority = rule.priority ? calculateAdmissionPriority(priorityBasis, context, rule.maxScore) : { base: 0, adjusted: 0, scale: rule.maxScore, shouldAdjust: false };
  return {
    base: rounded(base), priority, bonus: bonusResult.value,
    total: rounded(Math.min(rule.maxScore, base + bonusResult.value + priority.adjusted)), maxScore: rule.maxScore,
    breakdown: values.map(({ field, value }) => ({ label: field.label, value, weight: field.weight })),
  };
}
