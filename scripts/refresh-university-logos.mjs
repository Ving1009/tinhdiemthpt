import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL("../", import.meta.url);
const universitiesUrl = new URL("data/universities.json", root);
const universities = JSON.parse(await readFile(universitiesUrl, "utf8"));
const shouldWrite = process.argv.includes("--write");
const timeoutMs = 14_000;
const rejectedAssets = [
  "/uploads/ussh/menu/logo_up.png",
  "/media/config_ImageLogoMobile",
  "/Logo%20nhap%20hoc%201.png",
  "/Resources/ImagePhoto/logo.png",
  "/uploads/logo-bdu-2024.png",
  "/wp-content/uploads/2020/08/logo-footer.png",
  "/logo_QNU_white.png"
];

function decodeHtml(value = "") {
  return value.replaceAll("&amp;", "&").replaceAll("&#x2F;", "/").replaceAll("\\/", "/");
}

function normalize(value = "") {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLocaleLowerCase("vi");
}

function imageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  }
  if (buffer.length >= 10 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
    return [buffer.readUInt16LE(6), buffer.readUInt16LE(8)];
  }
  if (buffer.length >= 22 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1) {
    let largest = [0, 0];
    const count = buffer.readUInt16LE(4);
    for (let index = 0; index < count; index += 1) {
      const offset = 6 + index * 16;
      if (offset + 16 > buffer.length) break;
      const dimensions = [buffer[offset] || 256, buffer[offset + 1] || 256];
      if (dimensions[0] * dimensions[1] > largest[0] * largest[1]) largest = dimensions;
    }
    return largest;
  }
  if (buffer.length >= 30 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    const type = buffer.subarray(12, 16).toString("ascii");
    if (type === "VP8X") return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
    if (type === "VP8 " && buffer.subarray(23, 26).toString("hex") === "9d012a") return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
    if (type === "VP8L") return [1 + (((buffer[22] & 0x3f) << 8) | buffer[21]), 1 + (((buffer[24] & 0x0f) << 10) | (buffer[23] << 2) | (buffer[22] >> 6))];
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    const sizeMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if (sizeMarkers.has(marker)) return [buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5)];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += length + 2;
    }
  }
  return null;
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map((match) => [match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? "")]));
}

function absoluteImageUrl(value, pageUrl) {
  try {
    const url = new URL(decodeHtml(value), pageUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function collectCandidates(html, pageUrl, university) {
  const candidates = new Map();
  const aliases = [university.shortName, university.code]
    .map((value) => normalize(value || "").replace(/[^a-z0-9]/g, ""))
    .filter((value) => value.length >= 3 && !["hcm", "hue", "hps"].includes(value));
  const add = (value, details = {}) => {
    const url = absoluteImageUrl(value, pageUrl);
    if (!url || candidates.has(url) || rejectedAssets.some((fragment) => url.includes(fragment))) return;
    const normalizedUrl = normalize(new URL(url).pathname);
    const file = normalizedUrl.split("/").at(-1) || "";
    const semantic = normalize(`${details.className || ""} ${details.id || ""}`);
    const alt = normalize(details.alt || "");
    const urlHasLogo = /(?:^|[^a-z])logo(?:[^a-z]|$)|site.?logo|brand.?logo/.test(file);
    const semanticLogo = /(?:^|\s|[-_])(logo|brand|site-logo|header-logo)(?:$|\s|[-_])/.test(semantic);
    const headerContext = /header|navbar|site.?brand|branding/.test(semantic);
    const aliasMatch = aliases.some((alias) => normalize(`${normalizedUrl} ${alt}`).replace(/[^a-z0-9]/g, "").includes(alias));
    const exactGenericLogo = /^(?:logo|logo[-_](?:header|footer|mobile|new|main|site)|(?:header|footer|main|site)[-_]logo)\.(?:png|jpe?g|webp|svg|ico)/.test(file);
    let score = details.baseScore || 0;
    if (urlHasLogo) score += 62;
    if (semanticLogo) score += 105;
    if (headerContext) score += 36;
    if (/footer/.test(semantic)) score += 12;
    if (aliasMatch) score += 38;
    if (/banner|slider|slide|news|tin-tuc|article|event|su-kien|ky-niem|quangcao|advert|facebook|map-direction/.test(normalize(`${url} ${alt} ${semantic}`))) score -= 95;
    const identity = semanticLogo || (urlHasLogo && (headerContext || aliasMatch || exactGenericLogo)) || (details.source === "img" && aliasMatch);
    candidates.set(url, { url, context: `${details.className || ""} ${details.id || ""} ${details.alt || ""}`.slice(0, 300), score, identity, source: details.source || "unknown" });
  };

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const details = { source: "img", alt: attrs.alt, className: attrs.class, id: attrs.id, baseScore: 15 };
    for (const key of ["src", "data-src", "data-lazy-src", "data-original"]) if (attrs[key]) add(attrs[key], details);
    const srcset = attrs.srcset || attrs["data-srcset"];
    if (srcset) for (const part of srcset.split(",")) add(part.trim().split(/\s+/)[0], { ...details, baseScore: 12 });
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (attrs.href && /icon/i.test(attrs.rel || "")) add(attrs.href, { source: "icon", className: attrs.rel || "icon", baseScore: -15 });
  }
  for (const match of html.matchAll(/["']([^"']*(?:logo|brand)[^"']*\.(?:png|jpe?g|webp|svg|ico)(?:\?[^"']*)?)["']/gi)) add(match[1], { source: "raw", baseScore: -8 });
  return [...candidates.values()].sort((left, right) => right.score - left.score).slice(0, 18);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: "follow", ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extensionFor(type, url, buffer) {
  if (/svg/i.test(type) || buffer.subarray(0, 300).toString("utf8").includes("<svg")) return ".svg";
  if (/png/i.test(type) || buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return ".png";
  if (/webp/i.test(type) || buffer.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
  if (/jpe?g/i.test(type) || (buffer[0] === 0xff && buffer[1] === 0xd8)) return ".jpg";
  if (/icon|ico/i.test(type) || (buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1)) return ".ico";
  return [".svg", ".png", ".webp", ".jpg", ".jpeg", ".ico"].includes(extname(new URL(url).pathname).toLowerCase()) ? extname(new URL(url).pathname).toLowerCase().replace(".jpeg", ".jpg") : null;
}

async function inspectCandidate(candidate, pageUrl) {
  try {
    const response = await fetchWithTimeout(candidate.url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/png,image/webp,image/svg+xml,image/*,*/*;q=0.5", Referer: pageUrl }
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 250 || buffer.length > 4_000_000) return null;
    const type = response.headers.get("content-type") || "";
    const extension = extensionFor(type, response.url, buffer);
    if (!extension || /html|json/i.test(type)) return null;
    const dimensions = extension === ".svg" ? null : imageDimensions(buffer);
    let quality = candidate.score;
    if (extension === ".svg") quality += 105;
    if (dimensions) {
      const shortest = Math.min(...dimensions);
      const ratio = Math.max(...dimensions) / Math.max(1, shortest);
      quality += shortest >= 256 ? 90 : shortest >= 128 ? 62 : shortest >= 80 ? 34 : shortest >= 48 ? 5 : -70;
      quality += ratio <= 1.35 ? 35 : ratio <= 2.5 ? 22 : ratio <= 6 ? 4 : -55;
    } else if (extension !== ".svg") quality -= 45;
    return { ...candidate, finalUrl: response.url, buffer, extension, dimensions, quality, bytes: buffer.length };
  } catch {
    return null;
  }
}

async function findLogo(university) {
  try {
    const response = await fetchWithTimeout(university.website, { headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,application/xhtml+xml" } });
    if (!response.ok) return { university, error: `HTTP ${response.status}` };
    const html = await response.text();
    const candidates = collectCandidates(html, response.url, university);
    const inspected = (await Promise.all(candidates.map((candidate) => inspectCandidate(candidate, response.url)))).filter(Boolean).sort((left, right) => right.quality - left.quality);
    const selected = inspected.find((item) => item.identity && item.score >= 60 && item.quality >= 145 && (item.extension === ".svg" || (item.dimensions && Math.min(...item.dimensions) >= 80)));
    return { university, pageUrl: response.url, selected, candidates: inspected.slice(0, 3) };
  } catch (error) {
    return { university, error: error.name === "AbortError" ? "timeout" : error.message };
  }
}

const pending = universities.filter((item) => item.logoStatus === "updating" && item.website);
const results = [];
for (let index = 0; index < pending.length; index += 8) {
  results.push(...await Promise.all(pending.slice(index, index + 8).map(findLogo)));
  process.stdout.write(`\rĐã kiểm tra ${Math.min(index + 8, pending.length)}/${pending.length} website`);
}
process.stdout.write("\n");

let updated = 0;
for (const result of results) {
  const selected = result.selected;
  if (!selected) continue;
  const university = result.university;
  const filename = `${university.id}${selected.extension}`;
  const relativeLogo = `./assets/logos/${filename}`;
  const oldPrivate = new URL(university.logo.replace(/^\.\//, ""), root);
  const newPrivate = new URL(`assets/logos/${filename}`, root);
  const newPublic = new URL(`public/assets/logos/${filename}`, root);
  const oldHash = await readFile(oldPrivate).then((buffer) => createHash("sha256").update(buffer).digest("hex")).catch(() => "");
  const newHash = createHash("sha256").update(selected.buffer).digest("hex");
  if (shouldWrite) {
    await Promise.all([writeFile(newPrivate, selected.buffer), writeFile(newPublic, selected.buffer)]);
    university.logo = relativeLogo;
    university.logoStatus = "clear_local";
    university.logoSourceUrl = selected.finalUrl;
  }
  updated += 1;
  console.log(`${shouldWrite ? "CẬP NHẬT" : "TÌM THẤY"}\t${university.code}\t${selected.extension}\t${selected.dimensions?.join("x") || "vector"}\t${selected.bytes}\t${selected.score}/${selected.quality}\t${oldHash === newHash ? "trùng" : "mới"}\t${selected.finalUrl}`);
}

if (shouldWrite) await writeFile(universitiesUrl, `${JSON.stringify(universities, null, 2)}\n`);
const unresolved = results.filter((item) => !item.selected);
await writeFile(new URL("scripts/logo-audit-2026.json", root), `${JSON.stringify(results.map((item) => ({
  code: item.university.code,
  name: item.university.name,
  website: item.university.website,
  pageUrl: item.pageUrl,
  error: item.error,
  selected: item.selected && { url: item.selected.finalUrl, extension: item.selected.extension, dimensions: item.selected.dimensions, bytes: item.selected.bytes, score: item.selected.score, quality: item.selected.quality, context: item.selected.context },
  candidates: item.candidates?.map((candidate) => ({ url: candidate.finalUrl, extension: candidate.extension, dimensions: candidate.dimensions, bytes: candidate.bytes, score: candidate.score, quality: candidate.quality, identity: candidate.identity, context: candidate.context }))
})), null, 2)}\n`);
console.log(`Logo đạt ngưỡng: ${updated}/${pending.length}. Chưa đạt: ${unresolved.length}. Chế độ: ${shouldWrite ? "đã ghi" : "chỉ kiểm tra"}.`);
for (const item of unresolved) console.log(`CHƯA ĐẠT\t${item.university.code}\t${item.error || item.candidates?.map((candidate) => `${candidate.extension}:${candidate.dimensions?.join("x") || "?"}:${candidate.quality}:${candidate.finalUrl}`).join(",") || "không tìm thấy tài sản logo"}`);
