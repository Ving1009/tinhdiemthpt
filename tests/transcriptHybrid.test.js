import assert from "node:assert/strict";
import test from "node:test";
import { assessTranscriptQuality, mergeTranscriptResults } from "../public/js/core/transcriptHybrid.js";

const row = (subject = "Toán", grade = 12, values = {}) => ({ subject, grade, semester1: null, semester2: null, year: null, confidence: 0.99, ...values });
const payload = (...scores) => ({ data: { student: { name: "Tên riêng cần loại bỏ" }, scores }, warnings: [] });
const evidence = expectedCells => ({ expectedCells, expectedCellsReliable: true, visibleScoreCells: expectedCells, geometryReliable: true });

test("bảng nhỏ đủ 9 ô được xem là đầy đủ, giữ điểm 0 và 10", () => {
  const result = assessTranscriptQuality(payload(
    row("Toán", 12, { semester1: 0, semester2: 10, year: 8.5 }),
    row("Ngữ văn", 12, { semester1: 7, semester2: 8, year: 8 }),
    row("Vật lí", 12, { semester1: 5, semester2: 6, year: 6 })
  ), evidence(9));
  assert.equal(result.state, "complete");
  assert.equal(result.validCells, 9);
  assert.equal(result.coverage, 1);
  assert.equal(result.suggestOnline, false);
});

test("ít điểm với số ô kỳ vọng chưa chắc chắn không bị kết luận thiếu", () => {
  const result = assessTranscriptQuality(payload(row("Toán", 12, { year: 8 })), { expectedCells: 81, visibleScoreCells: 81, geometryReliable: false });
  assert.equal(result.state, "unknown");
  assert.equal(result.expectedCells, null);
  assert.equal(result.coverage, null);
  assert.equal(result.suggestOnline, false);
});

test("tỷ lệ dưới 60% gợi ý quét bổ sung, đúng 60% chưa gợi ý", () => {
  const data = payload(row("Toán", 12, { semester1: 7, semester2: 8, year: 9 }));
  assert.equal(assessTranscriptQuality(data, evidence(6)).suggestOnline, true);
  const boundary = assessTranscriptQuality(data, evidence(5));
  assert.equal(boundary.coverage, 0.6);
  assert.equal(boundary.state, "incomplete");
  assert.equal(boundary.suggestOnline, false);
  assert.equal(assessTranscriptQuality(data, evidence(6), { minimumCoverage: 0.5 }).suggestOnline, false);
});

test("nhiều vị trí điểm nhìn thấy nhưng chỉ đọc 0–4 ô gợi ý API khi có bằng chứng bố cục", () => {
  for (const data of [payload(), payload(row("Toán", 12, { year: 8 }))]) {
    const result = assessTranscriptQuality(data, { geometryReliable: true, visibleScoreCells: 12 });
    assert.equal(result.state, "incomplete");
    assert.equal(result.suggestOnline, true);
    assert.equal(result.coverage, null);
  }
  assert.equal(assessTranscriptQuality(payload(), { visibleScoreCells: 12 }).suggestOnline, false);
});

test("chỉ đếm các ô thực thấy và không đếm cột học kỳ trống hợp lệ", () => {
  const data = payload(row("Toán", 11, { semester1: 8 }), row("Ngữ văn", 11, { semester1: 7 }));
  const result = assessTranscriptQuality(data, { ...evidence(2), expectedCellKeys: ["Toán|11|semester1", "Ngữ văn|11|semester1"] });
  assert.equal(result.state, "complete");
  assert.equal(result.expectedCells, 2);
  assert.equal(result.coverage, 1);
});

test("điểm ở bảng khác không che ô thiếu; trùng ảnh không làm tăng số ô kỳ vọng", () => {
  const data = payload(row("Toán", 10, { year: 8 }), row("Toán", 11, { year: 8 }), row("Toán", 12, { year: 8 }));
  const result = assessTranscriptQuality(data, { ...evidence(2), expectedCellKeys: ["Toán|10|semester1", "Toán|10|year", "Toán|10|year"] });
  assert.equal(result.expectedCells, 2);
  assert.equal(result.validCells, 3);
  assert.equal(result.coverage, 0.5);
  assert.equal(result.suggestOnline, true);
});

test("ô nhìn thấy ở dòng chưa rõ môn vẫn nằm trong mẫu số, không bị các khóa đã rõ che mất", () => {
  const data = payload(row("Toán", 12, { semester1: 8, semester2: 9, year: 9 }), row("Ngữ văn", 12, { semester1: 7, semester2: 8 }));
  const result = assessTranscriptQuality(data, { ...evidence(15), unresolvedSubjects: 3, expectedCellKeys: [
    "Toán|12|semester1", "Toán|12|semester2", "Toán|12|year", "Ngữ văn|12|semester1", "Ngữ văn|12|semester2"
  ] });
  assert.equal(result.validCells, 5);
  assert.equal(result.expectedCells, 15);
  assert.equal(result.coverage, 1 / 3);
  assert.equal(result.suggestOnline, true);
});

test("confidence cao không biến bố cục chưa rõ thành bảng đầy đủ", () => {
  assert.equal(assessTranscriptQuality(payload(row("Toán", 12, { year: 8, confidence: 1 }))).state, "unknown");
  const result = assessTranscriptQuality(payload(row("Toán", 12, { year: 8 })), { ...evidence(1), unresolvedSubjects: 1 });
  assert.equal(result.state, "incomplete");
  assert.ok(result.reasons.includes("unresolved_subjects"));
});

test("điểm sai, lớp sai và ô trùng mâu thuẫn không tính vào số ô đọc được", () => {
  const result = assessTranscriptQuality(payload(
    row("Toán", 12, { semester1: -1, semester2: "8", year: 8 }),
    row("Toán", 12, { year: 9 }),
    row("Ngữ văn", 7, { year: 9 }),
    row("", 12, { year: 9 })
  ), evidence(5));
  assert.equal(result.validCells, 0);
  assert.equal(result.suggestOnline, true);
});

test("ghép giữ điểm trùng nhau, bổ sung ô trống và lưu nguồn tạm thời", () => {
  const result = mergeTranscriptResults(
    payload(row("Toán", 12, { semester1: 0, semester2: 8 })),
    payload(row("Toán", 12, { semester1: 0, year: 10 }))
  );
  assert.equal(result.data.student.name, null);
  assert.deepEqual(result.data.scores[0], row("Toán", 12, { semester1: 0, semester2: 8, year: 10, confidence: 0 }));
  assert.equal(result.provenance["Toán|12|semester1"].source, "agreement");
  assert.equal(result.provenance["Toán|12|semester2"].source, "local");
  assert.equal(result.provenance["Toán|12|year"].source, "remote");
  assert.equal(result.conflicts.length, 0);
});

test("điểm khác nhau để trống chờ chọn, không ưu tiên confidence hay lấy trung bình", () => {
  const local = payload(row("Toán", 12, { year: 5.4, confidence: 0.7 }));
  const remote = payload(row("Toán", 12, { year: 9.4, confidence: 1 }));
  const result = mergeTranscriptResults(local, remote);
  assert.equal(result.data.scores[0].year, null);
  assert.equal(result.provenance["Toán|12|year"].source, "conflict");
  assert.deepEqual(result.conflicts[0], { key: "Toán|12|year", subject: "Toán", grade: 12, field: "year", source: "conflict", local: 5.4, remote: 9.4 });
  assert.equal(local.data.scores[0].year, 5.4);
  assert.equal(remote.data.scores[0].year, 9.4);
});

test("không dịch chuyển điểm giữa lớp, môn hay kỳ, không tự suy đoán ngoại ngữ và công nghệ", () => {
  const result = mergeTranscriptResults(
    payload(row("Ngoại ngữ", 11, { semester1: 8 }), row("Công nghệ", 12, { year: 7 })),
    payload(row("Tiếng Anh", 11, { year: 9 }), row("Công nghệ công nghiệp", 12, { year: 9 }), row("Ngoại ngữ", 12, { year: 6 }))
  );
  assert.equal(result.data.scores.length, 5);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.data.scores.find(item => item.subject === "Ngoại ngữ" && item.grade === 11).year, null);
  assert.equal(result.data.scores.find(item => item.subject === "Công nghệ").year, 7);
});

test("ghép bỏ dòng sai lớp/môn và để trống điểm sai định dạng", () => {
  const result = mergeTranscriptResults(payload(row("Toán", 12, { year: 8 })), payload(
    row("Toán", 7, { year: 8 }), row("Toán", "12", { year: 8 }), row("", 12, { year: 8 }),
    row("Toán", 12, { semester1: -1, semester2: 11, year: "9" })
  ));
  assert.equal(result.data.scores.length, 1);
  assert.equal(result.data.scores[0].year, 8);
  assert.equal(result.data.scores[0].semester1, null);
  assert.equal(result.data.scores[0].semester2, null);
  assert.equal(result.conflicts.length, 0);
});

test("khi cung cấp catalog, chỉ ghép tên chuẩn mà không tìm gần đúng", () => {
  const result = mergeTranscriptResults(payload(row("Toán", 12, { year: 8 })), payload(row("Toan", 12, { year: 9 }), row("Tên bất kỳ", 12, { year: 9 })), { subjects: [{ canonical: "Toán" }] });
  assert.equal(result.data.scores.length, 1);
  assert.equal(result.data.scores[0].year, 8);
});

test("nhiều dòng cùng môn/lớp có số khác nhau trong một nguồn cũng phải chờ xác nhận", () => {
  const result = mergeTranscriptResults(
    payload(row("Toán", 12, { year: 8 }), row("Toán", 12, { year: 9 })),
    payload(row("Toán", 12, { year: 8 }))
  );
  assert.equal(result.data.scores.length, 1);
  assert.equal(result.data.scores[0].year, null);
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0].localValues, [8, 9]);
  assert.deepEqual(result.conflicts[0].remoteValues, [8]);
});

test("cả hai nguồn chưa đọc được thì giữ trống và gộp cảnh báo không lặp", () => {
  const local = payload(row("Toán", 12));
  local.warnings = ["Hãy đối chiếu ảnh."];
  const remote = payload(row("Toán", 12));
  remote.warnings = ["Hãy đối chiếu ảnh."];
  const result = mergeTranscriptResults(local, remote);
  assert.equal(result.data.scores[0].year, null);
  assert.equal(result.provenance["Toán|12|year"].source, "empty");
  assert.deepEqual(result.warnings, ["Hãy đối chiếu ảnh."]);
});

test("payload không có mảng điểm vẫn giữ được kết quả hợp lệ còn lại", () => {
  const invalid = { data: { scores: {} }, warnings: "không phải mảng" };
  assert.equal(assessTranscriptQuality(invalid).state, "unknown");
  const merged = mergeTranscriptResults(payload(row("Toán", 12, { year: 8 })), invalid);
  assert.equal(merged.data.scores[0].year, 8);
  assert.deepEqual(merged.warnings, []);
});

test("xung đột đã để trống trong payload vẫn phải chờ chọn dù lượt API sau trùng một giá trị", () => {
  const unresolved = mergeTranscriptResults(payload(row("Toán", 12, { year: 2 }), row("Toán", 12, { year: 3 })), null);
  const result = mergeTranscriptResults(unresolved, payload(row("Toán", 12, { year: 3 })));
  assert.equal(result.data.scores[0].year, null);
  assert.deepEqual(result.conflicts[0].localValues, [2, 3]);
  assert.deepEqual(result.conflicts[0].remoteValues, [3]);
  assert.equal(assessTranscriptQuality(result, evidence(1)).validCells, 0);
});

test("xung đột từ hai nguồn được giữ khi quét bổ sung lần nữa, kể cả 0 và 10", () => {
  const unresolved = mergeTranscriptResults(payload(row("Toán", 12, { year: 0 })), payload(row("Toán", 12, { year: 10 })));
  const result = mergeTranscriptResults(unresolved, payload(row("Toán", 12, { year: 10 })));
  assert.equal(result.data.scores[0].year, null);
  assert.deepEqual(result.conflicts[0].localValues, [0, 10]);
  assert.deepEqual(result.conflicts[0].remoteValues, [10]);
  assert.equal(result.data.student.name, null);
});

test("metadata xung đột chỉ áp dụng cùng khóa chuẩn, môn, lớp và trường điểm", () => {
  const local = payload(row("Toán", 12));
  local.conflicts = [
    { key: "Toán|11|year", subject: "Toán", grade: 12, field: "year", local: 2, remote: 3 },
    { key: "Ngữ văn|12|year", subject: "Ngữ văn", grade: 12, field: "year", local: 2, remote: 3 },
    { key: "Toán|12|year", subject: "Toán", grade: "12", field: "year", local: 2, remote: 3 },
    { key: "Toán|12|grade", subject: "Toán", grade: 12, field: "grade", local: 2, remote: 3 },
    { key: "Toan|12|year", subject: "Toan", grade: 12, field: "year", local: 2, remote: 3 }
  ];
  const result = mergeTranscriptResults(local, payload(row("Toán", 12, { year: 8 })), { subjects: [{ canonical: "Toán" }] });
  assert.equal(result.data.scores.length, 1);
  assert.equal(result.data.scores[0].year, 8);
  assert.equal(result.conflicts.length, 0);
});

test("metadata xung đột không nhận điểm sai hoặc làm sống lại dòng đã xóa", () => {
  const local = payload(row("Toán", 12));
  local.conflicts = [
    { key: "Toán|12|year", subject: "Toán", grade: 12, field: "year", local: -1, remote: 11,
      localValues: ["8", Number.NaN], remoteValues: [Infinity, null] },
    { key: "Ngữ văn|12|year", subject: "Ngữ văn", grade: 12, field: "year", local: 2, remote: 3 }
  ];
  const result = mergeTranscriptResults(local, payload(row("Toán", 12, { year: 8 })));
  assert.equal(result.data.scores.length, 1);
  assert.equal(result.data.scores[0].year, 8);
  assert.equal(result.conflicts.length, 0);
});
