import transcriptSubjectCatalog from "../data/transcript-subjects.json";
import { createConfiguredScanProviders } from "../server/configuredScanProviders.js";
import { createTranscriptScanService } from "../server/services/transcriptScanService.js";
import { configureTranscriptSubjectCatalog } from "../server/validators/transcriptValidator.js";
import { handleOcrRequest } from "./ocrHandler.js";

configureTranscriptSubjectCatalog(transcriptSubjectCatalog);
let scanner;

export default {
  fetch(request, environment) {
    scanner ||= createTranscriptScanService(createConfiguredScanProviders(environment, {
      onGeminiError: (failure) => console.warn(JSON.stringify({ event: "gemini_sdk_error", ...failure }))
    }), {
      onProviderError: (failure) => console.warn(JSON.stringify({ event: "transcript_provider_failed", ...failure }))
    });
    return handleOcrRequest(request, scanner);
  }
};
