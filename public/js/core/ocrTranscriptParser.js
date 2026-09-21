function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9.,&+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreNumbers(value) {
  return [...String(value).matchAll(/(?:^|\s)(10(?:[.,]0{1,2})?|[0-9](?:[.,][0-9]{1,2})?)(?=\s|$)/g)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((score) => Number.isFinite(score) && score >= 0 && score <= 10);
}

function gradeFrom(value) {
  const match = normalizeText(value).match(/\b(?:lop|khoi|grade)\s*(10|11|12)\b/);
  return match ? Number(match[1]) : null;
}

function layoutFrom(text) {
  const value = normalizeText(text);
  return {
    semester1: /\b(?:hk\s*1|hk\s*i|hoc k[yi]\s*1|hoc k[yi]\s*i)\b/.test(value),
    semester2: /\b(?:hk\s*2|hk\s*ii|hoc k[yi]\s*2|hoc k[yi]\s*ii)\b/.test(value),
    year: /\b(?:ca\s*nam|tbcn|tbm\s*cn|trung binh nam)\b/.test(value),
    threeGrades: [10, 11, 12].every((grade) => new RegExp(`\\b(?:lop|khoi|grade)\\s*${grade}\\b`).test(value))
  };
}

function aliasesFrom(catalog) {
  return catalog.subjects.flatMap((subject) => [subject.canonical, ...(subject.aliases || [])].map((alias) => ({
    subject: subject.canonical,
    alias: normalizeText(alias)
  }))).filter((item) => item.alias).sort((a, b) => b.alias.length - a.alias.length);
}

function subjectInLine(line, aliases) {
  const normalized = normalizeText(line);
  const firstNumber = normalized.search(/\b(?:10(?:[.,]0{1,2})?|[0-9](?:[.,][0-9]{1,2})?)\b/);
  for (const candidate of aliases) {
    const index = ` ${normalized} `.indexOf(` ${candidate.alias} `);
    const prefix = normalized.slice(0, index).trim();
    const validPrefix = !prefix || /^\d{1,2}[.,-]?$/.test(prefix) || /^(?:mon|mon hoc|diem)$/.test(prefix);
    if (index < 0 || index > 18 || !validPrefix || (firstNumber >= 0 && index > firstNumber)) continue;
    return { ...candidate, normalized, index };
  }
  return null;
}

function studentNameFrom(lines) {
  for (const line of lines) {
    const match = String(line).match(/(?:họ\s*(?:và\s*)?tên|ho\s*(?:va\s*)?ten|học\s*sinh|hoc\s*sinh)\s*[:\-]\s*([^\d|]{3,120})/i);
    if (match) return match[1].replace(/\s+/g, " ").trim().slice(0, 120);
  }
  return null;
}

function row(subject, grade, values, confidence, layout) {
  const result = { subject, grade, semester1: null, semester2: null, year: null, confidence };
  if (layout.semester1 && layout.semester2 && layout.year && values.length === 3) {
    [result.semester1, result.semester2, result.year] = values;
    return result;
  }
  if (layout.semester1 && layout.semester2 && !layout.year && values.length === 2) {
    [result.semester1, result.semester2] = values;
    return result;
  }
  if (layout.year && !layout.semester1 && !layout.semester2 && values.length === 1) {
    [result.year] = values;
    return result;
  }
  if (layout.semester1 && !layout.semester2 && !layout.year && values.length === 1) {
    [result.semester1] = values;
    return result;
  }
  if (layout.semester2 && !layout.semester1 && !layout.year && values.length === 1) {
    [result.semester2] = values;
    return result;
  }
  return null;
}

export function parseOcrTranscriptPages(pages, catalog) {
  const aliases = aliasesFrom(catalog);
  const scores = [];
  const warnings = [];
  let studentName = null;
  let recognizedSubjectLines = 0;

  for (const page of pages) {
    const lines = String(page.text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    studentName ||= studentNameFrom(lines);
    const layout = layoutFrom(page.text);
    const explicitGrades = [...new Set(lines.map(gradeFrom).filter(Boolean))];
    const pageGrade = gradeFrom(page.originalname) || (!layout.threeGrades && explicitGrades.length === 1 ? explicitGrades[0] : null);
    let currentGrade = pageGrade;

    for (let index = 0; index < lines.length; index += 1) {
      const lineGrade = gradeFrom(lines[index]);
      if (lineGrade && !layout.threeGrades) currentGrade = lineGrade;
      const match = subjectInLine(lines[index], aliases);
      if (!match) continue;
      recognizedSubjectLines += 1;
      const scoreText = match.normalized.slice(match.index + match.alias.length)
        .replace(/\b(?:lop|khoi|grade)\s*(?:10|11|12)\b/g, " ");
      let values = scoreNumbers(scoreText);
      if (!values.length && lines[index + 1] && !subjectInLine(lines[index + 1], aliases)) {
        const continued = scoreNumbers(normalizeText(lines[index + 1]));
        if (continued.length <= 3) { values = continued; index += 1; }
      }
      const confidence = Number(Math.max(0.2, Math.min(0.65, (Number(page.confidence) || 50) / 140)).toFixed(2));

      if (layout.threeGrades && !currentGrade && values.length === 3 && !layout.semester1 && !layout.semester2) {
        [10, 11, 12].forEach((grade, valueIndex) => scores.push({ subject: match.subject, grade, semester1: null, semester2: null, year: values[valueIndex], confidence }));
        continue;
      }
      if (!currentGrade) {
        warnings.push(`${match.subject}: chưa xác định được lớp nên chưa tự điền.`);
        continue;
      }
      if (!values.length || values.length > 3) {
        warnings.push(`${match.subject} lớp ${currentGrade}: bố cục điểm chưa đủ rõ nên chưa tự điền.`);
        continue;
      }
      const parsed = row(match.subject, currentGrade, values, confidence, layout);
      if (parsed) scores.push(parsed);
      else warnings.push(`${match.subject} lớp ${currentGrade}: chưa xác định chắc cột HK1, HK2 hoặc cả năm.`);
    }
  }

  if (!scores.length && recognizedSubjectLines) warnings.push("Đã đọc được tên môn nhưng chưa xác định chắc lớp và cột điểm.");
  return { payload: { student: { name: studentName }, scores }, warnings: [...new Set(warnings)].slice(0, 30) };
}
