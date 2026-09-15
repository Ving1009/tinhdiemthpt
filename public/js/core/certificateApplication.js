export function applyCertificateToEntries(entries, application) {
  const copy = entries.map((entry) => ({ ...entry }));
  if (!application || !Number.isInteger(application.rowIndex)) return copy;
  const target = copy[application.rowIndex];
  if (!target || target.subjectKey !== application.subjectKey || !Number.isFinite(Number(application.value))) return copy;
  target.score = Number(application.value);
  target.certificateApplication = {
    recordId: application.recordId || "",
    universityId: application.universityId || "",
    year: Number(application.year),
    certificate: application.certificate || "",
    method: application.method || "",
    subjectKey: application.subjectKey
  };
  return copy;
}
