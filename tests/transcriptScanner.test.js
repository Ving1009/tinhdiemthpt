import assert from "node:assert/strict";
import test from "node:test";
import { resolveTranscriptApiUrl } from "../public/js/transcriptScanner.js";

const noConfiguration = { querySelector: () => null };

test("Live Server tại cổng khác gọi backend AI tại cổng 3000", () => {
  const url = resolveTranscriptApiUrl({ hostname: "127.0.0.1", port: "5500" }, noConfiguration);
  assert.equal(url, "http://127.0.0.1:3000/api/scan-transcript");
});

test("website được backend phục vụ vẫn sử dụng cùng origin", () => {
  const url = resolveTranscriptApiUrl({ hostname: "127.0.0.1", port: "3000" }, noConfiguration);
  assert.equal(url, "/api/scan-transcript");
});
