import { parseOcrTranscriptPages } from "./core/ocrTranscriptParser.js?v=20261001-2";
import { validateTranscriptPayload } from "./core/transcriptValidator.js";
import { analyzeLocalTranscriptTable, localTranscriptTablePayload } from "./core/localTranscriptTable.js?v=20261013-1";
import { decodeTranscriptImage, optimizeTranscriptImage, prepareTranscriptCell } from "./transcriptImageOptimizer.js?v=20261013-2";

const GENERIC_OCR_ERROR = "Chưa đọc được ảnh. Bạn hãy dùng ảnh thẳng, rõ chữ hoặc nhập điểm thủ công.";

function boundedRectangle(rectangle, width, height, scale = 1) {
  if (!rectangle || ![width, height, scale, rectangle.left, rectangle.top, rectangle.width, rectangle.height].every(Number.isFinite)) return null;
  const left = Math.max(0, Math.floor(rectangle.left * scale));
  const top = Math.max(0, Math.floor(rectangle.top * scale));
  const right = Math.min(width, Math.ceil((rectangle.left + rectangle.width) * scale));
  const bottom = Math.min(height, Math.ceil((rectangle.top + rectangle.height) * scale));
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

function localOcrReading(result) {
  const words = (result?.data?.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(paragraph =>
    (paragraph.lines || []).flatMap(line => line.words || []))).filter(word => word.text?.trim() && !/^[.,|]$/.test(word.text.trim()));
  if (words.length > 1) return null;
  const text = String(words[0]?.text || result?.data?.text || "").trim();
  const confidence = Number(words[0]?.confidence ?? result?.data?.confidence);
  if (!/^\d{1,2}(?:[.,]\d{1,2})?$/.test(text) || !Number.isFinite(confidence) || confidence < 70) return null;
  const value = Number(text.replace(",", "."));
  return value >= 0 && value <= 10 ? { value, confidence } : null;
}

const mapBlocks = (blocks, mapWord) => (blocks || []).map(block => ({ ...block, paragraphs: (block.paragraphs || []).map(paragraph => ({ ...paragraph,
  lines: (paragraph.lines || []).map(line => ({ ...line, words: (line.words || []).flatMap(mapWord) })) })) }));

export function localOcrScore(result) {
  return localOcrReading(result)?.value ?? null;
}

export function agreeLocalOcrReadings(results, initial = null) {
  const readings = results.map(localOcrReading).filter(Boolean);
  if (initial?.value !== null && initial?.confidence >= 70) readings.push(initial);
  if (!readings.length || new Set(readings.map(reading => reading.value)).size !== 1) return null;
  const confidence = Math.max(...readings.map(reading => reading.confidence));
  return confidence >= 85 || readings.length >= 2 ? { value: readings[0].value, confidence } : null;
}

async function readLocalTable(page, image, sourceFile, catalog, configure, recognize, onStatus) {
  let table = analyzeLocalTranscriptTable(page, catalog);
  const header = boundedRectangle(table.headerRegion, image.width, image.height);
  let detailedImage;
  let originalImage;
  try {
    if (table.rows.length && sourceFile && Number.isFinite(image.width)) {
      detailedImage = await optimizeTranscriptImage(sourceFile, { maxDimension: 2400, quality: 0.95, allowUpscale: true,
        threshold: image.width > image.height ? 210 : null });
    }
    const scale = detailedImage ? detailedImage.width / image.width : 1;
    if (table.rows.length && header && table.columns.some((column) => !column.field)) {
      const columns = table.columns.filter(column => column.x >= header.left && column.x <= header.left + header.width);
      // Retry the whole ambiguous header group together; an isolated II misread as I must not move HK2 scores into HK1.
      for (const psm of columns.length <= 3 ? ["7", "13"] : []) {
        await configure({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: "" });
        let blocks = page.blocks;
        for (const column of columns.filter(column => !column.field)) {
          const height = Math.min(header.height, Math.min(...table.cells.map(cell => cell.rectangle.height)) * 0.7);
          const region = { left: column.x0 + 2, top: header.top + (header.height - height) / 2, width: column.x1 - column.x0 - 4, height };
          const rectangle = boundedRectangle(region, detailedImage?.width || image.width, detailedImage?.height || image.height, scale);
          if (!rectangle) continue;
          const result = await recognize(detailedImage?.blob || image.blob, { rectangle }, { blocks: true });
          const originalBlocks = mapBlocks(blocks, word => {
            const box = word.bbox;
            const x = (box.x0 + box.x1) / 2, y = (box.y0 + box.y1) / 2;
            return x >= column.x0 && x <= column.x1 && y >= header.top && y <= header.top + header.height ? [] : [word];
          });
          const headerBlocks = mapBlocks(result?.data?.blocks, word => [{ ...word,
            bbox: Object.fromEntries(Object.entries(word.bbox).map(([key, value]) => [key, value / scale])) }]);
          blocks = [...originalBlocks, ...headerBlocks];
        }
        const candidate = { ...page, blocks };
        const candidateTable = analyzeLocalTranscriptTable(candidate, catalog);
        const mapped = candidateTable.columns.filter(column => column.x >= header.left && column.x <= header.left + header.width);
        if (mapped.length === columns.length && mapped.every(column => column.field) && candidateTable.rows.length >= table.rows.length
          && columns.filter(column => column.field).every(column => mapped.some(next => next.field === column.field && Math.abs(next.x - column.x) < 10))) {
          page.blocks = candidate.blocks; table = candidateTable; break;
        }
      }
    }
    if (!table.grade) return { payload: { student: { name: null }, scores: [] }, warnings: table.warnings };
    for (const region of detailedImage ? table.labelRegions || [] : []) {
      const rectangle = boundedRectangle(region, detailedImage.width, detailedImage.height, scale);
      if (!rectangle) continue;
      for (const mode of ["7", "13", "native"]) {
        let nativeCell;
        if (mode === "native") {
          try {
            originalImage ||= await decodeTranscriptImage(sourceFile);
            nativeCell = await prepareTranscriptCell(originalImage, region, image.width, { zoom: 1.5, binarize: false });
          } catch { /* Không suy đoán tên môn nếu không đọc được vùng ảnh gốc. */ }
          if (!nativeCell) continue;
        }
        await configure({ tessedit_pageseg_mode: mode === "native" ? "7" : mode, tessedit_char_whitelist: "", user_defined_dpi: "0",
          preserve_interword_spaces: mode === "native" ? "0" : "1" });
        const result = await recognize(nativeCell || detailedImage.blob, nativeCell ? {} : { rectangle }, { blocks: true });
        const originalBlocks = mapBlocks(page.blocks, word => {
          const x = (word.bbox.x0 + word.bbox.x1) / 2, y = (word.bbox.y0 + word.bbox.y1) / 2;
          return x >= region.left && x <= region.left + region.width && y >= region.top && y <= region.top + region.height ? [] : [word];
        });
        let labelBlocks = [];
        if (nativeCell) {
          if (Number(result?.data?.confidence) >= 70) labelBlocks = [{ paragraphs: [{ lines: [{ words: [{
            text: String(result.data.text || "").trim(), confidence: result.data.confidence,
            bbox: { x0: region.left, x1: region.left + region.width, y0: region.top + region.height * 0.2, y1: region.top + region.height * 0.8 }
          }] }] }] }];
        } else {
          labelBlocks = mapBlocks(result?.data?.blocks, word => Number(word.confidence) >= 70 ? [{ ...word,
            bbox: Object.fromEntries(Object.entries(word.bbox).map(([key, value]) => [key, value / scale])) }] : []);
        }
        const blocks = [...originalBlocks, ...labelBlocks];
        const candidateTable = analyzeLocalTranscriptTable({ ...page, blocks }, catalog);
        if (candidateTable.grade === table.grade && candidateTable.rows.length > table.rows.length
          && table.rows.every(row => candidateTable.rows.some(next => next.subject === row.subject))
          && table.columns.filter(column => column.field).every(column => candidateTable.columns.some(next => next.field === column.field && Math.abs(next.x - column.x) < 10))) {
          page.blocks = blocks; table = candidateTable; break;
        }
      }
    }
    const retryCells = table.rows.flatMap((row) => Object.entries(row.cells).filter(([, cell]) => cell.value === null || cell.confidence < 85)
      .map(([field, cell]) => ({ row, field, cell }))).slice(0, 60);
    if (retryCells.length && detailedImage) {
      onStatus("Đang đọc lại các ô điểm chưa rõ trên thiết bị...");
      await configure({ tessedit_pageseg_mode: "13", tessedit_char_whitelist: "0123456789.,", user_defined_dpi: "300", preserve_interword_spaces: "1" });
      for (const { row, field, cell } of retryCells) {
        const rectangle = boundedRectangle(cell.rectangle, detailedImage.width, detailedImage.height, scale);
        if (!rectangle) continue;
        const readings = [];
        for (const psm of ["13", "7"]) {
          await configure({ tessedit_pageseg_mode: psm });
          readings.push(await recognize(detailedImage.blob, { rectangle }, { blocks: true }));
        }
        let reading = agreeLocalOcrReadings(readings, cell);
        if (!reading) {
          const inset = { left: rectangle.left + Math.floor(rectangle.width * 0.09), top: rectangle.top + Math.floor(rectangle.height * 0.09),
            width: Math.max(1, Math.floor(rectangle.width * 0.82)), height: Math.max(1, Math.floor(rectangle.height * 0.82)) };
          for (const psm of ["13", "7"]) {
            await configure({ tessedit_pageseg_mode: psm });
            readings.push(await recognize(detailedImage.blob, { rectangle: inset }, { blocks: true }));
          }
          reading = agreeLocalOcrReadings(readings, cell);
        }
        if (!reading && sourceFile) {
          for (const zoom of [1, 1.5]) {
            let preparedCell;
            try {
              originalImage ||= await decodeTranscriptImage(sourceFile);
              preparedCell = await prepareTranscriptCell(originalImage, cell.rectangle, image.width, { zoom });
            } catch { /* Giữ ô trống nếu trình duyệt không xử lý được vùng ảnh gốc. */ }
            if (!preparedCell) break;
            for (const psm of ["13", "7"]) {
              await configure({ tessedit_pageseg_mode: psm });
              readings.push(await recognize(preparedCell, {}, { blocks: true }));
            }
            reading = agreeLocalOcrReadings(readings, cell);
            if (reading) break;
          }
        }
        row.cells[field].value = reading?.value ?? null;
        row.cells[field].confidence = reading?.confidence ?? 0;
      }
    }
    return { payload: localTranscriptTablePayload(table), warnings: table.warnings };
  } finally {
    originalImage?.close?.();
    if (detailedImage) detailedImage.blob = null;
  }
}

async function withOcrTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ClientTranscriptOcrError(
        "Quét trên thiết bị mất quá nhiều thời gian. Bạn hãy thử với một ảnh hoặc nhập điểm thủ công.",
        "CLIENT_OCR_TIMEOUT"
      )), timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

export class ClientTranscriptOcrError extends Error {
  constructor(message = GENERIC_OCR_ERROR, code = "CLIENT_OCR_FAILED") {
    super(message);
    this.name = "ClientTranscriptOcrError";
    this.code = code;
  }
}

function urlFrom(baseUrl, path) {
  const pageBaseUrl = globalThis.document?.baseURI || globalThis.location?.href || "http://127.0.0.1/";
  return new URL(path, new URL(baseUrl, pageBaseUrl)).toString();
}

async function loadCatalog(catalogUrl, fetchImpl) {
  const response = await fetchImpl(catalogUrl, { cache: "force-cache" });
  if (!response.ok) throw new Error("subject catalog unavailable");
  const catalog = await response.json();
  if (!Array.isArray(catalog?.subjects) || !catalog.subjects.length) throw new Error("invalid subject catalog");
  return catalog;
}

async function loadTesseract(moduleUrl) {
  const imported = await import(moduleUrl);
  const module = imported.default || imported;
  if (typeof module?.createWorker !== "function") throw new Error("Tesseract unavailable");
  return module;
}

export function transcriptTextFromBlocks(blocks, fallbackText = "") {
  const words = (blocks || []).flatMap((block) => (block.paragraphs || []).flatMap((paragraph) =>
    (paragraph.lines || []).flatMap((line) => line.words || [])))
    .filter((word) => word.text?.trim() && [word.bbox?.x0, word.bbox?.y0, word.bbox?.y1].every(Number.isFinite));
  if (!words.length) return fallbackText;
  const heights = words.map((word) => word.bbox.y1 - word.bbox.y0).sort((a, b) => a - b);
  const tolerance = Math.max(6, heights[Math.floor(heights.length / 2)] * 1.2);
  const rows = [];
  for (const word of words.sort((a, b) => (a.bbox.y0 + a.bbox.y1) - (b.bbox.y0 + b.bbox.y1))) {
    const center = (word.bbox.y0 + word.bbox.y1) / 2;
    let row = rows.find((item) => Math.abs(item.center - center) <= tolerance);
    if (!row) { row = { center, words: [] }; rows.push(row); }
    row.words.push(word);
  }
  return rows.map((row) => row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map((word) => word.text).join(" ")).join("\n");
}

export async function recognizeTranscriptInBrowser(images, {
  assetBaseUrl,
  catalog,
  catalogUrl,
  fetchImpl = globalThis.fetch,
  tesseractModule,
  browserEnvironment = globalThis.window,
  onStatus = () => {},
  initializationTimeoutMs = 120_000,
  recognitionTimeoutMs = 120_000,
  sourceFiles = [],
  gradeHint = null,
  periodHint = null
} = {}) {
  if (!browserEnvironment) throw new ClientTranscriptOcrError(GENERIC_OCR_ERROR, "BROWSER_OCR_UNAVAILABLE");
  if (!Array.isArray(images) || images.length === 0) throw new ClientTranscriptOcrError("Hãy chọn ít nhất một ảnh học bạ.", "MISSING_IMAGES");
  if (!assetBaseUrl) throw new ClientTranscriptOcrError();

  let worker;
  let finished = false;
  try {
    onStatus("Đang chuẩn bị nhận diện trên thiết bị...");
    const tesseract = tesseractModule || await withOcrTimeout(loadTesseract(urlFrom(assetBaseUrl, "tesseract/tesseract.esm.min.js")), initializationTimeoutMs);
    const subjectCatalog = catalog || await withOcrTimeout(loadCatalog(catalogUrl || urlFrom(assetBaseUrl, "transcript-subjects.json"), fetchImpl), initializationTimeoutMs);
    let rejectWorkerFailure;
    const workerFailure = new Promise((_, reject) => { rejectWorkerFailure = reject; });
    const workerPromise = tesseract.createWorker(["vie", "eng"], 1, {
      workerPath: urlFrom(assetBaseUrl, "tesseract/worker.min.js?v=20261001-1"),
      corePath: urlFrom(assetBaseUrl, "tesseract-core/"),
      langPath: urlFrom(assetBaseUrl, "tesseract-lang/"),
      workerBlobURL: false,
      errorHandler: (error) => rejectWorkerFailure(error instanceof Error ? error : new Error(String(error)))
    });
    workerPromise.then((createdWorker) => {
      if (finished) createdWorker.terminate().catch(() => {});
    }, () => {});
    worker = await withOcrTimeout(Promise.race([workerPromise, workerFailure]), initializationTimeoutMs);
    await withOcrTimeout(Promise.race([worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "11" }), workerFailure]), initializationTimeoutMs);

    const scores = [];
    const warnings = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      onStatus(`Đang nhận diện ảnh ${index + 1}/${images.length}...`);
      let result;
      try {
        const deadline = Date.now() + recognitionTimeoutMs;
        if (sourceFiles[index]) {
          const maxDimension = Math.max(image.width, image.height) < 1600 ? 2400 : 1600;
          const prepared = await optimizeTranscriptImage(sourceFiles[index], { maxDimension, quality: 0.95, allowUpscale: true,
            threshold: image.width > image.height ? 210 : null });
          image.blob = prepared.blob; image.width = prepared.width; image.height = prepared.height;
        }
        const recognize = (blob, options, output) => withOcrTimeout(Promise.race([worker.recognize(blob, options, output), workerFailure]), Math.max(1, deadline - Date.now()));
        const configure = (parameters) => withOcrTimeout(Promise.race([worker.setParameters(parameters), workerFailure]), Math.max(1, deadline - Date.now()));
        await configure({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "11", tessedit_char_whitelist: "", user_defined_dpi: "0" });
        result = await recognize(image.blob, {}, { blocks: true });
        const page = {
          blocks: result?.data?.blocks,
          text: transcriptTextFromBlocks(result?.data?.blocks, String(result?.data?.text || "")),
          confidence: Number(result?.data?.confidence) || 0,
          originalname: image.originalName || image.uploadName || `hoc-ba-${index + 1}.jpg`,
          gradeHint, periodHint
        };
        // Geometry retains blank cells and maps average columns without importing exam components.
        const parsed = page.blocks?.length ? await readLocalTable(page, image, sourceFiles[index], subjectCatalog, configure, recognize, onStatus)
          : parseOcrTranscriptPages([page], subjectCatalog);
        scores.push(...parsed.payload.scores);
        warnings.push(...parsed.warnings);
      } finally {
        image.blob = null;
      }
    }

    if (!scores.length) throw new ClientTranscriptOcrError(
      [GENERIC_OCR_ERROR, ...new Set(warnings)].slice(0, 3).join(" "), "NO_TRANSCRIPT_DATA"
    );
    const validated = validateTranscriptPayload({ student: { name: null }, scores }, subjectCatalog);
    return {
      success: true,
      data: validated.data,
      warnings: [
        "Bạn hãy đối chiếu từng ô với ảnh gốc trước khi điền điểm.",
        "Quét trên thiết bị có thể bỏ sót môn hoặc cột điểm. Bạn hãy nhập tay các ô còn thiếu theo ảnh gốc, không đoán điểm.",
        ...new Set(warnings),
        ...validated.warnings
      ],
      engine: "browser"
    };
  } catch (error) {
    if (error instanceof ClientTranscriptOcrError) throw error;
    throw new ClientTranscriptOcrError();
  } finally {
    finished = true;
    for (const image of images) image.blob = null;
    if (worker) {
      try { await worker.terminate(); } catch { /* Worker đã được giải phóng. */ }
    }
  }
}
