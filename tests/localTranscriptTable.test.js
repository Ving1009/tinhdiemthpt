import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeLocalTranscriptTable, localTranscriptTablePayload, parseLocalTranscriptTable, localTranscriptTableEvidence } from "../public/js/core/localTranscriptTable.js";

const catalog = JSON.parse(await readFile(new URL("../data/transcript-subjects.json", import.meta.url), "utf8"));
const word = (text, x, y, confidence = 95, width = Math.max(10, text.length * 7)) => ({ text, confidence,
  bbox: { x0: x - width / 2, x1: x + width / 2, y0: y - 8, y1: y + 8 } });
const page = (words, text = "Lớp 12", originalname = "ảnh.png") => ({ text, originalname,
  blocks: [{ paragraphs: [{ lines: [{ words }] }] }] });
const simpleTable = (headers = ["HK1", "HK2", "Cả năm"]) => page([
  ...headers.map((text, index) => word(text, 220 + index * 100, 80)),
  word("Toán", 70, 130), word("8.1", 220, 132), word("8.2", 320, 132), word("8.3", 420, 132),
  word("Ngữ văn", 70, 190), word("7.1", 220, 192), word("7.2", 320, 192), word("7.3", 420, 192)
]);
const values = (result) => result.payload.scores.map(({ subject, grade, semester1, semester2, year }) => ({ subject, grade, semester1, semester2, year }));

test("local OCR gán điểm theo vị trí header, kể cả cột bị đảo", () => {
  assert.deepEqual(values(parseLocalTranscriptTable(simpleTable(["Cả năm", "HK2", "HK1"]), catalog)), [
    { subject: "Toán", grade: 12, semester1: 8.3, semester2: 8.2, year: 8.1 },
    { subject: "Ngữ văn", grade: 12, semester1: 7.3, semester2: 7.2, year: 7.1 }
  ]);
});

test("đánh giá chỉ đếm ô điểm nhìn thấy; ô trắng và cột thành phần không tăng số cần đọc", () => {
  const image = simpleTable();
  const words = image.blocks[0].paragraphs[0].lines[0].words;
  words.splice(words.findIndex(word => word.text === "8.2"), 1);
  words.find(word => word.text === "7.1").text = "71";
  const evidence = localTranscriptTableEvidence(analyzeLocalTranscriptTable(image, catalog));
  assert.equal(evidence.expectedCells, 5);
  assert.equal(evidence.visibleScoreCells, 5);
  assert.equal(evidence.expectedCellsReliable, true);
  assert.equal(evidence.invalidScores, 1);
  assert.equal(evidence.expectedCellKeys.includes("Toán|12|semester2"), false);
  image.text = "Lớp 7";
  assert.equal(localTranscriptTableEvidence(analyzeLocalTranscriptTable(image, catalog)).expectedCellsReliable, false);
});

test("local OCR khoanh tên môn hỏng để đọc lại, không nhận nó bằng suy đoán", () => {
  const image = page([
    word("HK1", 220, 80), word("HK2", 320, 80), word("CN", 420, 80),
    word("Toán", 70, 130), word("8.1", 220, 130),
    word("Ngir van", 70, 190), word("7.6", 220, 190), word("6.1", 320, 190), word("6.6", 420, 190),
    word("Thể chất", 70, 250), word("Đ", 220, 250),
    word("Lịch sử", 70, 310), word("7.5", 220, 310),
    word("Nhận xét", 70, 370), word("Tốt", 220, 370)
  ]);
  const table = analyzeLocalTranscriptTable(image, catalog);
  assert.deepEqual(table.rows.map(row => row.subject), ["Toán", "Lịch sử"]);
  assert.equal(table.labelRegions.length, 1);
  assert.ok(table.labelRegions[0].top < 190);
  assert.ok(table.labelRegions[0].top + table.labelRegions[0].height > 190);
  image.text = "Lớp 7";
  assert.deepEqual(analyzeLocalTranscriptTable(image, catalog).labelRegions, []);
});

test("local OCR giữ ô mất, ngoài khoảng hoặc độ tin cậy thấp, không dồn số sang cột khác", () => {
  const image = simpleTable();
  const words = image.blocks[0].paragraphs[0].lines[0].words;
  words.splice(words.findIndex((item) => item.text === "8.2"), 1);
  words.find((item) => item.text === "7.1").text = "71";
  words.find((item) => item.text === "7.2").confidence = 30;
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), [
    { subject: "Toán", grade: 12, semester1: 8.1, semester2: null, year: 8.3 },
    { subject: "Ngữ văn", grade: 12, semester1: null, semester2: null, year: 7.3 }
  ]);
  const table = analyzeLocalTranscriptTable(image, catalog);
  assert.equal(table.rows[0].cells.semester2.value, null);
  assert.equal(table.rows[1].cells.semester1.value, null);
  assert.ok(table.rows[0].cells.semester2.rectangle.width > 0);
});

test("local OCR không gán cột không có header vào HK1/cả năm kế bên", () => {
  const image = simpleTable(["HK1", "", "Cả năm"]);
  image.blocks[0].paragraphs[0].lines[0].words = image.blocks[0].paragraphs[0].lines[0].words.filter((item) => item.text);
  const result = parseLocalTranscriptTable(image, catalog);
  assert.deepEqual(values(result), [
    { subject: "Toán", grade: 12, semester1: 8.1, semester2: null, year: 8.3 },
    { subject: "Ngữ văn", grade: 12, semester1: 7.1, semester2: null, year: 7.3 }
  ]);
});

test("local OCR chỉ nhận lớp ghi rõ, từ chối lớp 7/101 và thông tin lớp mâu thuẫn", () => {
  for (const text of ["Lớp 7", "Lớp 101", "Lớp 11 Lớp 12", "Bảng điểm"]) {
    const image = simpleTable();
    image.text = text;
    const result = parseLocalTranscriptTable(image, catalog);
    assert.equal(result.payload.scores.length, 0);
    assert.match(result.warnings.join(" "), /Chưa xác định chắc lớp/);
  }
  const image = simpleTable();
  image.originalname = "hoc-ba-lop-10.png";
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
  image.text = "";
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores[0].grade, 10);
});

test("local OCR đọc lớp từ bbox khi text tổng hợp bỏ mất header lớp", () => {
  const image = simpleTable();
  image.text = "";
  image.blocks[0].paragraphs[0].lines[0].words.push(word("Lớp:", 100, 30), word("11TN7", 155, 30));
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores[0].grade, 11);
});

test("local OCR nhận STT, môn quốc phòng và ngoại ngữ xuống dòng", () => {
  const image = page([
    word("HK I", 260, 80), word("HK II", 360, 80), word("CN", 460, 80),
    word("1", 20, 130), word("Toán học", 80, 130), word("8,1", 260, 130), word("8.2", 360, 130), word("8.3", 460, 130),
    word("Ngoại ngữ 1", 90, 180), word("(Tiếng Anh)", 90, 205), word("7.9", 260, 192), word("8.0", 360, 192), word("8.0", 460, 192),
    word("Giáo dục quốc phòng", 105, 250), word("và an ninh", 85, 275), word("8.8", 260, 263), word("9.2", 360, 263), word("9.1", 460, 263)
  ]);
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), [
    { subject: "Toán", grade: 12, semester1: 8.1, semester2: 8.2, year: 8.3 },
    { subject: "Tiếng Anh", grade: 12, semester1: 7.9, semester2: 8, year: 8 },
    { subject: "Giáo dục quốc phòng và an ninh", grade: 12, semester1: 8.8, semester2: 9.2, year: 9.1 }
  ]);
});

test("local OCR bảng chi tiết vnEdu chỉ lấy cột ĐTB của học kỳ được ghi rõ", () => {
  const image = page([
    word("Học kỳ 2", 70, 30), word("TX", 210, 80), word("GK", 310, 80), word("CK", 410, 80), word("ĐTBmh", 510, 80),
    word("Toán", 70, 130), word("9", 210, 130), word("8", 235, 130), word("8.5", 310, 130), word("9.0", 410, 130), word("8.7", 510, 130),
    word("Ngữ văn", 70, 190), word("9", 210, 190), word("8", 235, 190), word("7.5", 310, 190), word("8.0", 410, 190), word("7.9", 510, 190)
  ], "Lớp 12 Học kỳ 2");
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), [
    { subject: "Toán", grade: 12, semester1: null, semester2: 8.7, year: null },
    { subject: "Ngữ văn", grade: 12, semester1: null, semester2: 7.9, year: null }
  ]);
  image.text = "Lớp 12";
  image.blocks[0].paragraphs[0].lines[0].words = image.blocks[0].paragraphs[0].lines[0].words.filter((item) => item.text !== "Học kỳ 2");
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
});

test("local OCR nhận riêng cả năm, không đoán giá trị từ các học kỳ", () => {
  const image = page([word("Cả năm", 260, 80), word("Toán", 70, 130), word("8.5", 260, 130)]);
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), [
    { subject: "Toán", grade: 12, semester1: null, semester2: null, year: 8.5 }
  ]);
});

test("local OCR từ chối nhiều số trong cùng ô, header trùng và không đưa tên học sinh vào payload", () => {
  const image = simpleTable();
  image.text = "Họ và tên: Nguyễn Văn An\nLớp 12";
  image.blocks[0].paragraphs[0].lines[0].words.push(word("9.9", 230, 132));
  let result = parseLocalTranscriptTable(image, catalog);
  assert.equal(result.payload.student.name, null);
  assert.equal(result.payload.scores[0].semester1, null);
  image.blocks[0].paragraphs[0].lines[0].words.find((item) => item.text === "HK2").text = "HK1";
  result = parseLocalTranscriptTable(image, catalog);
  assert.ok(result.payload.scores.every((row) => row.semester1 === null && row.semester2 === null));
});

test("local OCR dùng lớp/học kỳ người dùng chọn rõ, không đè lớp đọc được hoặc coi TX là điểm trung bình", () => {
  const image = page([word("TX", 220, 80), word("ĐTBmhk", 320, 80),
    word("Toán", 70, 130), word("9", 220, 130), word("8.5", 320, 130)], "");
  image.gradeHint = 11;
  image.periodHint = "semester1";
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), [
    { subject: "Toán", grade: 11, semester1: 8.5, semester2: null, year: null }
  ]);
  image.text = "Lớp 7";
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
  image.text = "Lớp 12";
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
  image.text = "Lớp 11 Học kỳ 2";
  image.blocks[0].paragraphs[0].lines[0].words.push(word("Học kỳ 2", 70, 30));
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
});

test("local OCR có regions cho cột điểm mất hoàn toàn và payload dùng kết quả retry của đúng ô", () => {
  const image = simpleTable();
  image.blocks[0].paragraphs[0].lines[0].words = image.blocks[0].paragraphs[0].lines[0].words.filter((item) => !["8.2", "7.2"].includes(item.text));
  const table = analyzeLocalTranscriptTable(image, catalog);
  const blanks = table.cells.filter((cell) => cell.field === "semester2");
  assert.equal(blanks.length, 2);
  assert.ok(blanks.every((cell) => cell.value === null && cell.rectangle.width > 0 && cell.rectangle.height > 0));
  table.rows[0].cells.semester2.value = 8.2;
  table.rows[0].cells.semester2.confidence = 90;
  assert.equal(localTranscriptTablePayload(table).scores[0].semester2, 8.2);
});

test("local OCR bỏ từ giống môn ở cột giáo viên/nhận xét và dưới vùng bảng điểm", () => {
  const image = simpleTable();
  image.blocks[0].paragraphs[0].lines[0].words.push(word("sự", 700, 55), word("hoa", 710, 250));
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), values(parseLocalTranscriptTable(simpleTable(), catalog)));
  const table = analyzeLocalTranscriptTable(image, catalog);
  assert.ok(table.headerRegion.left >= 150 && table.headerRegion.width < 400 && table.headerRegion.height < 60);
});

test("local OCR không biến ký tự lỗi thành số hoặc chấp nhận confidence thiếu", () => {
  const image = simpleTable();
  const words = image.blocks[0].paragraphs[0].lines[0].words;
  words.find((item) => item.text === "8.1").text = "8°";
  words.find((item) => item.text === "8.2").text = "8.555";
  delete words.find((item) => item.text === "8.3").confidence;
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.some((row) => row.subject === "Toán"), false);
});

test("local OCR lấy lớp ở header, bỏ lớp lên thẳng và nhận xét ở bên dưới bảng", () => {
  const image = simpleTable();
  image.text = "Lớp 11\nĐược lên lớp thẳng: lớp 12\nNhận xét cho lớp 10";
  const words = image.blocks[0].paragraphs[0].lines[0].words;
  words.push(word("Lớp:", 80, 30), word("11A2", 130, 30),
    word("Được lên lớp thẳng: lớp 12", 600, 170), word("Lớp 10", 600, 220));
  const result = parseLocalTranscriptTable(image, catalog);
  assert.equal(result.payload.scores.length, 2);
  assert.ok(result.payload.scores.every((row) => row.grade === 11));
  image.gradeHint = 12;
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
  image.gradeHint = null;
  words.find((item) => item.text === "11A2").text = "7A2";
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
});

test("local OCR bỏ câu lên lớp trong text khi bbox không có lớp hiện tại", () => {
  const image = simpleTable();
  image.text = "Lớp: 11A2\nĐược lên lớp thẳng: lớp 12";
  const result = parseLocalTranscriptTable(image, catalog);
  assert.equal(result.payload.scores.length, 2);
  assert.ok(result.payload.scores.every((row) => row.grade === 11));
  image.text = "Được lên lớp thẳng: lớp 12";
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
});

test("local OCR caption học kỳ không biến điểm thành phần thành cột trung bình", () => {
  const image = page([word("Học kỳ 1", 220, 55), word("TX", 220, 80), word("TBM", 320, 80),
    word("Toán", 70, 130), word("9", 220, 130), word("8.5", 320, 130)], "Lớp 12 Học kỳ 1");
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), [
    { subject: "Toán", grade: 12, semester1: 8.5, semester2: null, year: null }
  ]);
});

test("local OCR caption học kỳ phía trên không tạo cột thứ hai cùng TBM khi header thành phần bị mờ", () => {
  const image = page([word("Học kỳ 1", 300, 55), word("Điểm kiểm tra", 300, 80), word("TBM", 500, 80),
    word("Toán", 70, 130), word("9", 300, 130), word("8.5", 500, 130)], "Lớp 12 Học kỳ 1");
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), [
    { subject: "Toán", grade: 12, semester1: 8.5, semester2: null, year: null }
  ]);
});

test("local OCR đọc form điện tử có nhãn kỳ cùng hàng, chỉ lấy số ngay bên phải nhãn", () => {
  const image = page([word("2. Toán:", 90, 130), word("Học kỳ 1", 260, 130), word("0.9", 330, 130),
    word("Học kỳ 2", 460, 130), word("5", 530, 130), word("Cả năm", 660, 130), word("6", 730, 130)], "Lớp 10");
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), [
    { subject: "Toán", grade: 10, semester1: 0.9, semester2: 5, year: 6 }
  ]);
  const table = analyzeLocalTranscriptTable(image, catalog);
  assert.equal(table.cells.length, 3);
  assert.ok(table.cells.every((cell) => cell.rectangle.width > 0));
});

test("local OCR bảng bị cắt trước cột trung bình không lấy TB tổng quan ở khu vực phía trên", () => {
  const image = page([word("TB", 220, 80), word("TB", 320, 80), word("Học kỳ 1", 70, 260),
    word("Miệng", 220, 300), word("15 phút", 320, 300), word("1 tiết", 420, 300),
    word("Toán", 70, 350), word("9", 220, 350), word("7.9", 320, 350), word("6", 420, 350),
    word("Vật lí", 70, 410), word("8", 220, 410), word("7", 320, 410), word("5.6", 420, 410)], "Lớp 12 Học kỳ 1");
  image.periodHint = "semester1";
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
});

test("local OCR không dùng caption thay cột trung bình bị mất trong bảng nhiều cột kiểm tra", () => {
  const image = page([word("Học kỳ 1", 320, 80), word("Toán", 70, 130),
    word("9", 220, 130), word("8", 320, 130), word("7.5", 420, 130), word("6.5", 520, 130),
    word("Vật lí", 70, 190), word("8", 220, 190), word("7", 320, 190), word("7", 420, 190), word("6", 520, 190)]);
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
});

test("local OCR không dùng kỳ ở footer để cho phép lựa chọn mâu thuẫn với caption bảng", () => {
  const image = page([word("Học kỳ 1", 70, 35), word("TX", 220, 80), word("TBM", 420, 80),
    word("Toán", 70, 130), word("9", 220, 130), word("8.5", 420, 130), word("Cả năm", 70, 210)]);
  const expected = [{ subject: "Toán", grade: 12, semester1: 8.5, semester2: null, year: null }];
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), expected);
  image.periodHint = "semester2";
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
  image.periodHint = "semester1";
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), expected);
  image.blocks[0].paragraphs[0].lines[0].words.push(word("Học kỳ 2", 70, 55));
  assert.equal(parseLocalTranscriptTable(image, catalog).payload.scores.length, 0);
});

test("bố cục có cột số mất hoàn toàn header không được kết luận đã xác định đủ cột", () => {
  const image = simpleTable(["HK1", "", "Cả năm"]);
  const table = analyzeLocalTranscriptTable(image, catalog);
  const evidence = localTranscriptTableEvidence(table);
  assert.equal(table.unresolvedColumns, 1);
  assert.equal(evidence.geometryReliable, false);
  assert.equal(evidence.expectedCellsReliable, false);
  assert.equal(evidence.expectedCells, null);
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), [
    { subject: "Toán", grade: 12, semester1: 8.1, semester2: null, year: 8.3 },
    { subject: "Ngữ văn", grade: 12, semester1: 7.1, semester2: null, year: 7.3 }
  ]);
});

test("cột TX/GK/CK có nhãn rõ không bị coi là cột điểm trung bình chưa xác định", () => {
  const image = page([
    word("Học kỳ 1", 70, 30), word("TX", 210, 80), word("GK", 310, 80), word("CK", 410, 80), word("TBM", 510, 80),
    word("Toán", 70, 130), word("9", 210, 130), word("8.5", 310, 130), word("9", 410, 130), word("8.7", 510, 130),
    word("Ngữ văn", 70, 190), word("8", 210, 190), word("7.5", 310, 190), word("8", 410, 190), word("7.9", 510, 190)
  ], "Lớp 12 Học kỳ 1");
  const table = analyzeLocalTranscriptTable(image, catalog);
  const evidence = localTranscriptTableEvidence(table);
  assert.equal(table.unresolvedColumns, 0);
  assert.equal(evidence.geometryReliable, true);
  assert.equal(evidence.expectedCells, 2);
  assert.equal(evidence.recognizedCells, 2);
});

test("số nằm xa nhóm cột điểm ở vùng nhận xét không làm bố cục đủ header thành unknown", () => {
  const image = simpleTable();
  image.blocks[0].paragraphs[0].lines[0].words.push(word("12", 900, 132), word("8", 930, 192));
  const table = analyzeLocalTranscriptTable(image, catalog);
  const evidence = localTranscriptTableEvidence(table);
  assert.equal(table.unresolvedColumns, 0);
  assert.equal(evidence.expectedCellsReliable, true);
  assert.equal(evidence.expectedCells, 6);
  assert.equal(evidence.recognizedCells, 6);
  assert.deepEqual(values(parseLocalTranscriptTable(image, catalog)), values(parseLocalTranscriptTable(simpleTable(), catalog)));
});

test("cột số liền kề ở ngoài nhóm điểm bị mất header vẫn làm bố cục unknown", () => {
  for (const headers of [["", "HK2", "Cả năm"], ["HK1", "HK2", ""]]) {
    const table = analyzeLocalTranscriptTable(simpleTable(headers), catalog);
    const evidence = localTranscriptTableEvidence(table);
    assert.equal(table.unresolvedColumns, 1);
    assert.equal(evidence.expectedCellsReliable, false);
    assert.equal(evidence.expectedCells, null);
    assert.equal(table.rows[0].cells.semester2.value, 8.2);
  }
});

test("chỉ một cột đã xác định thì không loại số khác chỉ vì nằm xa", () => {
  const image = page([word("Cả năm", 220, 80),
    word("Toán", 70, 130), word("8.5", 220, 130), word("9", 900, 130)]);
  const table = analyzeLocalTranscriptTable(image, catalog);
  assert.equal(table.unresolvedColumns, 1);
  assert.equal(localTranscriptTableEvidence(table).expectedCellsReliable, false);
  assert.equal(table.rows[0].cells.year.value, 8.5);
});

test("dòng có điểm nhưng chưa có môn trong catalog vẫn được tính là ô nhìn thấy", () => {
  const image = page([
    word("HK1", 220, 80),
    word("Toán", 70, 130), word("8", 220, 130),
    word("GDCD", 70, 190), word("7", 220, 190),
    word("Ngoại ngữ", 70, 250), word("8", 220, 250),
    word("Công nghệ", 70, 310), word("9", 220, 310)
  ]);
  const table = analyzeLocalTranscriptTable(image, catalog);
  const evidence = localTranscriptTableEvidence(table);
  assert.equal(evidence.geometryReliable, true);
  assert.equal(evidence.expectedCells, 4);
  assert.equal(evidence.recognizedCells, 3);
  assert.equal(evidence.unresolvedSubjects, 1);
  assert.deepEqual(table.rows.map(row => row.subject), ["Toán", "Ngoại ngữ", "Công nghệ"]);
});
