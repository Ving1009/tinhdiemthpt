export function formatExamTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0
    ? [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":")
    : [minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
}

export function remainingExamSeconds(attempt, now = Date.now()) {
  return Math.max(0, Math.ceil((Number(attempt?.endsAt) - Number(now)) / 1000) || 0);
}

export function createPracticeAttempt(exam, now = Date.now()) {
  const durationMinutes = Math.max(1, Number(exam?.durationMinutes) || 1);
  return {
    id: `${exam.id}-${now}`,
    examId: exam.id,
    startedAt: now,
    endsAt: now + durationMinutes * 60_000,
    branch: Array.isArray(exam?.answerBranches) ? exam.answerBranches[0] || null : null,
    answers: {},
    flagged: []
  };
}

export function isPracticeQuestionAnswered(question, value) {
  if (question?.type === "true-false") {
    return Array.isArray(value) && value.some((item) => typeof item === "boolean");
  }
  if (question?.type === "short") return String(value ?? "").trim().length > 0;
  return Number.isInteger(value);
}

function normalizeShortAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("vi")
    .replace(/\s+/g, "")
    .replaceAll(",", ".");
}

function shortAnswerMatches(selected, expected) {
  const normalizedSelected = normalizeShortAnswer(selected);
  const normalizedExpected = normalizeShortAnswer(expected);
  if (!normalizedSelected) return false;
  if (normalizedSelected === normalizedExpected) return true;
  const selectedNumber = normalizedSelected.match(/^-?\d+(?:\.\d+)?$/)?.[0];
  const expectedNumber = normalizedExpected.match(/^-?\d+(?:\.\d+)?/)?.[0];
  return selectedNumber !== undefined
    && expectedNumber !== undefined
    && Math.abs(Number(selectedNumber) - Number(expectedNumber)) < 1e-9;
}

function trueFalsePoints(question, selected) {
  const answers = Array.isArray(selected) ? selected : [];
  const correctItems = question.answer.reduce(
    (total, expected, index) => total + (answers[index] === expected ? 1 : 0),
    0
  );
  const officialScale = [0, 0.1, 0.25, 0.5, 1];
  return {
    correctItems,
    earned: officialScale[correctItems] * Number(question.points || 1)
  };
}

export function gradePracticeExam(exam, answers = {}) {
  const questions = Array.isArray(exam?.questions) ? exam.questions : [];
  const usesWeightedScoring = questions.length > 0 && questions.every((question) => Number.isFinite(Number(question.points)));
  const maximumPoints = usesWeightedScoring
    ? questions.reduce((total, question) => total + Number(question.points), 0)
    : 10;
  const pointsPerQuestion = questions.length ? maximumPoints / questions.length : 0;
  let correctCount = 0;
  let answeredCount = 0;
  let earnedPoints = 0;
  const details = questions.map((question) => {
    const rawSelected = answers[question.id];
    const selected = question.type === "true-false"
      ? (Array.isArray(rawSelected) ? rawSelected.map((value) => typeof value === "boolean" ? value : null) : [null, null, null, null])
      : question.type === "short"
        ? String(rawSelected ?? "")
        : (Number.isInteger(rawSelected) ? rawSelected : null);
    const answered = isPracticeQuestionAnswered(question, selected);
    let correct = false;
    let awarded = 0;
    let correctItems;
    if (question.type === "true-false") {
      const tfResult = trueFalsePoints(question, selected);
      correctItems = tfResult.correctItems;
      correct = tfResult.correctItems === question.answer.length;
      awarded = tfResult.earned;
    } else if (question.type === "short") {
      correct = shortAnswerMatches(selected, question.answerText);
      awarded = correct ? Number(question.points || pointsPerQuestion) : 0;
    } else {
      correct = selected === question.answer;
      awarded = correct ? Number(question.points || pointsPerQuestion) : 0;
    }
    if (answered) answeredCount += 1;
    if (correct) correctCount += 1;
    earnedPoints += awarded;
    return {
      questionId: question.id,
      selected,
      correct,
      correctItems,
      correctAnswer: question.type === "short" ? question.answerText : question.answer,
      points: Number(awarded.toFixed(2)),
      maximumPoints: Number(question.points || pointsPerQuestion)
    };
  });
  return {
    score: Number((maximumPoints ? earnedPoints / maximumPoints * 10 : 0).toFixed(2)),
    correctCount,
    answeredCount,
    unansweredCount: questions.length - answeredCount,
    totalQuestions: questions.length,
    details
  };
}

export function normalizePracticeHistory(value, limit = 30) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.examId === "string" && Number.isFinite(Number(item.submittedAt)))
    .sort((a, b) => Number(b.submittedAt) - Number(a.submittedAt))
    .slice(0, limit);
}
