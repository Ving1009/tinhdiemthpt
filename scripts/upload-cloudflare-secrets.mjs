import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const source = parse(await readFile(join(root, ".env"), "utf8"));
const targetKeys = {
  "wrangler.ocr.jsonc": [
    "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
    "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_MODEL",
    "OCR_SPACE_API_KEY", "OCR_SPACE_API_KEYS", "OCR_SPACE_API_KEY_1", "OCR_SPACE_API_KEY_2",
    "OCR_SPACE_API_KEY_3", "OCR_SPACE_API_KEY_4", "OCR_SPACE_API_KEY_5",
    "OCR_SPACE_ENDPOINT", "OCR_SPACE_ENGINE", "OCR_SPACE_MAX_IMAGE_BYTES", "OCR_SPACE_TIMEOUT_MS"
  ],
  "wrangler.jsonc": [
    "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_REPORTS_TABLE", "SUPABASE_TIMEOUT_MS",
    "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_ALLOWED_HOSTNAMES",
    "GROQ_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY_1", "GROQ_API_KEY_2", "GROQ_API_KEY_3",
    "GROQ_API_KEY_4", "GROQ_API_KEY_5", "GROQ_MODEL", "GROQ_TIMEOUT_MS",
    "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID_1", "CLOUDFLARE_ACCOUNT_ID_2", "CLOUDFLARE_ACCOUNT_ID_3", "CLOUDFLARE_ACCOUNT_ID_4", "CLOUDFLARE_ACCOUNT_ID_5",
    "CLOUDFLARE_WORKERS_AI_API_KEY", "CLOUDFLARE_WORKERS_AI_API_KEYS", "CLOUDFLARE_WORKERS_AI_API_KEY_1", "CLOUDFLARE_WORKERS_AI_API_KEY_2", "CLOUDFLARE_WORKERS_AI_API_KEY_3", "CLOUDFLARE_WORKERS_AI_API_KEY_4", "CLOUDFLARE_WORKERS_AI_API_KEY_5",
    "CloudFlare_Workers_Ai_API_1", "CloudFlare_Workers_Ai_API_2", "CloudFlare_Workers_Ai_API_3", "CloudFlare_Workers_Ai_API_4", "CloudFlare_Workers_Ai_API_5", "CLOUDFLARE_AI_MODEL", "CLOUDFLARE_AI_TIMEOUT_MS",
    "MISTRAL_API_KEY", "MISTRAL_API_KEYS", "MISTRAL_API_KEY_1", "MISTRAL_API_KEY_2", "MISTRAL_API_KEY_3", "MISTRAL_API_KEY_4", "MISTRAL_API_KEY_5",
    "Mistral_API_1", "Mistral_API_2", "Mistral_API_3", "Mistral_API_4", "Mistral_API_5", "MISTRAL_MODEL", "MISTRAL_TIMEOUT_MS",
    "OPENROUTER_API_KEY", "OPENROUTER_API_KEYS", "OPENROUTER_API_KEY_1", "OPENROUTER_API_KEY_2", "OPENROUTER_API_KEY_3", "OPENROUTER_API_KEY_4", "OPENROUTER_API_KEY_5",
    "OpenRouter_Free_API_1", "OpenRouter_Free_API_2", "OpenRouter_Free_API_3", "OpenRouter_Free_API_4", "OpenRouter_Free_API_5", "OPENROUTER_MODEL", "OPENROUTER_TIMEOUT_MS"
  ]
};
const wrangler = require.resolve("wrangler");

function select(keys) {
  return Object.fromEntries(keys.filter((key) => String(source[key] || "").trim()).map((key) => [key, source[key]]));
}

function upload(config, values) {
  return new Promise((resolve, reject) => {
    if (!Object.keys(values).length) return reject(new Error("Không có biến phù hợp cho " + config + " trong .env."));
    const child = spawn(process.execPath, [wrangler, "secret", "bulk", "--config", config], { cwd: root, stdio: ["pipe", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Wrangler kết thúc với mã " + code + ".")));
    child.stdin.end(JSON.stringify(values));
  });
}

for (const [config, keys] of Object.entries(targetKeys)) {
  const values = select(keys);
  console.info("Đang cập nhật " + Object.keys(values).length + " biến bí mật cho " + config + "...");
  await upload(config, values);
}
console.info("Đã cập nhật secrets Cloudflare; không có giá trị nào được in ra terminal.");
