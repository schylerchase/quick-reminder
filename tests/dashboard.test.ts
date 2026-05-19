import test from "node:test";
import assert from "node:assert/strict";
import { openMainViewLeaf, openRightSidebarViewLeaf } from "../src/workspace";

test("openMainViewLeaf reuses the active main-pane leaf instead of splitting", async () => {
  // The current contract: "Dashboard" should TAKE OVER the active note tab
  // (no vertical split), then reveal + activate it. Previously this test
  // asserted the opposite — the split-on-open behavior was a known iPad bug.
  const noteLeaf = createLeaf("markdown", true);
  const workspace = {
    rightSplit: {
      collapseCalls: 0,
      collapse() {
        this.collapseCalls += 1;
      },
    },
    rootSplit: {},
    activeLeaf: noteLeaf,
    getLeafCalls: 0,
    getLeavesOfType: () => [],
    getMostRecentLeaf(_root?: unknown) {
      return noteLeaf;
    },
    iterateAllLeaves(cb: (leaf: MockLeaf) => void) {
      cb(noteLeaf);
    },
    getLeaf: (_type: string, _direction?: string) => {
      // Fallback path — must not be taken when an existing main-pane leaf is available.
      workspace.getLeafCalls += 1;
      return noteLeaf;
    },
    async revealLeaf(leaf: MockLeaf) {
      leaf.revealed = true;
    },
    setActiveLeaf(leaf: MockLeaf) {
      this.activeLeaf = leaf;
    },
  };

  const result = await openMainViewLeaf(workspace as never, "quick-reminder-view");

  assert.equal(result, noteLeaf, "should return the reused main-pane leaf");
  assert.equal(workspace.getLeafCalls, 0, "must not fall through to getLeaf split");
  assert.deepEqual(noteLeaf.setViewStateCalls, [
    { type: "quick-reminder-view", active: true },
  ]);
  assert.equal(noteLeaf.revealed, true);
  assert.equal(workspace.activeLeaf, noteLeaf);
  assert.equal(workspace.rightSplit.collapseCalls, 1);
});

test("openMainViewLeaf prefers an existing leaf of the requested view type", async () => {
  const dashboardLeaf = createLeaf("quick-reminder-view", true);
  const noteLeaf = createLeaf("markdown", true);
  const workspace = {
    rightSplit: { collapse() {} },
    rootSplit: {},
    activeLeaf: noteLeaf,
    getLeavesOfType: (type: string) =>
      type === "quick-reminder-view" ? [dashboardLeaf] : [],
    getMostRecentLeaf() {
      return noteLeaf;
    },
    iterateAllLeaves() {},
    getLeaf: () => noteLeaf,
    async revealLeaf(leaf: MockLeaf) {
      leaf.revealed = true;
    },
    setActiveLeaf(leaf: MockLeaf) {
      this.activeLeaf = leaf;
    },
  };

  const result = await openMainViewLeaf(workspace as never, "quick-reminder-view");

  assert.equal(result, dashboardLeaf, "existing dashboard leaf should be reused");
  // viewType matches → no setViewState needed
  assert.equal(dashboardLeaf.setViewStateCalls.length, 0);
  assert.equal(noteLeaf.setViewStateCalls.length, 0);
});

test("openRightSidebarViewLeaf reuses the restored sidebar leaf", async () => {
  const sidebarLeaf = createLeaf("quick-reminder-view", "right");
  const fallbackLeaf = createLeaf("markdown", "right");
  const workspace = {
    rightSplit: {
      expandCalls: 0,
      expand() {
        this.expandCalls += 1;
      },
    },
    getRightLeafCalls: 0,
    getLeavesOfType: (type: string) =>
      type === "quick-reminder-view" ? [sidebarLeaf] : [],
    getRightLeaf: () => {
      workspace.getRightLeafCalls += 1;
      return fallbackLeaf;
    },
  };

  const result = await openRightSidebarViewLeaf(
    workspace as never,
    "quick-reminder-view",
  );

  assert.equal(result, sidebarLeaf, "should keep the restored sidebar leaf in place");
  assert.equal(workspace.getRightLeafCalls, 0, "must not allocate a replacement sidebar leaf");
  assert.equal(sidebarLeaf.setViewStateCalls.length, 0);
  assert.equal(fallbackLeaf.setViewStateCalls.length, 0);
  assert.equal(sidebarLeaf.loadCalls, 1);
  assert.equal(workspace.rightSplit.expandCalls, 1);
});

test("openRightSidebarViewLeaf preserves a restored left sidebar leaf", async () => {
  const sidebarLeaf = createLeaf("quick-reminder-view", "left");
  const fallbackLeaf = createLeaf("markdown", "right");
  const workspace = {
    rightSplit: {
      expandCalls: 0,
      expand() {
        this.expandCalls += 1;
      },
    },
    getRightLeafCalls: 0,
    getLeavesOfType: (type: string) =>
      type === "quick-reminder-view" ? [sidebarLeaf] : [],
    getRightLeaf: () => {
      workspace.getRightLeafCalls += 1;
      return fallbackLeaf;
    },
  };

  const result = await openRightSidebarViewLeaf(
    workspace as never,
    "quick-reminder-view",
  );

  assert.equal(result, sidebarLeaf, "should keep the restored left sidebar leaf in place");
  assert.equal(workspace.getRightLeafCalls, 0, "must not allocate a right sidebar replacement");
  assert.equal(sidebarLeaf.setViewStateCalls.length, 0);
  assert.equal(fallbackLeaf.setViewStateCalls.length, 0);
  assert.equal(sidebarLeaf.loadCalls, 1);
});

interface MockLeaf {
  view: {
    getViewType(): string;
    containerEl: { closest(selector: string): Element | null };
  };
  setViewStateCalls: Array<{ type: string; active: boolean }>;
  openFileCalls: number;
  loadCalls: number;
  revealed: boolean;
  loadIfDeferred(): Promise<void>;
  setViewState(state: { type: string; active: boolean }): Promise<void>;
  openFile(): Promise<void>;
}

function createLeaf(
  viewType: string,
  location: boolean | "main" | "left" | "right" = true,
): MockLeaf {
  const pane = typeof location === "boolean" ? (location ? "main" : "right") : location;
  return {
    view: {
      getViewType: () => viewType,
      containerEl: {
        closest: (selector: string) => {
          if (pane === "main") return null;
          if (pane === "right" && (selector.includes("mod-right-split") || selector.includes(".mod-right"))) {
            return {} as Element;
          }
          if (pane === "left" && (selector.includes("mod-left-split") || selector.includes(".mod-left"))) {
            return {} as Element;
          }
          if (selector.includes("mod-left-split") && selector.includes("mod-right-split")) {
            return {} as Element;
          }
          return null;
        },
      },
    },
    setViewStateCalls: [],
    openFileCalls: 0,
    loadCalls: 0,
    revealed: false,
    async loadIfDeferred() {
      this.loadCalls += 1;
    },
    async setViewState(state) {
      this.setViewStateCalls.push(state);
    },
    async openFile() {
      this.openFileCalls += 1;
    },
  };
}
