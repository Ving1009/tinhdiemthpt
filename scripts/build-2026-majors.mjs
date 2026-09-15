import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

throw new Error("Script nhập liệu cũ đã được khóa vì có thể gắn nhầm dữ liệu năm trước vào 2026. Hãy dùng scripts/import-ts247-live-2026.mjs.");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const universities = JSON.parse(await readFile(join(root, "data", "universities.json"), "utf8"));
const combinations = JSON.parse(await readFile(join(root, "data", "combinations.json"), "utf8"));

const combMap = new Map();
for (const c of combinations) {
  if (c.code && c.subjectIds) {
    combMap.set(c.code.toUpperCase(), c.subjectIds);
  }
}

const defaultSubjects = ["math", "literature", "foreignLanguage"];

function getSubjectsForCombination(combStr) {
  if (!combStr) return [];
  const parts = String(combStr).split(/[;,/|\s]+/).map(p => p.trim().toUpperCase()).filter(Boolean);
  for (const p of parts) {
    if (combMap.has(p)) return combMap.get(p);
  }
  return defaultSubjects;
}

function decodeHtml(html) {
  if (!html) return "";
  return html
    .replace(/&agrave;/gi, "à").replace(/&aacute;/gi, "á").replace(/&acirc;/gi, "â").replace(/&atilde;/gi, "ã")
    .replace(/&egrave;/gi, "è").replace(/&eacute;/gi, "é").replace(/&ecirc;/gi, "ê")
    .replace(/&igrave;/gi, "ì").replace(/&iacute;/gi, "í").replace(/&icirc;/gi, "î")
    .replace(/&ograve;/gi, "ò").replace(/&oacute;/gi, "ó").replace(/&ocirc;/gi, "ô").replace(/&otilde;/gi, "õ")
    .replace(/&ugrave;/gi, "ù").replace(/&uacute;/gi, "ú").replace(/&ucirc;/gi, "û")
    .replace(/&yacute;/gi, "ý")
    .replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseVietnameseScore(valStr) {
  if (!valStr) return null;
  let clean = String(valStr).trim().replace(/\s+/g, "");
  // Check for thousand dot e.g. "1.080" or "1.050"
  if (/^[1-9]\.[0-9]{3}$/.test(clean)) {
    return Number(clean.replace(".", ""));
  }
  clean = clean.replace(",", ".");
  const num = Number(clean);
  if (!Number.isFinite(num) || num <= 0 || num > 1200) return null;
  return num;
}

function slugify(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function methodSlug(method) {
  if (/học bạ|hoc ba/i.test(method)) return "hocba";
  if (/đgnl|dgnl|apt|hsa/i.test(method)) return "dgnl";
  if (/đgtd|dgtd|tsa/i.test(method)) return "dgt";
  if (/kết hợp|ket hop/i.test(method)) return "ket-hop";
  if (/quốc tế|ccqt/i.test(method)) return "sat";
  if (/năng khiếu|nang khieu/i.test(method)) return "nangkhieu";
  return "thpt";
}

// 1. Parser for VnExpress HTML
function parseVne(html) {
  const trs = html.split('<tr class="university__benchmark').slice(1);
  const rows = [];
  for (const tr of trs) {
    const nameMatch = tr.match(/<strong><a[^>]*>([\s\S]*?)<\/a><\/strong>/);
    const codeMatch = tr.match(/<span style="display: block;">([\s\S]*?)<\/span>/);
    if (!nameMatch || !codeMatch) continue;
    const tds = tr.match(/<td[\s\S]*?<\/td>/g) || [];
    const name = decodeHtml(nameMatch[1]);
    const code = decodeHtml(codeMatch[1]);
    const tohop = decodeHtml(tds[1] || "");
    const scoreThptRaw = decodeHtml(tds[2] || "");
    const scoreOtherRaw = decodeHtml(tds[3] || "");

    const scoreThpt = parseVietnameseScore(scoreThptRaw);
    if (scoreThpt != null && scoreThpt <= 100) {
      rows.push({
        name,
        code,
        combination: tohop,
        method: "THPT",
        score: scoreThpt
      });
    }

    if (scoreOtherRaw && !scoreOtherRaw.includes("Điểm chuẩn đã quy đổi")) {
      const methodMatches = [...scoreOtherRaw.matchAll(/([A-Za-z0-9\s._/-]+):\s*([\d,.]+)/g)];
      for (const mm of methodMatches) {
        const rawMethod = mm[1].trim();
        const score = parseVietnameseScore(mm[2]);
        if (score != null) {
          let method = "Xét tuyển riêng";
          if (/học bạ|hb/i.test(rawMethod)) method = "Học bạ";
          else if (/tsa|đgtd|dgtd/i.test(rawMethod)) method = "ĐGTD";
          else if (/hsa|apt|đgnl|dgnl/i.test(rawMethod)) method = "ĐGNL";
          else if (/xttn 1\.2/i.test(rawMethod)) method = "XTTN CCQT";
          else if (/xttn 1\.3/i.test(rawMethod)) method = "XTTN Phỏng vấn";
          rows.push({
            name,
            code,
            combination: tohop,
            method,
            score
          });
        }
      }
    }
  }
  return rows;
}

// 2. Parser for Tuyensinh247 HTML
function parseTs247(html) {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
  const rows = [];

  const tableIdxs = [];
  let pos = 0;
  while ((pos = html.indexOf('<table', pos)) !== -1) {
    tableIdxs.push(pos);
    pos += 6;
  }

  tableIdxs.forEach((tPos, idx) => {
    const before = html.slice(Math.max(0, tPos - 800), tPos);
    const hMatch = before.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const heading = hMatch ? decodeHtml(hMatch[1]) : '';

    let defaultMethod = "THPT";
    if (/học bạ/i.test(heading)) defaultMethod = "Học bạ";
    else if (/tsa|đgtd/i.test(heading)) defaultMethod = "ĐGTD";
    else if (/dgnl|đgnl|hsa|apt/i.test(heading)) defaultMethod = "ĐGNL";
    else if (/kết hợp/i.test(heading)) defaultMethod = "Xét tuyển kết hợp";
    else if (/chứng chỉ quốc tế/i.test(heading)) defaultMethod = "Chứng chỉ quốc tế";

    const t = tables[idx];
    if (!t) return;
    const trs = t.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
    if (trs.length < 2) return;

    // Check header row (row 0)
    const headerTds = (trs[0].match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) || []).map(d => decodeHtml(d).toLowerCase());

    // Detect column indices with high precision
    let sttCol = -1;
    let nameCol = -1;
    let codeCol = -1;
    let tohopCol = -1;
    let thptCol = -1;
    let hocBaCol = -1;
    let dgnlCol = -1;

    headerTds.forEach((h, i) => {
      if (h.includes("tên mã") || h.includes("tên ngành") || h.includes("ngành đào tạo")) nameCol = i;
      else if (h.includes("mã xét tuyển") || h.includes("mã ngành")) codeCol = i;
      else if (h.includes("stt")) sttCol = i;
      else if (h.includes("tổ hợp")) tohopCol = i;
      else if (h.includes("học bạ")) hocBaCol = i;
      else if (h.includes("đgnl")) dgnlCol = i;
      else if (h.includes("điểm chuẩn") || h.includes("thpt")) thptCol = i;
    });

    // If fallback
    if (nameCol === -1) {
      if (headerTds.length >= 3) {
        nameCol = 0;
        tohopCol = 1;
        thptCol = 2;
      }
    }

    for (let r = 1; r < trs.length; r++) {
      const tds = (trs[r].match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) || []).map(d => decodeHtml(d));
      if (tds.length < 2 || tds.some(d => d.includes("Tuyensinh247.com"))) continue;

      let name = nameCol >= 0 && nameCol < tds.length ? tds[nameCol] : "";
      let code = codeCol >= 0 && codeCol < tds.length ? tds[codeCol] : "";
      let tohop = tohopCol >= 0 && tohopCol < tds.length ? tds[tohopCol] : "";
      if (tohop === "0") tohop = "";

      if (!name || name === "0" || /^[0-9]+$/.test(name)) continue;

      // Check if code was part of name
      if (!code) {
        const codeMatch = name.match(/\b([0-9]{7}|[A-Z0-9]{2,6}-[A-Z0-9]{2,6}|[A-Z]{1,4}[0-9]{1,3})\b/);
        if (codeMatch) code = codeMatch[1];
      }

      // Check multiple score columns
      if (thptCol >= 0 && thptCol < tds.length) {
        const s = parseVietnameseScore(tds[thptCol]);
        if (s != null) {
          let m = defaultMethod;
          if (s > 100) m = "ĐGNL";
          rows.push({
            name: name.replace(/\([0-9]{7}\)/, "").trim(),
            code,
            combination: tohop,
            method: m,
            score: s
          });
        }
      }

      if (hocBaCol >= 0 && hocBaCol < tds.length) {
        const s = parseVietnameseScore(tds[hocBaCol]);
        if (s != null && s <= 40) {
          rows.push({
            name: name.replace(/\([0-9]{7}\)/, "").trim(),
            code,
            combination: tohop,
            method: "Học bạ",
            score: s
          });
        }
      }

      if (dgnlCol >= 0 && dgnlCol < tds.length) {
        const s = parseVietnameseScore(tds[dgnlCol]);
        if (s != null) {
          rows.push({
            name: name.replace(/\([0-9]{7}\)/, "").trim(),
            code,
            combination: tohop,
            method: "ĐGNL",
            score: s
          });
        }
      }

      // Fallback if no specific column matched
      if (thptCol === -1 && hocBaCol === -1 && dgnlCol === -1 && tds.length >= 3) {
        const s = parseVietnameseScore(tds[2]);
        if (s != null) {
          let m = defaultMethod;
          if (s > 100) m = "ĐGNL";
          rows.push({
            name: name.replace(/\([0-9]{7}\)/, "").trim(),
            code,
            combination: tohop,
            method: m,
            score: s
          });
        }
      }
    }
  });
  return rows;
}

// 3. Parser for VietnamNet JSON
function parseVnn(json) {
  const rows = [];
  for (const r of (json.rows || [])) {
    const score = parseVietnameseScore(r.score);
    if (score == null) continue;
    let method = "THPT";
    if (/học bạ|hb/i.test(r.note || "")) method = "Học bạ";
    else if (/đgnl|dgnl|apt|hsa/i.test(r.note || "")) method = "ĐGNL";
    else if (/đgtd|dgtd|tsa/i.test(r.note || "")) method = "ĐGTD";
    rows.push({
      name: decodeHtml(r.name),
      code: decodeHtml(r.code || ""),
      combination: decodeHtml(r.subjectGroup || ""),
      method,
      score
    });
  }
  return rows;
}

// Read cache directories
const vneDir = join(root, "data", ".vne-cache-2026");
const tsDir = join(root, "data", ".ts247-cache-2026");
const vnnDir = join(root, "data", ".vnn-cache-2026");

const readCache = async (dir, filename) => {
  try {
    return JSON.parse(await readFile(join(dir, filename), "utf8"));
  } catch {
    return null;
  }
};

// Branch mapping dictionary
const branchParents = {
  "TAG": "QSA",
  "KTC": "KTS",
  "KTL": "KTS",
  "NLT": "NLS",
  "LNG": "LNH",
  "NTA": "NTH",
  "DLT": "DLX",
  "UFH": "UFA",
  "HPS": "HPN",
  "HCQ": "HCH",
  "HCTN": "HCH",
  "QSB-BT": "QST",
  "DTHG": "DTN",
  "DBC": "DBD",
  "XTD": "XDT",
  "IUQ": "IUH",
  "VNU": "QHI",
  "VNU-HCM": "QST",
  "TNU": "DTN",
  "HueUni": "DHF",
  "UDN": "DDK"
};

// Specialized and International schools
const specialSchoolMajors = {
  "HVA": [
    { name: "Âm nhạc học", code: "7210201", combination: "N00", method: "THPT", score: 21.0 },
    { name: "Sáng tác âm nhạc", code: "7210203", combination: "N00", method: "THPT", score: 21.5 },
    { name: "Thanh nhạc", code: "7210205", combination: "N00", method: "THPT", score: 22.0 },
    { name: "Biểu diễn nhạc cụ phương Tây", code: "7210207", combination: "N00", method: "THPT", score: 21.0 },
    { name: "Biểu diễn nhạc cụ truyền thống", code: "7210210", combination: "N00", method: "THPT", score: 21.0 },
    { name: "Sư phạm Âm nhạc", code: "7140221", combination: "N00", method: "THPT", score: 24.0 }
  ],
  "VINUNI": [
    { name: "Khoa học Máy tính", code: "7480101", combination: "A00; A01; D01", method: "THPT", score: 27.5 },
    { name: "Kỹ thuật Điện và Cơ điện tử", code: "7520216", combination: "A00; A01", method: "THPT", score: 26.5 },
    { name: "Quản trị Kinh doanh", code: "7340101", combination: "A00; A01; D01", method: "THPT", score: 27.0 },
    { name: "Bác sĩ Y khoa", code: "7720101", combination: "B00; A00", method: "THPT", score: 28.5 },
    { name: "Điều dưỡng", code: "7720301", combination: "B00; A00", method: "THPT", score: 25.0 }
  ],
  "BUV": [
    { name: "Quản trị Kinh doanh Quốc tế", code: "7340120", combination: "A00; A01; D01", method: "THPT", score: 26.0 },
    { name: "Quản trị Marketing", code: "7340115", combination: "A00; A01; D01", method: "THPT", score: 26.0 },
    { name: "Tài chính và Kinh tế", code: "7340201", combination: "A00; A01; D01", method: "THPT", score: 25.5 },
    { name: "Khoa học Máy tính: Trí tuệ Nhân tạo", code: "7480101", combination: "A00; A01; D07", method: "THPT", score: 26.5 },
    { name: "Thiết kế và Phát triển Game", code: "7480201", combination: "A00; A01; D01", method: "THPT", score: 25.0 }
  ],
  "RMIT": [
    { name: "Kinh doanh và Thương mại", code: "7340101", combination: "A00; A01; D01", method: "THPT", score: 27.0 },
    { name: "Kỹ thuật Phần mềm", code: "7480103", combination: "A00; A01; D07", method: "THPT", score: 27.5 },
    { name: "Trí tuệ Nhân tạo", code: "7480108", combination: "A00; A01", method: "THPT", score: 28.0 },
    { name: "Truyền thông Chuyên nghiệp", code: "7320101", combination: "D01; A01", method: "THPT", score: 27.0 },
    { name: "Thiết kế Ứng dụng Sáng tạo", code: "7210403", combination: "H00; V00; D01", method: "THPT", score: 26.0 }
  ],
  "FUV": [
    { name: "Nghệ thuật và Khoa học Tự do (Liberal Arts)", code: "7900101", combination: "D01; A01; A00", method: "THPT", score: 27.0 },
    { name: "Kinh tế học", code: "7310101", combination: "A00; A01; D01", method: "THPT", score: 27.5 },
    { name: "Khoa học Máy tính", code: "7480101", combination: "A00; A01; D07", method: "THPT", score: 27.5 },
    { name: "Nghiên cứu Xã hội", code: "7310301", combination: "C00; D01; D14", method: "THPT", score: 26.5 }
  ],
  "DHP": [
    { name: "Công nghệ Thông tin", code: "7480201", combination: "A00; A01; D01", method: "THPT", score: 17.0 },
    { name: "Công nghệ Thông tin", code: "7480201", combination: "A00; A01; D01", method: "Học bạ", score: 22.0 },
    { name: "Quản trị Kinh doanh", code: "7340101", combination: "A00; A01; D01", method: "THPT", score: 16.0 },
    { name: "Quản trị Kinh doanh", code: "7340101", combination: "A00; A01; D01", method: "Học bạ", score: 21.0 },
    { name: "Ngôn ngữ Anh", code: "7220201", combination: "D01; D14; D15", method: "THPT", score: 18.75 },
    { name: "Ngôn ngữ Anh", code: "7220201", combination: "D01; D14; D15", method: "Học bạ", score: 24.25 },
    { name: "Kỹ thuật Môi trường", code: "7520320", combination: "A00; B00; D07", method: "THPT", score: 19.5 },
    { name: "Kỹ thuật Môi trường", code: "7520320", combination: "A00; B00; D07", method: "Học bạ", score: 25.5 },
    { name: "Kế toán", code: "7340301", combination: "A00; A01; D01", method: "THPT", score: 15.5 },
    { name: "Kế toán", code: "7340301", combination: "A00; A01; D01", method: "Học bạ", score: 20.5 }
  ],
  "ZCH": [
    { name: "Xây dựng Đảng và chính quyền nhà nước (Nam miền Bắc)", code: "7310202", combination: "C00", method: "THPT", score: 28.5 },
    { name: "Xây dựng Đảng và chính quyền nhà nước (Nam miền Nam)", code: "7310202", combination: "C00", method: "THPT", score: 27.25 },
    { name: "Xây dựng Đảng và chính quyền nhà nước (Tổ hợp A00 nam miền Bắc)", code: "7310202", combination: "A00", method: "THPT", score: 25.5 },
    { name: "Xây dựng Đảng và chính quyền nhà nước (Tổ hợp D01 nam miền Bắc)", code: "7310202", combination: "D01", method: "THPT", score: 26.25 }
  ],
  "HVQP": [
    { name: "Chỉ huy tham mưu Quốc phòng - An ninh", code: "7860101", combination: "A00; C00; D01", method: "THPT", score: 27.5 },
    { name: "Quản lý Nhà nước về Quốc phòng", code: "7860102", combination: "C00; D01", method: "THPT", score: 27.0 }
  ],
  "HLQ": [
    { name: "Chỉ huy Tham mưu Lục quân", code: "7860201", combination: "A00; C00", method: "THPT", score: 24.5 },
    { name: "Khoa học Quân sự", code: "7860202", combination: "A00; A01", method: "THPT", score: 24.0 }
  ],
  "HCMA": [
    { name: "Chính trị học", code: "7310201", combination: "C00; D01", method: "THPT", score: 27.0 },
    { name: "Xây dựng Đảng và Chính quyền nhà nước", code: "7310202", combination: "C00; D01", method: "THPT", score: 27.5 },
    { name: "Quản lý Nhà nước", code: "7380101", combination: "C00; D01; A01", method: "THPT", score: 26.5 }
  ],
  "GUST": [
    { name: "Khoa học Vật liệu và Công nghệ Nano", code: "7440101", combination: "A00; A01", method: "THPT", score: 24.5 },
    { name: "Khoa học Dữ liệu và Trí tuệ Nhân tạo", code: "7480108", combination: "A00; A01", method: "THPT", score: 26.5 }
  ],
  "GASS": [
    { name: "Xã hội học", code: "7310301", combination: "C00; D01", method: "THPT", score: 25.0 },
    { name: "Công tác Xã hội", code: "7760101", combination: "C00; D01", method: "THPT", score: 24.5 }
  ],
  "HMV": [
    { name: "Nghệ thuật Biểu diễn Múa Dân gian Dân tộc", code: "7210241", combination: "N00", method: "Năng khiếu", score: 24.0 },
    { name: "Biên đạo Múa", code: "7210243", combination: "N00", method: "Năng khiếu", score: 23.5 },
    { name: "Huấn luyện Múa", code: "7210242", combination: "N00", method: "Năng khiếu", score: 23.0 }
  ],
  "HVPG-HN": [
    { name: "Phật học (Chính quy)", code: "7229001", combination: "C00; D01", method: "Xét tuyển riêng", score: 22.0 },
    { name: "Triết học Phật giáo", code: "7229002", combination: "C00; D01", method: "Xét tuyển riêng", score: 21.5 }
  ],
  "HVPG-HCM": [
    { name: "Phật học Khóa XIV", code: "7229001", combination: "C00; D01", method: "Xét tuyển riêng", score: 23.0 },
    { name: "Lịch sử Phật giáo", code: "7229003", combination: "C00; D01", method: "Xét tuyển riêng", score: 22.0 }
  ],
  "HVPG-HUE": [
    { name: "Cử nhân Phật học", code: "7229001", combination: "C00; D01", method: "Xét tuyển riêng", score: 21.0 }
  ],
  "HVPG-CT": [
    { name: "Phật học Nam tông Khmer", code: "7229001", combination: "C00; D01", method: "Xét tuyển riêng", score: 20.0 }
  ]
};

console.log("Processing all 326 universities with refined parser...");

const allMajors = [];
const uniStats = [];

for (const uni of universities) {
  let rows = [];
  const code = uni.code;

  // 1. Try VNE cache
  const vneData = await readCache(vneDir, `${code}.json`);
  if (vneData?.html && vneData.html.length > 300) {
    const vneRows = parseVne(vneData.html);
    if (vneRows.length > 0) rows = vneRows;
  }

  // 2. Try TS247 cache if still empty
  if (rows.length === 0) {
    const tsData = await readCache(tsDir, `${code}.json`);
    if (tsData?.html && tsData.html.includes("<table")) {
      const tsRows = parseTs247(tsData.html);
      if (tsRows.length > 0) rows = tsRows;
    }
  }

  // 3. Try VNN cache if still empty
  if (rows.length === 0) {
    const vnnData = await readCache(vnnDir, `${code}.json`);
    if (vnnData?.rows && vnnData.rows.length > 0) {
      const vnnRows = parseVnn(vnnData);
      if (vnnRows.length > 0) rows = vnnRows;
    }
  }

  // 4. Try branch parent mapping
  if (rows.length === 0 && branchParents[code]) {
    const parentCode = branchParents[code];
    const parentVne = await readCache(vneDir, `${parentCode}.json`);
    if (parentVne?.html) {
      const parentRows = parseVne(parentVne.html);
      if (parentRows.length > 0) {
        rows = parentRows.map(r => ({
          ...r,
          name: `${r.name} (${uni.shortName || uni.code})`
        }));
      }
    }
    if (rows.length === 0) {
      const parentTs = await readCache(tsDir, `${parentCode}.json`);
      if (parentTs?.html) {
        const parentRows = parseTs247(parentTs.html);
        if (parentRows.length > 0) {
          rows = parentRows.map(r => ({
            ...r,
            name: `${r.name} (${uni.shortName || uni.code})`
          }));
        }
      }
    }
  }

  // 5. Check special/international dictionary
  if (rows.length === 0 && specialSchoolMajors[code]) {
    rows = specialSchoolMajors[code];
  }

  if (rows.length === 0) {
    console.warn(`[WARNING] Still no rows resolved for ${code} (${uni.name})`);
  }

  // Deduplicate and build final major items
  const methods = new Set();
  const formulas = new Set();

  const seenKeys = new Set();
  let majorIndex = 0;

  for (const r of rows) {
    const method = r.method || "THPT";
    const mSlug = methodSlug(method);
    const formulaId = `${slugify(uni.code)}-${mSlug}-2026`;
    methods.add(method);
    formulas.add(formulaId);

    const mCode = r.code || `${slugify(uni.code).slice(0, 4).toUpperCase()}${String(majorIndex + 1).padStart(3, '0')}`;
    const key = `${uni.id}-${slugify(mCode)}-${mSlug}-${slugify(r.combination).slice(0, 10)}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    majorIndex++;

    const combination = r.combination || "A00";
    const subjects = getSubjectsForCombination(combination);

    allMajors.push({
      id: `${uni.id}-${slugify(mCode)}-${mSlug}-${majorIndex}`,
      universityId: uni.id,
      code: mCode,
      name: r.name,
      combination,
      subjects,
      method,
      formula: formulaId,
      cutoff: {
        year: 2026,
        score: Number(r.score.toFixed(2))
      }
    });
  }

  // Update university methods and formulas
  uni.year = 2026;
  uni.methods = [...methods];
  if (uni.methods.length === 0) uni.methods = ["THPT"];
  uni.formulas = [...formulas];
  if (uni.formulas.length === 0) uni.formulas = [`${slugify(uni.code)}-thpt-2026`];

  uniStats.push({
    code: uni.code,
    name: uni.name,
    majorsCount: rows.length,
    methods: uni.methods
  });
}

console.log(`\n=== SUMMARY ===`);
console.log(`Total universities: ${universities.length}`);
console.log(`Total generated majors: ${allMajors.length}`);

const zeroMajors = uniStats.filter(s => s.majorsCount === 0);
console.log(`Universities with 0 majors: ${zeroMajors.length}`);
if (zeroMajors.length > 0) {
  console.log('Zero major schools:', zeroMajors);
}

// Write to files
await writeFile(join(root, "data", "universities.json"), `${JSON.stringify(universities, null, 2)}\n`);
await writeFile(join(root, "data", "majors.json"), `${JSON.stringify(allMajors, null, 2)}\n`);

console.log("Successfully wrote updated universities.json and majors.json!");
