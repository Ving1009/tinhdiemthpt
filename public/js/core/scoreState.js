function finiteScore(value, scale) {
  const number = Number(value);
  return Number.isFinite(number) && Number.isFinite(Number(scale)) && Number(scale) > 0 && number >= 0 && number <= Number(scale) ? number : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  const text = JSON.stringify(stable(value));
  let result = 2166136261;
  for (const character of text) { result ^= character.codePointAt(0); result = Math.imul(result, 16777619); }
  return (result >>> 0).toString(36);
}

export function createScoreProfile({ type, method, year, results, subjects = [], priorityContext = {}, inputVersion = 0, updatedAt = new Date().toISOString() }) {
  const normalizedResults = (Array.isArray(results) ? results : []).map((item) => {
    const scale = Number(item.scale);
    const score = finiteScore(item.score, scale);
    if (!item.combination || score === null) return null;
    return {
      combination: String(item.combination).toLocaleUpperCase("vi"), score, scale,
      ruleId: String(item.ruleId || ""), method: String(item.method || method || ""), year: Number(item.year || year)
    };
  }).filter(Boolean).sort((a, b) => a.combination.localeCompare(b.combination, "vi"));
  const profile = {
    type: String(type || method || ""), method: String(method || type || ""), year: Number(year),
    subjects: (Array.isArray(subjects) ? subjects : []).map((item) => ({ subjectKey: String(item.subjectKey || ""), score: finiteScore(item.score, 10) })),
    priorityContext: { area: String(priorityContext.area || ""), priorityGroup: String(priorityContext.priorityGroup || "") },
    results: normalizedResults, inputVersion: Number(inputVersion) || 0, updatedAt
  };
  profile.fingerprint = hash({ ...profile, updatedAt: undefined });
  return profile;
}

export function createFinderScoreContext(profile, combinations = profile?.results || []) {
  if (!profile?.fingerprint) return null;
  const results = combinations.map((item) => ({
    combination: item.combination, score: item.score, scale: item.scale,
    year: item.year || profile.year, method: item.method || profile.method, ruleId: item.ruleId || ""
  }));
  return { sourceFingerprint: profile.fingerprint, sourceVersion: profile.inputVersion, type: profile.type, method: profile.method, year: profile.year, results };
}

export function finderContextIsFresh(context, profile) {
  return Boolean(context?.sourceFingerprint && profile?.fingerprint && context.sourceFingerprint === profile.fingerprint && context.sourceVersion === profile.inputVersion);
}

export function formatFinderScoreContext(context, formatter = (value) => Number(value).toFixed(2)) {
  if (!context?.results?.length) return "Chưa có điểm đối chiếu.";
  const suffix = `${context.method || context.type} ${context.year}`.trim();
  return context.results.map((item) => `${item.combination} — ${formatter(item.score)}/${item.scale}`).join(" · ") + ` — ${suffix}`;
}
