import { AppError } from "../server/errors.js";
import { failure, success } from "./http.js";
import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { readJsonObject } from "../lib/requestBody.js";

export const AUTH_COOKIE = "__Host-thpt_session";
export const PASSWORD_COST = 16_384;
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_AUTH_BODY_BYTES = 16 * 1024;
const MAX_USER_DATA_BYTES = 512 * 1024;
const DUMMY_PASSWORD_RECORD = {
  password_salt: "AAAAAAAAAAAAAAAAAAAAAA==",
  password_hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  password_iterations: PASSWORD_COST
};
const encoder = new TextEncoder();

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value) {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export function normalizeUsername(value) {
  return String(value || "").trim().toLocaleLowerCase("en");
}

export function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!/^[a-z0-9][a-z0-9._-]{2,22}[a-z0-9]$/.test(username)) {
    throw new AppError("Tên đăng nhập cần 4–24 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.", { statusCode: 400, code: "INVALID_USERNAME" });
  }
  if (/\.{2,}|_{2,}|-{2,}/.test(username)) {
    throw new AppError("Tên đăng nhập không được lặp liên tiếp ký tự đặc biệt.", { statusCode: 400, code: "INVALID_USERNAME" });
  }
  return username;
}

export function validatePassword(value) {
  const password = String(value || "");
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AppError("Mật khẩu cần 6–128 ký tự và có ít nhất một chữ cùng một số.", { statusCode: 400, code: "INVALID_PASSWORD" });
  }
  return password;
}

function derivePassword(password, salt, cost) {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 32, { N: cost, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(new Uint8Array(derived));
    });
  });
}

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PASSWORD_COST) {
  const derived = await derivePassword(password, salt, iterations);
  return { salt: bytesToBase64(salt), hash: bytesToBase64(derived), iterations };
}

export async function verifyPassword(password, stored) {
  const actual = await hashPassword(password, base64ToBytes(stored.password_salt), Number(stored.password_iterations));
  const expectedBytes = base64ToBytes(stored.password_hash);
  const actualBytes = base64ToBytes(actual.hash);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function cookieValue(cookieHeader, name = AUTH_COOKIE) {
  for (const item of String(cookieHeader || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(item.slice(separator + 1).trim()); }
    catch { return ""; }
  }
  return "";
}

function sessionCookie(token, maxAge = SESSION_MAX_AGE_SECONDS) {
  return `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function requireDatabase(environment) {
  if (!environment.AUTH_DB || typeof environment.AUTH_DB.prepare !== "function") {
    throw new AppError("Hệ thống tài khoản chưa sẵn sàng.", { statusCode: 503, code: "AUTH_UNAVAILABLE" });
  }
  return environment.AUTH_DB;
}

async function readJson(request, maxBytes = MAX_AUTH_BODY_BYTES) {
  return readJsonObject(request, maxBytes);
}

function sameOriginRequest(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

async function createSession(database, userId) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = Date.now();
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;
  await database.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, userId, now, expiresAt).run();
  return { token, expiresAt };
}

async function authenticatedUser(request, environment) {
  const database = requireDatabase(environment);
  const token = cookieValue(request.headers.get("Cookie"));
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await database.prepare(`
    SELECT users.id, users.username, users.created_at, sessions.expires_at
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(tokenHash, now).first();
  if (!row) {
    await database.prepare("DELETE FROM sessions WHERE token_hash = ? AND expires_at <= ?").bind(tokenHash, now).run();
  }
  return row ? { id: row.id, username: row.username, createdAt: row.created_at, expiresAt: row.expires_at, tokenHash } : null;
}

async function requireUser(request, environment) {
  const user = await authenticatedUser(request, environment);
  if (!user) throw new AppError("Phiên đăng nhập đã hết hạn.", { statusCode: 401, code: "AUTH_REQUIRED" });
  const expectedUserId = request.headers.get("X-Account-User-Id");
  if (expectedUserId && expectedUserId !== user.id) {
    throw new AppError("Tài khoản đã thay đổi. Hãy tải lại trang trước khi tiếp tục.", { statusCode: 409, code: "AUTH_ACCOUNT_CHANGED" });
  }
  return user;
}

async function register(request, environment) {
  const database = requireDatabase(environment);
  const body = await readJson(request);
  const username = validateUsername(body.username);
  const password = validatePassword(body.password);
  const passwordRecord = await hashPassword(password);
  const userId = crypto.randomUUID();
  const createdAt = Date.now();
  try {
    await database.prepare("INSERT INTO users (id, username, password_salt, password_hash, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(userId, username, passwordRecord.salt, passwordRecord.hash, passwordRecord.iterations, createdAt).run();
  } catch (error) {
    if (/unique|constraint/i.test(String(error?.message || error))) {
      throw new AppError("Tên đăng nhập này đã được sử dụng.", { statusCode: 409, code: "USERNAME_TAKEN" });
    }
    throw error;
  }
  const session = await createSession(database, userId);
  return success(request, { user: { id: userId, username, createdAt }, expiresAt: session.expiresAt }, {
    status: 201,
    headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(session.token) }
  });
}

async function login(request, environment) {
  const database = requireDatabase(environment);
  const body = await readJson(request);
  const username = validateUsername(body.username);
  const password = String(body.password || "");
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new AppError("Tên đăng nhập hoặc mật khẩu không đúng.", { statusCode: 401, code: "INVALID_CREDENTIALS" });
  }
  const row = await database.prepare("SELECT id, username, password_salt, password_hash, password_iterations, created_at FROM users WHERE username = ? COLLATE NOCASE")
    .bind(username).first();
  const passwordMatches = await verifyPassword(password, row || DUMMY_PASSWORD_RECORD);
  if (!row || !passwordMatches) {
    throw new AppError("Tên đăng nhập hoặc mật khẩu không đúng.", { statusCode: 401, code: "INVALID_CREDENTIALS" });
  }
  await database.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
  const session = await createSession(database, row.id);
  return success(request, { user: { id: row.id, username: row.username, createdAt: row.created_at }, expiresAt: session.expiresAt }, {
    headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(session.token) }
  });
}

async function logout(request, environment) {
  const database = requireDatabase(environment);
  const token = cookieValue(request.headers.get("Cookie"));
  if (token) await database.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return success(request, { loggedOut: true }, {
    headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie("", 0) }
  });
}

async function profile(request, environment) {
  const user = await authenticatedUser(request, environment);
  if (!user) return failure(request, "AUTH_REQUIRED", "Bạn chưa đăng nhập.", 401, { "Cache-Control": "no-store" });
  return success(request, { user: { id: user.id, username: user.username, createdAt: user.createdAt }, expiresAt: user.expiresAt }, {
    headers: { "Cache-Control": "no-store" }
  });
}

async function readUserData(request, environment) {
  const database = requireDatabase(environment);
  const user = await requireUser(request, environment);
  const row = await database.prepare("SELECT data, updated_at FROM user_app_data WHERE user_id = ?").bind(user.id).first();
  return success(request, row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : { data: null, updatedAt: null }, {
    headers: { "Cache-Control": "no-store" }
  });
}

async function writeUserData(request, environment) {
  const database = requireDatabase(environment);
  const user = await requireUser(request, environment);
  const body = await readJson(request, MAX_USER_DATA_BYTES);
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    throw new AppError("Bản sao dữ liệu không hợp lệ.", { statusCode: 400, code: "INVALID_USER_DATA" });
  }
  const serialized = JSON.stringify(body.data);
  if (encoder.encode(serialized).byteLength > MAX_USER_DATA_BYTES) {
    throw new AppError("Bản sao dữ liệu vượt giới hạn 512 KB.", { statusCode: 413, code: "USER_DATA_TOO_LARGE" });
  }
  const updatedAt = Date.now();
  await database.prepare(`
    INSERT INTO user_app_data (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).bind(user.id, serialized, updatedAt).run();
  return success(request, { updatedAt }, { headers: { "Cache-Control": "no-store" } });
}

export async function handleAuthRequest(request, environment) {
  if (!sameOriginRequest(request)) return failure(request, "INVALID_ORIGIN", "Nguồn yêu cầu không hợp lệ.", 403);
  const { pathname } = new URL(request.url);
  if (request.method === "POST" && pathname === "/api/auth/register") return register(request, environment);
  if (request.method === "POST" && pathname === "/api/auth/login") return login(request, environment);
  if (request.method === "POST" && pathname === "/api/auth/logout") return logout(request, environment);
  if (request.method === "GET" && pathname === "/api/auth/me") return profile(request, environment);
  if (request.method === "GET" && pathname === "/api/auth/data") return readUserData(request, environment);
  if (request.method === "PUT" && pathname === "/api/auth/data") return writeUserData(request, environment);
  return failure(request, "AUTH_ROUTE_NOT_FOUND", "Không tìm thấy chức năng tài khoản.", 404);
}
