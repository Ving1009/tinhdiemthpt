import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../server/errors.js";
import { AUTH_COOKIE, PASSWORD_MAX_LENGTH, cookieValue, hashPassword, normalizeUsername, validatePassword, validateUsername, verifyPassword } from "../worker/auth.js";

test("tên đăng nhập được chuẩn hóa và chỉ nhận ký tự an toàn", () => {
  assert.equal(normalizeUsername("  Quang.Vinh_26 "), "quang.vinh_26");
  assert.equal(validateUsername("user-2026"), "user-2026");
  for (const invalid of ["abc", "tênđăngnhập", "user name", "user..name", "-username"] ) {
    assert.throws(() => validateUsername(invalid), AppError);
  }
});

test("mật khẩu bắt buộc đủ độ dài, chữ và số", () => {
  const maxLengthPassword = `A1${"x".repeat(PASSWORD_MAX_LENGTH - 2)}`;
  assert.equal(validatePassword("Abcde1"), "Abcde1");
  assert.equal(validatePassword("Matkhau2026A"), "Matkhau2026A");
  assert.equal(validatePassword(maxLengthPassword), maxLengthPassword);
  for (const invalid of ["Abcd1", "abcdef", "123456", `A1${"x".repeat(PASSWORD_MAX_LENGTH - 1)}`]) {
    assert.throws(() => validatePassword(invalid), AppError);
  }
});

test("scrypt dùng salt riêng và xác minh mật khẩu không lưu bản rõ", async () => {
  const first = await hashPassword("Matkhau2026");
  const second = await hashPassword("Matkhau2026");
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyPassword("Matkhau2026", {
    password_salt: first.salt,
    password_hash: first.hash,
    password_iterations: first.iterations
  }), true);
  assert.equal(await verifyPassword("SaiMatKhau2027", {
    password_salt: first.salt,
    password_hash: first.hash,
    password_iterations: first.iterations
  }), false);
  assert.equal(first.hash.includes("Matkhau2026"), false);
});

test("cookie phiên chỉ được đọc đúng tên", () => {
  assert.equal(cookieValue(`theme=dark; ${AUTH_COOKIE}=token-abc; language=vi`), "token-abc");
  assert.equal(cookieValue("theme=dark"), "");
});
