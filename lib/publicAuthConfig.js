import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../worker/auth.js";

export function publicAuthConfig(environment = {}) {
  return {
    enabled: Boolean(environment.AUTH_DB && typeof environment.AUTH_DB.prepare === "function"),
    provider: "password",
    usernameMinLength: 4,
    usernameMaxLength: 24,
    passwordMinLength: PASSWORD_MIN_LENGTH,
    passwordMaxLength: PASSWORD_MAX_LENGTH
  };
}
