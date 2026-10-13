function isLocalHttp(url) {
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function isAllowedApiOrigin(requestUrl, origin, fetchSite = "") {
  const crossSite = String(fetchSite).toLowerCase() === "cross-site";
  if (origin == null) return !crossSite;
  try {
    const source = new URL(origin);
    const target = new URL(requestUrl);
    if (origin !== source.origin) return false;
    return (source.origin === target.origin && !crossSite) || (isLocalHttp(source) && isLocalHttp(target));
  } catch {
    return false;
  }
}
