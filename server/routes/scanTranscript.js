import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { AppError } from "../errors.js";
import { turnstileTokenFromHeaders, verifyTurnstile } from "../services/turnstile.js";

export const MAX_IMAGES = 12;
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isRealImage(file) {
  const { buffer, mimetype } = file;
  if (mimetype === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === "image/png") return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimetype === "image/webp") return buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_IMAGES, fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_request, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new AppError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.", { statusCode: 400, code: "UNSUPPORTED_IMAGE" }));
      return;
    }
    callback(null, true);
  }
});

export function createScanTranscriptRouter({ scanTranscript, environment = process.env }) {
  const router = Router();
  router.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 12,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ success: false, error: { code: "RATE_LIMITED", message: "Bạn đã gửi nhiều yêu cầu. Hãy thử lại sau ít phút." } })
  }));
  router.post("/scan-transcript", async (request, _response, next) => {
    try {
      await verifyTurnstile({
        environment,
        token: turnstileTokenFromHeaders(request.headers),
        action: "scan_transcript",
        remoteIp: request.ip,
        requestHostname: request.hostname
      });
      next();
    } catch (error) {
      next(error);
    }
  }, upload.array("images[]", MAX_IMAGES), async (request, response, next) => {
    try {
      const images = request.files || [];
      if (!images.length) throw new AppError("Hãy chọn ít nhất một ảnh học bạ.", { statusCode: 400, code: "MISSING_IMAGES" });
      if (images.reduce((total, image) => total + image.size, 0) > MAX_TOTAL_BYTES) throw new AppError("Tổng dung lượng ảnh vượt quá giới hạn 24 MB.", { statusCode: 413, code: "IMAGES_TOO_LARGE" });
      if (!images.every(isRealImage)) throw new AppError("Có ảnh không hợp lệ. Hãy chọn đúng ảnh JPG, PNG hoặc WEBP.", { statusCode: 400, code: "INVALID_IMAGE" });
      const result = await scanTranscript(images);
      response.json({ success: true, data: result.data, warnings: result.warnings, engine: result.engine || "configured" });
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export function isUploadError(error) {
  return error instanceof multer.MulterError;
}
