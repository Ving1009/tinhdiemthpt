import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const publicRoot = new URL("../public/", import.meta.url);
const universities = JSON.parse(await readFile(new URL("../data/universities.json", import.meta.url), "utf8"));

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const size = bytes.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    if (!size) break;
    offset += size + 2;
  }
  return null;
}

function rasterDimensions(bytes, extension) {
  if (extension === ".png" && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if ([".jpg", ".jpeg"].includes(extension)) return jpegDimensions(bytes);
  if (extension === ".ico" && bytes.length >= 22) {
    const count = bytes.readUInt16LE(4);
    let width = 0; let height = 0;
    for (let index = 0; index < count; index += 1) {
      const offset = 6 + index * 16;
      width = Math.max(width, bytes[offset] || 256);
      height = Math.max(height, bytes[offset + 1] || 256);
    }
    return { width, height };
  }
  if (extension === ".webp" && bytes.subarray(12, 16).toString("ascii") === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3)
    };
  }
  if (extension === ".webp" && bytes.subarray(12, 16).toString("ascii") === "VP8 " && bytes.length >= 30) {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (extension === ".webp" && bytes.subarray(12, 16).toString("ascii") === "VP8L" && bytes.length >= 25) {
    const b1 = bytes[21]; const b2 = bytes[22]; const b3 = bytes[23]; const b4 = bytes[24];
    return { width: 1 + b1 + ((b2 & 0x3f) << 8), height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10) };
  }
  return null;
}

function svgDimensions(bytes) {
  const head = bytes.subarray(0, 4096).toString("utf8");
  const viewBox = head.match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)["']/i);
  if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]), scalable: true };
  const width = head.match(/\bwidth=["']([\d.]+)/i);
  const height = head.match(/\bheight=["']([\d.]+)/i);
  return width && height ? { width: Number(width[1]), height: Number(height[1]), scalable: true } : null;
}

const records = [];
for (const university of universities) {
  if (university.logoStatus === "updating") continue;
  const relative = String(university.logo || "").replace(/^\.\//, "");
  const url = new URL(relative, publicRoot);
  const extension = fileURLToPath(url).slice(fileURLToPath(url).lastIndexOf(".")).toLowerCase();
  try {
    const bytes = await readFile(url);
    const dimensions = extension === ".svg" ? svgDimensions(bytes) : rasterDimensions(bytes, extension);
    records.push({ id: university.id, code: university.code, extension, bytes: bytes.length, ...dimensions });
  } catch {
    records.push({ id: university.id, code: university.code, extension, missing: true });
  }
}

const unreadable = records.filter((item) => item.missing || !Number.isFinite(item.width) || !Number.isFinite(item.height));
const lowResolution = records.filter((item) => !item.scalable && Number.isFinite(item.width) && Number.isFinite(item.height) && (Math.max(item.width, item.height) < 96 || Math.min(item.width, item.height) < 32));
console.log(JSON.stringify({
  checked: records.length,
  scalable: records.filter((item) => item.scalable).length,
  raster: records.filter((item) => !item.scalable).length,
  unreadable,
  lowResolution
}, null, 2));

if (unreadable.length) process.exitCode = 1;
