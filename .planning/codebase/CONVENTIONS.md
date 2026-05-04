# Coding Conventions

**Analysis Date:** 2026-04-18

## Naming Patterns

**Files:**
- Lowercase single-word filenames: `main.ts`, `modal.ts`, `parser.ts`, `scheduler.ts`, `store.ts`, `types.ts`, `view.ts`
- One primary module per file; filename reflects the domain concept (not the class name)
- No prefix/suffix scheme (no `*.service.ts`, `*.utils.ts`) — small codebase, flat layout

**Classes:**
- `PascalCase`, domain-oriented nouns
- Examples: `QuickReminderPlugin` (`src/main.ts:18`), `ReminderStore` (`src/store.ts:4`), `Scheduler` (`src/scheduler.ts:7`), `QuickCaptureModal` / `ReminderListModal` (`src/modal.ts:7`, `src/modal.ts:113`), `ReminderView` (`src/view.ts:9`), `QuickReminderSettingTab` (`src/main.ts:172`)

**Functions / methods:**
- `camelCase` verbs: `parseReminder`, `scheduleAll`, `cancelAll`, `scanOverdue`, `markNotified`, `snooze`, `renderPreview`, `convertSelectionToReminder`
- Private helpers use no prefix — visibility is declared via TypeScript `private` (see `private fire()` in `src/scheduler.ts:66`, `private notify()` in `src/store.ts:24`)
- Module-local helpers at bottom of file are plain `function` declarations: `formatDate` (`src/store.ts:134`), `formatWhen` (`src/view.ts:140`), `stripMatchedPhrase` (`src/parser.ts:33`), `showNativeNotification` (`src/scheduler.ts:77`), `genId` (`src/modal.ts:172`)

**Variables / fields:**
- `camelCase` throughout: `dueAt`, `rawInput`, `createdAt`, `snoozedFrom`, `currentParse`, `refreshHandler`
- Timestamps use `At` suffix (`dueAt`, `createdAt`, `snoozedFrom`) and hold `number` (epoch ms), not `Date` — see `src/types.ts:1`
- Booleans use plain adjective form (`notified`, `mirrorToMarkdown`, `fireMissedOnLaunch`, `soundOnNotify`) — no `is_*`/`has_*` prefix convention in this codebase

**Constants:**
- Exported top-level constants are `SCREAMING_SNAKE_CASE`: `DEFAULT_SETTINGS` (`src/types.ts:24`), `VIEW_TYPE_REMINDER` (`src/view.ts:7`)

**Types / interfaces:**
- `PascalCase`, no `I`-prefix: `Reminder`, `PluginData`, `Settings`, `ParseResult`, `FireCallback`
- Type aliases for callbacks: `type FireCallback = (reminder: Reminder) => void;` (`src/scheduler.ts:5`)

## Code Style

**TypeScript compiler:**
- Config: `tsconfig.json`
- `strictNullChecks: true` — all nullables must be handled explicitly
- `noImplicitAny: true` — every parameter and return must be typed (or inferrable)
- `isolatedModules: true` — no const enums, no `export =` from modules
- Target: `ES2020`, module: `ESNext`, `moduleResolution: "node"`
- Libs: `DOM`, `ES2020` (browser + modern JS)

**Linting / formatting:**
- No ESLint, Prettier, or Biome config present
- Consistency is maintained by hand — follow the patterns already in `src/`

**Indentation / spacing:**
- 2-space indent
- Trailing commas in multi-line argument lists and object literals (see constructor params in `src/modal.ts:12-17`)
- Double quotes for strings (`"obsidian"`, `"alarm-clock"`)
- Semicolons required at statement ends

**Type annotations:**
- Always annotate public method return types, including `void` and `Promise<void>` (see `src/main.ts:22`, `src/store.ts:34`, `src/scheduler.ts:22`)
- Prefer `readonly` / `private` modifiers on class fields where possible
- Use definite-assignment `!` assertion only for fields set in async `onload` / Obsidian lifecycle hooks: `store!: ReminderStore;` (`src/main.ts:19`), `private inputEl!: HTMLInputElement;` (`src/modal.ts:8`)

## Import Organization

**Order (observed across all files):**
1. Framework imports from `obsidian` (Plugin, Modal, App, Notice, etc.) — always first
2. Third-party packages (e.g., `import * as chrono from "chrono-node";` in `src/parser.ts:1`)
3. Local modules, relative paths with `./` prefix — types, then siblings

**Style:**
- Named imports in curly braces, one group per source (`src/main.ts:1-16`)
- Multi-line imports when more than ~3 names
- Default export used only for the Obsidian `Plugin` subclass (`src/main.ts:18`); every other file uses named exports

**Path aliases:**
- None. All imports use relative paths (`./store`, `./types`, `./parser`). Project is small enough not to need `@/` aliases.

## Error Handling

**Overall strategy:** Errors are caught at the boundary where they affect user experience. Internal/domain methods may throw; top-level handlers catch, log, and surface a user-friendly notice.

**Pattern 1 — `try/catch` + `console.error` + `Notice` fallback (scheduler fire):**

```typescript
// src/scheduler.ts:66-74
private fire(reminder: Reminder): void {
  try {
    showNativeNotification(reminder, this.store.settings.soundOnNotify);
  } catch (e) {
    console.error("native notify failed, falling back to Notice", e);
    new Notice(`⏰ ${reminder.text}`, 10_000);
  }
  this.onFire(reminder);
}
```

**Pattern 2 — defensive listener invocation (observer dispatch):**

```typescript
// src/store.ts:24-32
private notify(): void {
  for (const fn of this.listeners) {
    try {
      fn();
    } catch (e) {
      console.error("reminder listener failed", e);
    }
  }
}
```

**Pattern 3 — `.catch()` on fire-and-forget async side effects:**

```typescript
// src/store.ts:87-93
private async persist(): Promise<void> {
  await this.save(this.data);
  if (this.data.settings.mirrorToMarkdown) {
    await this.mirrorToMarkdown().catch((e) => console.error("mirror failed", e));
  }
  this.notify();
}
```

**Pattern 4 — input validation with early `Notice` + return (no throw):**

```typescript
// src/main.ts:135-149
const selection = editor.getSelection().trim();
if (!selection) {
  new Notice("No text selected.");
  return;
}

const parsed = parseReminder(selection);
if (!parsed.dueAt) {
  new Notice("No time detected in selection. Add e.g. 'tomorrow 3pm'.");
  return;
}
if (parsed.dueAt <= Date.now()) {
  new Notice("Detected time is in the past.");
  return;
}
```

Also see `src/modal.ts:80-94` for the same pattern in `QuickCaptureModal.save()`.

**Pattern 5 — throw for unrecoverable environment issues (caught upstream):**

```typescript
// src/scheduler.ts:77-80
function showNativeNotification(reminder: Reminder, silent: boolean): void {
  if (typeof Notification === "undefined") {
    throw new Error("Notification API unavailable");
  }
  // ...
}
```

**Rules:**
- Never swallow errors silently — always `console.error` with a descriptive prefix tag (`"native notify failed"`, `"mirror failed"`, `"reminder listener failed"`)
- User-facing errors always go through Obsidian's `Notice` API, not `alert`/`console`
- Validation failures return early; they do not throw

## Logging

**Framework:** `console.error` only — no structured logger

**Conventions:**
- `console.error(tag, error)` — first arg is a short human-readable prefix, second is the caught error object
- Used for unexpected runtime failures, not for informational logs
- No `console.log` / `console.info` / `console.warn` in `src/` — user-facing feedback is routed through `Notice`

**User feedback:**
- Obsidian `Notice` is the user-facing channel: `new Notice("message", durationMs)` (`src/scheduler.ts:71`, `src/modal.ts:84`, `src/main.ts:137`)

## Key Design Patterns

**Observer pattern (store change notifications):**

`ReminderStore` maintains a `Set<() => void>` of listeners. Views subscribe on open, unsubscribe on close. `persist()` fans out to all listeners after saving.

```typescript
// src/store.ts:6, 16-22, 24-32
private listeners: Set<() => void> = new Set();

onChange(fn: () => void): void {
  this.listeners.add(fn);
}
offChange(fn: () => void): void {
  this.listeners.delete(fn);
}

private notify(): void {
  for (const fn of this.listeners) {
    try { fn(); } catch (e) { console.error("reminder listener failed", e); }
  }
}
```

Consumers bind a stable handler reference so they can unsubscribe:

```typescript
// src/view.ts:10, 32-39
private refreshHandler = () => this.render();

async onOpen(): Promise<void> {
  this.store.onChange(this.refreshHandler);
  this.render();
}
async onClose(): Promise<void> {
  this.store.offChange(this.refreshHandler);
}
```

**Render / refresh pattern (view re-draw on state change):**

Views own a single `private render()` method that fully rebuilds the DOM from current store state. The view does not mutate DOM incrementally; it empties the root container and re-creates children every time. `renderSection` and `renderRow` are private helpers that render sub-trees.

```typescript
// src/view.ts:41-61
private render(): void {
  const container = this.containerEl.children[1];
  container.empty();
  container.addClass("qr-view");
  // ... rebuild header, sections, rows
  this.renderSection(container as HTMLElement, "Pending", pending, false);
  this.renderSection(container as HTMLElement, "History", done, true);
}
```

The same shape appears in `QuickCaptureModal.renderPreview()` (`src/modal.ts:57-78`) and in the modal reopening itself on mutation (`src/modal.ts:150`, `src/modal.ts:161`) — `this.onOpen()` is called to refresh after snooze/delete.

**Dependency injection via constructor:**

Every collaborator is injected through the constructor as a `private` parameter. This keeps classes testable and avoids module-level singletons.

```typescript
// src/store.ts:8-14
constructor(
  private app: App,
  private load: () => Promise<PluginData | null>,
  private save: (data: PluginData) => Promise<void>,
) { ... }

// src/scheduler.ts:10-13
constructor(
  private store: ReminderStore,
  private onFire: FireCallback,
) {}
```

Note: the plugin passes thin wrappers around `loadData`/`saveData` to the store (`src/main.ts:23-29`), rather than handing the `Plugin` instance itself — the store stays decoupled from Obsidian's `Plugin` class.

**Module-bottom pure helpers:**

Each module ends with non-exported helper functions kept out of the class body to keep classes focused and helpers trivially testable.

- `formatDate(ms)` — `src/store.ts:134`
- `formatWhen(ms, isHistory)` — `src/view.ts:140`
- `stripMatchedPhrase(input, phrase)` — `src/parser.ts:33`
- `showNativeNotification(reminder, silent)` — `src/scheduler.ts:77`
- `genId()` — `src/modal.ts:172`

## Function Design

**Size:** Most methods fit in 10–30 lines. The largest (`QuickReminderPlugin.onload` at ~80 lines in `src/main.ts:22-106`) is pure wiring — command registration, ribbon buttons, event hookup — not branching logic.

**Parameters:**
- Prefer positional parameters for 1–3 args
- For optional/boolean config, use a defaulted parameter: `activateView(reveal = true)` (`src/main.ts:112`), `parseReminder(input, ref = new Date())` (`src/parser.ts:9`)
- For struct-like settings, accept a `Partial<T>` patch: `updateSettings(patch: Partial<Settings>)` (`src/store.ts:82`)

**Return values:**
- `void` for side-effectful ops that don't need a result
- `Promise<void>` for async side effects
- Returning data? Use a plain interface: `ParseResult` (`src/parser.ts:3`)
- Getters expose computed views: `get all(): Reminder[]` sorts; `get pending(): Reminder[]` filters (`src/store.ts:48-54`)

**Immutability:**
- Getters return copies (`[...this.data.reminders].sort(...)` in `src/store.ts:49`) so callers can't mutate internal state
- `DEFAULT_SETTINGS` is spread when merged (`src/store.ts:39`, `src/store.ts:83`) — never mutated in place

**Async:**
- All I/O is `async`/`await` — no raw `.then()` chains except for the Notification permission ask (`src/scheduler.ts:98`)
- Fire-and-forget calls use `void` prefix: `void this.activateView()` (`src/main.ts:46`), `void this.convertSelectionToReminder(...)` (`src/main.ts:77`)

## Module Design

**Exports:**
- Named exports everywhere except the plugin class, which uses `export default` (required by Obsidian's plugin loader) — `src/main.ts:18`
- One file ≈ one public surface (a class, plus any types it needs)
- `src/types.ts` is the shared type module — no logic, just interfaces + `DEFAULT_SETTINGS`

**No barrel files:**
- No `index.ts` re-export files
- Every import points at the specific module it needs

## Obsidian-Specific Conventions

- Plugin class extends `Plugin` and implements `onload()` / `onunload()` (`src/main.ts:22`, `src/main.ts:108`)
- Custom views extend `ItemView` with `VIEW_TYPE_*` constant, plus `getViewType()` / `getDisplayText()` / `getIcon()` (`src/view.ts:7-30`)
- Modals extend `Modal` with `onOpen()` / `onClose()` and manage DOM via `this.contentEl` (`src/modal.ts:20-55`)
- Settings tabs extend `PluginSettingTab` with `display()` and use the `Setting` builder API (`src/main.ts:180-236`)
- Commands registered in `onload` with `{ id, name, callback }` or `editorCallback` (`src/main.ts:49-79`)
- All DOM mutations go through Obsidian's `createEl` / `createDiv` / `createSpan` helpers, never `innerHTML` or raw `document.createElement`
- Path normalization uses `normalizePath` from `obsidian` before vault operations (`src/store.ts:96`)

---

*Convention analysis: 2026-04-18*
