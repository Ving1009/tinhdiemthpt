export function publicAuthConfig(environment = {}) {
  return {
    enabled: Boolean(environment.AUTH_DB && typeof environment.AUTH_DB.prepare === "function"),
    provider: "password",
    usernameMinLength: 4,
    usernameMaxLength: 24,
    passwordMinLength: 10
  };
}
