import { Buffer } from "node:buffer";
import { AppError } from "../server/errors.js";
import { errorResponse, failure, json, optionsResponse } from "./http.js";

export const MAX_IMAGES = 12;
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function hasMagicBytes(buffer, type) {
  if (type === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (type === "image/png") return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === "image/webp") return buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

export async function handleOcrRequest(request, scanTranscript) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (request.method !== "POST") return failure(request, "API_NOT_FOUND", "Không tìm thấy API.", 404);
  try {
    const form = await request.formData();
    const files = form.getAll("images[]").filter((file) => file && typeof file.arrayBuffer === "function");
    if (!files.length) throw new AppError("Hãy chọn ít nhất một ảnh học bạ.", { statusCode: 400, code: "MISSING_IMAGES" });
    if (files.length > MAX_IMAGES) throw new AppError(`Chỉ được tải tối đa ${MAX_IMAGES} ảnh.`, { statusCode: 400, code: "LIMIT_FILE_COUNT" });
    if (files.some((file) => !ALLOWED_MIME_TYPES.has(file.type))) {
      throw new AppError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.", { statusCode: 400, code: "UNSUPPORTED_IMAGE" });
    }
    if (files.some((file) => file.size > MAX_IMAGE_BYTES)) {
      throw new AppError("Mỗi ảnh tối đa 7 MB.", { statusCode: 413, code: "LIMIT_FILE_SIZE" });
    }
    if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
      throw new AppError("Tổng dung lượng ảnh vượt quá giới hạn 24 MB.", { statusCode: 413, code: "IMAGES_TOO_LARGE" });
    }
    const images = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (!hasMagicBytes(buffer, file.type)) {
        throw new AppError("Có ảnh không hợp lệ. Hãy chọn đúng ảnh JPG, PNG hoặc WEBP.", { statusCode: 400, code: "INVALID_IMAGE" });
      }
      images.push({ buffer, size: buffer.length, mimetype: file.type, originalname: file.name || "hoc-ba" });
    }
    const result = await scanTranscript(images);
    return json(request, {
      success: true,
      data: result.data,
      warnings: result.warnings || [],
      engine: result.engine || "configured"
    });
  } catch (error) {
    return errorResponse(request, error);
  }
}
