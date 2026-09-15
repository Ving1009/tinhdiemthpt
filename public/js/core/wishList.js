export const WISH_BACKUP_VERSION = 3;
export const MAX_WISH_ITEMS = 5000;
const MAX_BACKUP_BYTES = 1024 * 1024;
const TEXT_LIMITS = {
  id: 220, wishId: 220, sourceId: 220, universityId: 180, university: 180,
  name: 300, code: 80, nationalMajorCode: 80, programId: 180, programType: 120,
  campusId: 180, campus: 180, method: 180, methodCode: 100, methodDetails: 300,
  combination: 200, ruleId: 180, cutoffStatus: 40, comparisonStatus: 40,
  comparisonReason: 300, conditions: 500, tuitionUnit: 80, tuitionPeriod: 80,
  savedAt: 60, dataVersion: 80
};

function cleanText(value, limit) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeText(value) {
  return cleanText(value, 500).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi");
}

function normalizeCombination(value) {
  return [...new Set(cleanText(value, 200).toLocaleUpperCase("vi").split(/[;,/|]+/).map((item) => item.trim()).filter(Boolean))].sort().join(";");
}

function finiteOrNull(value) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Nhận diện một phương án xét tuyển, độc lập với mã mục cá nhân. */
export function wishIdentity(item) {
  const program = item.programId
    ? `program:${normalizeText(item.programId)}`
    : `described:${normalizeText(item.nationalMajorCode || item.code)}:${normalizeText(item.name)}:${normalizeText(item.programType)}`;
  const methodCodes = Array.isArray(item.admissionMethodCodes)
    ? [...new Set(item.admissionMethodCodes.map(normalizeText).filter(Boolean))].sort().join(",")
    : normalizeText(item.methodCode);
  return [
    normalizeText(item.universityId), program, normalizeText(item.campusId || item.campus),
    Number(item.year) || "", methodCodes, normalizeText(item.method), normalizeText(item.methodDetails),
    normalizeCombination(item.combination), normalizeText(item.ruleId), finiteOrNull(item.scale) ?? ""
  ].join("|");
}

export function createWishId(item) {
  return `wish-${stableHash(wishIdentity(item))}`;
}

export function normalizeWish(value) {
  if (!value || typeof value !== "object") return null;
  const item = Object.fromEntries(Object.entries(TEXT_LIMITS).map(([key, limit]) => [key, cleanText(value[key], limit)]));
  item.sourceId = item.sourceId || item.id;
  item.id = item.sourceId;
  if (!item.sourceId || !item.universityId || !item.name || !item.code) return null;
  item.year = Number.isInteger(Number(value.year)) && Number(value.year) >= 2000 && Number(value.year) <= 2100 ? Number(value.year) : 2026;
  item.scale = finiteOrNull(value.scale);
  item.cutoff = finiteOrNull(value.cutoff);
  item.userScore = finiteOrNull(value.userScore);
  item.currentUserScore = finiteOrNull(value.currentUserScore);
  item.tuitionMin = finiteOrNull(value.tuitionMin);
  item.tuitionMax = finiteOrNull(value.tuitionMax);
  item.scoreContextVersion = Number.isInteger(Number(value.scoreContextVersion)) && Number(value.scoreContextVersion) >= 0 ? Number(value.scoreContextVersion) : 0;
  item.admissionMethodCodes = Array.isArray(value.admissionMethodCodes)
    ? [...new Set(value.admissionMethodCodes.map((entry) => cleanText(entry, 100)).filter(Boolean))].slice(0, 30)
    : [];
  if (item.scale !== null && item.scale <= 0) item.scale = null;
  if (item.cutoff !== null && (item.cutoff < 0 || (item.scale !== null && item.cutoff > item.scale))) item.cutoff = null;
  if (item.userScore !== null && (item.userScore < 0 || (item.scale !== null && item.userScore > item.scale))) item.userScore = null;
  if (item.currentUserScore !== null && (item.currentUserScore < 0 || (item.scale !== null && item.currentUserScore > item.scale))) item.currentUserScore = null;
  item.wishId = item.wishId || createWishId(item);
  return item;
}

export function normalizeWishListWithReport(values, maxItems = MAX_WISH_ITEMS) {
  if (!Array.isArray(values)) return { items: [], report: { input: 0, valid: 0, duplicates: 0, invalid: 0, exceeded: 0 } };
  const safeLimit = Math.max(1, Number(maxItems) || MAX_WISH_ITEMS);
  const unique = new Map();
  const usedWishIds = new Set();
  let invalid = 0;
  let duplicates = 0;
  const exceeded = Math.max(0, values.length - safeLimit);
  for (const value of values.slice(0, safeLimit)) {
    const item = normalizeWish(value);
    if (!item) { invalid += 1; continue; }
    const identity = wishIdentity(item);
    if (unique.has(identity)) { duplicates += 1; continue; }
    let wishId = item.wishId || createWishId(item);
    if (usedWishIds.has(wishId)) wishId = `${createWishId(item)}-${stableHash(`${identity}|${unique.size}`)}`;
    item.wishId = wishId;
    usedWishIds.add(wishId);
    unique.set(identity, item);
  }
  const items = [...unique.values()];
  return { items, report: { input: values.length, valid: items.length, duplicates, invalid, exceeded } };
}

export function normalizeWishList(values, maxItems = MAX_WISH_ITEMS) {
  return normalizeWishListWithReport(values, maxItems).items;
}

export function createWishBackup(items, exportedAt = new Date().toISOString()) {
  const normalized = normalizeWishListWithReport(items);
  return { kind: "tinh-diem-thpt-wishes", version: WISH_BACKUP_VERSION, exportedAt, itemCount: normalized.items.length, items: normalized.items };
}

export function parseWishBackup(text) {
  const bytes = new TextEncoder().encode(String(text ?? "")).length;
  if (bytes > MAX_BACKUP_BYTES) throw new Error("Tệp sao lưu vượt quá 1 MB.");
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error("Tệp JSON không hợp lệ."); }
  if (!payload || payload.kind !== "tinh-diem-thpt-wishes" || ![1, 2, 3].includes(Number(payload.version)) || !Array.isArray(payload.items)) {
    throw new Error("Tệp không đúng định dạng sao lưu nguyện vọng.");
  }
  const normalized = normalizeWishListWithReport(payload.items);
  if (payload.items.length && !normalized.items.length) throw new Error("Tệp không có nguyện vọng hợp lệ.");
  return { version: Number(payload.version), exportedAt: cleanText(payload.exportedAt, 60), items: normalized.items, report: normalized.report };
}

export function mergeWishListsDetailed(current, incoming, mode = "merge") {
  const source = mode === "replace" ? incoming : [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])];
  return normalizeWishListWithReport(source);
}

export function mergeWishLists(current, incoming, mode = "merge") {
  return mergeWishListsDetailed(current, incoming, mode).items;
}

export function removeWishById(items, wishId) {
  const normalized = normalizeWishList(items);
  const index = normalized.findIndex((item) => item.wishId === wishId);
  if (index < 0) return { items: normalized, removed: null, index: -1 };
  const [removed] = normalized.splice(index, 1);
  return { items: normalized, removed, index };
}

export function moveWishById(items, wishId, direction) {
  const normalized = normalizeWishList(items);
  const index = normalized.findIndex((item) => item.wishId === wishId);
  const next = index + Number(direction);
  if (index < 0 || next < 0 || next >= normalized.length) return normalized;
  [normalized[index], normalized[next]] = [normalized[next], normalized[index]];
  return normalized;
}

export function spreadsheetSafeText(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function xml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]));
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value) { value -= 1; name = String.fromCharCode(65 + (value % 26)) + name; value = Math.floor(value / 26); }
  return name;
}

function xlsxCell(value, row, column, style = 0) {
  const reference = `${columnName(column)}${row}`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${reference}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(spreadsheetSafeText(value))}</t></is></c>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); return bytes; }
function uint32(value) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value >>> 0, true); return bytes; }
function joinBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function createStoredZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const checksum = crc32(data);
    const local = joinBytes([uint32(0x04034b50), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0), uint32(checksum), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), nameBytes, data]);
    localParts.push(local);
    centralParts.push(joinBytes([uint32(0x02014b50), uint16(20), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0), uint32(checksum), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), nameBytes]));
    offset += local.length;
  }
  const central = joinBytes(centralParts);
  return joinBytes([...localParts, central, uint32(0x06054b50), uint16(0), uint16(0), uint16(files.length), uint16(files.length), uint32(central.length), uint32(offset), uint16(0)]);
}

export function wishesToXlsxBytes(items, exportedAt = new Date().toISOString()) {
  const headers = ["STT", "Năm", "Trường", "Ngành / chương trình", "Mã ngành", "Cơ sở", "Phương thức", "Tổ hợp", "Thang điểm", "Điểm chuẩn", "Điểm của tôi khi lưu", "Trạng thái so sánh", "Trạng thái dữ liệu", "Điều kiện", "Ngày xuất"];
  const rows = normalizeWishList(items).map((item, index) => [index + 1, item.year, item.university, item.name, item.code, item.campus || "Chưa có dữ liệu", item.method || "Chưa có dữ liệu", item.combination || "Chưa có dữ liệu", item.scale ?? "", item.cutoff ?? "", item.userScore ?? "", item.comparisonStatus || item.comparisonReason || "Chưa so sánh được", item.cutoffStatus || "Chưa có dữ liệu", item.conditions || "Chưa có dữ liệu", exportedAt]);
  const sheetRows = [headers, ...rows].map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, column) => xlsxCell(value, rowIndex + 1, column, rowIndex === 0 ? 1 : 0)).join("")}</row>`).join("");
  const widths = [7, 9, 30, 42, 14, 22, 28, 18, 12, 14, 18, 24, 20, 36, 24];
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:O${rows.length + 1}"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`],
    ["docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Tính Điểm THPT</Application></Properties>`],
    ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>Nguyện vọng cá nhân</dc:title><dc:creator>Tính Điểm THPT</dc:creator><dcterms:created>${xml(exportedAt)}</dcterms:created></cp:coreProperties>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Nguyện vọng" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF164E63"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`],
    ["xl/worksheets/sheet1.xml", worksheet]
  ];
  return createStoredZip(files);
}
