import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../server/server.js";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");

async function withServer(scanTranscript, run) {
  const app = createApp({ scanTranscript });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("endpoint nhận nhiều ảnh trong bộ nhớ và trả JSON đã chuẩn hóa", async () => {
  await withServer(async (images) => {
    assert.equal(images.length, 2);
    return {
      data: { student: { name: null }, scores: [{ subject: "Toán", grade: 10, semester1: 8, semester2: 8.4, year: 8.2, confidence: 0.95 }] },
      warnings: []
    };
  }, async (baseUrl) => {
    const form = new FormData();
    form.append("images[]", new Blob([PNG], { type: "image/png" }), "page-1.png");
    form.append("images[]", new Blob([PNG], { type: "image/png" }), "page-2.png");
    const response = await fetch(`${baseUrl}/api/scan-transcript`, { method: "POST", body: form });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.scores[0].subject, "Toán");
  });
});

test("endpoint từ chối tệp không phải ảnh", async () => {
  await withServer(async () => ({ data: { student: { name: null }, scores: [] }, warnings: [] }), async (baseUrl) => {
    const form = new FormData();
    form.append("images[]", new Blob(["not an image"], { type: "text/plain" }), "bad.txt");
    const response = await fetch(`${baseUrl}/api/scan-transcript`, { method: "POST", body: form });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.success, false);
  });
});

test("endpoint cho phép Live Server tại localhost gọi backend AI", async () => {
  await withServer(async () => ({ data: { student: { name: null }, scores: [] }, warnings: [] }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/scan-transcript`, {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:5500", "Access-Control-Request-Method": "POST" }
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5500");
  });
});
