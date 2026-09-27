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
    answers: {},
    flagged: []
  };
}

export function gradePracticeExam(exam, answers = {}) {
  const questions = Array.isArray(exam?.questions) ? exam.questions : [];
  const pointsPerQuestion = questions.length ? 10 / questions.length : 0;
  let correctCount = 0;
  let answeredCount = 0;
  const details = questions.map((question) => {
    const selected = Number.isInteger(answers[question.id]) ? answers[question.id] : null;
    const correct = selected === question.answer;
    if (selected !== null) answeredCount += 1;
    if (correct) correctCount += 1;
    return {
      questionId: question.id,
      selected,
      correct,
      correctAnswer: question.answer,
      points: correct ? pointsPerQuestion : 0
    };
  });
  return {
    score: Number((correctCount * pointsPerQuestion).toFixed(2)),
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
