import assert from "node:assert/strict";
import test from "node:test";
import { getTurnstileConfiguration, turnstileTokenFromHeaders, verifyTurnstile } from "../server/services/turnstile.js";

const environment = {
  TURNSTILE_SITE_KEY: "site-key",
  TURNSTILE_SECRET_KEY: "secret-key"
};

test("Turnstile tắt an toàn khi chưa cấu hình khóa", async () => {
  assert.deepEqual(getTurnstileConfiguration({}), { enabled: false, configured: false, siteKey: "" });
  assert.deepEqual(await verifyTurnstile({ environment: {}, action: "data_report" }), { skipped: true });
});

test("Turnstile yêu cầu token khi đã bật", async () => {
  await assert.rejects(
    verifyTurnstile({ environment, action: "data_report", requestHostname: "example.com" }),
    (error) => error.code === "TURNSTILE_REQUIRED" && error.statusCode === 403
  );
});

test("Turnstile gửi secret tới Siteverify và kiểm tra action cùng hostname", async () => {
  let submitted;
  const result = await verifyTurnstile({
    environment,
    token: "valid-token",
    action: "scan_transcript",
    remoteIp: "203.0.113.7",
    requestHostname: "tinhdiemthpt.id.vn",
    fetchImpl: async (_url, options) => {
      submitted = options.body;
      return new Response(JSON.stringify({ success: true, action: "scan_transcript", hostname: "tinhdiemthpt.id.vn" }));
    }
  });
  assert.equal(result.success, true);
  assert.equal(submitted.get("secret"), "secret-key");
  assert.equal(submitted.get("response"), "valid-token");
  assert.equal(submitted.get("remoteip"), "203.0.113.7");
});

test("Turnstile từ chối token của action hoặc hostname khác", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ success: true, action: "data_report", hostname: "evil.example" }));
  await assert.rejects(
    verifyTurnstile({ environment, token: "valid-token", action: "scan_transcript", requestHostname: "tinhdiemthpt.id.vn", fetchImpl }),
    (error) => error.code === "TURNSTILE_ACTION_MISMATCH"
  );
  const matchingActionFetch = async () => new Response(JSON.stringify({ success: true, action: "scan_transcript", hostname: "evil.example" }));
  await assert.rejects(
    verifyTurnstile({ environment, token: "valid-token", action: "scan_transcript", requestHostname: "tinhdiemthpt.id.vn", fetchImpl: matchingActionFetch }),
    (error) => error.code === "TURNSTILE_HOSTNAME_MISMATCH"
  );
});

test("Đọc token từ Web Headers và Express headers", () => {
  assert.equal(turnstileTokenFromHeaders(new Headers({ "X-Turnstile-Token": "web-token" })), "web-token");
  assert.equal(turnstileTokenFromHeaders({ "x-turnstile-token": "express-token" }), "express-token");
});
