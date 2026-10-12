import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { initAdConsent } from "../public/js/adConsent.js";

afterEach(() => { delete globalThis.window; delete globalThis.document; });

function fixture() {
  const link = new EventTarget();
  let reopened = 0;
  globalThis.document = { querySelector: () => link };
  globalThis.window = { googlefc: { showRevocationMessage: () => reopened++ } };
  initAdConsent();
  return { link, ready: window.googlefc.callbackQueue[0].CONSENT_API_READY, reopened: () => reopened };
}

test("consent controls stay hidden without a ready CMP, including a failed API", () => {
  const { link, ready } = fixture();
  assert.equal(link.hidden, true);
  assert.doesNotThrow(ready);
  window.__tcfapi = () => { throw new Error("CMP unavailable"); };
  assert.doesNotThrow(ready);
  assert.equal(link.hidden, true);
});

test("article and app consent controls reopen the CMP and follow its applicability", () => {
  const { link, ready, reopened } = fixture();
  let notify;
  window.__tcfapi = (command, version, callback) => {
    assert.equal(command, "addEventListener");
    assert.equal(version, 0);
    notify = callback;
  };
  ready();
  notify({ gdprApplies: true }, true);
  assert.equal(link.hidden, false);
  const event = new Event("click", { cancelable: true });
  link.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(reopened(), 1);
  for (const [data, success] of [[{ gdprApplies: false }, true], [{ gdprApplies: true }, false], [null, true]]) {
    notify(data, success);
    assert.equal(link.hidden, true);
  }
  delete window.googlefc.showRevocationMessage;
  notify({ gdprApplies: true }, true);
  assert.equal(link.hidden, true);
});

test("a page without a consent control never initializes Google globals", () => {
  globalThis.document = { querySelector: () => null };
  assert.doesNotThrow(initAdConsent);
  assert.equal(globalThis.window, undefined);
});
