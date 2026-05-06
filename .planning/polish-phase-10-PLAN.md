# Phase 10 — Keyboard Shortcuts

**Prerequisites:** Phase 1 (toolbar New button), Phase 3 (`editingId` state).

**Goal:** Dashboard keyboard navigation and actions. `?` opens cheat sheet.

**Files:** Create `src/keyboardController.ts`, `src/keyboardCheatSheetModal.ts`, `tests/resolveKeyAction.test.ts`. Modify `src/view.ts`.

---

### Task 1: resolveKeyAction pure function

- [ ] **Step 1:** Failing test:

```typescript
import { resolveKeyAction } from "../src/keyboardController";

const evt = (key: string, target: { tagName?: string } = {}) => ({ key, target } as any);

describe("resolveKeyAction", () => {
  it("j → next", () => expect(resolveKeyAction(evt("j"), null, false)).toBe("next"));
  it("k → prev", () => expect(resolveKeyAction(evt("k"), null, false)).toBe("prev"));
  it("Space → toggle-done", () => expect(resolveKeyAction(evt(" "), null, false)).toBe("toggle-done"));
  it("Enter → show", () => expect(resolveKeyAction(evt("Enter"), null, false)).toBe("show"));
  it("e → edit", () => expect(resolveKeyAction(evt("e"), null, false)).toBe("edit"));
  it("i → in-progress", () => expect(resolveKeyAction(evt("i"), null, false)).toBe("toggle-in-progress"));
  it("Delete → archive", () => expect(resolveKeyAction(evt("Delete"), null, false)).toBe("archive"));
  it("/ → focus-search", () => expect(resolveKeyAction(evt("/"), null, false)).toBe("focus-search"));
  it("? → cheat-sheet", () => expect(resolveKeyAction(evt("?"), null, false)).toBe("cheat-sheet"));
  it("G → bottom", () => expect(resolveKeyAction(evt("G"), null, false)).toBe("bottom"));

  it("suppressed when input focused", () => {
    expect(resolveKeyAction(evt("j", { tagName: "INPUT" }), null, false)).toBeNull();
  });
  it("suppressed during inline edit", () => {
    expect(resolveKeyAction(evt("j"), null, true)).toBeNull();
  });
  it("g g sequence → top", () => {
    expect(resolveKeyAction(evt("g"), null, false)).toBe("g-pending");
    expect(resolveKeyAction(evt("g"), "g-pending", false)).toBe("top");
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3:** Implement `src/keyboardController.ts`:

```typescript
export type KeyAction =
  | "next" | "prev" | "show" | "toggle-done" | "toggle-in-progress"
  | "edit" | "archive" | "delete-hard" | "focus-search" | "cheat-sheet"
  | "top" | "bottom" | "g-pending";

export function resolveKeyAction(
  event: { key: string; shiftKey?: boolean; target?: unknown },
  previousAction: string | null,
  isEditing: boolean,
): KeyAction | null {
  if (isEditing) return null;
  const target = event.target as { tagName?: string } | null;
  const tag = target?.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return null;

  const k = event.key;
  if (k === "j" || k === "ArrowDown") return "next";
  if (k === "k" || k === "ArrowUp") return "prev";
  if (k === "Enter") return "show";
  if (k === " ") return "toggle-done";
  if (k === "i") return "toggle-in-progress";
  if (k === "e") return "edit";
  if (k === "Delete" || k === "Backspace") {
    return event.shiftKey ? "delete-hard" : "archive";
  }
  if (k === "/") return "focus-search";
  if (k === "?") return "cheat-sheet";
  if (k === "G") return "bottom";
  if (k === "g") {
    return previousAction === "g-pending" ? "top" : "g-pending";
  }
  return null;
}
```

- [ ] **Step 4:** PASS.

- [ ] **Step 5:** Commit `feat: resolveKeyAction pure key resolver`.

---

### Task 2: Wire handler into ReminderView

- [ ] **Step 1:** Add to `view.ts`:

```typescript
private focusedRowIdx: number = -1;
private lastKeyAction: string | null = null;
private keydownHandler = (e: KeyboardEvent) => this.handleKey(e);

async onOpen() {
  // ... existing
  document.addEventListener("keydown", this.keydownHandler);
}

async onClose() {
  document.removeEventListener("keydown", this.keydownHandler);
  // ... existing
}

private handleKey(e: KeyboardEvent): void {
  // Only handle when this view is the active leaf
  if (this.app.workspace.activeLeaf?.view !== this) return;
  const action = resolveKeyAction(
    { key: e.key, shiftKey: e.shiftKey, target: e.target },
    this.lastKeyAction,
    this.editingId !== null,
  );
  if (action === null) return;
  e.preventDefault();
  this.lastKeyAction = action === "g-pending" ? "g-pending" : null;
  void this.dispatchKeyAction(action);
}

private async dispatchKeyAction(action: KeyAction): Promise<void> {
  // Implement each action — focus row, scroll, toggle, etc.
  // Use this.scrapedTasks and this.focusedRowIdx
  // Specifics omitted here for brevity — straightforward DOM ops
}
```

- [ ] **Step 2:** Add CSS focus ring:

```css
.qr-view-row.is-focused { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }
```

- [ ] **Step 3:** Commit `feat: dashboard keyboard controller`.

---

### Task 3: Cheat sheet modal

- [ ] **Step 1:** Create `src/keyboardCheatSheetModal.ts`:

```typescript
import { App, Modal } from "obsidian";

export class KeyboardCheatSheetModal extends Modal {
  constructor(app: App) { super(app); }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Keyboard shortcuts" });
    const rows: [string, string][] = [
      ["j / ↓", "Next row"],
      ["k / ↑", "Previous row"],
      ["Enter", "Show source"],
      ["Space", "Toggle done"],
      ["i", "Toggle in-progress"],
      ["e", "Edit task text"],
      ["Delete", "Archive (Shift+Delete = hard delete)"],
      ["/", "Focus search"],
      ["g g", "Top"],
      ["G", "Bottom"],
      ["?", "This sheet"],
    ];
    const table = contentEl.createEl("table");
    for (const [key, desc] of rows) {
      const tr = table.createEl("tr");
      tr.createEl("td", { text: key }).style.fontFamily = "monospace";
      tr.createEl("td", { text: desc });
    }
  }
  onClose(): void { this.contentEl.empty(); }
}
```

- [ ] **Step 2:** Wire `cheat-sheet` action to open the modal. Add a keyboard icon button in the toolbar that opens the same modal.

- [ ] **Step 3:** Commit `feat: keyboard cheat sheet modal + toolbar icon`.

---

### Task 4: Version + CHANGELOG + README

- [ ] **Step 1:** Bump patch.
- [ ] **Step 2:** CHANGELOG: "Phase 10: keyboard shortcuts with `?` cheat sheet."
- [ ] **Step 3:** README keyboard section.
- [ ] **Step 4:** Commit.

## Verification

- [ ] Tests: ≥10 resolveKeyAction scenarios.
- [ ] Manual: typing in search doesn't fire row keys.
- [ ] Manual: `?` opens cheat sheet.
- [ ] Manual: `g g` two-step works.
- [ ] Manual: focus ring visible on selected row.
