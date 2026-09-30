import assert from "node:assert/strict";
import test from "node:test";
import { AccountApp } from "../public/js/account.js";

test("AccountApp gọi fetch mặc định với đúng receiver của trình duyệt", async () => {
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  globalThis.document = { getElementById: () => null };
  globalThis.fetch = function () {
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    return Promise.resolve(new Response(JSON.stringify({ success: true, data: { enabled: true, passwordMinLength: 6 } })));
  };

  try {
    const account = new AccountApp({
      storageAdapter: { get: (_key, fallback) => fallback, set() {}, remove() {} },
      locationRef: {}
    });
    await account.loadConfig();
    assert.equal(account.config.enabled, true);
    assert.equal(account.config.passwordMinLength, 6);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
