import { getFormula } from "../formulas/index.js";

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .replace(/\s+/g, " ")
    .trim();
}

function page(items, requestedPage, requestedSize) {
  const pageSize = Math.max(1, Number(requestedSize) || 24);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.max(1, Math.min(pages, Number(requestedPage) || 1));
  return {
    items: items.slice((current - 1) * pageSize, current * pageSize),
    pagination: { page: current, pageSize, pages, total: items.length }
  };
}

function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException("Yêu cầu đã bị hủy.", "AbortError");
}

async function requestJson(path, { signal, method = "GET", body, headers = {} } = {}) {
  const browserLocation = globalThis.location;
  const isVsCodeLiveServer = browserLocation
    && ["127.0.0.1", "localhost"].includes(browserLocation.hostname)
    && /^55\d\d$/.test(browserLocation.port);
  const url = isVsCodeLiveServer ? `http://127.0.0.1:3000${path}` : path;
  let response;
  try {
    response = await fetch(url, {
      method,
      signal,
      headers: body ? { "Content-Type": "application/json", ...headers } : Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    if (isVsCodeLiveServer) throw new Error("Máy chủ dữ liệu chưa chạy. Hãy chạy npm.cmd run dev rồi gửi lại.");
    throw error;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "Không thể tải dữ liệu tuyển sinh.");
  return payload.data;
}

export class UniversityRepository {
  constructor() {
    this.universities = [];
    this.universityById = new Map();
    this.majors = [];
    this.combinations = [];
    this.subjects = [];
    this.majorCache = new Map();
    this.majorById = new Map();
    this.majorIndex = [];
    this.searchEntries = [];
    this.universityDetails = new Map();
    this.admissionFormulaCache = new Map();
  }

  async load() {
    const data = await requestJson("/api/bootstrap");
    this.universities = data.universities;
    this.universityById = new Map(this.universities.map((item) => [item.id, item]));
    this.metadata = data.metadata || {};
    this.majors = [];
    this.combinations = data.combinations;
    this.subjects = data.subjects;
    this.universityDetails = new Map(this.universities.map((item) => [item.id, item]));
    this.majorCache = new Map();
    this.majorIndex = [];
    this.searchEntries = [];
    this.universityDetails = new Map();
    this.admissionFormulaCache = new Map();
    return this;
  }

  getUniversity(id) { return this.universityById.get(id); }
  async getUniversityDetails(id) {
    if (!this.universityDetails.has(id)) this.universityDetails.set(id, requestJson(`/api/universities/${encodeURIComponent(id)}`));
    return this.universityDetails.get(id);
  }
  async getMajors(universityId, { force = false } = {}) {
    if (!force && this.majorCache.has(universityId)) return this.majorCache.get(universityId);
    const promise = requestJson(`/api/universities/${encodeURIComponent(universityId)}/major-options`).then((items) => {
      items.forEach((major) => this.rememberMajor(major));
      this.majorCache.set(universityId, items);
      return items;
    }).catch((error) => { this.majorCache.delete(universityId); throw error; });
    this.majorCache.set(universityId, promise);
    return promise;
  }
  getCachedMajors(universityId) {
    const value = this.majorCache.get(universityId);
    return Array.isArray(value) ? value : [];
  }
  async getAdmissionFormulas(universityId, { force = false } = {}) {
    if (!force && this.admissionFormulaCache.has(universityId)) return this.admissionFormulaCache.get(universityId);
    const promise = requestJson(`/api/universities/${encodeURIComponent(universityId)}/admission-formulas`)
      .then((data) => {
        this.admissionFormulaCache.set(universityId, data);
        return data;
      })
      .catch((error) => {
        this.admissionFormulaCache.delete(universityId);
        throw error;
      });
    this.admissionFormulaCache.set(universityId, promise);
    return promise;
  }
  async getMajorsPage(universityId, query = {}, { signal } = {}) {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => [key, String(value)]));
    const result = await requestJson(`/api/universities/${encodeURIComponent(universityId)}/majors?${params}`, { signal });
    result.items = result.items.map((major) => this.rememberMajor(major));
    return result;
  }
  rememberMajor(major) {
    const current = this.majorById.get(major.id);
    const transient = current ? {
      comparison: current.comparison,
      combinationMatch: current.combinationMatch,
      alternativeCombinations: current.alternativeCombinations,
      university: current.university
    } : {};
    const merged = { ...major, ...Object.fromEntries(Object.entries(transient).filter(([, value]) => value !== undefined)) };
    this.majorById.set(major.id, merged);
    return merged;
  }
  getMajor(id) { return this.majorById.get(id); }
  getFormula(id) { return getFormula(id); }
  getCombination(id) { return this.combinations.find((item) => item.id === id); }
  getCombinationByCode(code) {
    const wanted = String(code || "").toLocaleUpperCase("vi");
    return this.combinations.find((item) => item.code.toLocaleUpperCase("vi") === wanted);
  }
  getSubjectLabel(id) { return this.subjects.find((item) => item.id === id)?.name || id; }
  async search(query, { signal, limit = 25 } = {}) {
    if (!normalizeSearch(query)) return [];
    return requestJson(`/api/search?q=${encodeURIComponent(query)}&limit=${Math.max(1, Math.min(30, Number(limit) || 25))}`, { signal });
  }
  async listMajors(query = {}, { signal } = {}) {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => [key, String(value)]));
    const result = await requestJson(`/api/majors?${params}`, { signal });
    for (const major of result.items) this.rememberMajor(major);
    return result;
  }
  async findBestMajorCombinations(input, { signal } = {}) {
    const result = await requestJson("/api/majors/best-combinations", { signal, method: "POST", body: input });
    for (const major of result.items) this.rememberMajor(major);
    return result;
  }
  submitDataReport(report, { signal, turnstileToken = "" } = {}) {
    const headers = turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {};
    return requestJson("/api/data-reports", { signal, method: "POST", body: report, headers });
  }
}
