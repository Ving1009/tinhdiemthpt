import assert from "node:assert/strict";
import test from "node:test";
import { requestAssistantAnswer } from "../public/js/assistant.js";

test("trợ lý hủy request quá hạn để giao diện dùng tra cứu nội bộ", async () => {
  const originalDocument = globalThis.document;
  globalThis.document = { baseURI: "https://tinhdiemthpt.id.vn/" };
  let aborted = false;
  try {
    await assert.rejects(() => requestAssistantAnswer({ question: "25đ chọn ngành điện điện tử" }, {
      timeoutMs: 10,
      fetchImpl: async (_url, { signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
      })
    }), { name: "AbortError" });
    assert.equal(aborted, true);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
