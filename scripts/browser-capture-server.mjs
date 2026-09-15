import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = join(root, "data", "ts247-live-2026.json");
const port = 4179;

const page = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Nhập dữ liệu TuyểnSinh247</title>
<style>body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 20px}textarea{width:100%;height:240px}button{padding:12px 20px}</style>
<h1>Nhập dữ liệu TuyểnSinh247 2026</h1><form id="capture"><textarea id="payload" aria-label="Dữ liệu"></textarea><button type="submit">Lưu dữ liệu</button></form><p id="status"></p>
<script>document.querySelector('#capture').addEventListener('submit',async(event)=>{event.preventDefault();const status=document.querySelector('#status');status.textContent='Đang lưu…';const response=await fetch('/import',{method:'POST',headers:{'content-type':'application/json'},body:document.querySelector('#payload').value});status.textContent=response.ok?'Đã lưu dữ liệu thành công.':'Lưu dữ liệu thất bại.';});</script></html>`;

const server = createServer((request, response) => {
  if (request.method === "GET") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page);
    return;
  }
  if (request.method === "POST" && request.url === "/import") {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000_000) request.destroy();
    });
    request.on("end", async () => {
      try {
        const parsed = JSON.parse(body);
        if (parsed?.source !== "TuyểnSinh247" || !Array.isArray(parsed.pages)) throw new Error("Dữ liệu không đúng định dạng");
        await writeFile(outputFile, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
        response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        response.end("OK");
        console.log(`SAVED ${outputFile} (${parsed.pages.length} pages)`);
      } catch (error) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end(error.message);
      }
    });
    return;
  }
  response.writeHead(404).end();
});

server.listen(port, "127.0.0.1", () => console.log(`READY http://127.0.0.1:${port}`));
