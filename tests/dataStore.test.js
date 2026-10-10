import assert from "node:assert/strict";
import test from "node:test";
import { createDataStore, normalizeSearch } from "../server/dataStore.js";

const universities = [
  { id: "u1", code: "UTH", officialAdmissionsCode: "GHA", name: "Trường Đại học Giao thông vận tải", shortName: "UTH", region: "south", website: "https://uth.example.edu.vn", admissions: { status: "official_verified", note: "Đã cập nhật" } },
  { id: "u2", code: "BKA", name: "Đại học Bách khoa Hà Nội", shortName: "HUST", region: "north", admissions: { status: "official_verified", note: "Đã cập nhật" } }
];
const majors = [
  { id: "m-a01", universityId: "u1", code: "7480201", name: "Công nghệ thông tin", combination: "A00; A01; D01", method: "THPT", formula: "verified-thpt", calculationVerified: true, comparisonRules: { A00: "three-subject-sum-priority-2026", A01: "three-subject-sum-priority-2026", D01: "three-subject-sum-priority-2026" }, cutoff: { year: 2026, score: 25, scale: 30, status: "reference", sourceUrl: "https://hidden.example/m1" } },
  { id: "m-a010", universityId: "u1", code: "7520216", name: "Tự động hóa", combination: "A010", method: "THPT", cutoff: { year: 2026, score: 24, scale: 30, status: "verified", sourceUrl: "https://hidden.example/m2" } },
  { id: "m-hsa", universityId: "u2", code: "7480201", name: "Công nghệ thông tin", combination: "Q00", method: "ĐGNL HSA", cutoff: { year: 2026, score: 94, scale: 150, status: "reference", sourceUrl: "https://hidden.example/m3" } }
];
const combinations = [
  { id: "a00", code: "A00", subjects: ["Toán", "Vật lí", "Hóa học"], subjectIds: ["math", "physics", "chemistry"], subjectText: "Toán, Vật lí, Hóa học", raw: { private: true } },
  { id: "a01", code: "A01", subjects: ["Toán", "Vật lí", "Tiếng Anh"], subjectIds: ["math", "physics", "foreignLanguage"], subjectText: "Toán, Vật lí, Tiếng Anh" },
  { id: "a010", code: "A010", subjects: ["Toán", "Tin học", "Công nghệ"], subjectIds: ["math", "informatics", "industrialTechnology"], subjectText: "Toán, Tin học, Công nghệ" },
  { id: "d01", code: "D01", subjects: ["Toán", "Ngữ văn", "Tiếng Anh"], subjectIds: ["math", "literature", "foreignLanguage"], subjectText: "Toán, Ngữ văn, Tiếng Anh" },
  { id: "q00", code: "Q00", subjects: ["ĐGNL"], subjectIds: ["dgnl"], subjectText: "Đánh giá năng lực" }
];
const store = createDataStore({ universities, majors, combinations, subjects: [] });

test("tìm tên ngành rồi sắp điểm trước khi phân trang mà không phải nhập điểm cá nhân", () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({
    ...majors[0], id: `sort-${index}`, name: `Toán ${String(index).padStart(2, "0")}`, code: `7${index}`,
    cutoff: { ...majors[0].cutoff, score: 10 + index / 2 }
  }));
  const sortedStore = createDataStore({ universities, majors: rows, combinations });
  for (const [sort, highest] of [["cutoff-desc", true], ["cutoff-asc", false], ["major-desc", true], ["major-asc", false]]) {
    const result = sortedStore.listMajors({ q: "toán", sort, page: 1, pageSize: 24 });
    assert.equal(result.pagination.total, 40);
    assert.equal(result.items.length, 24);
    assert.equal(result.items[0].id, highest ? "sort-39" : "sort-0");
  }
});

test("phân trang dùng số nguyên và đầu vào tổ hợp không hợp lệ không gây crash", () => {
  const result = store.listMajors({ page: 1.5, pageSize: 2.5 });
  assert.equal(result.pagination.page, 1);
  assert.equal(result.pagination.pageSize, 2);
  assert.equal(result.items.length, 2);
  assert.equal(store.findBestMajorCombinations({ results: [null, false, [], "invalid"] }).pagination.total, 0);
  assert.ok(store.findBestMajorCombinations({ results: [null, { combination: "A00", score: 26.4, scale: 30, year: 2026, method: "THPT", ruleId: "three-subject-sum-priority-2026" }] }).pagination.total > 0);
});

test("normalize search hỗ trợ tiếng Việt có và không dấu", () => {
  assert.equal(normalizeSearch("Tự động hóa"), "tu dong hoa");
  assert.equal(normalizeSearch("ĐẠI HỌC"), "dai hoc");
});

test("từ khóa Tìm ngành chỉ khớp tên ngành và phân biệt toán với toàn khi có dấu", () => {
  const names = ["Toán học", "Sư phạm Toán học", "Kế toán", "An toàn thông tin", "Ngôn ngữ Hàn Quốc", "Công nghệ thông tin"];
  const keywordStore = createDataStore({ universities, combinations, majors: names.map((name, index) => ({
    ...majors[0], id: `keyword-${index}`, code: `748020${index}`, name,
    combination: "A00 (Toán, Vật lí, Hóa học); A01"
  })) });
  for (const q of ["toán", "TOÁN", "toán".normalize("NFD")]) {
    assert.deepEqual(keywordStore.listMajors({ q }).items.map((item) => item.name).sort(), names.slice(0, 3).sort());
    assert.deepEqual(keywordStore.findBestMajorCombinations({ q, year: 2026, results: [
      { combination: "A01", score: 26.4, scale: 30, method: "THPT", ruleId: "three-subject-sum-priority-2026" }
    ] }).items.map((item) => item.name).sort(), names.slice(0, 3).sort());
  }
  assert.deepEqual(keywordStore.listMajors({ q: "toàn" }).items.map((item) => item.name), ["An toàn thông tin"]);
  assert.deepEqual(keywordStore.listMajors({ q: "ngon ngu han quoc" }).items.map((item) => item.name), ["Ngôn ngữ Hàn Quốc"]);
  for (const q of ["A00", "Vật lí", "THPT", "748020", "Giao thông vận tải"]) {
    assert.equal(keywordStore.listMajors({ q }).pagination.total, 0, q);
  }
  assert.equal(keywordStore.listMajors({ q: "", method: "THPT", combination: "A01" }).pagination.total, names.length);
});

test("tìm ngành điện điện tử không cần nhập đúng dấu phẩy hoặc gạch ngang của tên ngành", () => {
  const names = ["Công nghệ kỹ thuật điện, điện tử", "Kỹ thuật điện – điện tử", "Kỹ thuật điện-điện tử"];
  const electricalStore = createDataStore({ universities, combinations, majors: names.map((name, index) => ({ ...majors[0], id: `electrical-${index}`, name })) });
  for (const q of ["điện điện tử", "DIEN DIEN TU", "điện, điện tử", "điện-điện tử"]) {
    assert.equal(electricalStore.listMajors({ q }).pagination.total, 3);
    assert.equal(electricalStore.findBestMajorCombinations({ q, year: 2026, results: [{ combination: "A00", score: 26.4, scale: 30, method: "THPT", ruleId: "three-subject-sum-priority-2026" }] }).pagination.total, 3);
  }
  assert.equal(electricalStore.listMajors({ q: "ngôn ngữ" }).pagination.total, 0);
});

test("major filter dùng đúng token tổ hợp", () => {
  const result = store.listMajors({ combination: "A01", pageSize: 100 });
  assert.deepEqual(result.items.map((item) => item.id), ["m-a01"]);
});

test("so sánh chỉ chạy khi cùng năm, phương thức, thang điểm và quy tắc", () => {
  const compatible = store.listMajors({ method: "THPT", combination: "A00", year: 2026, score: 25.5, scale: 30, ruleId: "three-subject-sum-priority-2026", status: "verified,reference", pageSize: 100 });
  assert.ok(compatible.items.every((item) => item.comparison?.compatible === true));
  const incompatible = store.listMajors({ method: "ĐGNL HSA", year: 2026, score: 25.5, scale: 30, status: "reference", pageSize: 100 });
  assert.equal(incompatible.items[0].comparison.compatible, false);
  assert.match(incompatible.items[0].comparison.reason, /phương thức|thang điểm|căn cứ/i);
});

test("tìm nhiều tổ hợp không bỏ dòng thứ 51 và phân trang sau khi gộp", () => {
  const manyMajors = Array.from({ length: 75 }, (_, index) => ({
    id: `m-${index + 1}`, universityId: "u1", code: `748${String(index).padStart(4, "0")}`, name: `Ngành ${index + 1}`,
    combination: index % 2 ? "A00; A01" : "A00", method: "THPT", formula: "verified-thpt", calculationVerified: true,
    comparisonRules: { A00: "three-subject-sum-priority-2026", A01: "three-subject-sum-priority-2026" },
    cutoff: { year: 2026, score: 20 + (index % 5), scale: 30, status: "verified", sourceUrl: `https://hidden.example/${index}` }
  }));
  const largeStore = createDataStore({ universities, majors: manyMajors, combinations, subjects: [] });
  const input = { year: 2026, pageSize: 24, page: 3, results: [
    { combination: "A00", score: 25, scale: 30, method: "THPT", ruleId: "three-subject-sum-priority-2026" },
    { combination: "A01", score: 26, scale: 30, method: "THPT", ruleId: "three-subject-sum-priority-2026" }
  ] };
  const result = largeStore.findBestMajorCombinations(input);
  assert.equal(result.pagination.total, 75);
  assert.equal(result.pagination.pages, 4);
  assert.equal(result.pagination.page, 3);
  assert.equal(result.items.length, 24);
  assert.ok(result.items.some((item) => Number(item.id.slice(2)) > 50));
  assert.ok(result.items.filter((item) => item.combination.includes("A01")).every((item) => item.combinationMatch.combination === "A01"));
  const filtered = largeStore.findBestMajorCombinations({ ...input, page: 1, maxScore: 21, cutoffScale: 30 });
  assert.equal(filtered.pagination.total, 30);
  assert.equal(largeStore.findBestMajorCombinations({ ...input, page: 1, maxScore: 21, cutoffScale: 150 }).pagination.total, 0);
});

test("tìm một tổ hợp xác định khả năng so sánh và chênh lệch trước phân trang", () => {
  const rows = Array.from({ length: 75 }, (_, index) => ({
    id: `ordered-${index}`, universityId: "u1", code: `7${String(index).padStart(6, "0")}`, name: `Chương trình ${index}`,
    combination: "A00", method: "THPT", calculationVerified: index >= 60,
    comparisonRules: index >= 60 ? { A00: "three-subject-sum-priority-2026" } : undefined,
    cutoff: { year: 2026, score: index >= 60 ? 20 + (index - 60) / 10 : 10 + index / 100, scale: 30, status: "verified", sourceUrl: `https://hidden.example/ordered-${index}` }
  }));
  const orderedStore = createDataStore({ universities, majors: rows, combinations, subjects: [] });
  const result = orderedStore.listMajors({
    combination: "A00", method: "THPT", year: 2026, score: 25, scale: 30,
    ruleId: "three-subject-sum-priority-2026", status: "verified", sort: "difference-desc", page: 1, pageSize: 10
  });
  assert.equal(result.pagination.total, 75);
  assert.equal(result.items.length, 10);
  assert.ok(result.items.every((item) => item.comparison.compatible));
  assert.ok(result.items.every((item) => item.comparison.userScore === 25));
  assert.ok(result.items[0].comparison.difference >= result.items.at(-1).comparison.difference);
});

test("kết quả API store được làm sạch nhưng giữ website trường", () => {
  const item = store.listMajors({ ids: "m-a01" }).items[0];
  assert.equal(item.cutoff.status, "reference");
  assert.equal(item.university.website, "https://uth.example.edu.vn");
  assert.doesNotMatch(JSON.stringify(item), /sourceUrl|hidden\.example/i);
  assert.equal(Object.hasOwn(store.publicCombinations[0], "raw"), false);
});

test("search dùng index và giới hạn số kết quả", () => {
  assert.match(JSON.stringify(store.search("tu dong hoa", 30)), /Tự động hóa/);
  assert.match(JSON.stringify(store.search("7480201", 30)), /7480201/);
  assert.ok(store.search("cong nghe", 1).length <= 1);
  const u1Programs = store.search("7480201", 30).filter((item) => item.type === "major" && item.item.universityId === "u1");
  assert.equal(u1Programs.length, 1, "global search không nên lặp cùng chương trình theo từng dòng phương thức");
});

test("tra cứu trường dùng được mã tuyển sinh chính thức", () => {
  const result = store.listUniversities({ q: "GHA", pageSize: 10 });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].officialAdmissionsCode, "GHA");
  assert.equal(result.items[0].code, "UTH");
});
