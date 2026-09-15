export function normalizeCombinationCode(value) {
  return String(value ?? "").trim().toLocaleUpperCase("vi");
}

export function parseCombinationCodes(value, validCodes = null) {
  const allowed = validCodes ? new Set([...validCodes].map(normalizeCombinationCode)) : null;
  const tokens = String(value ?? "")
    .split(/[;,/|]+/)
    .map(normalizeCombinationCode)
    .filter(Boolean);
  return [...new Set(tokens.filter((token) => allowed ? allowed.has(token) : /^[A-ZĐ]{1,5}\d{1,3}[A-Z0-9-]*$/.test(token)))];
}

export function majorHasCombination(major, code, validCodes = null) {
  const wanted = normalizeCombinationCode(code);
  return Boolean(wanted) && parseCombinationCodes(major?.combination, validCodes).includes(wanted);
}

