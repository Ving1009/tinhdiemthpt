import { parseOcrTranscriptPages } from "./core/ocrTranscriptParser.js?v=20261001-2";
import { validateTranscriptPayload } from "./core/transcriptValidator.js";
import { mergeTranscriptResults } from "./core/transcriptHybrid.js?v=20261013-1";
import { analyzeLocalTranscriptTable, localTranscriptTablePayload, localTranscriptTableEvidence } from "./core/localTranscriptTable.js?v=20261013-4";
import { decodeTranscriptImage, optimizeTranscriptImage, prepareTranscriptCell, cropTranscriptRectangle } from "./transcriptImageOptimizer.js?v=20261013-3";

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

async function readLocalTable(page, image, sourceFile, catalog, configure, recognize, onStatus, prepare) {
  let table = analyzeLocalTranscriptTable(page, catalog);
  const header = boundedRectangle(table.headerRegion, image.width, image.height);
  let detailedImage;
  let detailedBitmap;
  let originalImage;
  try {
    const needsDetail = table.columns.some(column => !column.field) || table.labelRegions?.length
      || table.rows.some(row => Object.values(row.cells).some(cell => cell.value === null || cell.confidence < 85));
    if (table.grade && table.rows.length && needsDetail && sourceFile && Number.isFinite(image.width)) {
      detailedImage = await prepare(() => optimizeTranscriptImage(sourceFile, { maxDimension: 2400, quality: 0.95, allowUpscale: true,
        threshold: image.width > image.height ? 210 : null }));
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
    if (!table.grade) return { payload: { student: { name: null }, scores: [] }, warnings: table.warnings, evidence: localTranscriptTableEvidence(table) };
    for (const region of detailedImage ? table.labelRegions || [] : []) {
      const rectangle = boundedRectangle(region, detailedImage.width, detailedImage.height, scale);
      if (!rectangle) continue;
      for (const mode of ["7", "13", "native"]) {
        let nativeCell;
        if (mode === "native") {
          try {
            originalImage ||= await prepare(() => decodeTranscriptImage(sourceFile));
            nativeCell = await prepare(() => prepareTranscriptCell(originalImage, region, image.width, { zoom: 1.5, binarize: false }));
          } catch (error) { if (error instanceof ClientTranscriptOcrError) throw error; }
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
      onStatus("Đang đọc lại những ô điểm chưa rõ...");
      await configure({ tessedit_pageseg_mode: "13", tessedit_char_whitelist: "0123456789.,", user_defined_dpi: "300", preserve_interword_spaces: "1" });
      try { detailedBitmap = await prepare(() => decodeTranscriptImage(detailedImage.blob)); }
      catch (error) { if (error instanceof ClientTranscriptOcrError) throw error; }
      const readRectangle = async (rectangle, readings) => {
        const cropped = detailedBitmap ? await prepare(() => cropTranscriptRectangle(detailedBitmap, rectangle)) : null;
        for (const psm of ["13", "7"]) {
          await configure({ tessedit_pageseg_mode: psm });
          readings.push(await recognize(cropped?.blob || detailedImage.blob, { rectangle: cropped?.rectangle || rectangle }, { blocks: true }));
        }
      };
      for (const { row, field, cell } of retryCells) {
        const rectangle = boundedRectangle(cell.rectangle, detailedImage.width, detailedImage.height, scale);
        if (!rectangle) continue;
        const readings = [];
        const initial = { value: cell.value, confidence: cell.confidence };
        await readRectangle(rectangle, readings);
        let reading = agreeLocalOcrReadings(readings, cell);
        if (!reading) {
          const inset = { left: rectangle.left + Math.floor(rectangle.width * 0.09), top: rectangle.top + Math.floor(rectangle.height * 0.09),
            width: Math.max(1, Math.floor(rectangle.width * 0.82)), height: Math.max(1, Math.floor(rectangle.height * 0.82)) };
          await readRectangle(inset, readings);
          reading = agreeLocalOcrReadings(readings, cell);
        }
        if (!reading && sourceFile) {
          for (const zoom of [1, 1.5]) {
            let preparedCell;
            try {
              originalImage ||= await prepare(() => decodeTranscriptImage(sourceFile));
              preparedCell = await prepare(() => prepareTranscriptCell(originalImage, cell.rectangle, image.width, { zoom }));
            } catch (error) { if (error instanceof ClientTranscriptOcrError) throw error; }
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
        row.cells[field].observedScore ||= Boolean(reading);
        row.cells[field].conflict = new Set([initial, ...readings.map(localOcrReading).filter(Boolean)]
          .filter(value => value.value !== null && value.confidence >= 70).map(value => value.value)).size > 1;
      }
    }
    return { payload: localTranscriptTablePayload(table), warnings: table.warnings, evidence: localTranscriptTableEvidence(table) };
  } finally {
    originalImage?.close?.();
    detailedBitmap?.close?.();
    if (detailedImage) detailedImage.blob = null;
  }
}

function checkCancellation(signal) {
  if (signal?.aborted) throw new ClientTranscriptOcrError("Đã dừng quét ảnh. Các điểm bạn đã nhập vẫn được giữ.", "CLIENT_OCR_ABORTED");
}

async function withOcrTimeout(promise, timeoutMs, signal) {
  let timer;
  let abort;
  try {
    checkCancellation(signal);
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ClientTranscriptOcrError(
        "Quét ảnh mất quá nhiều thời gian. Bạn có thể thử từng ảnh hoặc nhập điểm bằng tay.",
        "CLIENT_OCR_TIMEOUT"
      )), timeoutMs);
      abort = () => reject(new ClientTranscriptOcrError("Đã dừng quét ảnh. Các điểm bạn đã nhập vẫn được giữ.", "CLIENT_OCR_ABORTED"));
      signal?.addEventListener("abort", abort, { once: true });
    })]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
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

async function loadCatalog(catalogUrl, fetchImpl, signal) {
  const response = await fetchImpl(catalogUrl, { cache: "force-cache", signal });
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

function createTrackedTesseractWorker(tesseract, options, onSpawn) {
  const OriginalWorker = globalThis.Worker;
  let temporaryWorker;
  try {
    if (typeof OriginalWorker === "function") {
      temporaryWorker = new Proxy(OriginalWorker, { construct(target, argumentsList, newTarget) {
        const nativeWorker = Reflect.construct(target, argumentsList, newTarget);
        try {
          const pageUrl = globalThis.document?.baseURI || globalThis.location?.href || "http://127.0.0.1/";
          if (new URL(String(argumentsList[0]), pageUrl).href === options.workerPath) onSpawn(nativeWorker);
        } catch { /* Chỉ theo dõi worker nhận diện có đúng đường dẫn đã cấu hình. */ }
        return nativeWorker;
      } });
      try { globalThis.Worker = temporaryWorker; } catch { temporaryWorker = null; }
    }
    // Tesseract 7 starts its native worker synchronously, before returning the initialization promise.
    return tesseract.createWorker(["vie", "eng"], 1, options);
  } finally {
    if (temporaryWorker && globalThis.Worker === temporaryWorker) globalThis.Worker = OriginalWorker;
  }
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
  periodHint = null,
  signal,
  onTiming = () => {}
} = {}) {
  if (!browserEnvironment) throw new ClientTranscriptOcrError(GENERIC_OCR_ERROR, "BROWSER_OCR_UNAVAILABLE");
  if (!Array.isArray(images) || images.length === 0) throw new ClientTranscriptOcrError("Hãy chọn ít nhất một ảnh học bạ.", "MISSING_IMAGES");
  if (!assetBaseUrl) throw new ClientTranscriptOcrError();

  let worker;
  let initializingNativeWorker;
  let nativeInitializationTerminated = false;
  let finished = false;
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const started = now();
  const timings = { moduleMs: 0, catalogMs: 0, workerInitMs: 0, preprocessMs: 0, pageOcrMs: 0, retryMs: 0, tableParseMs: 0,
    coreLoadMs: 0, languageLoadMs: 0, apiInitMs: 0, retryReads: 0, workerCount: 0, totalMs: 0, pages: [] };
  const measure = async (stage, operation, target = timings) => {
    const start = now();
    try { return await operation(); } finally { target[stage] = (target[stage] || 0) + now() - start; }
  };
  const pageEvidence = [];
  const evidence = () => {
    const reliable = pageEvidence.length === images.length && pageEvidence.every(page => page.expectedCellsReliable);
    const keys = [...new Set(pageEvidence.flatMap(page => page.expectedCellKeys || []))];
    return {
      expectedCells: reliable ? keys.length + pageEvidence.reduce((count, page) => count + Math.max(0, (page.expectedCells || 0) - (page.expectedCellKeys?.length || 0)), 0) : null,
      expectedCellKeys: keys, expectedCellsReliable: reliable,
      geometryReliable: pageEvidence.length > 0 && pageEvidence.every(page => page.geometryReliable),
      visibleScoreCells: pageEvidence.reduce((count, page) => count + (page.visibleScoreCells || 0), 0),
      unresolvedSubjects: pageEvidence.reduce((count, page) => count + (page.unresolvedSubjects || 0), 0),
      unresolvedColumns: pageEvidence.reduce((count, page) => count + (page.unresolvedColumns || 0), 0),
      conflicts: pageEvidence.reduce((count, page) => count + (page.conflicts || 0), 0),
      invalidScores: pageEvidence.reduce((count, page) => count + (page.invalidScores || 0), 0), pages: pageEvidence
    };
  };
  try {
    checkCancellation(signal);
    onStatus("Đang chuẩn bị quét ảnh trên thiết bị...");
    const [tesseract, subjectCatalog] = await Promise.all([
      measure("moduleMs", () => tesseractModule || withOcrTimeout(loadTesseract(urlFrom(assetBaseUrl, "tesseract/tesseract.esm.min.js")), initializationTimeoutMs, signal)),
      measure("catalogMs", () => catalog || withOcrTimeout(loadCatalog(catalogUrl || urlFrom(assetBaseUrl, "transcript-subjects.json"), fetchImpl, signal), initializationTimeoutMs, signal))
    ]);
    checkCancellation(signal);
    let rejectWorkerFailure;
    const workerFailure = new Promise((_, reject) => { rejectWorkerFailure = reject; });
    const workerPromise = Promise.resolve(createTrackedTesseractWorker(tesseract, {
      workerPath: urlFrom(assetBaseUrl, "tesseract/worker.min.js?v=20261001-1"),
      corePath: urlFrom(assetBaseUrl, "tesseract-core/"),
      langPath: urlFrom(assetBaseUrl, "tesseract-lang/"),
      workerBlobURL: false,
      cacheMethod: "write",
      logging: false,
      logger: (() => {
        const stages = new Map([["loading tesseract core", "coreLoadMs"], ["loading language traineddata", "languageLoadMs"], ["initializing api", "apiInitMs"]]);
        const starts = new Map();
        return ({ status, progress }) => {
          const stage = stages.get(status);
          if (!stage || finished) return;
          if (progress === 0 && !starts.has(stage)) starts.set(stage, now());
          if (progress === 1 && starts.has(stage)) timings[stage] = now() - starts.get(stage);
        };
      })(),
      errorHandler: (error) => rejectWorkerFailure(error instanceof Error ? error : new Error(String(error)))
    }, nativeWorker => { initializingNativeWorker ||= nativeWorker; }));
    workerPromise.then((createdWorker) => {
      if (finished && !nativeInitializationTerminated) createdWorker.terminate().catch(() => {});
    }, () => {});
    worker = await measure("workerInitMs", () => withOcrTimeout(Promise.race([workerPromise, workerFailure]), initializationTimeoutMs, signal));
    initializingNativeWorker = null;
    timings.workerCount = 1;
    checkCancellation(signal);
    await withOcrTimeout(Promise.race([worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "11" }), workerFailure]), initializationTimeoutMs, signal);

    const scores = [];
    const warnings = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      checkCancellation(signal);
      onStatus(`Đang đọc ảnh ${index + 1}/${images.length}...`);
      const pageTiming = { imageIndex: index, preprocessMs: 0, pageOcrMs: 0, retryMs: 0, tableParseMs: 0, retryReads: 0 };
      timings.pages.push(pageTiming);
      let result;
      try {
        const deadline = Date.now() + recognitionTimeoutMs;
        const run = (operation) => {
          checkCancellation(signal);
          let discarded = false;
          const pending = Promise.resolve().then(() => {
            checkCancellation(signal);
            if (Date.now() >= deadline) throw new ClientTranscriptOcrError("Quét ảnh mất quá nhiều thời gian. Bạn có thể thử từng ảnh hoặc nhập điểm bằng tay.", "CLIENT_OCR_TIMEOUT");
            return operation();
          });
          pending.then(value => {
            if (discarded) {
              try { value?.close?.(); } catch { /* Không giữ bitmap hoàn thành sau khi dừng. */ }
              if (value?.blob) value.blob = null;
            }
          }, () => {});
          return withOcrTimeout(pending, Math.max(1, deadline - Date.now()), signal).catch(error => { discarded = true; throw error; });
        };
        const prepare = operation => measure("preprocessMs", () => run(operation), pageTiming);
        if (sourceFiles[index]) {
          const prepared = await prepare(async () => {
            const decoded = await decodeTranscriptImage(sourceFiles[index]);
            let handedOff = false;
            try {
              checkCancellation(signal);
              const maxDimension = Math.max(decoded.width, decoded.height) < 1600 ? 2400 : 1600;
              handedOff = true;
              return await optimizeTranscriptImage(sourceFiles[index], { decoder: async () => decoded, maxDimension, quality: 0.95, allowUpscale: true,
                threshold: decoded.width > decoded.height ? 210 : null });
            } finally { if (!handedOff) decoded.close?.(); }
          });
          image.blob = prepared.blob; image.width = prepared.width; image.height = prepared.height;
        }
        const recognize = (blob, options, output) => {
          pageTiming.retryReads++;
          return measure("retryMs", () => run(() => Promise.race([worker.recognize(blob, options, output), workerFailure])), pageTiming);
        };
        const configure = parameters => run(() => Promise.race([worker.setParameters(parameters), workerFailure]));
        await configure({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "11", tessedit_char_whitelist: "", user_defined_dpi: "0" });
        result = await measure("pageOcrMs", () => run(() => Promise.race([worker.recognize(image.blob, {}, { blocks: true }), workerFailure])), pageTiming);
        const page = {
          blocks: result?.data?.blocks,
          text: transcriptTextFromBlocks(result?.data?.blocks, String(result?.data?.text || "")),
          confidence: Number(result?.data?.confidence) || 0,
          originalname: image.originalName || image.uploadName || `hoc-ba-${index + 1}.jpg`,
          gradeHint, periodHint
        };
        // Geometry retains blank cells and maps average columns without importing exam components.
        const parsingStarted = now();
        const retriesBefore = pageTiming.retryMs, preprocessingBefore = pageTiming.preprocessMs;
        const parsed = page.blocks?.length ? await readLocalTable(page, image, sourceFiles[index], subjectCatalog, configure, recognize, onStatus, prepare)
          : parseOcrTranscriptPages([page], subjectCatalog);
        pageTiming.tableParseMs += Math.max(0, now() - parsingStarted - (pageTiming.retryMs - retriesBefore) - (pageTiming.preprocessMs - preprocessingBefore));
        pageEvidence.push(parsed.evidence || { expectedCells: null, expectedCellsReliable: false, geometryReliable: false });
        scores.push(...parsed.payload.scores);
        warnings.push(...parsed.warnings);
      } finally {
        image.blob = null;
        for (const stage of ["preprocessMs", "pageOcrMs", "retryMs", "tableParseMs", "retryReads"]) timings[stage] += pageTiming[stage];
      }
    }

    if (!scores.length) {
      const error = new ClientTranscriptOcrError([GENERIC_OCR_ERROR, ...new Set(warnings)].slice(0, 3).join(" "), "NO_TRANSCRIPT_DATA");
      error.evidence = evidence();
      throw error;
    }
    const merged = mergeTranscriptResults({ data: { student: { name: null }, scores } }, null, subjectCatalog);
    const confidences = new Map();
    for (const row of scores) {
      const key = `${row.subject}|${row.grade}`;
      confidences.set(key, Math.min(confidences.get(key) ?? 1, Number(row.confidence) || 0));
    }
    for (const row of merged.data.scores) row.confidence = confidences.get(`${row.subject}|${row.grade}`) ?? 0;
    const validated = validateTranscriptPayload(merged.data, subjectCatalog);
    const qualityEvidence = evidence();
    qualityEvidence.conflicts += merged.conflicts.length;
    return {
      success: true,
      data: validated.data,
      warnings: [
        "Kiểm tra lại từng ô với ảnh gốc trước khi xác nhận.",
        "Nếu còn thiếu môn hoặc cột điểm, bạn có thể bổ sung bằng tay theo ảnh gốc.",
        ...new Set(warnings),
        ...merged.warnings,
        ...validated.warnings
      ],
      engine: "browser",
      evidence: qualityEvidence,
      provenance: merged.provenance,
      conflicts: merged.conflicts,
      timings
    };
  } catch (error) {
    if (error instanceof ClientTranscriptOcrError) throw error;
    checkCancellation(signal);
    throw new ClientTranscriptOcrError();
  } finally {
    finished = true;
    for (const image of images) image.blob = null;
    if (!worker && initializingNativeWorker) {
      try { initializingNativeWorker.terminate(); nativeInitializationTerminated = true; } catch { /* Giữ phương án giải phóng handle đến muộn. */ }
      initializingNativeWorker = null;
    }
    if (worker) {
      try { await withOcrTimeout(worker.terminate(), 5000); } catch { /* Worker đã được giải phóng. */ }
    }
    timings.totalMs = now() - started;
    onTiming(timings);
  }
}
