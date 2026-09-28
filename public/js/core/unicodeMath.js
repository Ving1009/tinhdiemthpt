const SUPERSCRIPT = Object.freeze({
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ"
});

const SUBSCRIPT = Object.freeze({
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ",
  k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ"
});

function convertCharacters(value, table, fallbackWrapper = ["(", ")"]) {
  const source = String(value);
  if ([...source].every((character) => table[character])) return [...source].map((character) => table[character]).join("");
  return `${fallbackWrapper[0]}${source}${fallbackWrapper[1]}`;
}

function wrapFractionPart(value) {
  const text = String(value).trim();
  return /^[\p{L}\p{N}.,+−-]+$/u.test(text) ? text : `(${text})`;
}

export function toUnicodeMathText(value) {
  let text = String(value ?? "");
  if (!text) return text;

  text = text
    .replace(/\\mathbb\{R\}/g, "ℝ")
    .replace(/\\mathbb\{N\}/g, "ℕ")
    .replace(/\\mathbb\{Z\}/g, "ℤ")
    .replace(/\\mathbb\{Q\}/g, "ℚ");

  for (let pass = 0; pass < 3; pass += 1) {
    text = text.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, (_, numerator, denominator) => `${wrapFractionPart(numerator)}⁄${wrapFractionPart(denominator)}`);
  }

  text = text
    .replace(/\\(?:mathrm|text|mathbf|mathit)\{([^{}]*)\}/g, "$1")
    .replace(/\\overrightarrow\{([^{}]+)\}/g, "→$1")
    .replace(/\\vec\{([^{}]+)\}/g, "→$1")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\\begin\{cases\}/g, "{ ")
    .replace(/\\end\{cases\}/g, " }")
    .replace(/\\left|\\right/g, "")
    .replace(/\\cdot/g, "·")
    .replace(/\\times/g, "×")
    .replace(/\\leq?/g, "≤")
    .replace(/\\geq?/g, "≥")
    .replace(/\\neq/g, "≠")
    .replace(/\\infty/g, "∞")
    .replace(/\\to/g, "→")
    .replace(/\\in(?![A-Za-z])/g, "∈")
    .replace(/\\int/g, "∫")
    .replace(/\\sin/g, "sin")
    .replace(/\\cos/g, "cos")
    .replace(/\\tan/g, "tan")
    .replace(/\\log/g, "log")
    .replace(/\\%/g, "%")
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/\\{2,}/g, "; ");

  text = text
    .replace(/\^\{([^{}]+)\}/g, (_, exponent) => convertCharacters(exponent, SUPERSCRIPT))
    .replace(/\^\(([-+0-9]+)\)/g, (_, exponent) => convertCharacters(exponent, SUPERSCRIPT))
    .replace(/\^([-+0-9ni]+)/g, (_, exponent) => convertCharacters(exponent, SUPERSCRIPT))
    .replace(/_\{([^{}]+)\}/g, (_, subscript) => convertCharacters(subscript, SUBSCRIPT, ["₍", "₎"]))
    .replace(/_([0-9a-z]+)/gi, (_, subscript) => convertCharacters(subscript.toLowerCase(), SUBSCRIPT, ["₍", "₎"]))
    .replace(/\((\d{2,3})\)([A-Z][a-z]?)/g, (_, mass, element) => `${convertCharacters(mass, SUPERSCRIPT)}${element}`)
    .replace(/\blambda\b/g, "λ")
    .replace(/(\d(?:[.,]\d+)?)\s*\*\s*(10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)/g, "$1 × $2")
    .replace(/\b([a-zA-Z])\.\s*(10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)/g, "$1 × $2")
    .replace(/\$+/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");

  return text;
}

function unicodeChemicalFormula(token) {
  return token.replace(/([A-Za-z)])(\d+)/g, (_, prefix, digits) => `${prefix}${convertCharacters(digits, SUBSCRIPT)}`);
}

export function toUnicodeChemistryText(value) {
  let text = toUnicodeMathText(value)
    .replace(/<=>|⇄/g, "⇌")
    .replace(/->/g, "→")
    .replace(/\bDelta\b/g, "Δ")
    .replace(/\blambda\b/g, "λ")
    .replace(/(?<![A-Za-z])([A-Z][a-z]?)(\d*)([+-])(?=\s|[,.;:)\]}]|$)/g, (_, element, charge, sign) => `${element}${convertCharacters(`${charge}${sign}`, SUPERSCRIPT)}`)
    .replace(/(?<![A-Za-z])([A-Z][a-z]?(?:\d+)?(?:[A-Z][a-z]?(?:\d+)?)*)/g, (token) => unicodeChemicalFormula(token));

  text = text
    .replace(/\bn((?:[A-Z][a-z]?\d*)+)/g, (_, formula) => `n${unicodeChemicalFormula(formula)}`)
    .replace(/([\])}])(\d+)/g, (_, bracket, index) => `${bracket}${convertCharacters(index, SUBSCRIPT)}`)
    .replace(/\b([mnst])([0-9])\b/g, (_, symbol, index) => `${symbol}${convertCharacters(index, SUBSCRIPT)}`)
    .replace(/°([0-9]{2,3})\b/g, (_, index) => `°${convertCharacters(index, SUBSCRIPT)}`)
    .replace(/Δ\s+r\s+H/g, "ΔᵣH");
  return text;
}

export function formatOfficialExamText(slug, value) {
  if (slug === "chemistry") return toUnicodeChemistryText(value);
  if (["math", "physics"].includes(slug)) return toUnicodeMathText(value);
  return String(value ?? "");
}
