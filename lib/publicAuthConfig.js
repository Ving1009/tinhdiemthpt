export function publicAuthConfig(environment = {}) {
  const url = String(environment.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const publicKey = String(environment.SUPABASE_PUBLIC_KEY || environment.SUPABASE_ANON_KEY || "").trim();
  const userDataTable = String(environment.SUPABASE_USER_DATA_TABLE || "user_app_data").trim();
  const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);
  const keyLooksSecret = /^sb_secret_/i.test(publicKey);
  const enabled = validUrl && publicKey.length >= 20 && !keyLooksSecret;
  return {
    enabled,
    url: enabled ? url : "",
    publicKey: enabled ? publicKey : "",
    userDataTable: enabled ? userDataTable : "user_app_data",
    provider: "google"
  };
}
