import { Router } from "express";
import { gzipSync } from "node:zlib";
import rateLimit from "express-rate-limit";

function ok(response, data) { response.json({ success: true, data }); }
function badRequest(response, code, message) { response.status(400).json({ success: false, error: { code, message } }); }
function notFound(response, code, message) { response.status(404).json({ success: false, error: { code, message } }); }

export function createPublicApiRouter({ store, reportStore }) {
  const router = Router();
  const bootstrapJson = JSON.stringify({ success: true, data: store.publicInitialData });
  const bootstrapGzip = gzipSync(bootstrapJson, { level: 6 });
  const reportLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

  router.get("/bootstrap", (request, response) => {
    response.type("application/json");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Vary", "Accept-Encoding");
    if (/\bgzip\b/i.test(request.headers["accept-encoding"] || "")) {
      response.setHeader("Content-Encoding", "gzip");
      response.setHeader("Content-Length", bootstrapGzip.length);
      response.send(bootstrapGzip);
      return;
    }
    response.setHeader("Content-Length", Buffer.byteLength(bootstrapJson));
    response.send(bootstrapJson);
  });

  router.get("/universities", (request, response) => ok(response, store.listUniversities(request.query)));
  router.get("/universities/:id/majors", (request, response) => {
    const result = store.listUniversityMajors(request.params.id, request.query);
    if (!result) return notFound(response, "UNIVERSITY_NOT_FOUND", "Không tìm thấy trường.");
    ok(response, result);
  });
  router.get("/universities/:id/major-options", (request, response) => {
    const result = store.listUniversityMajorOptions(request.params.id);
    if (!result) return notFound(response, "UNIVERSITY_NOT_FOUND", "Không tìm thấy trường.");
    ok(response, result);
  });
  router.get("/universities/:id/admission-formulas", (request, response) => {
    const result = store.listAdmissionFormulas(request.params.id);
    if (!result) return notFound(response, "UNIVERSITY_NOT_FOUND", "Không tìm thấy trường.");
    ok(response, result);
  });
  router.get("/universities/:id", (request, response) => {
    const university = store.getUniversity(request.params.id);
    if (!university) return notFound(response, "UNIVERSITY_NOT_FOUND", "Không tìm thấy trường.");
    ok(response, university);
  });
  router.get("/majors", (request, response) => ok(response, store.listMajors(request.query)));
  router.post("/majors/best-combinations", (request, response) => {
    const input = request.body || {};
    if (!Array.isArray(input.results) || !input.results.length) return badRequest(response, "INVALID_COMBINATION_RESULTS", "Thiếu kết quả tổ hợp để đối chiếu.");
    ok(response, store.findBestMajorCombinations(input));
  });
  router.get("/search", (request, response) => {
    if (!String(request.query.q || "").trim()) return ok(response, []);
    ok(response, store.search(request.query.q, request.query.limit));
  });
  router.get("/catalog/combinations", (_request, response) => ok(response, store.publicCombinations));
  router.get("/catalog/subjects", (_request, response) => ok(response, store.publicSubjects));
  router.post("/data-reports", reportLimiter, async (request, response, next) => {
    try {
      if (!reportStore) return response.status(503).json({ success: false, error: { code: "REPORT_INTAKE_UNAVAILABLE", message: "Nơi tiếp nhận báo cáo chưa sẵn sàng." } });
      const result = await reportStore.submit(request.body);
      response.status(202).json({ success: true, data: result });
    } catch (error) {
      if (/định dạng|mô tả|liên kết/i.test(error.message || "")) return badRequest(response, "INVALID_DATA_REPORT", error.message);
      next(error);
    }
  });

  return router;
}
