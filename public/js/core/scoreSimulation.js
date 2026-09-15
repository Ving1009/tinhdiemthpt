export function simulateScoreChange({ entries, subjectKey, delta, calculate }) {
  if (!Array.isArray(entries) || typeof calculate !== "function") throw new Error("Thiếu dữ liệu mô phỏng.");
  const change = Number(delta);
  if (!Number.isFinite(change)) throw new Error("Mức thay đổi điểm không hợp lệ.");
  const original = entries.map((item) => ({ ...item, score: Number(item.score) }));
  const target = original.find((item) => item.subjectKey === subjectKey);
  if (!target) throw new Error("Không tìm thấy môn cần mô phỏng.");
  const nextValue = Number((target.score + change).toFixed(2));
  if (nextValue < 0 || nextValue > 10) throw new Error("Điểm mô phỏng phải nằm trong khoảng 0 đến 10.");
  const simulated = original.map((item) => item.subjectKey === subjectKey ? { ...item, score: nextValue } : { ...item });
  return { original, simulated, before: calculate(original), after: calculate(simulated), subjectKey, originalScore: target.score, simulatedScore: nextValue };
}
