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

test("HTML có tìm kiếm mobile, chọn năm 2027 và giữ nhãn dữ liệu tham khảo 2026", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  assert.match(html, /id="mobile-search"/);
  assert.match(html, /value="2027" selected>2027/);
  assert.doesNotMatch(html, /value="2027" disabled/);
  assert.match(html, /Dữ liệu tuyển sinh 2027 đang cập nhật/);
  assert.match(html, /điểm chuẩn năm 2026 để tham khảo cho tuyển sinh 2027/);
  assert.match(html, /Luyện thi THPT 2027/);
  assert.match(html, /18 môn và ngoại ngữ, mỗi môn một đề luyện ngắn/);
  assert.match(html, /Các bộ đề do người dùng cung cấp tạm ngừng công bố để xác minh quyền sử dụng/);
  assert.match(html, /không mô phỏng đầy đủ cấu trúc hay độ khó của đề chính thức/);
  assert.match(html, /<h3>Quét học bạ \(không bắt buộc\)<\/h3>/);
  assert.doesNotMatch(html, /AI \+ OCR|Độ tin cậy|id="certificate"|Quy đổi chứng chỉ theo trường|id="formulas"|Mục 8/i);
  assert.equal((html.match(/id="export-wishes-pdf"/g) || []).length, 1);
  assert.match(html, /id="transcript-consent"/);
  assert.match(html, /id="transcript-fallback-dialog"/);
  assert.match(html, /Chính sách quyền riêng tư/);
  assert.equal((html.match(/class="reference-warning/g) || []).length, 3);
  assert.match(html, /<title>Tính Điểm THPT \| Tra cứu tuyển sinh 2027<\/title>/);
  assert.match(html, /<meta property="og:title" content="Tính Điểm THPT \| Tra cứu tuyển sinh 2027"/);
  assert.match(html, /<meta name="twitter:title" content="Tính Điểm THPT \| Tra cứu tuyển sinh 2027"/);
  assert.doesNotMatch(html, /transcript-api-base|26\.75|● Đã tính/);
  assert.match(html, /Ví dụ minh họa/);
  assert.match(html, /<strong>26\.40<\/strong>/);
  assert.match(html, /<b>\+ 0\.40<\/b>/);
});

test("frontend dùng API và không import private dataset", async () => {
  const repository = await readFile(new URL("js/university.js", publicRoot), "utf8");
  assert.match(repository, /\/api\/universities/);
  assert.match(repository, /majorCache = new Map/);
  assert.doesNotMatch(repository, /majors\.json|\.\.\/data\//);
});

test("frontend không chặn app vì auth và dùng thông báo AI trung tính", async () => {
  const main = await readFile(new URL("js/main.js", publicRoot), "utf8");
  const assistant = await readFile(new URL("js/assistant.js", publicRoot), "utf8");
  assert.doesNotMatch(main, /await\s+this\.account\.init\(\)/);
  assert.match(main, /this\.account\.init\(\)\.catch/);
  assert.doesNotMatch(assistant, /Groq tạm thời chưa phản hồi/);
  assert.match(assistant, /Trợ lý AI tạm thời chưa phản hồi/);
});

test("các hồi quy giao diện chính được khóa trong source", async () => {
  const [main, css, utils] = await Promise.all([
    readFile(new URL("js/main.js", publicRoot), "utf8"),
    readFile(new URL("css/refinement.css", publicRoot), "utf8"),
    readFile(new URL("js/utils.js", publicRoot), "utf8")
  ]);
  assert.match(main, /major-filter-form"\)\.addEventListener\("submit"[\s\S]{0,180}invalidateMajorResults\.cancel\(\)/);
  assert.match(main, /aria-describedby="auto-error-\$\{index\}"/);
  assert.match(main, /input\.setAttribute\("aria-invalid"/);
  assert.match(main, /validateScore\(input\.value, required\)/);
  for (const message of ["Vui lòng nhập điểm.", "Điểm phải là số.", "Điểm phải nằm trong khoảng 0 đến 10.", "Dùng tối đa 2 chữ số thập phân."]) assert.match(utils, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(css, /#score-form \.candidate-card\s*\{[^}]*order\s*:\s*2/);
});
