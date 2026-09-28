const LETTERS = ["A", "B", "C", "D"];

function assetPages(slug, kind, count) {
  return Array.from({ length: count }, (_, index) => `assets/practice-2026/${slug}/${kind}/${index + 1}.webp`);
}

function singleChoiceQuestions(examId, answerKey) {
  if (!/^[ABCD]+$/.test(answerKey)) throw new Error(`Đáp án trắc nghiệm không hợp lệ: ${examId}`);
  return [...answerKey].map((letter, index) => ({
    id: `${examId}-mc-${index + 1}`,
    type: "single",
    section: "Phần I",
    number: index + 1,
    prompt: `Câu ${index + 1}`,
    options: LETTERS,
    answer: LETTERS.indexOf(letter),
    points: 0.25,
    explanation: ""
  }));
}

function trueFalseQuestions(examId, answerKeys, startNumber = 0) {
  if (answerKeys.some((key) => !/^[TF]{4}$/.test(key))) throw new Error(`Đáp án đúng/sai không hợp lệ: ${examId}`);
  return answerKeys.map((key, index) => ({
    id: `${examId}-tf-${startNumber + index + 1}`,
    type: "true-false",
    section: "Phần II",
    number: startNumber + index + 1,
    prompt: `Câu ${startNumber + index + 1}`,
    statements: ["a", "b", "c", "d"],
    answer: [...key].map((value) => value === "T"),
    points: 1,
    explanation: ""
  }));
}

function shortAnswerQuestions(examId, answers, points) {
  return answers.map((answer, index) => ({
    id: `${examId}-short-${index + 1}`,
    type: "short",
    section: "Phần III",
    number: index + 1,
    prompt: `Câu ${index + 1}`,
    answerText: String(answer),
    points,
    explanation: ""
  }));
}

function officialExam({
  id, subject, category, icon, code, minutes, slug, pageCount = 4, solutionCount = 0,
  answerCount = 0, mc, tf = [], branchTf = {}, short = [], shortPoints = 0.25, note = "", answerSource = ""
}) {
  const branchEntries = Object.entries(branchTf);
  const branchQuestions = branchEntries.flatMap(([branch, keys], branchIndex) =>
    trueFalseQuestions(`${id}-branch-${branchIndex + 1}`, keys, tf.length).map((question) => ({ ...question, branch }))
  );
  const questions = [
    ...singleChoiceQuestions(id, mc),
    ...trueFalseQuestions(id, tf),
    ...branchQuestions,
    ...shortAnswerQuestions(id, short, shortPoints)
  ];
  const baseQuestions = questions.filter((question) => !question.branch);
  const scoreSets = branchEntries.length
    ? branchEntries.map(([branch]) => [...baseQuestions, ...questions.filter((question) => question.branch === branch)])
    : [questions];
  for (const scoreSet of scoreSets) {
    const maximumScore = scoreSet.reduce((total, question) => total + question.points, 0);
    if (Math.abs(maximumScore - 10) > 0.001) {
      throw new Error(`Thang điểm của ${id} phải bằng 10, hiện là ${maximumScore}`);
    }
  }
  return {
    id,
    subject,
    category,
    icon,
    officialMinutes: minutes,
    durationMinutes: minutes,
    title: `Đề thi chính thức tốt nghiệp THPT 2026 · Mã đề ${code}`,
    examCode: code,
    sourceKind: "official-paper",
    sourceLabel: "Đề thi do người dùng cung cấp",
    answerSource,
    answerBranches: branchEntries.map(([branch]) => branch),
    questionCount: scoreSets[0].length,
    note: `${note}${note ? " " : ""}Đề được hiển thị nguyên trang; phiếu trả lời trực tuyến chấm theo cấu trúc và thang điểm của đề.`,
    pageImages: assetPages(slug, "pages", pageCount),
    answerImages: assetPages(slug, "answers", answerCount),
    solutionImages: assetPages(slug, "solutions", solutionCount),
    questions
  };
}

export const OFFICIAL_PRACTICE_EXAMS_2026 = [
  officialExam({
    id: "math-official-2026-01", subject: "Toán", category: "Bắt buộc", icon: "∑", code: "0101", minutes: 90, slug: "math", solutionCount: 8,
    mc: "ACBDADBABAAA", tf: ["TTFF", "TTTF", "TTFF", "TFTT"], short: ["7,35", "1152", "5,91", "1856", "1275", "1990"], shortPoints: 0.5,
    note: "Tài liệu có hướng dẫn giải tham khảo."
  }),
  officialExam({
    id: "physics-official-2026-0211", subject: "Vật lí", category: "Tự chọn", icon: "⚡", code: "0211", minutes: 50, slug: "physics", solutionCount: 6,
    mc: "DCCDAADBBCADCCDABA", tf: ["TTFT", "TTFF", "FFFT", "TFFT"], short: ["2,52 mA", "0,16 mW", "11,6%", "10,4%", "0,11 kJ", "6,19"],
    note: "Tài liệu có lời giải chi tiết."
  }),
  officialExam({
    id: "chemistry-official-2026-0344", subject: "Hóa học", category: "Tự chọn", icon: "⚗", code: "0344", minutes: 50, slug: "chemistry", solutionCount: 8,
    mc: "AAADDCDDCAACCDADCA", tf: ["FFTT", "TTFF", "TFTT", "FFFT"], short: ["3412", "42,9", "1256", "17,2", "0,64", "4,95"],
    note: "Tài liệu có lời giải chi tiết."
  }),
  officialExam({
    id: "biology-official-2026-0430", subject: "Sinh học", category: "Tự chọn", icon: "DNA", code: "0430", minutes: 50, slug: "biology", solutionCount: 18,
    mc: "CADADDBABABDDCCCDC", tf: ["FFTF", "FTTF", "TFTF", "FTTT"], short: ["0,12", "25,00%", "2603", "3142", "0,35", "1480"],
    note: "Tài liệu có lời giải chi tiết."
  }),
  officialExam({
    id: "history-official-2026-0828", subject: "Lịch sử", category: "Tự chọn", icon: "⌛", code: "0828", minutes: 50, slug: "history", solutionCount: 7,
    mc: "DBDABCBCBBDADDADACAAADAA", tf: ["FFFT", "FTTT", "FTTT", "FTTT"],
    note: "Tài liệu có lời giải chi tiết."
  }),
  officialExam({
    id: "geography-official-2026-0920", subject: "Địa lí", category: "Tự chọn", icon: "◎", code: "0920", minutes: 50, slug: "geography", solutionCount: 8,
    mc: "AABBBBDDCCBBDDDBBD", tf: ["FTTF", "FFTF", "FTFF", "FTTF"], short: ["63,6", "10,4", "10,1", "1,33", "42,4%", "1,56"],
    note: "Tài liệu có lời giải chi tiết."
  }),
  officialExam({
    id: "economic-law-official-2026-1026", subject: "Giáo dục kinh tế và pháp luật", category: "Tự chọn", icon: "§", code: "1026", minutes: 50, slug: "economic-law", solutionCount: 7,
    mc: "AADBDCCADCACBDBDCBADBDDA", tf: ["FFTF", "TTTT", "FTFF", "TFFF"],
    note: "Tài liệu có lời giải chi tiết."
  }),
  officialExam({
    id: "informatics-official-2026-0501", subject: "Tin học", category: "Tự chọn", icon: "</>", code: "0501", minutes: 50, slug: "informatics", answerCount: 1,
    mc: "ACBCBACBABDBDAAABBACACDB", tf: ["FTTT", "TFTF"],
    branchTf: { "Khoa học máy tính": ["FTTF", "TTFF"], "Tin học ứng dụng": ["TTTF", "FTTT"] },
    note: "Phần II có 2 câu chung; thí sinh chọn thêm 2 câu của một trong hai định hướng. Có thể đổi định hướng ngay trên phiếu trả lời."
  }),
  officialExam({
    id: "industrial-tech-official-2026-0601", subject: "Công nghệ công nghiệp", category: "Tự chọn", icon: "⚙", code: "0601", minutes: 50, slug: "industrial-tech",
    mc: "ABDADCABAADBDCDBDBCDBCDC", tf: ["TFTF", "TTFF", "FTFT", "FTTF"],
    answerSource: "https://olm.vn/bai-viet/dap-an-de-thi-tot-nghiep-thpt-2026-mon-cong-nghe-cong-nghiep-day-du-ma-de-683132577"
  }),
  officialExam({
    id: "agricultural-tech-official-2026-0734", subject: "Công nghệ nông nghiệp", category: "Tự chọn", icon: "♧", code: "0734", minutes: 50, slug: "agricultural-tech", answerCount: 1,
    mc: "DACACACADCADDADCACCABBAC", tf: ["TTFT", "FFTT", "TTFF", "TFFT"]
  }),
  officialExam({
    id: "english-official-2026-1127", subject: "Tiếng Anh", category: "Ngoại ngữ", icon: "EN", code: "1127", minutes: 50, slug: "english", solutionCount: 5,
    mc: "DCADDDADADDACADACBADBDBBABADBDCDBDBABCBC",
    note: "Tài liệu có lời giải chi tiết."
  }),
  officialExam({ id: "russian-official-2026-1225", subject: "Tiếng Nga", category: "Ngoại ngữ", icon: "RU", code: "1225", minutes: 50, slug: "russian", answerCount: 1, mc: "ACBCDDABDCBCBDBBCCACBDACBCBBBDDCDBCDBAAC" }),
  officialExam({ id: "french-official-2026-1325", subject: "Tiếng Pháp", category: "Ngoại ngữ", icon: "FR", code: "1325", minutes: 50, slug: "french", answerCount: 1, mc: "DDACDCCCBAABCDDDAABDBBCBADACABDAACCBBDCD" }),
  officialExam({ id: "chinese-official-2026-1428", subject: "Tiếng Trung Quốc", category: "Ngoại ngữ", icon: "中", code: "1428", minutes: 50, slug: "chinese", answerCount: 2, mc: "CADDCBCDCCBDADDCCAABCBABCABBCCDDDDABCACB" }),
  officialExam({ id: "german-official-2026-1525", subject: "Tiếng Đức", category: "Ngoại ngữ", icon: "DE", code: "1525", minutes: 50, slug: "german", answerCount: 1, mc: "CCCDBDBDBAADBAACCADBDACADBBBACACDCDDBCBD" }),
  officialExam({ id: "japanese-official-2026-1625", subject: "Tiếng Nhật", category: "Ngoại ngữ", icon: "日", code: "1625", minutes: 50, slug: "japanese", answerCount: 1, mc: "CBCADDBCADCBBCACBCBACABBAADDCCDABCABACDD" }),
  officialExam({ id: "korean-official-2026-1725", subject: "Tiếng Hàn", category: "Ngoại ngữ", icon: "한", code: "1725", minutes: 50, slug: "korean", pageCount: 10, answerCount: 1, mc: "DACDDABCDBDAAADDACADAACDCCBABCBCBCDBABDC" })
];
