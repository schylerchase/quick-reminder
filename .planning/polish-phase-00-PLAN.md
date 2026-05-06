# Phase 0 — Safety Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vitest test harness, atomic write primitive (`vault.process`), 3-line hash verification, pure-function module extraction, inline-field foundation, and tabbed settings — invisible to user but unlocks every subsequent polish-roadmap phase safely.

**Architecture:** All task-mutating writes route through a new `verifyAndWrite` helper that wraps Obsidian's `vault.process` (atomic against editor buffers) and verifies a `(prev-line, target-line, next-line)` content-hash trio before applying mutation. Parsing logic extracted to `src/scannerCore.ts` (zero `obsidian` imports) for unit testability. Inline-field reading/writing extracted to `src/inlineFields.ts` (bracket-balanced parser, not regex). Settings UI splits into 4 sub-tabs to cap sprawl before later phases add toggles.

**Tech Stack:** TypeScript 5.x, Vitest 1.x, esbuild, Obsidian Plugin API ≥1.4.0, FNV-1a (hand-rolled, no crypto deps).

**File touchpoint summary:**
- Create: `vitest.config.ts`, `tests/__mocks__/obsidian.ts`, `src/scannerCore.ts`, `src/inlineFields.ts`, `tests/scannerCore.test.ts`, `tests/inlineFields.test.ts`, `tests/verifyAndWrite.test.ts`, `tests/hash.test.ts`.
- Modify: `src/types.ts`, `src/taskScanner.ts`, `src/view.ts` (lines 728, 781, 808), `src/main.ts:878-1048` (settings tab split), `package.json`, `manifest.json`, `CHANGELOG.md`, `README.md`.

---

### Task 1: Vitest dependencies and config

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1:** Add devDeps. Run from project root:

```bash
npm install --save-dev vitest @vitest/ui
```

- [ ] **Step 2:** Add `test` and `test:watch` scripts in `package.json`:

```json
"scripts": {
  "build": "node esbuild.config.mjs production",
  "dev": "node esbuild.config.mjs",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3:** Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "tests/__mocks__/obsidian.ts"),
    },
  },
});
```

- [ ] **Step 4:** Run `npm test`. Expected: `No test files found, exiting with code 1` (acceptable — harness wired, no tests yet).

- [ ] **Step 5:** Commit:

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test harness"
```

---

### Task 2: Obsidian mock module

**Files:**
- Create: `tests/__mocks__/obsidian.ts`

- [ ] **Step 1:** Create the mock with minimal surface — just enough for scanner code to compile and `instanceof TFile` checks to succeed:

```typescript
export class TFile {
  path: string = "";
  extension: string = "md";
  basename: string = "";
  parent: TFolder | null = null;
  stat: { mtime: number; ctime: number; size: number } = { mtime: 0, ctime: 0, size: 0 };
}

export class TFolder {
  path: string = "";
  children: (TFile | TFolder)[] = [];
}

export class TAbstractFile {
  path: string = "";
}

export function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
}

export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export class Modal {
  app: unknown;
  contentEl: { empty(): void; createDiv(): unknown } = {
    empty() {},
    createDiv() { return {}; },
  };
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
  constructor(app: unknown) { this.app = app; }
}

export type EventRef = { ref: string };

export class App {
  vault = {
    read: async (_file: TFile): Promise<string> => "",
    cachedRead: async (_file: TFile): Promise<string> => "",
    modify: async (_file: TFile, _data: string): Promise<void> => {},
    process: async (_file: TFile, fn: (data: string) => string): Promise<string> => fn(""),
    getAbstractFileByPath: (_path: string): TAbstractFile | null => null,
    getMarkdownFiles: (): TFile[] => [],
    on: (_event: string, _cb: (...args: unknown[]) => void): EventRef => ({ ref: "" }),
    offref: (_ref: EventRef): void => {},
  };
  workspace = {
    on: (_event: string, _cb: (...args: unknown[]) => void): EventRef => ({ ref: "" }),
  };
}
```

- [ ] **Step 2:** Verify the file compiles standalone:

```bash
npx tsc --noEmit tests/__mocks__/obsidian.ts
```

Expected: no errors.

- [ ] **Step 3:** Commit:

```bash
git add tests/__mocks__/obsidian.ts
git commit -m "test: add minimal obsidian mock for vitest"
```

---

### Task 3: Extract scannerCore.ts pure parsing

**Files:**
- Create: `src/scannerCore.ts`
- Create: `tests/scannerCore.test.ts`
- Modify: `src/taskScanner.ts`

- [ ] **Step 1:** Write the failing test first. Create `tests/scannerCore.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseCheckboxLine, parseMarkerLine, getCheckboxStatus, getCheckboxStatusMarker } from "../src/scannerCore";

describe("parseCheckboxLine", () => {
  it("parses todo checkbox", () => {
    const result = parseCheckboxLine("- [ ] Buy milk");
    expect(result).toEqual({ status: "todo", text: "Buy milk" });
  });

  it("parses in-progress checkbox", () => {
    expect(parseCheckboxLine("- [/] Working on it")?.status).toBe("in-progress");
  });

  it("parses completed checkbox", () => {
    expect(parseCheckboxLine("- [x] Done")?.status).toBe("completed");
  });

  it("returns null for non-checkbox", () => {
    expect(parseCheckboxLine("Some text")).toBeNull();
  });

  it("preserves leading whitespace handling", () => {
    expect(parseCheckboxLine("  - [ ] Indented")?.text).toBe("Indented");
  });
});

describe("parseMarkerLine", () => {
  it("parses TODO marker", () => {
    expect(parseMarkerLine("TODO: refactor this")).toEqual({ marker: "TODO", text: "refactor this" });
  });

  it("parses FIXME marker", () => {
    expect(parseMarkerLine("FIXME: bug here")?.marker).toBe("FIXME");
  });

  it("returns null for non-marker", () => {
    expect(parseMarkerLine("regular text")).toBeNull();
  });
});

describe("getCheckboxStatusMarker", () => {
  it("maps statuses correctly", () => {
    expect(getCheckboxStatusMarker("todo")).toBe(" ");
    expect(getCheckboxStatusMarker("in-progress")).toBe("/");
    expect(getCheckboxStatusMarker("completed")).toBe("x");
  });
});
```

- [ ] **Step 2:** Run the test to verify it fails:

```bash
npm test
```

Expected: FAIL with "Cannot find module '../src/scannerCore'".

- [ ] **Step 3:** Create `src/scannerCore.ts` with the pure functions extracted from `taskScanner.ts`:

```typescript
export const CHECKBOX_TASK_RE = /^\s*[-*+]\s+\[(?<status>[^\]])\]\s+(?<text>.+)$/;
export const TODO_MARKER_RE = /^\s*(?:[-*+]\s+)?(?<marker>TODO|FIXME|TASK):\s*(?<text>.+)$/;
export const FENCE_RE = /^\s*(```|~~~)/;
export const HEADING_RE = /^\s{0,3}#{1,6}\s+(?<heading>.+?)\s*#*\s*$/;

export type CheckboxStatus = "todo" | "in-progress" | "completed";

export interface CheckboxParseResult {
  status: CheckboxStatus;
  text: string;
}

export interface MarkerParseResult {
  marker: string;
  text: string;
}

export function parseCheckboxLine(line: string): CheckboxParseResult | null {
  const m = line.match(CHECKBOX_TASK_RE);
  if (!m?.groups) return null;
  return {
    status: getCheckboxStatus(m.groups.status),
    text: m.groups.text.trim(),
  };
}

export function parseMarkerLine(line: string): MarkerParseResult | null {
  const m = line.match(TODO_MARKER_RE);
  const text = m?.groups?.text.trim();
  if (!m?.groups || !text) return null;
  return {
    marker: m.groups.marker.toUpperCase(),
    text,
  };
}

export function getCheckboxStatus(raw: string): CheckboxStatus {
  const c = raw.trim().toLowerCase();
  if (c === "x") return "completed";
  if (c === "/") return "in-progress";
  return "todo";
}

export function getCheckboxStatusMarker(status: CheckboxStatus): string {
  if (status === "completed") return "x";
  if (status === "in-progress") return "/";
  return " ";
}

export function isScannableTaskLine(line: string): boolean {
  return CHECKBOX_TASK_RE.test(line) || TODO_MARKER_RE.test(line);
}
```

- [ ] **Step 4:** Run tests, expect PASS:

```bash
npm test
```

Expected: 9/9 pass.

- [ ] **Step 5:** Refactor `src/taskScanner.ts` to import from scannerCore. Replace top-of-file regex consts and helper functions with imports:

```typescript
import { App, TFile, normalizePath } from "obsidian";
import { ScrapedTask } from "./types";
import {
  CHECKBOX_TASK_RE,
  TODO_MARKER_RE,
  FENCE_RE,
  HEADING_RE,
  parseCheckboxLine,
  parseMarkerLine,
  getCheckboxStatusMarker,
  isScannableTaskLine,
  type CheckboxStatus,
} from "./scannerCore";
```

Delete the duplicated regex consts and `getCheckboxStatus` / `getCheckboxStatusMarker` / `isScannableTaskLine` from taskScanner.ts. Update `parseCheckboxTask` and `parseMarkerTask` internal helpers to use the new functions.

- [ ] **Step 6:** Run `npm run build`. Expected: clean build.

- [ ] **Step 7:** Commit:

```bash
git add src/scannerCore.ts tests/scannerCore.test.ts src/taskScanner.ts
git commit -m "refactor: extract pure parsing to scannerCore for unit testing"
```

---

### Task 4: Inline fields module — getInlineField

**Files:**
- Create: `src/inlineFields.ts`
- Create: `tests/inlineFields.test.ts`

- [ ] **Step 1:** Write failing tests in `tests/inlineFields.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getInlineField } from "../src/inlineFields";

describe("getInlineField", () => {
  it("reads simple field", () => {
    expect(getInlineField("Task [priority:: high]", "priority")).toBe("high");
  });

  it("reads field with whitespace", () => {
    expect(getInlineField("Task [due::  2026-05-10  ]", "due")).toBe("2026-05-10");
  });

  it("returns null when field absent", () => {
    expect(getInlineField("Task without metadata", "priority")).toBeNull();
  });

  it("handles wikilink-valued fields (nested brackets)", () => {
    expect(getInlineField("Task [link:: [[Daily Note]]]", "link")).toBe("[[Daily Note]]");
  });

  it("returns null on unclosed bracket", () => {
    expect(getInlineField("Task [priority:: high", "priority")).toBeNull();
  });

  it("is case-insensitive on key", () => {
    expect(getInlineField("Task [Priority:: high]", "priority")).toBe("high");
  });

  it("ignores non-matching key", () => {
    expect(getInlineField("Task [other:: value]", "priority")).toBeNull();
  });
});
```

- [ ] **Step 2:** Run, expect FAIL:

```bash
npm test
```

- [ ] **Step 3:** Create `src/inlineFields.ts` with bracket-balanced parser:

```typescript
export function getInlineField(line: string, key: string): string | null {
  const lower = line.toLowerCase();
  const needle = `[${key.toLowerCase()}::`;
  const start = lower.indexOf(needle);
  if (start === -1) return null;

  const valueStart = start + needle.length;
  let depth = 1;
  let i = valueStart;
  while (i < line.length && depth > 0) {
    const ch = line[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) return null;
  return line.slice(valueStart, i).trim();
}
```

- [ ] **Step 4:** Run tests, expect 7/7 PASS:

```bash
npm test
```

- [ ] **Step 5:** Commit:

```bash
git add src/inlineFields.ts tests/inlineFields.test.ts
git commit -m "feat: add inlineFields.getInlineField with bracket-balanced parser"
```

---

### Task 5: Inline fields — setInlineField

**Files:**
- Modify: `src/inlineFields.ts`
- Modify: `tests/inlineFields.test.ts`

- [ ] **Step 1:** Add failing tests:

```typescript
import { setInlineField } from "../src/inlineFields";

describe("setInlineField", () => {
  it("appends new field when absent", () => {
    expect(setInlineField("Task body", "priority", "high")).toBe("Task body [priority:: high]");
  });

  it("replaces existing field in place", () => {
    expect(setInlineField("Task [priority:: low] more", "priority", "high"))
      .toBe("Task [priority:: high] more");
  });

  it("preserves wikilink values when updating sibling field", () => {
    const result = setInlineField("Task [link:: [[Note]]] [priority:: low]", "priority", "high");
    expect(result).toBe("Task [link:: [[Note]]] [priority:: high]");
  });

  it("appends with single space when line has trailing whitespace", () => {
    expect(setInlineField("Task ", "priority", "high")).toBe("Task [priority:: high]");
  });
});
```

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3:** Implement in `src/inlineFields.ts`:

```typescript
export function setInlineField(line: string, key: string, value: string): string {
  const existing = findFieldRange(line, key);
  if (existing) {
    return line.slice(0, existing.start) + `[${key}:: ${value}]` + line.slice(existing.end);
  }
  return `${line.replace(/\s+$/, "")} [${key}:: ${value}]`;
}

function findFieldRange(line: string, key: string): { start: number; end: number } | null {
  const lower = line.toLowerCase();
  const needle = `[${key.toLowerCase()}::`;
  const start = lower.indexOf(needle);
  if (start === -1) return null;
  let depth = 1;
  let i = start + needle.length;
  while (i < line.length && depth > 0) {
    const ch = line[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    if (depth === 0) return { start, end: i + 1 };
    i++;
  }
  return null;
}
```

Refactor `getInlineField` to reuse `findFieldRange`:

```typescript
export function getInlineField(line: string, key: string): string | null {
  const range = findFieldRange(line, key);
  if (!range) return null;
  const valueStart = range.start + `[${key}::`.length;
  return line.slice(valueStart, range.end - 1).trim();
}
```

- [ ] **Step 4:** Run tests, expect all PASS.

- [ ] **Step 5:** Commit:

```bash
git add src/inlineFields.ts tests/inlineFields.test.ts
git commit -m "feat: add setInlineField with in-place replacement"
```

---

### Task 6: Inline fields — removeInlineField

**Files:**
- Modify: `src/inlineFields.ts`
- Modify: `tests/inlineFields.test.ts`

- [ ] **Step 1:** Failing tests:

```typescript
import { removeInlineField } from "../src/inlineFields";

describe("removeInlineField", () => {
  it("removes field cleanly", () => {
    expect(removeInlineField("Task [priority:: high] more", "priority"))
      .toBe("Task more");
  });

  it("collapses double space after removal", () => {
    expect(removeInlineField("Task  [priority:: high]  more", "priority"))
      .toBe("Task more");
  });

  it("removes trailing field", () => {
    expect(removeInlineField("Task [priority:: high]", "priority")).toBe("Task");
  });

  it("returns line unchanged when field absent", () => {
    expect(removeInlineField("Task body", "priority")).toBe("Task body");
  });
});
```

- [ ] **Step 2:** Run, FAIL.

- [ ] **Step 3:** Implement:

```typescript
export function removeInlineField(line: string, key: string): string {
  const range = findFieldRange(line, key);
  if (!range) return line;
  const before = line.slice(0, range.start).replace(/\s+$/, "");
  const after = line.slice(range.end).replace(/^\s+/, "");
  if (before.length === 0) return after;
  if (after.length === 0) return before;
  return `${before} ${after}`;
}
```

- [ ] **Step 4:** Run, PASS.

- [ ] **Step 5:** Commit:

```bash
git add src/inlineFields.ts tests/inlineFields.test.ts
git commit -m "feat: add removeInlineField with whitespace cleanup"
```

---

### Task 7: FNV-1a hash function

**Files:**
- Create: `src/hash.ts`
- Create: `tests/hash.test.ts`

- [ ] **Step 1:** Failing tests:

```typescript
import { describe, it, expect } from "vitest";
import { fnv1a } from "../src/hash";

describe("fnv1a", () => {
  it("returns 8-char hex string", () => {
    expect(fnv1a("hello")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic", () => {
    expect(fnv1a("same input")).toBe(fnv1a("same input"));
  });

  it("differs for different inputs", () => {
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
  });

  it("differs by leading whitespace (no trim)", () => {
    expect(fnv1a("  task")).not.toBe(fnv1a("task"));
  });

  it("handles empty string", () => {
    expect(fnv1a("")).toMatch(/^[0-9a-f]{8}$/);
  });
});
```

- [ ] **Step 2:** Run, FAIL.

- [ ] **Step 3:** Create `src/hash.ts`:

```typescript
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
```

- [ ] **Step 4:** Run, PASS.

- [ ] **Step 5:** Commit:

```bash
git add src/hash.ts tests/hash.test.ts
git commit -m "feat: add FNV-1a sync hash for line verification"
```

---

### Task 8: Hash trio fields on ScrapedTask

**Files:**
- Modify: `src/types.ts`
- Modify: `src/taskScanner.ts`

- [ ] **Step 1:** Update `ScrapedTask` in `src/types.ts`:

```typescript
export interface ScrapedTask {
  id: string;
  text: string;
  filePath: string;
  line: number;
  kind: "checkbox" | "marker";
  status: "todo" | "in-progress" | "completed" | "marker";
  completed: boolean;
  category: string;
  project: string;
  marker?: string;
  expectedLineHash: string;
  expectedPrevHash: string;
  expectedNextHash: string;
}
```

- [ ] **Step 2:** Update `parseCheckboxTask` and `parseMarkerTask` in `src/taskScanner.ts` to accept lines array + index, populate hash trio:

```typescript
import { fnv1a } from "./hash";

function parseTaskLine(file: TFile, lines: string[], lineIndex: number, category: string): ScrapedTask | null {
  const line = lines[lineIndex];
  return parseCheckboxTask(file, lines, lineIndex, category)
      ?? parseMarkerTask(file, lines, lineIndex, category);
}

function parseCheckboxTask(file: TFile, lines: string[], lineIndex: number, category: string): ScrapedTask | null {
  const line = lines[lineIndex];
  const parsed = parseCheckboxLine(line);
  if (!parsed) return null;
  return {
    id: `${file.path}:${lineIndex + 1}:checkbox`,
    text: parsed.text,
    filePath: file.path,
    line: lineIndex + 1,
    kind: "checkbox",
    status: parsed.status,
    completed: parsed.status === "completed",
    category,
    project: getProjectName(file),
    expectedLineHash: fnv1a(line),
    expectedPrevHash: fnv1a(lines[lineIndex - 1] ?? ""),
    expectedNextHash: fnv1a(lines[lineIndex + 1] ?? ""),
  };
}
```

Apply the same shape to `parseMarkerTask`. Update the `lines.forEach` caller to pass the array and index.

- [ ] **Step 3:** Run `npm run build`. Expected: clean.

- [ ] **Step 4:** Run `npm test`. Existing tests should still pass (parseCheckboxLine signature unchanged).

- [ ] **Step 5:** Commit:

```bash
git add src/types.ts src/taskScanner.ts
git commit -m "feat: add hash trio (prev/line/next) to ScrapedTask"
```

---

### Task 9: verifyAndWrite via vault.process

**Files:**
- Modify: `src/taskScanner.ts`
- Create: `tests/verifyAndWrite.test.ts`

- [ ] **Step 1:** Failing test in `tests/verifyAndWrite.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { TaskScanner } from "../src/taskScanner";
import { TFile } from "obsidian";
import { fnv1a } from "../src/hash";
import type { ScrapedTask } from "../src/types";

function makeApp(content: string) {
  let stored = content;
  const file = Object.assign(new TFile(), { path: "note.md" });
  return {
    file,
    stored: () => stored,
    app: {
      vault: {
        getAbstractFileByPath: () => file,
        process: async (_f: TFile, fn: (data: string) => string) => {
          stored = fn(stored);
          return stored;
        },
        read: async () => stored,
        getMarkdownFiles: () => [],
      },
    } as unknown as ConstructorParameters<typeof TaskScanner>[0],
  };
}

function fakeTask(lines: string[], idx: number): ScrapedTask {
  return {
    id: `note.md:${idx + 1}:checkbox`,
    text: "x",
    filePath: "note.md",
    line: idx + 1,
    kind: "checkbox",
    status: "todo",
    completed: false,
    category: "",
    project: "",
    expectedLineHash: fnv1a(lines[idx]),
    expectedPrevHash: fnv1a(lines[idx - 1] ?? ""),
    expectedNextHash: fnv1a(lines[idx + 1] ?? ""),
  };
}

describe("verifyAndWrite", () => {
  it("applies mutator when hash trio matches", async () => {
    const lines = ["before", "- [ ] target", "after"];
    const env = makeApp(lines.join("\n"));
    const scanner = new TaskScanner(env.app);
    const task = fakeTask(lines, 1);
    const result = await scanner.verifyAndWrite(task, (line) => line.replace("[ ]", "[x]"));
    expect(result).toBe("ok");
    expect(env.stored()).toContain("- [x] target");
  });

  it("returns 'stale' when target line changed", async () => {
    const lines = ["before", "- [ ] target", "after"];
    const env = makeApp(lines.join("\n"));
    const scanner = new TaskScanner(env.app);
    const task = fakeTask(lines, 1);
    // simulate external edit
    const newLines = ["before", "- [ ] DIFFERENT", "after"];
    (env.app.vault as unknown as { read: () => Promise<string> }).read =
      async () => newLines.join("\n");
    (env.app.vault as unknown as { process: (f: TFile, fn: (d: string) => string) => Promise<string> })
      .process = async (_f, fn) => fn(newLines.join("\n"));
    const result = await scanner.verifyAndWrite(task, (line) => line.replace("[ ]", "[x]"));
    expect(result).toBe("stale");
  });

  it("returns 'stale' when neighbor changed (duplicate-text protection)", async () => {
    // Two identical task lines; line above the second changed
    const lines = ["- [ ] same", "- [ ] same", "after"];
    const env = makeApp(lines.join("\n"));
    const scanner = new TaskScanner(env.app);
    // Build task pointing at line 1 (idx 1 in 0-based) with hash trio from original lines
    const task = fakeTask(lines, 1);
    // External edit changes the prev line content but not the target
    const newLines = ["- [x] same", "- [ ] same", "after"];
    (env.app.vault as unknown as { read: () => Promise<string> }).read =
      async () => newLines.join("\n");
    (env.app.vault as unknown as { process: (f: TFile, fn: (d: string) => string) => Promise<string> })
      .process = async (_f, fn) => fn(newLines.join("\n"));
    const result = await scanner.verifyAndWrite(task, (line) => line.replace("[ ]", "[x]"));
    expect(result).toBe("stale");
  });

  it("delete via mutator returning null removes line", async () => {
    const lines = ["before", "- [ ] target", "after"];
    const env = makeApp(lines.join("\n"));
    const scanner = new TaskScanner(env.app);
    const task = fakeTask(lines, 1);
    const result = await scanner.verifyAndWrite(task, () => null);
    expect(result).toBe("ok");
    expect(env.stored()).not.toContain("target");
  });
});
```

- [ ] **Step 2:** Run, expect FAIL (verifyAndWrite not defined).

- [ ] **Step 3:** Implement on `TaskScanner` class in `src/taskScanner.ts`:

```typescript
async verifyAndWrite(
  task: ScrapedTask,
  mutator: (line: string) => string | null,
): Promise<"ok" | "stale" | "error"> {
  const file = this.app.vault.getAbstractFileByPath(task.filePath);
  if (!(file instanceof TFile)) return "error";

  let outcome: "ok" | "stale" = "ok";
  await this.app.vault.process(file, (data: string) => {
    const newline = data.includes("\r\n") ? "\r\n" : "\n";
    const lines = data.split(/\r?\n/);
    const idx = task.line - 1;
    const target = lines[idx];
    if (target === undefined) {
      outcome = "stale";
      return data;
    }
    const prev = lines[idx - 1] ?? "";
    const next = lines[idx + 1] ?? "";
    if (
      fnv1a(target) !== task.expectedLineHash ||
      fnv1a(prev) !== task.expectedPrevHash ||
      fnv1a(next) !== task.expectedNextHash
    ) {
      outcome = "stale";
      return data;
    }
    const mutated = mutator(target);
    if (mutated === null) {
      lines.splice(idx, 1);
    } else {
      lines[idx] = mutated;
    }
    return lines.join(newline);
  });
  return outcome;
}
```

Add `import { fnv1a } from "./hash";` at top.

- [ ] **Step 4:** Run tests, expect 4/4 PASS.

- [ ] **Step 5:** Commit:

```bash
git add src/taskScanner.ts tests/verifyAndWrite.test.ts
git commit -m "feat: add verifyAndWrite with hash-trio verification via vault.process"
```

---

### Task 10: Refactor setCheckboxStatus through verifyAndWrite

**Files:**
- Modify: `src/taskScanner.ts`

- [ ] **Step 1:** Replace existing `setCheckboxStatus` body:

```typescript
async setCheckboxStatus(
  task: ScrapedTask,
  status: CheckboxStatus,
): Promise<"ok" | "stale" | "error"> {
  if (task.kind !== "checkbox") return "error";
  return this.verifyAndWrite(task, (line) => {
    if (!CHECKBOX_TASK_RE.test(line)) return null;
    return line.replace(/\[[^\]]\]/, `[${getCheckboxStatusMarker(status)}]`);
  });
}
```

Update `completeCheckbox` and `uncompleteCheckbox` to forward the new return type.

- [ ] **Step 2:** Run `npm run build`. Fix any type errors at view.ts call sites — temporarily ignore by `void` casting; full call-site update is Task 13.

- [ ] **Step 3:** Run `npm test`. Existing scanner tests should still pass.

- [ ] **Step 4:** Commit:

```bash
git add src/taskScanner.ts
git commit -m "refactor: setCheckboxStatus routes through verifyAndWrite"
```

---

### Task 11: Refactor replaceTaskLine through verifyAndWrite

**Files:**
- Modify: `src/taskScanner.ts`

- [ ] **Step 1:** Replace existing `replaceTaskLine` body:

```typescript
async replaceTaskLine(task: ScrapedTask, nextLine: string): Promise<"ok" | "stale" | "error"> {
  return this.verifyAndWrite(task, (line) => {
    if (!CHECKBOX_TASK_RE.test(line)) return null;
    return nextLine;
  });
}
```

- [ ] **Step 2:** Build clean. Test pass.

- [ ] **Step 3:** Commit:

```bash
git add src/taskScanner.ts
git commit -m "refactor: replaceTaskLine routes through verifyAndWrite"
```

---

### Task 12: Refactor deleteTaskLine through verifyAndWrite

**Files:**
- Modify: `src/taskScanner.ts`

- [ ] **Step 1:** Replace existing `deleteTaskLine` body:

```typescript
async deleteTaskLine(task: ScrapedTask): Promise<"ok" | "stale" | "error"> {
  return this.verifyAndWrite(task, (line) => {
    if (!isScannableTaskLine(line)) return line;
    return null;
  });
}
```

- [ ] **Step 2:** Build clean. Test pass.

- [ ] **Step 3:** Commit:

```bash
git add src/taskScanner.ts
git commit -m "refactor: deleteTaskLine routes through verifyAndWrite"
```

---

### Task 13: Update view.ts call sites for stale branch

**Files:**
- Modify: `src/view.ts`

- [ ] **Step 1:** At `view.ts:728` `updateTaskStatus`, handle the new return:

```typescript
private async updateTaskStatus(
  task: ScrapedTask,
  status: "todo" | "in-progress" | "completed",
  successMessage: string,
): Promise<void> {
  const result = await this.taskScanner.setCheckboxStatus(task, status);
  if (result === "stale") {
    await this.refreshScrapedTasks();
    await this.render();
    new Notice("Task changed since last scan, rescanning...");
    return;
  }
  if (result === "error") {
    new Notice("Could not update task — file not found.");
    return;
  }
  await this.render();
  new Notice(successMessage);
}
```

- [ ] **Step 2:** At `view.ts:781` `editWithTasksPlugin`, after the call to `replaceTaskLine`, branch on result similarly.

- [ ] **Step 3:** At `view.ts:808` `deleteTask`, branch on `deleteTaskLine` result similarly.

- [ ] **Step 4:** Build clean.

- [ ] **Step 5:** Manual smoke test: load plugin in vault, click Done on a task, confirm normal flow works. Open same file in editor, make unsaved edit to the task line, click Done in dashboard — expect "Task changed since last scan, rescanning..." notice.

- [ ] **Step 6:** Commit:

```bash
git add src/view.ts
git commit -m "feat: surface stale-rescan branch in view action handlers"
```

---

### Task 14: Tabbed settings layout

**Files:**
- Modify: `src/main.ts:878-1048` (the `QuickReminderSettingTab` class)

- [ ] **Step 1:** Replace the `display()` method to render 4 tabs. Approach: create a tab strip, then a content container; each tab click clears content and renders that tab's settings:

```typescript
class QuickReminderSettingTab extends PluginSettingTab {
  private activeTab: "safety" | "metadata" | "display" | "integrations" = "safety";

  constructor(app: App, private plugin: QuickReminderPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Quick Reminder Settings" });

    const tabs = containerEl.createDiv({ cls: "qr-settings-tabs" });
    const tabContent = containerEl.createDiv({ cls: "qr-settings-tab-content" });

    const renderTab = (id: typeof this.activeTab, label: string) => {
      const btn = tabs.createEl("button", { text: label, cls: "qr-settings-tab" });
      btn.toggleClass("is-active", this.activeTab === id);
      btn.onclick = () => {
        this.activeTab = id;
        this.display();
      };
    };

    renderTab("safety", "Safety");
    renderTab("metadata", "Metadata");
    renderTab("display", "Display");
    renderTab("integrations", "Integrations");

    if (this.activeTab === "safety") this.renderSafetyTab(tabContent);
    if (this.activeTab === "metadata") this.renderMetadataTab(tabContent);
    if (this.activeTab === "display") this.renderDisplayTab(tabContent);
    if (this.activeTab === "integrations") this.renderIntegrationsTab(tabContent);
  }

  private renderSafetyTab(parent: HTMLElement): void {
    new Setting(parent)
      .setName("Fire missed reminders on launch")
      .setDesc("If Obsidian was closed when a reminder was due, show it when you reopen.")
      .addToggle((t) => t.setValue(this.plugin.store.settings.fireMissedOnLaunch).onChange(async (v) => {
        await this.plugin.store.updateSettings({ fireMissedOnLaunch: v });
      }));
    // ... move existing safety-relevant settings here
  }

  private renderMetadataTab(parent: HTMLElement): void {
    // taskSectionHeadings, autoInsertTaskSections, taskSectionAutoInsertFolders, mirrorToMarkdown, mirrorFilePath
  }

  private renderDisplayTab(parent: HTMLElement): void {
    // autoRevealActiveFile, soundOnNotify
  }

  private renderIntegrationsTab(parent: HTMLElement): void {
    // tasksIntegrationEnabled, checkForUpdatesOnLaunch, plugin updates button
  }
}
```

Move the existing settings into the appropriate tab method based on category. Today's full list:
- Safety: `fireMissedOnLaunch`, `defaultSnoozeMinutes`
- Metadata: `mirrorToMarkdown`, `mirrorFilePath`, `taskSectionHeadings`, `autoInsertTaskSections`, `taskSectionAutoInsertFolders`, `Insert task sections` button
- Display: `soundOnNotify`, `autoRevealActiveFile`
- Integrations: `tasksIntegrationEnabled`, `checkForUpdatesOnLaunch`, `Plugin updates`

- [ ] **Step 2:** Add minimal CSS in `styles.css`:

```css
.qr-settings-tabs {
  display: flex;
  gap: 0.25em;
  border-bottom: 1px solid var(--background-modifier-border);
  margin-bottom: 1em;
}
.qr-settings-tab {
  background: transparent;
  border: none;
  padding: 0.5em 1em;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.qr-settings-tab.is-active {
  border-bottom-color: var(--interactive-accent);
  color: var(--text-normal);
}
```

- [ ] **Step 3:** Build clean. Manual test: open settings, click each tab, verify settings appear under expected tab.

- [ ] **Step 4:** Commit:

```bash
git add src/main.ts styles.css
git commit -m "feat: tabbed settings layout (Safety/Metadata/Display/Integrations)"
```

---

### Task 15: Version bump + CHANGELOG + README

**Files:**
- Modify: `manifest.json`, `package.json`, `CHANGELOG.md` (create if absent), `README.md`

- [ ] **Step 1:** Bump version:

```bash
# Read current version, increment patch, write to both files
node -e "const m=require('./manifest.json'); const p=require('./package.json'); const [a,b,c]=m.version.split('.'); const v=`${a}.${b}.${parseInt(c)+1}`; m.version=v; p.version=v; require('fs').writeFileSync('./manifest.json', JSON.stringify(m,null,2)+'\n'); require('fs').writeFileSync('./package.json', JSON.stringify(p,null,2)+'\n'); console.log(v);"
```

- [ ] **Step 2:** Create or update `CHANGELOG.md` with a v0.1.x entry:

```markdown
# Changelog

## v0.1.x — Phase 0: Safety foundation

- Added Vitest test harness with Obsidian mock module.
- Extracted pure parsing into `scannerCore.ts` and `inlineFields.ts` (zero `obsidian` import) for unit testability.
- All task-mutating writes now route through `verifyAndWrite` using `vault.process` — atomic against open editor buffers.
- Added 3-line content-hash verification (prev / target / next) to detect stale scans, including duplicate-text false-match protection.
- Settings UI split into 4 sub-tabs: Safety, Metadata, Display, Integrations.
- No user-visible behavior change. Subsequent phases build on this foundation.
```

- [ ] **Step 3:** Update `README.md` with a new "Safety" section noting that the dashboard surfaces a "Task changed since last scan, rescanning..." notice when source files change between scan and action.

- [ ] **Step 4:** Run `npm run build` + `npm test` + manual plugin reload in test vault. Confirm green.

- [ ] **Step 5:** Commit:

```bash
git add manifest.json package.json CHANGELOG.md README.md
git commit -m "chore: bump to v0.1.x for Phase 0 safety foundation"
```

---

## Phase 0 verification checklist

- [ ] `npm run build` clean.
- [ ] `npm test` ≥18 tests pass (scannerCore, inlineFields, hash, verifyAndWrite).
- [ ] Manual: stale-rescan notice fires when target line content changes externally.
- [ ] Manual: stale-rescan notice fires when neighbor line content changes (duplicate-text protection).
- [ ] Manual: editor with unsaved buffer + dashboard click → both writes land via `vault.process`.
- [ ] Manual: existing `ignoredTaskIds` survive upgrade — no orphan ignores.
- [ ] Settings panel renders 4 tabs; all existing settings discoverable under correct tab.
- [ ] Manifest version bumped, CHANGELOG entry added, README "Safety" section present.

## Success criteria

Phase 0 ships invisibly to users but unlocks every subsequent phase:
- Phase 1+ inserts new tasks via the same `vault.process` primitive — no race with editor buffer.
- Phase 3 inline edit reuses `inlineFields.ts` for metadata-suffix preservation.
- Phase 4/5/11 mutations all run through `verifyAndWrite` — stale scans never silently corrupt unrelated lines.
- Settings tabs accommodate ~14 new toggles across phases without becoming a flat 25-field list.
