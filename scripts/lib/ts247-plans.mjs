import { decodeNextFlightText } from "./ts247-parser.mjs";

// Flight text records are byte-counted, not newline-delimited: HTML can contain newlines.
export function flightRecords(html) {
  const bytes = Buffer.from(decodeNextFlightText(html));
  const records = new Map();
  let position = 0;
  while (position < bytes.length) {
    const colon = bytes.indexOf(58, position);
    if (colon < 0) break;
    const key = bytes.subarray(position, colon).toString().trim();
    position = colon + 1;
    if (!/^[0-9a-f]+$/i.test(key)) break;
    if (bytes[position] === 84) {
      const comma = bytes.indexOf(44, position);
      const length = Number.parseInt(bytes.subarray(position + 1, comma).toString(), 16);
      if (comma < 0 || !Number.isFinite(length)) break;
      records.set(key, bytes.subarray(comma + 1, comma + 1 + length).toString());
      position = comma + 1 + length;
    } else {
      let end = bytes.indexOf(10, position);
      if (end < 0) end = bytes.length;
      try { records.set(key, JSON.parse(bytes.subarray(position, end).toString())); }
      catch { /* Import hints and protocol metadata aren't source data. */ }
      position = end + 1;
    }
  }
  function resolve(value, path = new Set()) {
    if (typeof value === "string" && /^\$[0-9a-f]+$/i.test(value)) {
      const key = value.slice(1);
      if (records.has(key) && !path.has(key)) return resolve(records.get(key), new Set([...path, key]));
    }
    if (Array.isArray(value)) return value.map((item) => resolve(item, path));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, path)]));
    return value;
  }
  return [...records.values()].filter((value) => typeof value === "object" && value).map((value) => resolve(value));
}

export function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}

const entities = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", times: "×", divide: "÷", ge: "≥", le: "≤", ne: "≠", sup2: "²", sup3: "³" };
for (const [stem, base] of Object.entries({ a: "a", e: "e", i: "i", o: "o", u: "u", y: "y" })) {
  for (const [suffix, mark] of Object.entries({ grave: "\u0300", acute: "\u0301", circ: "\u0302", tilde: "\u0303", uml: "\u0308" })) {
    entities[stem + suffix] = (base + mark).normalize("NFC");
    entities[stem.toUpperCase() + suffix] = (base.toUpperCase() + mark).normalize("NFC");
  }
}
export function plainText(html) {
  return String(html || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(?:p|li|div|tr|h[1-6])>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:td|th)>/gi, " | ").replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (all, key) => {
      if (key.startsWith("#")) { const n = Number.parseInt(key.slice(key[1].toLowerCase() === "x" ? 2 : 1), key[1].toLowerCase() === "x" ? 16 : 10); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""; }
      return entities[key] ?? all;
    }).replace(/[ \t\r]+/g, " ").replace(/\n\s*\n/g, "\n").trim();
}

export function htmlTables(html) {
  return [...String(html || "").matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((table) =>
    {
      const result = [], spans = [];
      for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = []; let column = 0;
        const carry = () => {
          while (spans[column]?.remaining) {
            cells[column] = spans[column].text; spans[column].remaining -= 1; column += 1;
          }
        };
        for (const cell of row[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
          carry();
          const text = plainText(cell[2]).replace(/\n/g, " ");
          const width = Math.min(100, Number(cell[1].match(/colspan\s*=\s*["']?(\d+)/i)?.[1]) || 1);
          const height = Math.min(1000, Number(cell[1].match(/rowspan\s*=\s*["']?(\d+)/i)?.[1]) || 1);
          for (let i = 0; i < width; i += 1) {
            cells[column] = text;
            if (height > 1) spans[column] = { text, remaining: height - 1 };
            column += 1;
          }
        }
        carry();
        if (cells.length) result.push(cells);
      }
      return result;
    });
}

export function programFromRow(row) {
  return { code: row.code, displayCode: row.display_code || row.code, name: plainText(row.name), group: plainText(row.group_name), combinations: plainText(row.block), quota: row.quota, note: plainText(row.note), methodVariant: String(row.sub_mark_type || row.mark_type || "") };
}

export function programsForTag(rows, tag, year = 2026) {
  return rows.filter((row) => Number(row.year) === year &&
    [row.sub_mark_type, row.mark_type].some((value) => String(value || "").split(",").some((code) => code.trim() && Number(code) === Number(tag)))).map(programFromRow);
}

export function mentionedExams(text) {
  const names = ["HSA", "TSA", "V-ACT", "V-SAT", "VSAT", "SPT", "SAT", "ACT", "IELTS", "TOEFL", "TOEIC", "HSK", "VSTEP", "PTE", "Aptis", "Cambridge"];
  // V-SAT and V-ACT are domestic exams, not the international SAT and ACT.
  return names.filter((name) => new RegExp(`(?<![A-Za-z-])${name}(?![A-Za-z])`, "i").test(text));
}

export function parseAdmissionPlan(html, year = 2026) {
  const roots = flightRecords(html);
  let metadata;
  let allPrograms = [];
  const sections = new Map();
  roots.forEach((root) => walk(root, (value) => {
    if (Array.isArray(value.admissions) && value.school) metadata = value;
    if (Array.isArray(value.schoolMajors)) allPrograms = value.schoolMajors;
    if (value.className === "sub-content__method" && value.id) {
      let nested = 0;
      walk(value, (child) => { if (child.className === "sub-content__method") nested += 1; });
      if (!sections.has(value.id) || nested < sections.get(value.id).nested) sections.set(value.id, { value, nested });
    }
  }));
  if (!metadata) return null;
  const methods = metadata.admissions.filter((item) => Number(item.year) === year).map((item) => {
    const section = [...sections.values()].find(({ value }) => value.id.endsWith(`-${item.id}`))?.value;
    let label = item.method_name;
    const rows = [];
    if (section) walk(section, (value) => {
      if (value.className === "title__name-method" && !label) label = Array.isArray(value.children) ? value.children.filter((x) => typeof x === "string").join("") : value.children;
      if (Array.isArray(value.dataSource)) rows.push(...value.dataSource.filter((row) => Number(row.year) === year));
    });
    // Some source pages omit their per-method table but still explicitly tag rows
    // in schoolMajors. Only use a base code when it identifies one method here.
    let scopeStatus = rows.length ? "explicit_program_table" : "program_scope_missing";
    if (!rows.length && metadata.admissions.filter((other) => Number(other.year) === year && Number(other.method) === Number(item.method)).length === 1) {
      rows.push(...allPrograms.filter((row) => Number(row.year) === year && String(row.mark_type).split(",").some((tag) => tag.trim() && Number(tag) === Number(item.method))));
      if (rows.length) scopeStatus = "explicit_program_tags";
    }
    const seen = new Set();
    const programs = rows.filter((row) => {
      const key = `${row.code}|${row.name}|${row.group_name}|${row.block}|${row.note}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map(programFromRow);
    return {
      id: String(item.id), sectionId: section?.id || "", label: plainText(label).replace(/\s*-\s*202\d$/, ""), methodCode: String(item.method), parentMethodCode: item.parent_method == null ? null : String(item.parent_method), year,
      details: Object.fromEntries(["description", "object", "quality", "condition", "regulations", "admission_time", "other_infomation"].map((key) => [key, plainText(item[key])]).filter(([, text]) => text)),
      programs, scopeStatus, factTables: Object.fromEntries(["object", "condition", "regulations", "quality"].map((key) => [key, htmlTables(item[key])]).filter(([, tables]) => tables.length))
    };
  });
  // The overview can already be 2027 while individual methods still describe 2026.
  return { code: metadata.school.code, name: metadata.school.name, schoolId: metadata.school.id, pageYear: metadata.schoolInfo?.year, availableMethodYears: [...new Set(metadata.admissions.map((x) => x.year))], methods,
    programs: allPrograms.filter((row) => Number(row.year) === year),
    info: Object.fromEntries(["top_content", "major_html", "major_note", "admission_pdf_file", "score_conversion", "time_and_documents"].map((key) => [key, plainText(metadata.schoolInfo?.[key])]).filter(([, text]) => text)),
    programTables: htmlTables(metadata.schoolInfo?.major_html),
    documentUrls: [...new Set([...String(metadata.schoolInfo?.admission_pdf_file || "").matchAll(/href="([^"]+)"/g)].map((match) => match[1]))]
  };
}
