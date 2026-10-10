import assert from "node:assert/strict";
import test from "node:test";
import { createMajorSearchIndex } from "../server/dataStoreCore.js";

const fixture = (request) => {
  const name = new URL(request.url).pathname.split("/").pop();
  if (name === "major-search-index.json") return Response.json({ schemaVersion: 1, rows: [] });
  return Response.json(name.includes("formulas") || name.includes("catalog")
    ? { schemaVersion: 1, year: 2026, schools: [] } : []);
};

test("Worker không để một lượt tải chưa hoàn tất chặn các yêu cầu dữ liệu tiếp theo", async () => {
  const { loadCloudflareDataStore } = await import("../worker/dataApi.js?concurrent-load");
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = loadCloudflareDataStore({ ASSETS: { async fetch(request) { await gate; return fixture(request); } } });
  let secondCalls = 0;
  const environment = { ASSETS: { async fetch(request) { secondCalls++; return fixture(request); } } };
  let timeout;
  try {
    const second = await Promise.race([
      loadCloudflareDataStore(environment),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Yêu cầu mới bị kẹt theo lượt tải cũ.")), 500); })
    ]);
    assert.equal(second.majors.length, 0);
    assert.equal(secondCalls, 6);
    assert.strictEqual(await loadCloudflareDataStore(environment), second);
    assert.equal(secondCalls, 6, "Dữ liệu đã tải xong phải được tái sử dụng.");
  } finally {
    clearTimeout(timeout);
    release();
    await first;
  }
});

test("Worker tải lại được sau khi một yêu cầu tải dữ liệu bị lỗi", async () => {
  const { loadCloudflareDataStore } = await import("../worker/dataApi.js?failed-load");
  await assert.rejects(loadCloudflareDataStore({ ASSETS: { fetch() { throw new Error("Asset unavailable"); } } }), /Asset unavailable/);
  const store = await loadCloudflareDataStore({ ASSETS: { async fetch(request) { return fixture(request); } } });
  assert.equal(store.universities.length, 0);
});

test("tìm ngành không nạp catalog lớn; công thức nạp khi cần, thử lại sau lỗi và được tái sử dụng", async (t) => {
  const { handleDataApi } = await import("../worker/dataApi.js?lazy-formula-catalog");
  t.mock.method(console, "error", () => {});
  const requested = [];
  let catalogAttempts = 0;
  const datasets = {
    universities: [{ id: "u1", code: "U", name: "Trường thử", year: 2026 }],
    majors: [{ id: "m1", universityId: "u1", name: "Ngành thử", method: "THPT", cutoff: { year: 2026, score: 20, scale: 30, status: "reference", sourceUrl: "https://example.edu.vn/2026" } }],
    "admission-formulas-2026": { schemaVersion: 1, year: 2026, schools: [] },
    "school-formula-catalog-2026": { schemaVersion: 1, year: 2026, checkedAt: "2026-10-01", schools: [
      { universityId: "u1", schoolCode: "U", status: "requires_review", programs: [], methods: [], issues: [] }
    ] }
  };
  const environment = { ASSETS: { async fetch(request) {
    const name = new URL(request.url).pathname.split("/").pop().replace(".json", "");
    requested.push(name);
    if (name === "major-search-index") return Response.json(createMajorSearchIndex(datasets.majors, []));
    if (name === "school-formula-catalog-2026" && ++catalogAttempts === 1) throw new Error("Catalog temporarily unavailable");
    return Response.json(datasets[name] || []);
  } } };
  const request = (path) => handleDataApi(new Request(`https://example.com/api/${path}`), environment);
  const search = await request("majors?q=ngành");
  assert.equal(search.status, 200);
  assert.equal((await search.json()).data.items.length, 1);
  assert.equal(requested.includes("school-formula-catalog-2026"), false);
  assert.equal((await request("universities/u1/admission-formulas")).status, 500);
  const restored = await request("universities/u1/admission-formulas");
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).data.catalog.checkedAt, "2026-10-01");
  assert.equal((await request("universities/u1/admission-formulas")).status, 200);
  assert.equal(catalogAttempts, 2);
});
