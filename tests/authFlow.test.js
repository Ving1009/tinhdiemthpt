import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_COOKIE, PASSWORD_MAX_LENGTH, handleAuthRequest } from "../worker/auth.js";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function createFakeAuthDatabase() {
  const usersById = new Map();
  const usersByUsername = new Map();
  const sessions = new Map();
  const userData = new Map();

  function prepare(sql) {
    return {
      bind(...values) {
        return {
          async run() {
            const normalized = sql.replace(/\s+/g, " ").trim();
            if (normalized.startsWith("INSERT INTO users")) {
              const [id, username, passwordSalt, passwordHash, passwordIterations, createdAt] = values;
              if (usersByUsername.has(String(username).toLocaleLowerCase("en"))) throw new Error("UNIQUE constraint failed: users.username");
              const user = { id, username, password_salt: passwordSalt, password_hash: passwordHash, password_iterations: passwordIterations, created_at: createdAt };
              usersById.set(id, user);
              usersByUsername.set(String(username).toLocaleLowerCase("en"), user);
              return { success: true };
            }
            if (normalized.startsWith("INSERT INTO sessions")) {
              const [tokenHash, userId, createdAt, expiresAt] = values;
              sessions.set(tokenHash, { token_hash: tokenHash, user_id: userId, created_at: createdAt, expires_at: expiresAt });
              return { success: true };
            }
            if (normalized.startsWith("DELETE FROM sessions WHERE token_hash = ? AND expires_at <= ?")) {
              const [tokenHash, now] = values;
              const session = sessions.get(tokenHash);
              if (session && session.expires_at <= now) sessions.delete(tokenHash);
              return { success: true };
            }
            if (normalized.startsWith("DELETE FROM sessions WHERE token_hash = ?")) {
              sessions.delete(values[0]);
              return { success: true };
            }
            if (normalized.startsWith("DELETE FROM sessions WHERE expires_at <= ?")) {
              const [now] = values;
              for (const [tokenHash, session] of sessions) if (session.expires_at <= now) sessions.delete(tokenHash);
              return { success: true };
            }
            if (normalized.startsWith("INSERT INTO user_app_data")) {
              const [userId, data, updatedAt] = values;
              userData.set(userId, { user_id: userId, data, updated_at: updatedAt });
              return { success: true };
            }
            throw new Error(`Unhandled run SQL: ${normalized}`);
          },
          async first() {
            const normalized = sql.replace(/\s+/g, " ").trim();
            if (normalized.startsWith("SELECT users.id")) {
              const [tokenHash, now] = values;
              const session = sessions.get(tokenHash);
              if (!session || session.expires_at <= now) return null;
              const user = usersById.get(session.user_id);
              return user ? { id: user.id, username: user.username, created_at: user.created_at, expires_at: session.expires_at } : null;
            }
            if (normalized.startsWith("SELECT id, username, password_salt")) {
              const user = usersByUsername.get(String(values[0]).toLocaleLowerCase("en"));
              return clone(user || null);
            }
            if (normalized.startsWith("SELECT data, updated_at FROM user_app_data")) {
              return clone(userData.get(values[0]) || null);
            }
            throw new Error(`Unhandled first SQL: ${normalized}`);
          }
        };
      }
    };
  }

  return {
    prepare,
    expireAllSessions() {
      for (const session of sessions.values()) session.expires_at = Date.now() - 1000;
    },
    sessionCount() {
      return sessions.size;
    }
  };
}

function authRequest(path, { method = "GET", cookie = "", body = null, origin = "" } = {}) {
  const headers = new Headers({ Accept: "application/json" });
  if (cookie) headers.set("Cookie", cookie);
  if (origin) headers.set("Origin", origin);
  if (body) headers.set("Content-Type", "application/json");
  return new Request(`https://tinhdiemthpt.id.vn${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
}

async function json(response) {
  return response.json();
}

async function register(environment, username, password = "Matkhau2026") {
  const response = await handleAuthRequest(authRequest("/api/auth/register", {
    method: "POST",
    body: { username, password }
  }), environment);
  const payload = await json(response);
  assert.equal(response.status, 201);
  return { cookie: response.headers.get("set-cookie").match(new RegExp(`${AUTH_COOKIE}=[^;]+`))[0], payload, setCookie: response.headers.get("set-cookie") };
}

test("auth flow cô lập dữ liệu theo user và không cho đọc ghi chéo", async () => {
  const environment = { AUTH_DB: createFakeAuthDatabase() };
  const accountA = await register(environment, "user-a");
  assert.match(accountA.setCookie, /HttpOnly/);
  assert.match(accountA.setCookie, /Secure/);
  assert.match(accountA.setCookie, /SameSite=Lax/);
  assert.match(accountA.setCookie, /Path=\//);
  assert.doesNotMatch(accountA.setCookie, /Domain=/i);

  const dataA = { "thpt-calculator-form-v2": { score: 26 }, "thpt-wishlist-v1": ["A"] };
  const writeA = await handleAuthRequest(authRequest("/api/auth/data", { method: "PUT", cookie: accountA.cookie, body: { data: dataA } }), environment);
  assert.equal(writeA.status, 200);

  const accountB = await register(environment, "user-b");
  const readBEmpty = await handleAuthRequest(authRequest("/api/auth/data", { cookie: accountB.cookie }), environment);
  assert.deepEqual((await json(readBEmpty)).data.data, null);

  const dataB = { "thpt-calculator-form-v2": { score: 19 }, "thpt-practice-history-v1": [{ exam: "Toán" }] };
  const writeB = await handleAuthRequest(authRequest("/api/auth/data", { method: "PUT", cookie: accountB.cookie, body: { data: dataB } }), environment);
  assert.equal(writeB.status, 200);

  const readA = await handleAuthRequest(authRequest("/api/auth/data", { cookie: accountA.cookie }), environment);
  const readBAfter = await handleAuthRequest(authRequest("/api/auth/data", { cookie: accountB.cookie }), environment);
  assert.deepEqual((await json(readA)).data.data, dataA);
  assert.deepEqual((await json(readBAfter)).data.data, dataB);

  const logoutA = await handleAuthRequest(authRequest("/api/auth/logout", { method: "POST", cookie: accountA.cookie }), environment);
  assert.equal(logoutA.status, 200);
  assert.match(logoutA.headers.get("set-cookie"), /Max-Age=0/);
  const meA = await handleAuthRequest(authRequest("/api/auth/me", { cookie: accountA.cookie }), environment);
  assert.equal(meA.status, 401);
  const meB = await handleAuthRequest(authRequest("/api/auth/me", { cookie: accountB.cookie }), environment);
  assert.equal(meB.status, 200);
});

test("auth từ chối origin lạ, xóa session hết hạn và giữ giới hạn mật khẩu 128 ký tự", async () => {
  const environment = { AUTH_DB: createFakeAuthDatabase() };
  const invalidOrigin = await handleAuthRequest(authRequest("/api/auth/login", {
    method: "POST",
    origin: "https://evil.example",
    body: { username: "user-a", password: "Matkhau2026" }
  }), environment);
  assert.equal(invalidOrigin.status, 403);

  const longPassword = `A1${"x".repeat(PASSWORD_MAX_LENGTH - 2)}`;
  const account = await register(environment, "user-long", longPassword);
  environment.AUTH_DB.expireAllSessions();
  const expired = await handleAuthRequest(authRequest("/api/auth/me", { cookie: account.cookie }), environment);
  assert.equal(expired.status, 401);
  assert.equal(environment.AUTH_DB.sessionCount(), 0);

  await assert.rejects(
    handleAuthRequest(authRequest("/api/auth/register", {
      method: "POST",
      body: { username: "user-toolong", password: `A1${"x".repeat(PASSWORD_MAX_LENGTH - 1)}` }
    }), environment),
    (error) => error.code === "INVALID_PASSWORD" && error.statusCode === 400
  );
});
