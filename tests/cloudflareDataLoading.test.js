import assert from "node:assert/strict";
import test from "node:test";

const fixture = (request) => {
  const name = new URL(request.url).pathname.split("/").pop();
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
