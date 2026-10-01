import { AppError } from "../server/errors.js";

function tooLarge() {
  return new AppError("Dữ liệu gửi lên quá lớn.", { statusCode: 413, code: "REQUEST_TOO_LARGE" });
}

export async function readLimitedBody(request, maximumBytes) {
  if (Number(request.headers.get("Content-Length") || 0) > maximumBytes) {
    await request.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  let buffer = new Uint8Array();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const nextSize = size + value.byteLength;
      if (nextSize > maximumBytes) {
        await reader.cancel().catch(() => {});
        throw tooLarge();
      }
      if (nextSize > buffer.byteLength) {
        const expanded = new Uint8Array(Math.min(maximumBytes, Math.max(nextSize, buffer.byteLength * 2, 1024)));
        expanded.set(buffer);
        buffer = expanded;
      }
      buffer.set(value, size);
      size = nextSize;
    }
    return buffer.subarray(0, size);
  } finally {
    reader.releaseLock();
  }
}

export async function readJsonObject(request, maximumBytes, { allowEmpty = false } = {}) {
  const bytes = await readLimitedBody(request, maximumBytes);
  try {
    const source = new TextDecoder().decode(bytes);
    const body = JSON.parse(allowEmpty && !source ? "{}" : source);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new AppError("Dữ liệu JSON không hợp lệ.", { statusCode: 400, code: "INVALID_JSON" });
  }
}
