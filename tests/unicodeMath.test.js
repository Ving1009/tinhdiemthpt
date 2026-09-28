import assert from "node:assert/strict";
import test from "node:test";
import { PRACTICE_EXAMS_2026 } from "../public/js/data/practiceExams2026.js";
import { toUnicodeChemistryText, toUnicodeMathText } from "../public/js/core/unicodeMath.js";

test("cú pháp toán học được đổi sang ký hiệu Unicode", () => {
  assert.equal(
    toUnicodeMathText(String.raw`Cho $(u_n)$, $x^2$, $\frac{37}{3}$, $\mathbb{R}$, $\overrightarrow{AB}$`),
    "Cho (uₙ), x², 37⁄3, ℝ, →AB"
  );
  assert.equal(
    toUnicodeMathText(String.raw`\begin{cases} x + y < 0 \\ x-y > 1 \end{cases}`),
    "{ x + y < 0; x-y > 1 }"
  );
  assert.equal(toUnicodeMathText("lambda = 2,50 * 10^(-10) s^(-1), x.10^(24), (238)Pu, m^3"), "λ = 2,50 × 10⁻¹⁰ s⁻¹, x × 10²⁴, ²³⁸Pu, m³");
});

test("công thức và phương trình hóa học dùng chỉ số Unicode", () => {
  assert.equal(
    toUnicodeChemistryText("Al3+, K+, CaCO3, nCH2=CH-CN, nH2N-[CH2]5-COOH, CH4(g) + H2O(g) -> CO(g) + 3H2(g), [CH2]4"),
    "Al³⁺, K⁺, CaCO₃, nCH₂=CH-CN, nH₂N-[CH₂]₅-COOH, CH₄(g) + H₂O(g) → CO(g) + 3H₂(g), [CH₂]₄"
  );
});

test("đề Toán, Vật lí và Hóa học không còn cú pháp công thức thô", () => {
  for (const exam of PRACTICE_EXAMS_2026.filter((item) => ["Toán", "Vật lí", "Hóa học"].includes(item.subject))) {
    const values = exam.questions.flatMap((question) => [
      question.context,
      question.prompt,
      ...(question.options || []),
      ...(question.statements || [])
    ]).filter(Boolean);
    for (const value of values) {
      assert.doesNotMatch(value, /\$|\\(?:frac|mathrm|mathbb|overrightarrow|begin|end|int|infty)|\^\(?[-+0-9]/, `${exam.subject}: ${value}`);
    }
  }
});
