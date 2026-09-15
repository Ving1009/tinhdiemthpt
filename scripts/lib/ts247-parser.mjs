const FLIGHT_CHUNK = /<script>self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)<\/script>/g;

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&agrave;/gi, "à").replace(/&aacute;/gi, "á").replace(/&acirc;/gi, "â").replace(/&atilde;/gi, "ã")
    .replace(/&egrave;/gi, "è").replace(/&eacute;/gi, "é").replace(/&ecirc;/gi, "ê")
    .replace(/&igrave;/gi, "ì").replace(/&iacute;/gi, "í").replace(/&icirc;/gi, "î")
    .replace(/&ograve;/gi, "ò").replace(/&oacute;/gi, "ó").replace(/&ocirc;/gi, "ô").replace(/&otilde;/gi, "õ")
    .replace(/&ugrave;/gi, "ù").replace(/&uacute;/gi, "ú").replace(/&ucirc;/gi, "û")
    .replace(/&yacute;/gi, "ý").replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function decodeNextFlightText(html) {
  const chunks = [];
  for (const match of String(html ?? "").matchAll(FLIGHT_CHUNK)) {
    try { chunks.push(JSON.parse(match[1])); }
    catch { /* Ignore malformed transport chunks; they cannot be evidence. */ }
  }
  return chunks.join("");
}

function balancedObjectAt(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return text.slice(start, index + 1);
  }
  return "";
}

function candidateObjects(text) {
  const objects = [];
  const starts = /(?:^|\n)[0-9a-z]+:(\{)/gi;
  for (const match of text.matchAll(starts)) {
    const start = match.index + match[0].lastIndexOf("{");
    const raw = balancedObjectAt(text, start);
    if (!raw) continue;
    try { objects.push(JSON.parse(raw)); }
    catch { /* A partial/non-JSON object is ignored. */ }
  }
  return objects;
}

export function normalizeMethod(value) {
  const method = decodeEntities(value) || "Chưa nêu rõ";
  if (/điểm thi thpt|thi tốt nghiệp|thpt/i.test(method)) return "THPT";
  if (/học bạ/i.test(method)) return "Học bạ";
  if (/đánh giá tư duy|đgtd|tsa/i.test(method)) return "ĐGTD";
  if (/đánh giá năng lực|đgnl|hsa|v-act|apt/i.test(method)) return "ĐGNL";
  if (/sat|act|chứng chỉ quốc tế/i.test(method)) return "Chứng chỉ quốc tế";
  if (/kết hợp/i.test(method)) return "Xét tuyển kết hợp";
  if (/năng khiếu/i.test(method)) return "Năng khiếu";
  return method;
}

export function inferScale(row) {
  const method = `${row.admission_name ?? ""} ${row.admission_alias ?? ""} ${row.introtext ?? ""}`.toLowerCase();
  const score = Number(row.mark);
  if (/sat/.test(method)) return 1600;
  if (/\bact\b/.test(method)) return 36;
  if (/v-act|đhqg\s*tp|dgnl\s*hcm/.test(method)) return 1200;
  if (/hsa|đhqg\s*hn/.test(method)) return 150;
  if (/tsa|đánh giá tư duy|đgtd/.test(method)) return 100;
  if (score > 150) return 1200;
  if (score > 100) return 150;
  if (score > 30) return 100;
  return 30;
}

export function formulaText(row) {
  const formula = decodeEntities(row.formula).replaceAll("MON_1", "Môn 1").replaceAll("MON_2", "Môn 2").replaceAll("MON_3", "Môn 3").replaceAll("UT", "Ưu tiên").replaceAll("KK", "Khuyến khích");
  if (formula) return formula;
  return "Theo quy định của phương thức tuyển sinh; nguồn tham khảo chưa nêu công thức chi tiết.";
}

export function parseTs247Admissions(html, year = 2026) {
  const flightText = decodeNextFlightText(html);
  const seen = new Set();
  const rows = [];
  for (const row of candidateObjects(flightText)) {
    const score = Number(row?.mark);
    const code = decodeEntities(row?.code);
    const name = decodeEntities(row?.name);
    if (Number(row?.year) !== year || !Number.isFinite(score) || score < 0 || !code || !name) continue;
    const scale = inferScale(row);
    if (score > scale) continue;
    const method = normalizeMethod(row.admission_name);
    const combination = decodeEntities(row.block);
    const key = `${row.id ?? ""}|${code}|${name}|${method}|${score}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      sourceId: row.id ?? null,
      code,
      name,
      combination,
      method,
      methodDetail: decodeEntities(row.admission_name),
      score,
      scale,
      formulaText: formulaText(row),
      note: decodeEntities(row.introtext)
    });
  }
  return rows;
}

export function pageIdentity(html) {
  const title = decodeEntities(String(html ?? "").match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
  const canonical = String(html ?? "").match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1] || "";
  return { title, canonical };
}
