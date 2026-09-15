import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const publicRoot = new URL("../public/", import.meta.url);

async function textFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "assets") continue;
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...await textFiles(url));
    else if (/\.(?:html|js|css|json)$/i.test(entry.name)) files.push(url);
  }
  return files;
}

test("public source không chứa wording hay website thu thập dữ liệu", async () => {
  const files = await textFiles(publicRoot);
  const content = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  for (const forbidden of [
    "Nguồn ngành", "Nguồn công thức", "Nguồn phương thức", "Nguồn đã dùng", "Nguồn tham khảo ↗",
    "TuyểnSinh247", "diemthi.tuyensinh247.com", "diemthi.vnexpress.net", "GEMINI_API_KEY", "../data/"
  ]) assert.equal(content.toLocaleLowerCase("vi").includes(forbidden.toLocaleLowerCase("vi")), false, `không được public: ${forbidden}`);
});

test("HTML có tìm kiếm mobile và không cho dùng công thức 2026 cho năm 2027", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  assert.match(html, /id="mobile-search"/);
  assert.match(html, /value="2027" disabled/);
  assert.match(html, /Tesseract OCR cục bộ/);
});

test("frontend dùng API và không import private dataset", async () => {
  const repository = await readFile(new URL("js/university.js", publicRoot), "utf8");
  assert.match(repository, /\/api\/universities/);
  assert.match(repository, /majorCache = new Map/);
  assert.doesNotMatch(repository, /majors\.json|\.\.\/data\//);
});
