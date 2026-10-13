import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Cloudflare cache rules revalidate app scripts without overriding immutable OCR assets", async () => {
  const script = await readFile(new URL("../scripts/build-cloudflare.mjs", import.meta.url), "utf8");
  const block = script.match(/writeFile\(join\(output, "_headers"\), \[([\s\S]*?)\]\.join\("\\n"\)\)/);
  assert.ok(block, "read the actual _headers configuration without executing the build");
  const lines = [...block[1].matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*,?\s*$/gm)].map(match => JSON.parse(match[1]));
  const rules = [];
  let pattern;
  for (const line of lines) {
    if (line.startsWith("/")) pattern = line;
    else if (line.startsWith("  Cache-Control:")) rules.push({ pattern, value: line.slice("  Cache-Control:".length).trim() });
  }
  const matches = (pattern, path) => new RegExp(`^${pattern.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(path);
  const immutable = "public, max-age=31536000, immutable";
  for (const [path, expected] of [
    ["/js/clientTranscriptOcr.js", "no-cache"],
    ["/js/core/localTranscriptTable.js", "no-cache"],
    ["/formulas/universities/bka-thpt.js", "no-cache"],
    ["/vendor/tesseract/tesseract.esm.min.js", immutable],
    ["/vendor/tesseract/worker.min.js", immutable],
    ["/vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js", immutable],
    ["/vendor/tesseract-core/tesseract-core-simd-lstm.wasm", immutable],
    ["/vendor/tesseract-lang/vie.traineddata.gz", immutable],
    ["/vendor/transcript-subjects.json", immutable]
  ]) assert.deepEqual(rules.filter(rule => matches(rule.pattern, path)).map(rule => rule.value), [expected], path);
});
