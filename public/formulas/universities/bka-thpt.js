import { calculateAdmissionPriority, rounded, subjectLabel } from "../../js/utils.js";

const STANDARD_RULE = "three-subject-sum-priority-2026";
const K01_RULE = "bka-k01-weighted-priority-2026";

const COMBINATIONS = {
  A00: { ruleId: STANDARD_RULE, subjects: ["math", "physics", "chemistry"] },
  A01: { ruleId: STANDARD_RULE, subjects: ["math", "physics", "foreignLanguage:english"] },
  K01: { ruleId: K01_RULE, subjects: ["math", "literature"], choice: ["physics", "chemistry", "biology", "informatics"] }
};

const LABELS = {
  "foreignLanguage:english": "Tiếng Anh",
  physics: "Vật lí",
  chemistry: "Hóa học",
  biology: "Sinh học",
  informatics: "Tin học"
};

function label(key) { return LABELS[key] || subjectLabel(key); }

export const bkaThptFormula = {
  id: "bka-thpt-2026",
  name: "Điểm THPT Đại học Bách khoa Hà Nội 2026",
  year: 2026,
  verified: true,
  generic: false,
  type: "Thi THPT",
  description: "Hỗ trợ A00, A01 và công thức trọng số K01 theo quy tắc đã liên kết với ba chương trình trong dữ liệu.",
  inputs: ["Tổ hợp", "Điểm các môn", "Khu vực", "Đối tượng ưu tiên"],
  expression: "A00/A01: tổng 3 môn + ưu tiên. K01: [3 × Toán + Ngữ văn + 2 × (Lí/Hóa/Sinh/Tin)] ÷ 2 + ưu tiên.",
  example: "K01: Toán 9, Văn 8, Vật lí 9 → (27 + 8 + 18) ÷ 2 = 26,50 trước điểm ưu tiên.",
  combinations: COMBINATIONS,
  getInputDefinition(combinationCode, choice) {
    const config = COMBINATIONS[combinationCode];
    if (!config) return null;
    const selectedChoice = config.choice?.includes(choice) ? choice : config.choice?.[0];
    return { ...config, selectedChoice, subjects: config.choice ? [...config.subjects, selectedChoice] : [...config.subjects] };
  },
  calculate(data) {
    const definition = this.getInputDefinition(data.combinationCode, data.choiceSubject);
    if (!definition) throw new Error("Tổ hợp chưa được công thức này hỗ trợ.");
    const scores = data.scores || {};
    let examScore;
    let breakdown;
    if (data.combinationCode === "K01") {
      examScore = rounded((3 * Number(scores.math) + Number(scores.literature) + 2 * Number(scores[definition.selectedChoice])) / 2);
      breakdown = [
        { label: "Toán", value: Number(scores.math), weight: 3 },
        { label: "Ngữ văn", value: Number(scores.literature), weight: 1 },
        { label: label(definition.selectedChoice), value: Number(scores[definition.selectedChoice]), weight: 2 }
      ];
    } else {
      examScore = rounded(definition.subjects.reduce((sum, key) => sum + Number(scores[key]), 0));
      breakdown = definition.subjects.map((key) => ({ label: label(key), value: Number(scores[key]), weight: 1 }));
    }
    const priority = calculateAdmissionPriority(examScore, data.priorityContext);
    return {
      total: rounded(examScore + priority.adjusted),
      maxScore: 30,
      examScore,
      priority,
      breakdown,
      combinationCode: data.combinationCode,
      comparisonRule: definition.ruleId,
      explanation: data.combinationCode === "K01" ? this.expression.split(". ")[1] : this.expression.split(". ")[0],
      formula: this.expression
    };
  },
  formatResult(result) { return `${result.total.toFixed(2)} / ${result.maxScore}`; }
};

export const BKA_STANDARD_COMPARISON_RULE = STANDARD_RULE;
export const BKA_K01_COMPARISON_RULE = K01_RULE;
