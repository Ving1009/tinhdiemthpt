import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { createApp } from "../server/server.js";

let server;
let baseUrl;
const receivedReports = [];
const assistantQuestions = [];
const TURNSTILE_ENV = { TURNSTILE_SITE_KEY: "site-key", TURNSTILE_SECRET_KEY: "secret-key" };

before(async () => {
  const app = createApp({
    environment: TURNSTILE_ENV,
    turnstileFetch: async () => new Response(JSON.stringify({ success: true, action: "data_report", hostname: "127.0.0.1" })),
    scanTranscript: async () => ({ data: {}, warnings: [] }),
    admissionsAssistant: async (input) => { assistantQuestions.push(input); return { answer: "Câu trả lời Groq thử nghiệm.", model: "test-model" }; },
    reportStore: { async submit(value) { receivedReports.push(value); return { id: "report-test", status: "pending_review", receivedAt: "2026-09-14T00:00:00.000Z" }; } }
  });
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); });

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return { response, text: await response.text() };
}

function forbiddenKeys(value, path = "$") {
  if (Array.isArray(value)) return value.flatMap((item, index) => forbiddenKeys(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(/(?:source|reference)/i.test(key) ? [`${path}.${key}`] : []),
    ...forbiddenKeys(child, `${path}.${key}`)
  ]);
}

test("chỉ public directory được phục vụ", async () => {
  for (const path of ["/", "/css/style.css", "/js/main.js"]) {
    const { response } = await get(path);
    assert.equal(response.status, 200, `${path} phải public`);
  }
  for (const path of ["/package.json", "/server/server.js", "/.env", "/tests/admissions.test.js", "/scripts/verify-dataset.mjs", "/data/majors.json", "/formulas/universities/generated-school-formulas.js"]) {
    const { response } = await get(path);
    assert.equal(response.status, 404, `${path} không được public`);
  }
});

test("HTML, CSS và JavaScript luôn tái xác thực sau khi cập nhật", async () => {
  for (const path of ["/", "/css/refinement.css", "/js/main.js"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.headers.get("cache-control"), "no-cache", `${path} không được giữ bản cũ`);
  }
  const logo = await fetch(`${baseUrl}/assets/logos/dai-hoc-quoc-gia-ha-noi.svg`);
  assert.match(logo.headers.get("cache-control") || "", /max-age=604800/, "logo nên được cache để giảm tải");
  const securityConfig = await fetch(`${baseUrl}/api/security-config`);
  assert.match(securityConfig.headers.get("cache-control") || "", /no-store/, "cấu hình xác minh không được dùng bản cũ");
});

test("mọi response có security headers và HTTPS proxy nhận HSTS", async () => {
  const response = await fetch(`${baseUrl}/`, { headers: { "X-Forwarded-Proto": "https" } });
  const csp = response.headers.get("content-security-policy") || "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("strict-transport-security") || "", /max-age=31536000/);
});

test("chỉ OCR worker được chạy WebAssembly, trang và các script khác vẫn giữ CSP chặt", async () => {
  for (const path of ["/", "/js/main.js", "/vendor/tesseract/worker.min.js", "/favicon.svg"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200);
    const csp = response.headers.get("content-security-policy");
    assert.equal(csp.includes("'wasm-unsafe-eval'"), path === "/vendor/tesseract/worker.min.js");
    assert.doesNotMatch(csp, /'unsafe-eval'|'unsafe-inline'/);
  }
});

test("security.txt công khai kênh báo lỗi bảo mật mà không lộ email cá nhân", async () => {
  const response = await fetch(`${baseUrl}/.well-known/security.txt`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/plain/);
  assert.match(body, /^Contact: https:\/\/github\.com\/Ving1009\/tinhdiemthpt\/issues\/new/m);
  assert.match(body, /^Expires: 2027-09-27T00:00:00Z/m);
  assert.doesNotMatch(body, /@/);
});

test("CORS không phản chiếu origin ngoài danh sách phát triển", async () => {
  const response = await fetch(`${baseUrl}/api/search?q=BKA`, { headers: { Origin: "https://attacker.invalid" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
});

test("JSON lỗi và body quá lớn trả mã an toàn, không lộ stack", async () => {
  const malformed = await fetch(`${baseUrl}/api/majors/best-combinations`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{"
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { success: false, error: { code: "INVALID_JSON", message: "Dữ liệu JSON không hợp lệ." } });

  const oversized = await fetch(`${baseUrl}/api/majors/best-combinations`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ padding: "x".repeat(101 * 1024) })
  });
  assert.equal(oversized.status, 413);
  const payload = await oversized.json();
  assert.equal(payload.error.code, "REQUEST_TOO_LARGE");
  assert.equal(Object.hasOwn(payload, "stack"), false);
});

test("API trường, ngành và catalog không lộ metadata hay tên website thu thập", async () => {
  const listResponse = await fetch(`${baseUrl}/api/universities?pageSize=3`);
  const listPayload = await listResponse.json();
  assert.equal(listPayload.success, true);
  const universityId = listPayload.data.items.find((item) => item.majorRowCount > 0)?.id;
  assert.ok(universityId);
  const payloads = [listPayload];
  for (const path of [
    `/api/universities/${encodeURIComponent(universityId)}`,
    `/api/universities/${encodeURIComponent(universityId)}/majors?pageSize=5`,
    `/api/universities/${encodeURIComponent(universityId)}/major-options`,
    `/api/universities/${encodeURIComponent(universityId)}/admission-formulas`,
    "/api/catalog/combinations",
    "/api/catalog/subjects"
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200);
    payloads.push(await response.json());
  }
  for (const payload of payloads) {
    assert.deepEqual(forbiddenKeys(payload), []);
    assert.doesNotMatch(JSON.stringify(payload), /tuyensinh247|diemthi\.vnexpress\.net/i);
  }
  const catalog = payloads[5].data;
  assert.ok(catalog.length > 0);
  assert.equal(Object.hasOwn(catalog[0], "raw"), false);
});

test("homepage chỉ nạp danh mục nhẹ; dữ liệu ngành được lọc và phân trang qua API", async () => {
  const [{ text: html }, repositoryCode] = await Promise.all([
    get("/"),
    readFile(new URL("../public/js/university.js", import.meta.url), "utf8")
  ]);
  assert.doesNotMatch(html, /data\/majors\.json/i);
  assert.doesNotMatch(repositoryCode, /data\/majors\.json|majors\.json/i);
  assert.match(repositoryCode, /requestJson\("\/api\/bootstrap"\)/);
  const response = await fetch(`${baseUrl}/api/bootstrap`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-encoding"), "gzip");
  assert.ok(Number(response.headers.get("content-length")) < 200 * 1024, "gói bootstrap nén phải nhỏ hơn 200 KB");
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.ok(payload.data.universities.length > 300);
  assert.equal(Object.hasOwn(payload.data, "majors"), false);
  assert.ok(payload.data.metadata.majorRowCount > 17000);
  const majorsResponse = await fetch(`${baseUrl}/api/majors?method=THPT&page=2&pageSize=24`);
  const majorsPayload = await majorsResponse.json();
  assert.equal(majorsPayload.data.items.length, 24);
  assert.ok(majorsPayload.data.pagination.total > 5000);
  assert.deepEqual(forbiddenKeys(payload), []);
});

test("search server hỗ trợ mã trường, tiếng Việt có/không dấu và mã ngành", async () => {
  for (const [query, matcher] of [
    ["BKA", /BKA/i],
    ["tự động hóa", /tự động hóa/i],
    ["tu dong hoa", /tự động hóa/i],
    ["7480201", /7480201/]
  ]) {
    const response = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(query)}&limit=30`);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.ok(payload.data.length <= 30);
    assert.match(JSON.stringify(payload.data), matcher, `thiếu kết quả cho ${query}`);
    assert.deepEqual(forbiddenKeys(payload), []);
  }
});

test("API lỗi dùng schema thống nhất và không gửi stack", async () => {
  const missing = await fetch(`${baseUrl}/api/does-not-exist`);
  const missingPayload = await missing.json();
  assert.deepEqual(missingPayload, { success: false, error: { code: "API_NOT_FOUND", message: "Không tìm thấy API." } });
  assert.equal(Object.hasOwn(missingPayload, "stack"), false);
});

test("API trợ lý giữ Groq ở backend và không cache hội thoại", async () => {
  const response = await fetch(`${baseUrl}/api/assistant-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Tìm trường BKA", context: { cards: [] } })
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.deepEqual(payload.data, { answer: "Câu trả lời Groq thử nghiệm.", model: "test-model" });
  assert.equal(assistantQuestions.at(-1).question, "Tìm trường BKA");
  assert.doesNotMatch(JSON.stringify(payload), /API_KEY|secret/i);
});

test("API quy đổi chứng chỉ độc lập đã được gỡ", async () => {
  const list = await fetch(`${baseUrl}/api/universities?pageSize=1`).then((response) => response.json());
  const id = list.data.items[0].id;
  for (const [path, options] of [
    [`/api/universities/${id}/certificate-conversions?year=2026`, undefined],
    ["/api/certificate-conversions/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }]
  ]) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const payload = await response.json();
    assert.equal(response.status, 404);
    assert.equal(payload.error.code, "API_NOT_FOUND");
  }
});

test("API gộp nhiều tổ hợp trả dữ liệu đã làm sạch", async () => {
  const response = await fetch(`${baseUrl}/api/majors/best-combinations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      year: 2026,
      pageSize: 5,
      results: [
        { combination: "A00", score: 25, scale: 30, method: "THPT", ruleId: "three-subject-sum-priority-2026" },
        { combination: "A01", score: 26, scale: 30, method: "THPT", ruleId: "three-subject-sum-priority-2026" }
      ]
    })
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.ok(payload.data.pagination.total > 50);
  assert.deepEqual(forbiddenKeys(payload), []);
  assert.doesNotMatch(JSON.stringify(payload), /tuyensinh247|diemthi\.vnexpress\.net|sourceUrl/i);
});

test("API chỉ nhận báo dữ liệu sai vào hàng chờ và không công khai danh sách", async () => {
  const report = {
    kind: "tinh-diem-thpt-data-report", version: 1, createdAt: "2026-09-14T00:00:00.000Z", status: "saved-locally-not-sent",
    context: { universityId: "u1", university: "Trường A", majorId: "m1", major: "Ngành A", code: "7480201", method: "THPT", year: 2026 },
    report: { field: "Điểm chuẩn", description: "Đề nghị kiểm tra lại mốc điểm.", proposedValue: "25", evidenceUrl: "https://example.edu.vn/thong-bao" }
  };
  const response = await fetch(`${baseUrl}/api/data-reports`, { method: "POST", headers: { "content-type": "application/json", "X-Turnstile-Token": "test-token" }, body: JSON.stringify(report) });
  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.data.status, "pending_review");
  assert.equal(receivedReports.length, 1);
  const listing = await fetch(`${baseUrl}/api/data-reports`);
  assert.equal(listing.status, 404);
});
