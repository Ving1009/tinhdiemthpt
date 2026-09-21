import { readFile } from "node:fs/promises";
import { AppError } from "../errors.js";
import {
  normalizeTranscriptText,
  TranscriptPayloadError,
  validateTranscriptPayload as validateTranscriptPayloadCore
} from "../../public/js/core/transcriptValidator.js";

let subjectCatalogPromise;

export const normalizeText = normalizeTranscriptText;

export function configureTranscriptSubjectCatalog(catalog) {
  if (!Array.isArray(catalog?.subjects) || catalog.subjects.length === 0) {
    throw new AppError("Không tải được danh mục môn học.");
  }
  subjectCatalogPromise = Promise.resolve(catalog);
}

export async function loadTranscriptSubjectCatalog() {
  subjectCatalogPromise ||= readFile(new URL("../../data/transcript-subjects.json", import.meta.url), "utf8").then((content) => {
    const catalog = JSON.parse(content);
    if (!Array.isArray(catalog.subjects) || catalog.subjects.length === 0) throw new AppError("Không tải được danh mục môn học.");
    return catalog;
  });
  return subjectCatalogPromise;
}

export function validateTranscriptPayload(payload, catalog) {
  try {
    return validateTranscriptPayloadCore(payload, catalog);
  } catch (error) {
    if (error instanceof TranscriptPayloadError) {
      throw new AppError(error.message, { statusCode: error.statusCode, code: error.code });
    }
    throw error;
  }
}
