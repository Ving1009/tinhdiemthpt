export const TRANSCRIPT_IMAGE_MAX_DIMENSION = 1600;
export const TRANSCRIPT_IMAGE_QUALITY = 0.8;

export function fitImageDimensions(width, height, maxDimension = TRANSCRIPT_IMAGE_MAX_DIMENSION, allowUpscale = false) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const scale = allowUpscale ? maxDimension / Math.max(safeWidth, safeHeight) : Math.min(1, maxDimension / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale))
  };
}

function waitForImage(image) {
  if (typeof image.decode === "function") return image.decode();
  return new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", reject, { once: true });
  });
}

async function decodeWithImageElement(file, { ImageCtor, urlApi }) {
  const objectUrl = urlApi.createObjectURL(file);
  const image = new ImageCtor();
  image.decoding = "async";
  image.style.imageOrientation = "from-image";
  image.src = objectUrl;
  try {
    await waitForImage(image);
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      close: () => urlApi.revokeObjectURL(objectUrl)
    };
  } catch (error) {
    urlApi.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function decodeTranscriptImage(file, {
  createImageBitmapImpl = globalThis.createImageBitmap,
  ImageCtor = globalThis.Image,
  urlApi = globalThis.URL
} = {}) {
  if (typeof createImageBitmapImpl === "function") {
    try {
      const bitmap = await createImageBitmapImpl(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch {
      // Một số bản Safari không hỗ trợ tùy chọn imageOrientation; thẻ img vẫn đọc EXIF đúng hướng.
    }
  }
  if (typeof ImageCtor !== "function" || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL) {
    throw new Error("Trình duyệt này không đọc được ảnh. Bạn hãy thử trình duyệt khác.");
  }
  return decodeWithImageElement(file, { ImageCtor, urlApi });
}

function canvasBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === "function") return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Không tạo được ảnh sau khi xử lý. Bạn hãy thử lại.")),
    type,
    quality
  ));
}

function optimizedName(name) {
  const base = String(name || "hoc-ba").replace(/\.[^.]+$/, "").slice(0, 120) || "hoc-ba";
  return `${base}.jpg`;
}

export async function optimizeTranscriptImage(file, {
  maxDimension = TRANSCRIPT_IMAGE_MAX_DIMENSION,
  quality = TRANSCRIPT_IMAGE_QUALITY,
  allowUpscale = false,
  threshold = null,
  decoder = decodeTranscriptImage,
  canvasFactory = () => document.createElement("canvas")
} = {}) {
  let decoded;
  let canvas;
  try {
    decoded = await decoder(file);
    const dimensions = fitImageDimensions(decoded.width, decoded.height, maxDimension, allowUpscale);
    canvas = canvasFactory(dimensions.width, dimensions.height);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Không thể xử lý ảnh trên thiết bị này.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, dimensions.width, dimensions.height);
    context.drawImage(decoded.source, 0, 0, dimensions.width, dimensions.height);
    if (Number.isFinite(threshold)) {
      const pixels = context.getImageData(0, 0, dimensions.width, dimensions.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const lightness = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
        pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = lightness >= threshold ? 255 : 0;
      }
      context.putImageData(pixels, 0, 0);
    }
    const blob = await canvasBlob(canvas, "image/jpeg", quality);
    return {
      blob,
      uploadName: optimizedName(file.name),
      originalName: String(file.name || "hoc-ba.jpg"),
      width: dimensions.width,
      height: dimensions.height
    };
  } finally {
    try { decoded?.close?.(); } catch { /* Ảnh đã được giải phóng. */ }
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}

export async function prepareTranscriptCell(decoded, rectangle, referenceWidth, {
  zoom = 1,
  binarize = true,
  canvasFactory = () => document.createElement("canvas")
} = {}) {
  if (![decoded?.width, decoded?.height, referenceWidth, rectangle?.left, rectangle?.top, rectangle?.width, rectangle?.height].every(Number.isFinite)
    || referenceWidth <= 0 || rectangle.width <= 0 || rectangle.height <= 0) return null;
  const sourceScale = decoded.width / referenceWidth;
  const left = Math.max(0, rectangle.left * sourceScale), top = Math.max(0, rectangle.top * sourceScale);
  const width = Math.min(rectangle.width * sourceScale, decoded.width - left);
  const height = Math.min(rectangle.height * sourceScale, decoded.height - top);
  if (width <= 0 || height <= 0) return null;
  const scale = Number.isFinite(zoom) ? Math.min(2, Math.max(1, zoom)) : 1;
  // Preserve label strokes with one resize; numbers are enlarged after binarization to retain decimal dots.
  const drawScale = binarize ? 1 : scale;
  const cellWidth = Math.ceil(Math.min(512, rectangle.width * 2) * drawScale), cellHeight = Math.ceil(Math.min(256, rectangle.height * 2) * drawScale);
  const padding = Math.ceil(16 * drawScale);
  let canvas, enlarged;
  try {
    canvas = canvasFactory();
    canvas.width = cellWidth + padding * 2; canvas.height = cellHeight + padding * 2;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.source, left, top, width, height, padding, padding, cellWidth, cellHeight);
    if (binarize) {
      const pixels = context.getImageData(padding, padding, cellWidth, cellHeight);
      const histogram = new Uint32Array(256);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const gray = Math.round(pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114);
        pixels.data[index] = gray; histogram[gray] += 1;
      }
      const percentile = (fraction) => {
        const target = pixels.data.length / 4 * fraction;
        let count = 0;
        for (let value = 0; value < histogram.length; value += 1) {
          count += histogram[value];
          if (count >= target) return value;
        }
        return 255;
      };
      const low = percentile(0.02), high = percentile(0.7);
      // A uniform blank cell must stay blank rather than become a black OCR image.
      if (high - low < 20) return null;
      for (let index = 0; index < pixels.data.length; index += 4) {
        const value = (pixels.data[index] - low) * 255 / (high - low) > 150 ? 255 : 0;
        pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
      }
      context.putImageData(pixels, padding, padding);
    }
    if (!binarize || scale === 1) return await canvasBlob(canvas, "image/png");
    enlarged = canvasFactory();
    enlarged.width = Math.ceil(canvas.width * scale); enlarged.height = Math.ceil(canvas.height * scale);
    const enlargedContext = enlarged.getContext("2d", { alpha: false });
    if (!enlargedContext) return null;
    enlargedContext.drawImage(canvas, 0, 0, enlarged.width, enlarged.height);
    return await canvasBlob(enlarged, "image/png");
  } finally {
    for (const image of [canvas, enlarged]) if (image) { image.width = 1; image.height = 1; }
  }
}

export async function cropTranscriptRectangle(decoded, rectangle, { margin = 128, canvasFactory = () => document.createElement("canvas") } = {}) {
  if (![decoded?.width, decoded?.height, rectangle?.left, rectangle?.top, rectangle?.width, rectangle?.height].every(Number.isFinite)) return null;
  const targetLeft = Math.max(0, Math.floor(rectangle.left)), targetTop = Math.max(0, Math.floor(rectangle.top));
  const targetWidth = Math.min(Math.floor(rectangle.width), decoded.width - targetLeft), targetHeight = Math.min(Math.floor(rectangle.height), decoded.height - targetTop);
  if (targetWidth <= 0 || targetHeight <= 0) return null;
  const padding = Number.isFinite(margin) ? Math.min(256, Math.max(0, Math.floor(margin))) : 128;
  const left = Math.max(0, targetLeft - padding), top = Math.max(0, targetTop - padding);
  const width = Math.min(decoded.width - left, targetLeft + targetWidth + padding - left);
  const height = Math.min(decoded.height - top, targetTop + targetHeight + padding - top);
  let canvas;
  try {
    canvas = canvasFactory(); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    // Keep nearby pixels for Tesseract's thresholding, but recognize only the original cell rectangle.
    context.drawImage(decoded.source, left, top, width, height, 0, 0, width, height);
    return { blob: await canvasBlob(canvas, "image/png"), width, height,
      rectangle: { left: targetLeft - left, top: targetTop - top, width: targetWidth, height: targetHeight } };
  } finally { if (canvas) { canvas.width = 1; canvas.height = 1; } }
}

export async function optimizeTranscriptImagesSequentially(files, {
  optimize = optimizeTranscriptImage,
  onProgress = () => {},
  signal
} = {}) {
  const optimized = [];
  const checkAbort = () => { if (signal?.aborted) throw new DOMException("Đã dừng xử lý ảnh.", "AbortError"); };
  try {
    for (let index = 0; index < files.length; index += 1) {
      checkAbort();
      onProgress(index, files.length);
      optimized.push(await optimize(files[index]));
      checkAbort();
    }
    return optimized;
  } catch (error) {
    for (const image of optimized) image.blob = null;
    throw error;
  }
}
