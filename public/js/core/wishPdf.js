const CANVAS_WIDTH = 1240;
const CANVAS_HEIGHT = 1754;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

function pdfNumber(value, fallback = "Chưa có dữ liệu") {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) : String(value);
}

function safeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function wishPdfFilename(date = new Date()) {
  const value = safeDate(date);
  const stamp = [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
  return `nganh-phu-hop-${stamp}.pdf`;
}

export function createWishPdfModel(wishes, exportedAt = new Date()) {
  const date = safeDate(exportedAt);
  const items = (Array.isArray(wishes) ? wishes : []).map((item, index) => ({
    order: index + 1,
    name: String(item?.name || "Ngành chưa có tên"),
    university: String(item?.university || "Trường chưa có dữ liệu"),
    campus: String(item?.campus || ""),
    code: String(item?.code || "Chưa có dữ liệu"),
    method: String(item?.method || "Chưa có dữ liệu"),
    combination: String(item?.combination || "Chưa có dữ liệu"),
    year: String(item?.year || 2026),
    userScore: pdfNumber(item?.userScore, "Chưa so sánh được"),
    cutoff: pdfNumber(item?.cutoff),
    scale: pdfNumber(item?.scale),
    cutoffStatus: item?.cutoffStatus === "verified" ? "Đã xác minh" : item?.cutoffStatus === "reference" ? "Tham khảo" : "Chưa xác minh",
    comparison: item?.comparisonStatus === "compatible" ? "Có thể đối chiếu" : String(item?.comparisonReason || "Chưa so sánh được")
  }));
  return {
    title: "Ngành phù hợp với điểm",
    subtitle: "Danh sách nguyện vọng đã chọn",
    exportedAt: date.toLocaleDateString("vi-VN"),
    items
  };
}

function asciiBytes(value) { return new TextEncoder().encode(value); }

function joinBytes(chunks, totalLength) {
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

export function buildRasterPdf(jpegPages, { pixelWidth = CANVAS_WIDTH, pixelHeight = CANVAS_HEIGHT } = {}) {
  if (!Array.isArray(jpegPages) || !jpegPages.length) throw new Error("PDF cần ít nhất một trang.");
  const pages = jpegPages.map((bytes) => bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const objectCount = 2 + pages.length * 3;
  const offsets = new Array(objectCount + 1).fill(0);
  const chunks = [];
  let length = 0;
  const append = (bytes) => { chunks.push(bytes); length += bytes.length; };
  const appendText = (value) => append(asciiBytes(value));
  const startObject = (id) => { offsets[id] = length; appendText(`${id} 0 obj\n`); };

  append(asciiBytes("%PDF-1.4\n"));
  append(Uint8Array.from([37, 226, 227, 207, 211, 10]));
  startObject(1); appendText("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  const pageIds = pages.map((_, index) => 3 + index * 3);
  startObject(2); appendText(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>\nendobj\n`);

  pages.forEach((jpeg, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const stream = `q\n${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm\n/Im0 Do\nQ\n`;
    startObject(pageId);
    appendText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
    startObject(contentId); appendText(`<< /Length ${asciiBytes(stream).length} >>\nstream\n${stream}endstream\nendobj\n`);
    startObject(imageId);
    appendText(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    append(jpeg); appendText("\nendstream\nendobj\n");
  });

  const xrefOffset = length;
  appendText(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) appendText(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  appendText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return joinBytes(chunks, length);
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y); context.lineTo(x + width - r, y); context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r); context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height); context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r); context.quadraticCurveTo(x, y, x + r, y); context.closePath();
}

function fitCanvasText(context, value, maxWidth, forceEllipsis = false) {
  const text = String(value || "");
  if (!forceEllipsis && context.measureText(text).width <= maxWidth) return text;
  let fitted = text;
  while (fitted.length && context.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted.trim()}…`;
}

function wrappedCanvasLines(context, value, maxWidth, maxLines = 2) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  let truncated = false;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = line ? `${line} ${word}` : word;
    if (!line || context.measureText(candidate).width <= maxWidth) { line = candidate; continue; }
    lines.push(line); line = word;
    if (lines.length === maxLines - 1) { truncated = index < words.length - 1; break; }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (truncated && lines.length) lines[lines.length - 1] = fitCanvasText(context, lines[lines.length - 1], maxWidth, true);
  return lines.length ? lines : [""];
}

function drawPage(context, model, pageItems, pageNumber, pageCount) {
  const font = '"Be Vietnam Pro", "Noto Sans", Arial, sans-serif';
  context.fillStyle = "#f8fafc"; context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = "#3b49df"; context.fillRect(0, 0, CANVAS_WIDTH, 250);
  context.fillStyle = "#ffffff"; context.font = `700 46px ${font}`; context.fillText(model.title, 84, 96);
  context.font = `500 25px ${font}`; context.fillText(model.subtitle, 84, 142);
  context.fillStyle = "#dbe2ff"; context.font = `400 20px ${font}`;
  context.fillText(`Xuất ngày ${model.exportedAt} · ${model.items.length} nguyện vọng`, 84, 188);

  pageItems.forEach((item, localIndex) => {
    const top = 292 + localIndex * 410;
    context.fillStyle = "#ffffff"; roundedRect(context, 72, top, 1096, 394, 24); context.fill();
    context.strokeStyle = "#e2e8f0"; context.lineWidth = 2; roundedRect(context, 72, top, 1096, 394, 24); context.stroke();
    context.fillStyle = "#eef2ff"; context.beginPath(); context.arc(124, top + 55, 29, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#3b49df"; context.font = `700 22px ${font}`; context.textAlign = "center"; context.fillText(String(item.order), 124, top + 63); context.textAlign = "left";

    context.fillStyle = "#0f172a"; context.font = `700 29px ${font}`;
    wrappedCanvasLines(context, item.name, 925, 2).forEach((line, index) => context.fillText(line, 174, top + 48 + index * 38));
    context.fillStyle = "#475569"; context.font = `500 21px ${font}`;
    context.fillText(fitCanvasText(context, `${item.university}${item.campus ? ` · ${item.campus}` : ""}`, 925), 174, top + 126);

    const cells = [
      [174, "MÃ NGÀNH", item.code, 210],
      [410, "PHƯƠNG THỨC", item.method, 330],
      [770, "TỔ HỢP", item.combination, 175],
      [970, "NĂM", item.year, 140]
    ];
    cells.forEach(([x, label, value, width]) => {
      context.fillStyle = "#64748b"; context.font = `600 15px ${font}`; context.fillText(label, x, top + 192);
      context.fillStyle = "#0f172a"; context.font = `600 20px ${font}`; context.fillText(fitCanvasText(context, value, width), x, top + 224);
    });

    context.fillStyle = "#f1f5f9"; roundedRect(context, 160, top + 255, 950, 106, 15); context.fill();
    const scoreCells = [
      [184, "ĐIỂM CỦA BẠN", item.userScore === "Chưa so sánh được" ? item.userScore : `${item.userScore} / ${item.scale}`, 275, false],
      [512, "ĐIỂM CHUẨN", item.cutoff === "Chưa có dữ liệu" ? item.cutoff : `${item.cutoff} / ${item.scale}`, 270, false],
      [820, "TRẠNG THÁI", `${item.cutoffStatus} · ${item.comparison}`, 270, true]
    ];
    scoreCells.forEach(([x, label, value, width, wrap]) => {
      context.fillStyle = "#64748b"; context.font = `600 14px ${font}`; context.fillText(label, x, top + 284);
      context.fillStyle = "#172554"; context.font = `${wrap ? 600 : 700} ${wrap ? 16 : 19}px ${font}`;
      if (wrap) wrappedCanvasLines(context, value, width, 3).forEach((line, lineIndex) => context.fillText(line, x, top + 310 + lineIndex * 20));
      else context.fillText(fitCanvasText(context, value, width), x, top + 316);
    });
  });

  context.fillStyle = "#64748b"; context.font = `400 18px ${font}`;
  context.fillText("Kết quả chỉ để tham khảo. Hãy kiểm tra thông tin tuyển sinh chính thức của từng trường.", 72, 1682);
  context.textAlign = "right"; context.fillText(`Trang ${pageNumber} / ${pageCount}`, 1168, 1682); context.textAlign = "left";
}

async function canvasJpegBytes(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Trình duyệt không thể tạo trang PDF.");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function createWishPdfBlob(wishes, { exportedAt = new Date(), documentRef = document } = {}) {
  const model = createWishPdfModel(wishes, exportedAt);
  if (!model.items.length) throw new Error("Chưa có nguyện vọng để xuất.");
  try { await documentRef.fonts?.ready; } catch { /* The system font remains a valid Vietnamese fallback. */ }
  const pages = [];
  const pageCount = Math.ceil(model.items.length / 3);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const canvas = documentRef.createElement("canvas");
    canvas.width = CANVAS_WIDTH; canvas.height = CANVAS_HEIGHT;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Trình duyệt không hỗ trợ tạo PDF.");
    drawPage(context, model, model.items.slice(pageIndex * 3, pageIndex * 3 + 3), pageIndex + 1, pageCount);
    pages.push(await canvasJpegBytes(canvas));
    context.clearRect(0, 0, canvas.width, canvas.height); canvas.width = 1; canvas.height = 1;
  }
  return new Blob([buildRasterPdf(pages)], { type: "application/pdf" });
}
