export const TRANSCRIPT_IMAGE_MAX_DIMENSION = 2000;
export const TRANSCRIPT_IMAGE_QUALITY = 0.86;

export function fitImageDimensions(width, height, maxDimension = TRANSCRIPT_IMAGE_MAX_DIMENSION) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(1, maxDimension / Math.max(safeWidth, safeHeight));
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

async function decodeImage(file, {
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
    throw new Error("Không thể giải mã ảnh trên trình duyệt này.");
  }
  return decodeWithImageElement(file, { ImageCtor, urlApi });
}

function canvasBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === "function") return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Không thể tạo ảnh đã tối ưu.")),
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
  decoder = decodeImage,
  canvasFactory = () => document.createElement("canvas")
} = {}) {
  let decoded;
  let canvas;
  try {
    decoded = await decoder(file);
    const dimensions = fitImageDimensions(decoded.width, decoded.height, maxDimension);
    canvas = canvasFactory(dimensions.width, dimensions.height);
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Không thể xử lý ảnh trên thiết bị này.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, dimensions.width, dimensions.height);
    context.drawImage(decoded.source, 0, 0, dimensions.width, dimensions.height);
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

export async function optimizeTranscriptImagesSequentially(files, {
  optimize = optimizeTranscriptImage,
  onProgress = () => {}
} = {}) {
  const optimized = [];
  for (let index = 0; index < files.length; index += 1) {
    onProgress(index, files.length);
    optimized.push(await optimize(files[index]));
  }
  return optimized;
}
