import { createDataStore } from "../server/dataStoreCore.js";
import { createCloudflareReportStore } from "../server/cloudflareReportStore.js";
import { errorResponse, failure, optionsResponse, success } from "./http.js";

const DATA_FILES = ["universities", "majors", "combinations", "subjects", "admission-formulas-2026"];
let dataStorePromise;

async function loadAssetJson(assets, name) {
  const response = await assets.fetch(new Request(`https://assets.invalid/_worker-data/${name}.json`));
  if (!response.ok) throw new Error(`Không tải được dữ liệu ${name} (${response.status}).`);
  return response.json();
}

export function loadCloudflareDataStore(environment) {
  if (!dataStorePromise) {
    dataStorePromise = Promise.all(DATA_FILES.map((name) => loadAssetJson(environment.ASSETS, name)))
      .then(([universities, majors, combinations, subjects, admissionFormulas]) =>
        createDataStore({ universities, majors, combinations, subjects, admissionFormulas }))
      .catch((error) => {
        dataStorePromise = undefined;
        throw error;
      });
  }
  return dataStorePromise;
}

function query(url) {
  return Object.fromEntries(url.searchParams.entries());
}

async function jsonBody(request, maximumBytes = 100 * 1024) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maximumBytes) throw new Response(null, { status: 413 });
  const source = await request.text();
  if (new TextEncoder().encode(source).byteLength > maximumBytes) throw new Response(null, { status: 413 });
  try {
    return JSON.parse(source || "{}");
  } catch {
    throw new Response(null, { status: 400 });
  }
}

function universityRoute(pathname) {
  const match = pathname.match(/^\/api\/universities\/([^/]+)(?:\/(majors|major-options|admission-formulas))?$/);
  if (!match) return null;
  try {
    return { id: decodeURIComponent(match[1]), child: match[2] || "" };
  } catch {
    return { id: "", child: "" };
  }
}

export async function handleDataApi(request, environment) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  const url = new URL(request.url);
  try {
    if (request.method === "POST" && url.pathname === "/api/data-reports") {
      const reportStore = createCloudflareReportStore(environment);
      if (!reportStore) return failure(request, "REPORT_INTAKE_UNAVAILABLE", "Nơi tiếp nhận báo cáo chưa sẵn sàng.", 503);
      const result = await reportStore.submit(await jsonBody(request));
      return success(request, result, { status: 202 });
    }

    const store = await loadCloudflareDataStore(environment);
    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      return success(request, store.publicInitialData, { headers: { "Cache-Control": "no-cache" } });
    }
    if (request.method === "GET" && url.pathname === "/api/universities") return success(request, store.listUniversities(query(url)));
    const schoolRoute = universityRoute(url.pathname);
    if (request.method === "GET" && schoolRoute) {
      let result;
      if (schoolRoute.child === "majors") result = store.listUniversityMajors(schoolRoute.id, query(url));
      else if (schoolRoute.child === "major-options") result = store.listUniversityMajorOptions(schoolRoute.id);
      else if (schoolRoute.child === "admission-formulas") result = store.listAdmissionFormulas(schoolRoute.id);
      else result = store.getUniversity(schoolRoute.id);
      return result
        ? success(request, result)
        : failure(request, "UNIVERSITY_NOT_FOUND", "Không tìm thấy trường.", 404);
    }
    if (request.method === "GET" && url.pathname === "/api/majors") return success(request, store.listMajors(query(url)));
    if (request.method === "POST" && url.pathname === "/api/majors/best-combinations") {
      const input = await jsonBody(request);
      if (!Array.isArray(input.results) || !input.results.length) {
        return failure(request, "INVALID_COMBINATION_RESULTS", "Thiếu kết quả tổ hợp để đối chiếu.", 400);
      }
      return success(request, store.findBestMajorCombinations(input));
    }
    if (request.method === "GET" && url.pathname === "/api/search") {
      return success(request, String(url.searchParams.get("q") || "").trim()
        ? store.search(url.searchParams.get("q"), url.searchParams.get("limit"))
        : []);
    }
    if (request.method === "GET" && url.pathname === "/api/catalog/combinations") return success(request, store.publicCombinations);
    if (request.method === "GET" && url.pathname === "/api/catalog/subjects") return success(request, store.publicSubjects);
    return failure(request, "API_NOT_FOUND", "Không tìm thấy API.", 404);
  } catch (error) {
    if (error instanceof Response) {
      if (error.status === 413) return failure(request, "REQUEST_TOO_LARGE", "Dữ liệu gửi lên quá lớn.", 413);
      if (error.status === 400) return failure(request, "INVALID_JSON", "Dữ liệu JSON không hợp lệ.", 400);
    }
    return errorResponse(request, error);
  }
}
