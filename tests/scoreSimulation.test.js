import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { simulateScoreChange } from "../public/js/core/scoreSimulation.js";
import { debounce } from "../public/js/utils.js";

test("mô phỏng tính trên bản sao và không sửa điểm thật", () => {
  const entries = [{ subjectKey: "math", score: 7 }, { subjectKey: "physics", score: 8 }];
  const result = simulateScoreChange({ entries, subjectKey: "math", delta: 1, calculate: (items) => items.reduce((sum, item) => sum + item.score, 0) });
  assert.equal(entries[0].score, 7);
  assert.equal(result.before, 15);
  assert.equal(result.after, 16);
  assert.equal(result.simulatedScore, 8);
});

test("mô phỏng từ chối điểm vượt khoảng", () => {
  assert.throws(() => simulateScoreChange({ entries: [{ subjectKey: "math", score: 10 }], subjectKey: "math", delta: 0.5, calculate: () => 0 }), /0 đến 10/);
});

test("đóng hoặc thay modal hủy mô phỏng đang debounce và xóa kết quả cũ", async () => {
  const source = await readFile(new URL("../public/js/main.js", import.meta.url), "utf8");
  const methods = source.slice(source.indexOf("  openModal(content, trigger) {"), source.indexOf("  openCalculationModal() {"));
  const classList = { add() {}, remove() {} };
  const Fixture = vm.runInNewContext(`(class { ${methods} })`, { document: { body: { classList } } });
  const originalWindow = globalThis.window;
  globalThis.window = { setTimeout };
  try {
    for (const operation of ["close", "replace"]) {
      const app = new Fixture();
      app.elements = { modal: { classList, querySelector: () => ({ focus() {} }) }, modalBody: { innerHTML: "simulation" } };
      app.pendingSimulation = { simulatedScore: 9 };
      let updates = 0;
      app.simulationUpdate = debounce(() => { updates += 1; }, 10);
      app.simulationUpdate();
      if (operation === "close") app.closeModal(false);
      else app.openModal("different dialog", { focus() {} });
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(updates, 0);
      assert.equal(app.simulationUpdate, null);
      assert.equal(app.pendingSimulation, null);
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
