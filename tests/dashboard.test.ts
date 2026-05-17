import test from "node:test";
import assert from "node:assert/strict";
import { openMainViewLeaf } from "../src/workspace";

test("openMainViewLeaf does not replace or reopen the active markdown leaf", async () => {
  const noteLeaf = createLeaf("markdown", true);
  const dashboardLeaf = createLeaf("empty", true);
  const workspace = {
    rightSplit: {
      collapseCalls: 0,
      collapse() {
        this.collapseCalls += 1;
      },
    },
    activeLeaf: noteLeaf,
    getLeavesOfType: () => [],
    getLeaf: (type: string, direction?: string) => {
      assert.equal(type, "split");
      assert.equal(direction, "vertical");
      return dashboardLeaf;
    },
    async revealLeaf(leaf: MockLeaf) {
      leaf.revealed = true;
    },
    setActiveLeaf(leaf: MockLeaf) {
      this.activeLeaf = leaf;
    },
  };

  const result = await openMainViewLeaf(workspace as never, "quick-reminder-view");

  assert.equal(result, dashboardLeaf);
  assert.equal(noteLeaf.setViewStateCalls.length, 0);
  assert.equal(noteLeaf.openFileCalls, 0);
  assert.deepEqual(dashboardLeaf.setViewStateCalls, [
    { type: "quick-reminder-view", active: true },
  ]);
  assert.equal(dashboardLeaf.openFileCalls, 0);
  assert.equal(workspace.activeLeaf, dashboardLeaf);
  assert.equal(workspace.rightSplit.collapseCalls, 1);
});

interface MockLeaf {
  view: {
    getViewType(): string;
    containerEl: { closest(selector: string): Element | null };
  };
  setViewStateCalls: Array<{ type: string; active: boolean }>;
  openFileCalls: number;
  revealed: boolean;
  loadIfDeferred(): Promise<void>;
  setViewState(state: { type: string; active: boolean }): Promise<void>;
  openFile(): Promise<void>;
}

function createLeaf(viewType: string, isMainLeaf: boolean): MockLeaf {
  return {
    view: {
      getViewType: () => viewType,
      containerEl: {
        closest: () => (isMainLeaf ? null : document.createElement("div")),
      },
    },
    setViewStateCalls: [],
    openFileCalls: 0,
    revealed: false,
    async loadIfDeferred() {},
    async setViewState(state) {
      this.setViewStateCalls.push(state);
    },
    async openFile() {
      this.openFileCalls += 1;
    },
  };
}
