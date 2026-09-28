import assert from "node:assert/strict";
import test from "node:test";
import { publicAuthConfig } from "../lib/publicAuthConfig.js";

test("chỉ bật tài khoản khi có D1 binding và không công khai cấu hình nội bộ", () => {
  const disabled = publicAuthConfig({});
  assert.equal(disabled.enabled, false);
  const enabled = publicAuthConfig({ AUTH_DB: { prepare() {} }, AUTH_PRIVATE_VALUE: "hidden" });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.provider, "password");
  assert.equal(enabled.passwordMinLength, 10);
  assert.equal(JSON.stringify(enabled).includes("hidden"), false);
});
