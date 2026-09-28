import assert from "node:assert/strict";
import test from "node:test";
import { publicAuthConfig } from "../lib/publicAuthConfig.js";

test("chỉ bật auth khi có khóa công khai và không bao giờ trả secret", () => {
  const disabled = publicAuthConfig({ SUPABASE_URL: "https://demo.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_hidden" });
  assert.equal(disabled.enabled, false);
  assert.equal(JSON.stringify(disabled).includes("sb_secret_hidden"), false);
  const enabled = publicAuthConfig({ SUPABASE_URL: "https://demo.supabase.co", SUPABASE_PUBLIC_KEY: "sb_publishable_12345678901234567890" });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.publicKey, "sb_publishable_12345678901234567890");
});
