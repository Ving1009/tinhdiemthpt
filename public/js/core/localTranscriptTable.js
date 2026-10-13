const SCORE_FIELDS = ["semester1", "semester2", "year"];

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9.,&\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.length ? ordered[Math.floor(ordered.length / 2)] : 0;
}

function wordsFrom(blocks) {
  return (blocks || []).flatMap((block) => (block.paragraphs || []).flatMap((paragraph) =>
    (paragraph.lines || []).flatMap((line) => line.words || [])))
    .filter((word) => word.text?.trim() && ["x0", "y0", "x1", "y1"].every((key) => Number.isFinite(word.bbox?.[key]))
      && word.bbox.x1 > word.bbox.x0 && word.bbox.y1 > word.bbox.y0)
    .map((word) => ({ ...word, x: (word.bbox.x0 + word.bbox.x1) / 2, y: (word.bbox.y0 + word.bbox.y1) / 2 }));
}

function rowsFrom(words, height) {
  const rows = [];
  for (const word of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let row = rows.find((item) => Math.abs(item.y - word.y) <= height * 0.65);
    if (!row) { row = { y: word.y, words: [] }; rows.push(row); }
    row.words.push(word);
    row.y = median(row.words.map((item) => item.y));
  }
  return rows.sort((a, b) => a.y - b.y).map((row) => ({ ...row, words: row.words.sort((a, b) => a.x - b.x) }));
}

function rectangle(words) {
  const left = Math.min(...words.map((word) => word.bbox.x0));
  const top = Math.min(...words.map((word) => word.bbox.y0));
  return { left, top, width: Math.max(...words.map((word) => word.bbox.x1)) - left,
    height: Math.max(...words.map((word) => word.bbox.y1)) - top };
}

function fieldFrom(value) {
  const text = normalized(String(value || "").replace(/[|!]/g, "i"));
  if (/^(?:hk|(?:hoc|loc|doc|hoo)\s*[kl][yi])\s*(?:1|i|l)$/.test(text)) return "semester1";
  if (/^(?:hk|(?:hoc|loc|doc|hoo)\s*[kl][yi])\s*(?:2|i[ilt])$/.test(text)) return "semester2";
  if (/^(?:ca\s*nam|cn|tbcn|tbm\s*cn|dtb\s*cn|trung binh nam)$/.test(text)) return "year";
  if (/^(?:dtb(?:m|mh|mhk)?|tb(?:m|mh|mhk)?|tb mon|diem tb|diem trung binh)$/.test(text)) return "average";
  if (/^(?:tx|gk|ck|ddg(?:tx|gk|ck)|thuong xuyen|giua k[yi]|cuoi k[yi])$/.test(text)) return "component";
  return null;
}

function headerCandidates(rows, height) {
  const headers = [];
  for (const row of rows) {
    for (let start = 0; start < row.words.length; start += 1) {
      for (let count = Math.min(4, row.words.length - start); count >= 1; count -= 1) {
        const words = row.words.slice(start, start + count);
        if (words.some((word, index) => index && word.bbox.x0 - words[index - 1].bbox.x1 > height * 1.7)) continue;
        const field = fieldFrom(words.map((word) => word.text).join(" "));
        if (!field) continue;
        headers.push({ field, x: (words[0].bbox.x0 + words.at(-1).bbox.x1) / 2, y: row.y, rectangle: rectangle(words) });
        start += count - 1;
        break;
      }
    }
  }
  return headers;
}

function prefixWords(row) {
  const result = [];
  for (let index = 0; index < row.words.length; index += 1) {
    const word = row.words[index];
    if (result.length && [1, 2, 3].some((count) => SCORE_FIELDS.includes(fieldFrom(row.words.slice(index, index + count).map((item) => item.text).join(" "))))) break;
    const text = normalized(word.text);
    if (/^\d+(?:[.,]\d+)?$/.test(text)) {
      if (!result.length && /^\d{1,2}$/.test(text)) { result.push(word); continue; }
      if (text === "1" && /ngoai ngu$/.test(normalized(result.map((item) => item.text).join(" ")))) { result.push(word); continue; }
      break;
    }
    result.push(word);
  }
  return result;
}

function subjectFrom(words, aliases) {
  const text = normalized(words.map((word) => word.text).join(" ")).replace(/^\d{1,2}[.,-]?\s+/, "");
  if (/^ngoai ngu\s*1?\s*tieng anh$/.test(text)) return "Tiếng Anh";
  for (const alias of aliases) {
    if (text === alias.text || (alias.text === "toan" && text === "toan hoc")) return alias.subject;
    if (alias.text === "tin" && /^tin (?:hoc|hoe)$/.test(text)) return alias.subject;
    if (alias.text === "ngoai ngu" && /^ngoai ngu\s*1$/.test(text)) return alias.subject;
  }
  return null;
}

function subjectRows(rows, aliases, height) {
  const subjects = [];
  for (let index = 0; index < rows.length; index += 1) {
    let words = prefixWords(rows[index]);
    let subject = subjectFrom(words, aliases);
    for (let nextIndex = index + 1; nextIndex < rows.length && rows[nextIndex].y - rows[index].y <= height * 2.2; nextIndex += 1) {
      const continuation = prefixWords(rows[nextIndex]);
      if (!continuation.some((word) => /[a-z]/.test(normalized(word.text)))) continue;
      const continued = [...words, ...continuation];
      const combined = subjectFrom(continued, aliases);
      if (combined && (!subject || subject === "Ngoại ngữ")) {
        subject = combined;
        words = continued;
        index = nextIndex;
      }
      break;
    }
    if (subject) subjects.push({ subject, words, y: (Math.min(...words.map((word) => word.bbox.y0)) + Math.max(...words.map((word) => word.bbox.y1))) / 2 });
  }
  return subjects;
}

function gradeFrom(page, rows, firstSubjectTop) {
  const currentClassText = (value) => String(value || "").split(/\r?\n/).map((line) => normalized(line)
    .split(/\b(?:duoc\s+len\s+lop|len\s+lop\s+thang|len\s+lop|luu\s+ban|thi\s+lai)\b/)[0]).join(" ");
  const from = (value) => [...currentClassText(value).matchAll(/\b(?:lop|khoi|grade)\s*[:.-]?\s*(\d+)(?=$|[^0-9])/g)].map((match) => Number(match[1]));
  const headerGrades = rows.filter((row) => row.y < firstSubjectTop).flatMap((row) => from(row.words.map((word) => word.text).join(" ")));
  const grades = [...new Set([...from(page.originalname), ...(headerGrades.length ? headerGrades : from(page.text)),
    ...(page.gradeHint === undefined || page.gradeHint === null ? [] : [Number(page.gradeHint)])])];
  return grades.length === 1 && [10, 11, 12].includes(grades[0]) ? grades[0] : null;
}

function numericWord(word) {
  return /^[+-]?\d+(?:[.,]\d+)?$/.test(normalized(word.text));
}

function scoreOf(words) {
  if (words.length !== 1 || !/^\d{1,2}(?:[.,]\d{1,2})?$/.test(String(words[0].text).trim())) return null;
  const value = Number(String(words[0].text).trim().replace(",", "."));
  return value >= 0 && value <= 10 && Number(words[0].confidence ?? 0) >= 60 ? value : null;
}

function numericClusters(words, height) {
  const clusters = [];
  for (const word of words.filter(numericWord).sort((a, b) => a.x - b.x)) {
    let cluster = clusters.find((item) => Math.abs(item.x - word.x) <= height * 1.5);
    if (!cluster) { cluster = { x: word.x, words: [] }; clusters.push(cluster); }
    cluster.words.push(word);
    cluster.x = median(cluster.words.map((item) => item.x));
  }
  return clusters;
}

function inlineCells(row, headers, words, height) {
  const right = Math.max(...row.words.map((word) => word.bbox.x1));
  const labels = headers.filter((header) => SCORE_FIELDS.includes(header.field) && header.x > right && Math.abs(header.y - row.y) <= height * 0.9)
    .sort((a, b) => a.x - b.x);
  const cells = {};
  const columns = [];
  const gap = median(labels.slice(1).map((header, index) => header.x - labels[index].x)) || height * 8;
  for (let index = 0; index < labels.length; index += 1) {
    const header = labels[index];
    if (labels.filter((item) => item.field === header.field).length !== 1) continue;
    const left = header.rectangle.left + header.rectangle.width + height * 0.2;
    const end = labels[index + 1]?.rectangle.left - height * 0.2 || left + gap * 0.65;
    const cellWords = words.filter((word) => word.x > left && word.x < end && Math.abs(word.y - row.y) <= height * 1.4);
    const value = scoreOf(cellWords);
    cells[header.field] = { value, observedScore: cellWords.some(numericWord), confidence: cellWords.length === 1 ? Number(cellWords[0].confidence ?? 0) : 0,
      rectangle: { left: Math.floor(left), top: Math.max(0, Math.floor(row.y - height * 1.4)), width: Math.max(1, Math.ceil(end - left)), height: Math.ceil(height * 2.8) } };
    columns.push({ field: header.field, x: (left + end) / 2, x0: left, x1: end, header: header.rectangle });
  }
  return { cells, columns };
}

export function analyzeLocalTranscriptTable(page, catalog) {
  const words = wordsFrom(page.blocks);
  const height = Math.max(4, median(words.map((word) => word.bbox.y1 - word.bbox.y0)));
  const rows = rowsFrom(words, height);
  const aliases = (catalog?.subjects || []).flatMap((subject) => [subject.canonical, ...(subject.aliases || [])]
    .map((alias) => ({ subject: subject.canonical, text: normalized(alias) }))).sort((a, b) => b.text.length - a.text.length);
  const initialSubjects = subjectRows(rows, aliases, height);
  const warnings = [];
  const allHeaders = headerCandidates(rows, height);
  const matchingHeaders = allHeaders.filter((header) => words.some((word) => numericWord(word) && word.y > header.y
    && Math.abs(word.x - header.x) <= Math.max(height * 1.5, header.rectangle.width / 2)));
  const bands = [];
  for (const header of matchingHeaders.length ? matchingHeaders : allHeaders) {
    let band = bands.find((item) => Math.abs(item.y - header.y) <= height * 2);
    if (!band) { band = { y: header.y, headers: [] }; bands.push(band); }
    band.headers.push(header);
  }
  const band = bands.sort((a, b) => b.headers.length - a.headers.length || a.y - b.y)[0];
  const firstHeaderLeft = band ? Math.min(...band.headers.map((header) => header.rectangle.left)) : Infinity;
  const labelRight = median(initialSubjects.flatMap((row) => row.words.map((word) => word.bbox.x1)).filter((x) => x < firstHeaderLeft));
  const labelClusters = numericClusters(words.filter((word) => word.x > labelRight + height * 0.6 && word.y > (band?.y || 0)), height);
  const recurringColumns = labelClusters.filter((cluster) => cluster.words.length > 1);
  const numericLeft = Math.min(...(recurringColumns.length ? recurringColumns : labelClusters).flatMap((cluster) => cluster.words.map((word) => word.bbox.x0)));
  const subjectBoundary = Math.min(firstHeaderLeft, numericLeft - height * 0.5);
  const subjects = subjectRows(rowsFrom(words.filter((word) => word.bbox.x1 < subjectBoundary + height * 0.3), height), aliases, height)
    .filter((row) => !band || row.y > band.y + height * 0.5 || allHeaders.some((header) => SCORE_FIELDS.includes(header.field)
      && Math.abs(header.y - row.y) <= height * 0.9 && header.x > Math.max(...row.words.map((word) => word.bbox.x1))));
  const grade = gradeFrom(page, rows, subjects.length ? Math.min(...subjects[0].words.map((word) => word.bbox.y0)) : -Infinity);
  if (!grade) warnings.push("Chưa xác định chắc lớp 10, 11 hoặc 12 nên chưa tự điền điểm từ bảng này.");
  if (!subjects.length) return { grade, rows: [], cells: [], columns: [], warnings };
  const firstTop = Math.min(...subjects[0].words.map((word) => word.bbox.y0));
  const lastBottom = Math.max(...subjects.at(-1).words.map((word) => word.bbox.y1));
  const subjectRight = Math.max(...subjects.flatMap((row) => row.words.map((word) => word.bbox.x1)));
  const spacing = median(subjects.slice(1).map((row, index) => row.y - subjects[index].y)) || height * 3;
  const candidates = allHeaders.filter((header) => header.y < firstTop && header.x > subjectRight
    && firstTop - (header.rectangle.top + header.rectangle.height) <= Math.max(height * 4, spacing * 1.25));
  const closestHeader = Math.max(...candidates.map((header) => header.y));
  const headers = candidates.filter((header) => closestHeader - header.y <= height * 0.9);
  const directFields = [...new Set(allHeaders.filter((header) => header.y < firstTop)
    .map((header) => header.field).filter((field) => SCORE_FIELDS.includes(field)))];
  const periodHint = SCORE_FIELDS.includes(page.periodHint) ? page.periodHint : null;
  const averageField = directFields.length === 1 ? (!periodHint || periodHint === directFields[0] ? directFields[0] : null)
    : directFields.length ? null : periodHint;
  const clusters = numericClusters(words.filter((item) => item.y >= firstTop && item.y <= lastBottom + height * 2 && item.x > subjectRight), height);
  for (const header of headers) {
    if (header.field === "component" || !clusters.every((cluster) => Math.abs(cluster.x - header.x) > Math.max(height * 1.5, header.rectangle.width / 2))) continue;
    clusters.push({ x: header.x, words: [] });
  }
  let columns = clusters.sort((a, b) => a.x - b.x).map((cluster, index, all) => {
    const nearby = headers.filter((header) => Math.abs(header.x - cluster.x) <= Math.max(height * 1.5, header.rectangle.width / 2));
    const fields = [...new Set(nearby.map((header) => header.field === "average" ? averageField : header.field))];
    const field = fields.length === 1 && SCORE_FIELDS.includes(fields[0]) ? fields[0] : null;
    return { field, hasNumericWords: cluster.words.length > 0,
      isComponent: nearby.length > 0 && nearby.every(header => header.field === "component"),
      x: cluster.x, x0: index ? (all[index - 1].x + cluster.x) / 2 : Math.max(subjectRight, cluster.x - Math.max(height * 2, (all[1]?.x - cluster.x || height * 4) / 2)),
      x1: index + 1 < all.length ? (cluster.x + all[index + 1].x) / 2 : cluster.x + Math.max(height * 2, (cluster.x - all[index - 1]?.x || height * 4) / 2),
      header: nearby.find((header) => header.field === field || header.field === "average")?.rectangle || null };
  });
  for (const field of SCORE_FIELDS) {
    const matches = columns.filter((column) => column.field === field);
    if (matches.length > 1) matches.forEach((column) => { column.field = null; });
  }
  // A caption alone cannot identify a mean column in a table of assessment components.
  if (columns.length > 3 && headers.length === 1 && SCORE_FIELDS.includes(headers[0].field)) {
    columns.forEach((column) => { column.field = null; });
  }
  const detectedRows = subjects.map((row, index) => {
    const y0 = Math.max(firstTop - height, index ? (subjects[index - 1].y + row.y) / 2 : row.y - spacing / 2);
    const y1 = index + 1 < subjects.length ? (row.y + subjects[index + 1].y) / 2 : row.y + spacing / 2;
    const cells = {};
    for (const column of columns.filter((item) => item.field)) {
      const halfWidth = Math.max(height * 0.8, Math.min(column.x - column.x0, column.x1 - column.x) * 0.78);
      const halfHeight = Math.max(height * 0.9, Math.min(height * 1.4, Math.min(row.y - y0, y1 - row.y) * 0.8));
      const cellWords = words.filter((word) => Math.abs(word.y - row.y) <= halfHeight && Math.abs(word.x - column.x) <= halfWidth);
      const numericWords = cellWords.filter(numericWord);
      const cellY = numericWords.length === 1 ? numericWords[0].y : row.y;
      const value = scoreOf(cellWords);
      cells[column.field] = { value, observedScore: numericWords.length > 0, confidence: cellWords.length === 1 ? Number(cellWords[0].confidence ?? 0) : 0,
        rectangle: { left: Math.max(0, Math.floor(column.x - halfWidth)), top: Math.max(0, Math.floor(cellY - halfHeight)), width: Math.ceil(halfWidth * 2), height: Math.ceil(halfHeight * 2) } };
    }
    const inline = inlineCells(row, allHeaders, words, height);
    if (Object.keys(inline.cells).length) {
      if (subjects.length === 1) columns = inline.columns;
      return { subject: row.subject, grade, cells: inline.cells };
    }
    return { subject: row.subject, grade, cells };
  });
  const headerLeft = Math.max(subjectRight, columns.filter((column) => column.x <= Math.max(...headers.map((header) => header.x)) + height * 2)[0]?.x0 || subjectRight);
  const headerRight = headers.length ? Math.max(...headers.map((header) => header.rectangle.left + header.rectangle.width)) + height * 0.5 : columns.at(-1)?.x1 || headerLeft;
  const headerTop = headers.length ? Math.min(...headers.map((header) => header.rectangle.top)) - height * 0.5 : firstTop - height * 4;
  const headerBottom = headers.length ? Math.max(...headers.map((header) => header.rectangle.top + header.rectangle.height)) + height * 0.5 : firstTop - height;
  // Retry a damaged subject label only when its row contains a number in a mapped score column.
  const labelRegions = grade ? rows.filter(row => row.y >= firstTop - spacing / 2 && row.y <= lastBottom + spacing / 2
    && !subjects.some(subject => Math.abs(subject.y - row.y) <= height * 1.5)
    && row.words.some(word => numericWord(word) && columns.some(column => column.field && word.x >= column.x0 && word.x <= column.x1)))
    .flatMap(row => {
      const labels = row.words.filter(word => word.bbox.x1 < subjectBoundary && /[a-z]/.test(normalized(word.text)));
      if (!labels.length) return [];
      const left = Math.max(0, Math.min(...labels.map(word => word.bbox.x0)) - height * 0.5);
      const right = Math.min(subjectBoundary, Math.max(...labels.map(word => word.bbox.x1)) + height * 0.5);
      return [{ left: Math.floor(left), top: Math.max(0, Math.floor(row.y - height * 1.4)),
        width: Math.max(1, Math.ceil(right - left)), height: Math.ceil(height * 2.8) }];
    }).slice(0, 16) : [];
  const unknownScorePositions = labelRegions.flatMap(region => words.filter(word => numericWord(word)
    && word.y >= region.top && word.y <= region.top + region.height
    && columns.some(column => column.field && word.x >= column.x0 && word.x <= column.x1)));
  const mappedColumns = columns.filter(column => column.field);
  // Numeric marks in the remarks/signature area are not missing score columns.
  // With only one mapped column, there is too little geometry to exclude them safely.
  const scoreGap = median(mappedColumns.slice(1).map((column, index) => column.x - mappedColumns[index].x));
  const adjacentMargin = Math.max(scoreGap * 1.25, height * 3,
    ...mappedColumns.map(column => column.header?.width || 0));
  const scoreLeft = Math.min(...mappedColumns.map(column => column.x)) - adjacentMargin;
  const scoreRight = Math.max(...mappedColumns.map(column => column.x)) + adjacentMargin;
  const unresolvedColumns = columns.filter(column => !column.field && !column.isComponent && ((column.hasNumericWords
    && (mappedColumns.length < 2 || (column.x >= scoreLeft && column.x <= scoreRight)))
    || headers.some(header => header.field !== "component"
      && Math.abs(header.x - column.x) <= Math.max(height * 1.5, header.rectangle.width / 2)))).length;
  return { grade, rows: detectedRows, columns, warnings,
    unresolvedColumns, unknownScoreCells: unknownScorePositions.length,
    labelRegions,
    cells: detectedRows.flatMap((row) => Object.entries(row.cells).map(([field, cell]) => ({ subject: row.subject, grade, field, ...cell }))),
    headerRegion: { left: Math.max(0, Math.floor(headerLeft)), top: Math.max(0, Math.floor(headerTop)),
      width: Math.max(1, Math.ceil(headerRight - headerLeft)), height: Math.max(1, Math.ceil(headerBottom - headerTop)) } };
}

export function localTranscriptTableEvidence(table) {
  const observed = (table.rows || []).flatMap(row => Object.entries(row.cells).filter(([, cell]) => cell.observedScore || cell.value !== null)
    .map(([field, cell]) => ({ key: `${row.subject}|${table.grade}|${field}`, cell })));
  const expectedCellKeys = [...new Set(observed.map(item => item.key))];
  const unresolvedSubjects = table.labelRegions?.length || 0;
  const geometryReliable = Boolean(table.grade && table.rows?.length && table.columns?.some(column => column.field)
    && !table.unresolvedColumns);
  return {
    expectedCells: geometryReliable ? expectedCellKeys.length + (table.unknownScoreCells || 0) : null,
    expectedCellsReliable: geometryReliable,
    expectedCellKeys: geometryReliable ? expectedCellKeys : [],
    visibleScoreCells: observed.length + (table.unknownScoreCells || 0),
    recognizedCells: observed.filter(({ cell }) => Number.isFinite(cell.value) && cell.value >= 0 && cell.value <= 10).length,
    geometryReliable,
    unresolvedSubjects,
    unresolvedColumns: table.unresolvedColumns || 0,
    conflicts: observed.filter(({ cell }) => cell.conflict).length,
    invalidScores: observed.filter(({ cell }) => cell.value === null && !cell.conflict).length
  };
}

export function localTranscriptTablePayload(table) {
  const scores = table.grade ? table.rows.flatMap((row) => {
    const values = Object.fromEntries(SCORE_FIELDS.map((field) => [field, row.cells[field]?.value ?? null]));
    if (Object.values(values).every((value) => value === null)) return [];
    return [{ subject: row.subject, grade: table.grade, ...values,
      confidence: Number((Math.min(...SCORE_FIELDS.filter((field) => values[field] !== null).map((field) => row.cells[field].confidence)) / 100).toFixed(2)) }];
  }) : [];
  return { student: { name: null }, scores };
}

export function parseLocalTranscriptTable(page, catalog) {
  const table = analyzeLocalTranscriptTable(page, catalog);
  return { payload: localTranscriptTablePayload(table), warnings: table.warnings };
}
