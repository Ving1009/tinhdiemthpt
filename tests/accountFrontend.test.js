import assert from "node:assert/strict";
import test from "node:test";
import { AccountApp, AUTH_SESSION_KEY } from "../public/js/account.js";

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

function accountFixture() {
  const originalDocument = globalThis.document;
  globalThis.document = { getElementById: () => null };
  const values = new Map([["theme", "dark"]]);
  const storageAdapter = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) };
  let reloads = 0;
  const account = new AccountApp({ personalKeys: ["scores", "wishes", "history"], storageAdapter, locationRef: { reload: () => { reloads += 1; } } });
  account.render = () => {};
  account.setStatus = (message, error) => { account.status = { message, error }; };
  return { account, values, reloads: () => reloads, cleanup() {
    account.cancelPendingSync();
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  } };
}

test("đăng xuất lỗi mạng không giả vờ xóa phiên rồi đăng nhập lại sau reload", async () => {
  const fixture = accountFixture();
  const { account, values } = fixture;
  try {
    account.user = { id: "A" };
    account.dataIsolation.beginUser("A");
    account.dataIsolation.completeUser("A", { scores: [9] });
    account.scheduleBackup();
    account.request = async () => { throw new TypeError("Network unavailable"); };
    await account.logout();
    assert.equal(account.user.id, "A");
    assert.equal(values.get(AUTH_SESSION_KEY).userId, "A");
    assert.deepEqual(values.get("scores"), [9]);
    assert.equal(fixture.reloads(), 0);
    assert.equal(account.syncTimer, null);
    assert.equal(account.status.error, true);
    assert.match(account.status.message, /Chưa thể đăng xuất/);
    account.request = async () => ({});
    await account.logout();
    assert.equal(account.user, null);
    assert.equal(values.has(AUTH_SESSION_KEY), false);
    assert.equal(values.has("scores"), false);
    assert.equal(values.get("theme"), "dark");
    assert.equal(fixture.reloads(), 1);
  } finally { fixture.cleanup(); }
});

test("A logout rồi B login chỉ restore/backup B và hủy timer cũ của A", async () => {
  const fixture = accountFixture();
  const { account, values } = fixture;
  const uploads = [];
  try {
    account.user = { id: "A" };
    account.dataIsolation.beginUser("A");
    account.dataIsolation.completeUser("A", { scores: [9], wishes: ["A"], history: ["exam-A"] });
    account.request = async (path, options) => {
      if (options?.method === "PUT") {
        uploads.push({ userId: account.user.id, ...JSON.parse(options.body) });
        return { updatedAt: new Date().toISOString() };
      }
      return path === "/api/auth/data" ? { data: { scores: [7], wishes: ["B"], history: ["exam-B"] } } : {};
    };
    account.scheduleBackup();
    await account.logout();
    assert.equal(account.syncTimer, null);
    assert.equal(values.has("wishes"), false);
    await account.activateUser({ id: "B" });
    await account.backup(false, "A");
    assert.equal(uploads.length, 0);
    account.scheduleBackup();
    await new Promise((resolve) => setTimeout(resolve, 1900));
    assert.deepEqual(uploads, [{ userId: "B", data: { scores: [7], wishes: ["B"], history: ["exam-B"] } }]);
    assert.equal(values.get("theme"), "dark");
  } finally { fixture.cleanup(); }
});
