# Testing Patterns

**Analysis Date:** 2026-04-18

## Current State — CONCERN: No tests exist

**There are zero test files in this codebase.** This is an MVP; tests have not been written yet. The only `*.test.ts` files on disk are vendored inside `node_modules/chrono-node/test/` and do not belong to this project.

**Impact:**
- Every bugfix and refactor requires manual verification inside Obsidian
- Regressions in the parser (`src/parser.ts`), persistence (`src/store.ts`), and timer logic (`src/scheduler.ts`) cannot be caught automatically
- The `setTimeout`-based scheduler has subtle edge cases (overflow clamp at `2_147_483_000` in `src/scheduler.ts:28`, overdue rescan behaviour in `src/scheduler.ts:49-64`, snooze re-arming in `src/store.ts:68-75`) that are difficult to exercise by hand
- As features accumulate, the cost of lacking tests compounds

**This gap should be flagged in `CONCERNS.md` as a priority item.** Below is the recommended path forward.

## Test Framework

**None configured.** `package.json` has no `test` script, no test runner dependencies (`jest`, `vitest`, `mocha`, etc.).

**Recommendation: Vitest**

Reasons it fits this codebase:
- Native ESM / TypeScript support — matches the existing `"module": "ESNext"` / `"target": "ES2020"` config in `tsconfig.json`
- Built-in fake-timer support (`vi.useFakeTimers()`, `vi.advanceTimersByTime()`) — needed for `src/scheduler.ts`
- First-class mocking API (`vi.fn()`, `vi.mock()`) — needed to stub the Obsidian `App` for `src/store.ts`
- No Babel config required (unlike Jest) — keeps the toolchain minimal, consistent with esbuild-only bundling
- Fast cold-start — important for an MVP where tests should run on every save

**Proposed additions to `package.json`:**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0"
  }
}
```

**Proposed `vitest.config.ts` at project root:**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",           // jsdom only needed if DOM/view tests are added
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/main.ts"],    // main.ts is wiring; test behavior in the units it composes
    },
  },
});
```

## Recommended Test File Organization

**Location:** Co-locate tests alongside source files — `src/parser.test.ts` next to `src/parser.ts`. Keeps the unit under test one click away, matches the flat project layout.

**Naming:**
- `{module}.test.ts` for unit tests of that module
- `{module}.integration.test.ts` for tests that wire multiple modules together (e.g., store + scheduler + fake timers)

**Proposed structure:**

```
src/
├── parser.ts
├── parser.test.ts                # pure — no mocks needed
├── store.ts
├── store.test.ts                 # mock App + load/save callbacks
├── scheduler.ts
├── scheduler.integration.test.ts # fake timers + real store w/ mock App
├── view.ts                       # defer — DOM-heavy, low ROI for MVP
├── modal.ts                      # defer — DOM-heavy, low ROI for MVP
├── main.ts                       # defer — pure wiring
└── types.ts                      # no tests (no logic)
```

## Recommended Test Structure

**Suite organization (Vitest):**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseReminder } from "./parser";

describe("parseReminder", () => {
  const REF = new Date("2026-04-18T12:00:00Z");

  describe("empty / invalid input", () => {
    it("returns empty result for empty string", () => {
      expect(parseReminder("", REF)).toEqual({
        text: "",
        dueAt: null,
        matchedText: null,
      });
    });
  });

  describe("with matched time phrase", () => {
    it("extracts dueAt and strips phrase from text", () => {
      const result = parseReminder("call mom tomorrow at 3pm", REF);
      expect(result.dueAt).not.toBeNull();
      expect(result.text).toBe("call mom");
      expect(result.matchedText).toContain("tomorrow");
    });
  });
});
```

**Patterns:**
- `describe` blocks mirror the observable behaviors, not the internal methods
- Always pass an explicit reference date to `parseReminder` — never rely on real `Date.now()`
- Use `beforeEach` for shared setup; prefer per-test fixtures over module-level state

## Mocking

**Framework:** Vitest built-ins (`vi.fn()`, `vi.spyOn()`, `vi.mock()`, `vi.useFakeTimers()`).

### Mocking the Obsidian `App` (for `store.test.ts`)

`ReminderStore` takes an `App` in its constructor (`src/store.ts:8-14`) but only uses `app.vault.getAbstractFileByPath`, `app.vault.modify`, and `app.vault.create` — and only when `mirrorToMarkdown` is enabled (`src/store.ts:95-104`). A minimal mock is enough:

```typescript
import { vi } from "vitest";
import type { App, TFile } from "obsidian";

function createMockApp(): App {
  return {
    vault: {
      getAbstractFileByPath: vi.fn().mockReturnValue(null),
      modify: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as App;
}

// stub load/save callbacks
const storage = new Map<string, unknown>();
const load = vi.fn(async () => (storage.get("data") ?? null) as any);
const save = vi.fn(async (d: unknown) => { storage.set("data", d); });
```

Because the store already accepts `load`/`save` as constructor params (DI pattern in `src/main.ts:23-29`), there is no need to mock `Plugin.loadData` / `Plugin.saveData` — just pass the stubs directly.

### Mocking the `obsidian` module (for `Notice`, `normalizePath`, `TFile`)

`src/store.ts:1` imports `normalizePath` and `TFile`; `src/scheduler.ts:1` imports `Notice`. Stub the module surface used by the code under test:

```typescript
vi.mock("obsidian", () => ({
  Notice: vi.fn(),
  normalizePath: (p: string) => p,
  TFile: class {},
}));
```

### Fake timers (for `scheduler.integration.test.ts`)

Required because `Scheduler.schedule` uses `setTimeout` (`src/scheduler.ts:29`).

```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { Scheduler } from "./scheduler";
import { ReminderStore } from "./store";

describe("Scheduler (integration)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("fires onFire callback when reminder is due", async () => {
    const store = new ReminderStore(createMockApp(), async () => null, async () => {});
    await store.init();
    const onFire = vi.fn();
    const scheduler = new Scheduler(store, onFire);

    const reminder = {
      id: "r1", text: "test", rawInput: "test in 5 minutes",
      dueAt: Date.now() + 5 * 60_000, createdAt: Date.now(), notified: false,
    };
    await store.add(reminder);
    scheduler.schedule(reminder);

    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(onFire).toHaveBeenCalledWith(reminder);
  });
});
```

**What to mock:**
- Obsidian framework surface (`App`, `Notice`, `TFile`, `normalizePath`)
- Browser `Notification` API (for `src/scheduler.ts:77-102`) — `globalThis.Notification = vi.fn(...) as any` or delete it to exercise the fallback
- `setTimeout` — via `vi.useFakeTimers()`, not by hand

**What NOT to mock:**
- `chrono-node` — it's the whole point of `parseReminder`. Let it run for real with a fixed reference date.
- `Date.now()` — prefer injecting a clock or using `vi.setSystemTime()` at the test boundary; do not stub it globally
- The module under test itself

## Fixtures and Factories

**Recommended pattern — factory functions co-located with the test file or in a shared helper:**

```typescript
// src/test-utils.ts (new file)
import type { Reminder, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  const now = Date.now();
  return {
    id: `r_${now.toString(36)}`,
    text: "test reminder",
    rawInput: "test reminder tomorrow 3pm",
    dueAt: now + 60_000,
    createdAt: now,
    notified: false,
    ...overrides,
  };
}

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}
```

**Location:** `src/test-utils.ts` — sibling of source modules, matches the flat layout. Not imported by production code; tree-shaken out by esbuild regardless.

## Coverage

**Recommendation for MVP:** No enforced threshold yet. Start by covering `src/parser.ts` and `src/store.ts` behaviors; grow from there.

**Realistic targets once baseline exists:**
- `src/parser.ts` → 100% (pure function, cheap to cover)
- `src/store.ts` → 80%+ (mutation paths + mirror rendering)
- `src/scheduler.ts` → 70%+ (schedule/cancel/overdue paths; native `Notification` fallback)
- `src/view.ts` / `src/modal.ts` → defer until there's a reason (DOM assertions are high-cost, low-ROI for an MVP)

**View coverage:**

```bash
npm run test -- --coverage
open coverage/index.html
```

## Test Types

### Unit tests

**`src/parser.test.ts`** — pure, highest ROI first target

- `parseReminder("")` → empty result
- `parseReminder("no time here")` → `{ text, dueAt: null }`
- `parseReminder("call mom tomorrow at 3pm", REF)` → extracts `dueAt`, strips phrase from `text`
- `parseReminder("in 10 minutes", REF)` → dueAt ≈ REF + 10 min
- `stripMatchedPhrase` edge cases (via `parseReminder`): matched phrase at start, middle, end; trailing connectors (`at`, `on`, `by`) stripped
- Forward-date option: ambiguous day resolves to future (`forwardDate: true` in `src/parser.ts:15`)

**`src/store.test.ts`** — with mock App + stubbed load/save

- `init` with no saved data → uses `DEFAULT_SETTINGS`
- `init` with partial saved settings → merged with defaults (`src/store.ts:37-41`)
- `add` → persisted, listeners notified
- `markNotified` → sets flag, unknown id is a no-op
- `snooze` → updates `dueAt`, sets `snoozedFrom`, clears `notified` (`src/store.ts:68-75`)
- `remove` → filters out id
- `get all` → sorted by dueAt; caller mutation doesn't affect store (`[...this.data.reminders]` in `src/store.ts:49`)
- `get pending` → excludes notified
- `persist` → calls `save`, triggers mirror when enabled, survives mirror failure (`.catch` in `src/store.ts:90`)
- Listener error isolation — one throwing listener doesn't break the others (`src/store.ts:24-32`)

### Integration tests

**`src/scheduler.integration.test.ts`** — fake timers + real store + mock App

- `schedule` with `dueAt` in the past → no timer set (`src/scheduler.ts:25-27`)
- `schedule` with `dueAt` in the future → fires after `advanceTimersByTime`
- `schedule` with `dueAt` > 2_147_483_000 ms from now → clamped (`src/scheduler.ts:28`)
- `schedule` same id twice → previous timer cancelled (`src/scheduler.ts:23`)
- `cancel` → clears timer, removes from map
- `cancelAll` → clears every timer
- `scheduleAll` → clears existing then schedules all pending
- `scanOverdue` with `fireMissedOnLaunch=false` → no-op (`src/scheduler.ts:50`)
- `scanOverdue` with 1 overdue → fires immediately
- `scanOverdue` with N overdue → shows consolidated `Notice`, then fires each
- `fire` with `Notification` undefined → falls through to `Notice` fallback (`src/scheduler.ts:66-74`)
- End-to-end: `store.add(pastReminder)` → `scanOverdue` → `onFire` invoked → `store.markNotified` → `pending` excludes it

### E2E / DOM tests

**Not recommended for MVP.** `ReminderView` (`src/view.ts`) and the modals (`src/modal.ts`) lean heavily on Obsidian's `createEl`/`createDiv` helpers and the `ItemView` / `Modal` lifecycle, which are awkward to reproduce outside Obsidian. Defer until either:
1. A DOM-layer bug warrants it, or
2. The plugin ships and a proper Obsidian test harness (e.g., a headless Electron fixture) exists

For now, view/modal behavior is validated by manual smoke tests during dev.

## Common Patterns (proposed)

**Async testing:**

```typescript
it("persists reminder after add", async () => {
  const save = vi.fn(async () => {});
  const store = new ReminderStore(createMockApp(), async () => null, save);
  await store.init();

  await store.add(makeReminder());
  expect(save).toHaveBeenCalledOnce();
});
```

**Error-path testing:**

```typescript
it("continues notifying other listeners when one throws", async () => {
  const store = new ReminderStore(createMockApp(), async () => null, async () => {});
  await store.init();

  const bad = vi.fn(() => { throw new Error("boom"); });
  const good = vi.fn();
  store.onChange(bad);
  store.onChange(good);

  await store.add(makeReminder());
  expect(bad).toHaveBeenCalled();
  expect(good).toHaveBeenCalled();   // not short-circuited by bad's throw
});
```

**Time-sensitive testing with fake timers:**

```typescript
it("fires reminder at dueAt", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-18T12:00:00Z"));

  const onFire = vi.fn();
  const scheduler = new Scheduler(store, onFire);
  scheduler.schedule(makeReminder({ dueAt: Date.now() + 60_000 }));

  vi.advanceTimersByTime(60_001);
  expect(onFire).toHaveBeenCalledOnce();

  vi.useRealTimers();
});
```

## Run Commands (once set up)

```bash
npm test                # Run all tests once
npm run test:watch      # Watch mode during development
npm test -- --coverage  # With coverage report
npm test parser         # Run only parser tests (name filter)
```

---

*Testing analysis: 2026-04-18*
