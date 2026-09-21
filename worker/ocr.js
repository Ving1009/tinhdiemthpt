import transcriptSubjectCatalog from "../data/transcript-subjects.json";
import { createConfiguredScanProviders } from "../server/configuredScanProviders.js";
import { createTranscriptScanService } from "../server/services/transcriptScanService.js";
import { configureTranscriptSubjectCatalog } from "../server/validators/transcriptValidator.js";
import { handleOcrRequest } from "./ocrHandler.js";

configureTranscriptSubjectCatalog(transcriptSubjectCatalog);
let scanner;

export default {
  fetch(request, environment) {
    scanner ||= createTranscriptScanService(createConfiguredScanProviders(environment));
    return handleOcrRequest(request, scanner);
  }
};
