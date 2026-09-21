import "dotenv/config";
import express from "express";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "./errors.js";
import { defaultDataStore } from "./dataStore.js";
import { createPublicApiRouter } from "./routes/publicApi.js";
import { createScanTranscriptRouter, isUploadError } from "./routes/scanTranscript.js";
import { createConfiguredScanProviders } from "./configuredScanProviders.js";
import { createTranscriptScanService } from "./services/transcriptScanService.js";
import { createReportStore } from "./reportStore.js";

const serverRequire = createRequire(import.meta.url);
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const TRANSCRIPT_SUBJECT_CATALOG = fileURLToPath(new URL("../data/transcript-subjects.json", import.meta.url));
const TESSERACT_DIST_DIR = join(dirname(serverRequire.resolve("tesseract.js/package.json")), "dist");
const TESSERACT_CORE_DIR = dirname(serverRequire.resolve("tesseract.js-core/package.json"));
const TESSERACT_VIE_DIR = join(dirname(serverRequire.resolve("@tesseract.js-data/vie/package.json")), "4.0.0_best_int");
const TESSERACT_ENG_DIR = join(dirname(serverRequire.resolve("@tesseract.js-data/eng/package.json")), "4.0.0_best_int");

function isAllowedDevelopmentOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function localDevelopmentCors(request, response, next) {
  const origin = request.headers.origin;
  if (origin && isAllowedDevelopmentOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Turnstile-Token");
    response.setHeader("Access-Control-Max-Age", "600");
    response.append("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
}

export { createConfiguredScanProviders } from "./configuredScanProviders.js";

export function createApp({ scanTranscript, dataStore = defaultDataStore, reportStore = createReportStore(), environment = process.env } = {}) {
  const app = express();
  const scanner = scanTranscript || createTranscriptScanService(createConfiguredScanProviders());
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", localDevelopmentCors);
  app.use("/api", createPublicApiRouter({ store: dataStore, reportStore, environment }));
  app.use("/api", createScanTranscriptRouter({ scanTranscript: scanner, environment }));
  const vendorStaticOptions = { dotfiles: "deny", index: false, etag: true, maxAge: "30d", immutable: true };
  app.use("/vendor/tesseract", localDevelopmentCors, express.static(TESSERACT_DIST_DIR, vendorStaticOptions));
  app.use("/vendor/tesseract-core", localDevelopmentCors, express.static(TESSERACT_CORE_DIR, vendorStaticOptions));
  app.use("/vendor/tesseract-lang", localDevelopmentCors, express.static(TESSERACT_VIE_DIR, vendorStaticOptions), express.static(TESSERACT_ENG_DIR, vendorStaticOptions));
  app.get("/vendor/transcript-subjects.json", localDevelopmentCors, (_request, response) => {
    response.setHeader("Cache-Control", "public, max-age=86400");
    response.sendFile(TRANSCRIPT_SUBJECT_CATALOG);
  });
  app.use(express.static(PUBLIC_DIR, {
    dotfiles: "deny",
    index: "index.html",
    etag: true,
    maxAge: "1h",
    setHeaders(response, path) {
      if (/\.(?:html?|css|m?js)$/i.test(path)) response.setHeader("Cache-Control", "no-cache");
      else if (/\.(?:png|jpe?g|webp|svg|ico|woff2?)$/i.test(path)) response.setHeader("Cache-Control", "public, max-age=604800");
    }
  }));
  app.use("/api", (_request, response) => response.status(404).json({ success: false, error: { code: "API_NOT_FOUND", message: "Không tìm thấy API." } }));
  app.use((_request, response) => response.status(404).send("Not found"));
  app.use((error, _request, response, _next) => {
    if (isUploadError(error)) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Mỗi ảnh tối đa 7 MB." : "Tệp tải lên không hợp lệ.";
      response.status(400).json({ success: false, error: { code: error.code || "INVALID_UPLOAD", message } });
      return;
    }
    const knownError = error instanceof AppError;
    response.status(knownError ? error.statusCode : 500).json({
      success: false,
      error: { code: knownError ? error.code : "INTERNAL_ERROR", message: knownError ? error.message : "Không thể xử lý yêu cầu. Hãy thử lại sau." }
    });
  });
  return app;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const port = Number(process.env.PORT || 3000);
  const reportStore = createReportStore();
  createApp({ reportStore }).listen(port, () => console.info(`Tính Điểm THPT đang chạy tại http://127.0.0.1:${port}`));
  let lastReportSyncError = "";
  const syncReports = async () => {
    const result = await reportStore.syncPending();
    if (result.synced) console.info(`Đã đồng bộ ${result.synced} báo cáo lên Supabase.`);
    if (result.errorCode && result.errorCode !== lastReportSyncError) console.warn(`Báo cáo đang chờ đồng bộ: ${result.errorCode}.`);
    lastReportSyncError = result.errorCode || "";
  };
  syncReports().catch(() => {});
  const syncInterval = Math.max(60_000, Math.min(60 * 60_000, Number(process.env.SUPABASE_SYNC_INTERVAL_MS) || 5 * 60_000));
  setInterval(() => syncReports().catch(() => {}), syncInterval).unref();
}
