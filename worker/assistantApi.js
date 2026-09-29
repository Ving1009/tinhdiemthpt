import { createConfiguredAdmissionsAssistant } from "../server/configuredAssistant.js";
import { errorResponse, failure, optionsResponse, success } from "./http.js";
import { jsonBody } from "./dataApi.js";

export async function handleAssistantApi(request, environment, assistant) {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (request.method !== "POST") return failure(request, "METHOD_NOT_ALLOWED", "Phương thức không được hỗ trợ.", 405, { Allow: "POST, OPTIONS" });
  try {
    const ask = assistant || createConfiguredAdmissionsAssistant(environment);
    const result = await ask(await jsonBody(request, 32 * 1024));
    return success(request, result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof Response) {
      if (error.status === 413) return failure(request, "REQUEST_TOO_LARGE", "Nội dung trò chuyện quá lớn.", 413);
      if (error.status === 400) return failure(request, "INVALID_JSON", "Dữ liệu JSON không hợp lệ.", 400);
    }
    return errorResponse(request, error);
  }
}
