import http from "node:http";
import { gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";

const origin = process.env.PERF_ORIGIN || "http://127.0.0.1:3000";

function request(path, { method = "GET", body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const started = performance.now();
    const req = http.request(new URL(path, origin), {
      method,
      headers: {
        "accept-encoding": "gzip",
        ...(payload ? { "content-type": "application/json", "content-length": payload.length } : {})
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const compressed = Buffer.concat(chunks);
        const decoded = response.headers["content-encoding"] === "gzip" ? gunzipSync(compressed) : compressed;
        resolve({
          status: response.statusCode,
          encoding: response.headers["content-encoding"] || "identity",
          transferBytes: compressed.length,
          decodedBytes: decoded.length,
          durationMs: Number((performance.now() - started).toFixed(1)),
          data: JSON.parse(decoded.toString("utf8")).data
        });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const bootstrapRuns = [];
for (let index = 0; index < 3; index += 1) bootstrapRuns.push(await request("/api/bootstrap"));

const comparisonInput = {
  year: 2026,
  pageSize: 24,
  results: [
    { combination: "A00", score: 24.5, scale: 30, method: "THPT", ruleId: "three-subject-sum-priority-2026" },
    { combination: "A01", score: 25.5, scale: 30, method: "THPT", ruleId: "three-subject-sum-priority-2026" },
    { combination: "D07", score: 24, scale: 30, method: "THPT", ruleId: "three-subject-sum-priority-2026" }
  ]
};
const comparisonRuns = [];
for (let index = 0; index < 5; index += 1) comparisonRuns.push(await request("/api/majors/best-combinations", { method: "POST", body: comparisonInput }));

const bootstrap = bootstrapRuns.at(-1);
const comparison = comparisonRuns.at(-1);
console.log(JSON.stringify({
  origin,
  bootstrap: {
    status: bootstrap.status,
    encoding: bootstrap.encoding,
    transferBytes: bootstrap.transferBytes,
    decodedBytes: bootstrap.decodedBytes,
    medianDurationMs: median(bootstrapRuns.map((item) => item.durationMs)),
    universities: bootstrap.data.universities.length,
    majorRowsDeferred: bootstrap.data.metadata.majorRowCount,
    includesMajors: Object.hasOwn(bootstrap.data, "majors")
  },
  bestCombinations: {
    status: comparison.status,
    encoding: comparison.encoding,
    resultTotal: comparison.data.pagination.total,
    responseTransferBytes: comparison.transferBytes,
    medianDurationMs: median(comparisonRuns.map((item) => item.durationMs))
  }
}, null, 2));
