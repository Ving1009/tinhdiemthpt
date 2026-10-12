// No redistribution permission is recorded for these user-supplied materials.
// Preserve the originals for review, but exclude every representation from serving/builds.
export function isRestrictedExamPath(pathname = '') {
  let path;
  try { path = decodeURIComponent(pathname).replaceAll('\\', '/').toLowerCase(); }
  catch { return true; }
  return path === '/assets/practice-2026' || path.startsWith('/assets/practice-2026/')
    || /^\/js\/data\/official(?:practiceexams|questioncontent|solutions)2026\.js(?:$|\/)/.test(path);
}
