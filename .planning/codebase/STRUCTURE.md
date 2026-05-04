# Codebase Structure

**Analysis Date:** 2026-04-18

## Directory Layout

```
quick-reminder/
├── src/                     # TypeScript source (7 files, 888 lines total)
│   ├── main.ts              # Plugin entry point + settings tab
│   ├── modal.ts             # Capture and list modals
│   ├── view.ts              # Sidebar ItemView
│   ├── parser.ts            # chrono-node wrapper
│   ├── scheduler.ts         # setTimeout queue + notifications
│   ├── store.ts             # Persistence + markdown mirror + observers
│   └── types.ts             # Shared interfaces + defaults
├── .planning/               # GSD planning docs (this directory)
│   └── codebase/            # Codebase analysis docs
├── node_modules/            # Dependencies (gitignored)
├── .git/                    # Git metadata
├── main.js                  # Bundled output (esbuild target, gitignored in typical Obsidian setup)
├── manifest.json            # Obsidian plugin manifest (id, version, minAppVersion)
├── package.json             # npm manifest
├── package-lock.json        # npm lockfile
├── tsconfig.json            # TypeScript compiler config
├── esbuild.config.mjs       # Bundler config (entry: src/main.ts → main.js)
├── styles.css               # Plugin stylesheet (qr-* classes)
├── README.md                # User-facing documentation
└── .gitignore
```

## Directory Purposes

**`src/`:**
- Purpose: All TypeScript source code for the plugin.
- Contains: 7 `.ts` files, flat layout (no subdirectories).
- Key files: `main.ts` (entry point bundled by esbuild).

**`.planning/codebase/`:**
- Purpose: GSD (Get Stuff Done) workflow analysis documents.
- Contains: `ARCHITECTURE.md`, `STRUCTURE.md`, and any other codebase mapping docs.
- Generated: Yes, by `/gsd-map-codebase`.
- Committed: Typically yes (team-readable project context).

**Project root (non-source files):**
- `manifest.json` — Required by Obsidian. Declares `id`, `name`, `version`, `minAppVersion: 1.4.0`, `isDesktopOnly: true`.
- `esbuild.config.mjs` — Builds `src/main.ts` → `main.js` (CJS, es2020 target). Externals include `obsidian`, `electron`, `@codemirror/*`, `@lezer/*`, and Node builtins.
- `package.json` — npm scripts and dev dependencies.
- `tsconfig.json` — TypeScript compiler options.
- `styles.css` — CSS classes prefixed `qr-` (e.g., `.qr-modal`, `.qr-view-row`, `.qr-preview`).
- `main.js` — Bundled output loaded by Obsidian (not authored directly).

## File-by-File Summary

**`src/main.ts`** (237 lines)
- Purpose: Plugin lifecycle, dependency wiring, Obsidian hook registration.
- Exports: `QuickReminderPlugin` (default, extends `Plugin`).
- Internal: `QuickReminderSettingTab` (extends `PluginSettingTab`).
- Key methods: `onload()`, `onunload()`, `activateView()`, `convertSelectionToReminder()`.
- Responsibilities: Instantiate `ReminderStore` + `Scheduler`, register the view, add 2 ribbon icons, add 4 commands, register editor-menu event, add settings tab, run launch-time overdue scan + `scheduleAll()`.

**`src/modal.ts`** (174 lines)
- Purpose: Modal dialogs for capture and (legacy) pending list.
- Exports: `QuickCaptureModal`, `ReminderListModal`.
- Internal: `genId()` helper generating `r_<base36-time>_<base36-rand>` ids.
- Key behaviors: Live parse preview on every input keystroke, Enter-to-save, inline snooze/delete buttons in list modal.

**`src/view.ts`** (165 lines)
- Purpose: Persistent sidebar panel (Obsidian `ItemView`).
- Exports: `ReminderView`, `VIEW_TYPE_REMINDER = "quick-reminder-view"`.
- Internal: `formatWhen(ms, isHistory)` producing relative labels like `"in 2h · …"` / `"3m ago · …"` / `"overdue · …"`.
- Key behaviors: Renders "Pending" + "History" sections (history capped at 30 most recent notified reminders, reversed). Subscribes to `store.onChange` in `onOpen`, unsubscribes in `onClose`. Per-row actions: Snooze (pending), Re-add (history, pre-fills a new `QuickCaptureModal`), Delete.

**`src/parser.ts`** (37 lines)
- Purpose: Natural-language date/time parsing.
- Exports: `parseReminder(input, ref?)`, `ParseResult` interface.
- Internal: `stripMatchedPhrase()` removes the matched phrase + trailing connectors (`at`, `on`, `by`, `in`, `next`, `this`, commas, whitespace).
- Dependency: `chrono-node` (called with `forwardDate: true`).
- Pure function — no side effects, no Obsidian imports.

**`src/scheduler.ts`** (102 lines)
- Purpose: In-memory timer registry + native notification firing.
- Exports: `Scheduler`.
- Internal: `showNativeNotification(reminder, silent)` wraps the Web `Notification` API with `tag` (reminder id) and permission handling.
- Key methods: `schedule`, `scheduleAll`, `cancel`, `cancelAll`, `scanOverdue`, private `fire`.
- Key detail: Clamps `setTimeout` delay to `2_147_483_000` ms at `src/scheduler.ts:28`.

**`src/store.ts`** (143 lines)
- Purpose: JSON persistence, markdown mirror, observer pattern.
- Exports: `ReminderStore`.
- Internal: `formatDate(ms)` for mirror-file date labels.
- Key methods: `init`, `add`, `markNotified`, `snooze`, `remove`, `updateSettings`, `onChange`/`offChange`, private `persist`, private `mirrorToMarkdown`, private `renderMarkdown`.
- Getters: `settings`, `all` (sorted by `dueAt` asc), `pending` (filter `!notified`).

**`src/types.ts`** (30 lines)
- Purpose: Shared type definitions.
- Exports: `Reminder`, `PluginData`, `Settings` interfaces; `DEFAULT_SETTINGS` constant.
- Defaults: `mirrorToMarkdown: true`, `mirrorFilePath: "Reminders.md"`, `defaultSnoozeMinutes: 10`, `fireMissedOnLaunch: true`, `soundOnNotify: true`.

## Naming Conventions

**Files:**
- Lowercase, single-word descriptors of the primary concept: `main.ts`, `modal.ts`, `view.ts`, `parser.ts`, `scheduler.ts`, `store.ts`, `types.ts`.
- No suffixes (no `.service`, `.model`, `.ts` module-type indicators).
- One cohesive concern per file; multiple related classes can live together (e.g., both modals in `modal.ts`).

**Classes:**
- PascalCase, noun-based, typically extend an Obsidian base: `QuickReminderPlugin` (extends `Plugin`), `QuickCaptureModal` (extends `Modal`), `ReminderView` (extends `ItemView`), `ReminderListModal` (extends `Modal`), `QuickReminderSettingTab` (extends `PluginSettingTab`).
- Domain services named by role: `ReminderStore`, `Scheduler`.

**Functions:**
- camelCase, verb-first: `parseReminder`, `stripMatchedPhrase`, `formatWhen`, `formatDate`, `genId`, `showNativeNotification`, `activateView`, `convertSelectionToReminder`, `renderMarkdown`.

**Types/Interfaces:**
- PascalCase nouns: `Reminder`, `PluginData`, `Settings`, `ParseResult`.
- Constants in SCREAMING_SNAKE_CASE: `DEFAULT_SETTINGS`, `VIEW_TYPE_REMINDER`.

**CSS:**
- BEM-ish with `qr-` prefix: `qr-modal`, `qr-input`, `qr-preview`, `qr-preview-row`, `qr-preview-label`, `qr-preview-warn`, `qr-hint`, `qr-list-modal`, `qr-list-row`, `qr-list-title`, `qr-list-when`, `qr-view`, `qr-view-header`, `qr-view-add-btn`, `qr-view-section`, `qr-view-section-head`, `qr-view-section-title`, `qr-view-section-count`, `qr-view-empty`, `qr-view-row`, `qr-view-row-done`, `qr-view-row-body`, `qr-view-row-text`, `qr-view-row-when`, `qr-view-row-actions`, `qr-view-del`.

**Id generation:**
- Reminders use `r_<base36-timestamp>_<6-char-base36-random>` (see `src/modal.ts:172` and duplicated inline at `src/main.ts:152`).

## Import Graph

```
                         ┌──────────────┐
                         │   main.ts    │  (entry)
                         └──────┬───────┘
           ┌────────────┬───────┼──────────┬────────────┐
           ▼            ▼       ▼          ▼            ▼
      ┌─────────┐  ┌─────────┐  │     ┌──────────┐ ┌──────────┐
      │ modal.ts│  │ view.ts │  │     │scheduler │ │ store.ts │
      └────┬────┘  └────┬────┘  │     └────┬─────┘ └────┬─────┘
           │            │       │          │            │
           │            │       │     ┌────┴────┐       │
           │            │       │     │ store.ts│◀──────┘
           │            │       │     └─────────┘
           │            │       │          ▲
           │            │       │          │
           ▼            ▼       ▼          │
      ┌─────────┐  ┌─────────────────────┐ │
      │parser.ts│  │      types.ts       │◀┘
      └─────────┘  └─────────────────────┘
                           ▲
                           └──── imported by: main, modal, view, scheduler, store
```

**Concrete imports (who imports whom):**
- `main.ts` imports: `store`, `scheduler`, `modal`, `types`, `parser`, `view`.
- `modal.ts` imports: `parser`, `types`, `store`, `scheduler`.
- `view.ts` imports: `types`, `store`, `scheduler`, `modal`.
- `scheduler.ts` imports: `types`, `store`.
- `store.ts` imports: `types`.
- `parser.ts` imports: `chrono-node` only.
- `types.ts` imports: nothing.

**Dependency observations:**
- `types.ts` is a leaf — imported everywhere except `parser.ts`.
- `parser.ts` is a leaf on the domain side — depends only on `chrono-node`, imported by `modal` + `main`.
- `store.ts` is imported by all other domain/UI files. It never imports UI.
- `scheduler.ts` imports `store` (reads pending + settings) but not vice versa.
- `view.ts` imports `modal.ts` (to launch capture from the sidebar) — this is the only UI-to-UI import. No cycles.
- No module in `src/` is unused or orphaned.

## Key File Locations

**Entry Points:**
- `src/main.ts:18` — `QuickReminderPlugin` default export (loaded by Obsidian).
- `esbuild.config.mjs:8` — bundler entry: `src/main.ts` → `main.js`.

**Configuration:**
- `manifest.json` — plugin metadata for Obsidian.
- `tsconfig.json` — TypeScript options.
- `esbuild.config.mjs` — bundler options (externals, target, format).
- `src/types.ts:24-30` — `DEFAULT_SETTINGS` (runtime config defaults).

**Core Logic:**
- `src/store.ts` — data model + persistence + mirror + observer.
- `src/scheduler.ts` — timing + notification firing.
- `src/parser.ts` — natural-language parsing.

**UI:**
- `src/modal.ts` — capture + legacy list modals.
- `src/view.ts` — sidebar panel.
- `src/main.ts:172-237` — settings tab.
- `styles.css` — all styling.

**Testing:**
- None present. No `*.test.*`, no `*.spec.*`, no `jest.config.*` / `vitest.config.*`.

## Where to Add New Code

**New reminder field (e.g., `priority`):**
1. Add to `Reminder` interface in `src/types.ts`.
2. Set default (optional field, or update creation sites in `src/modal.ts:96` and `src/main.ts:151`).
3. Update markdown mirror rendering in `src/store.ts:106` (`renderMarkdown`) if user-visible.
4. Update view rendering in `src/view.ts:90` (`renderRow`) if user-visible.

**New setting:**
1. Add to `Settings` interface + `DEFAULT_SETTINGS` in `src/types.ts`.
2. Add a `new Setting(containerEl)` block in `QuickReminderSettingTab.display()` at `src/main.ts:180`.
3. Read via `store.settings.<name>` wherever it applies.

**New command:**
1. Add `this.addCommand({ id, name, callback })` inside `onload()` in `src/main.ts`, alongside existing commands around line 49-79.

**New modal:**
1. Create a new class in `src/modal.ts` (existing pattern: extend `Modal`, inject `store` + `scheduler` via constructor) OR create a dedicated file if substantially different.
2. Instantiate from `main.ts` via a command/ribbon or from `view.ts` via a button.

**New view section (e.g., "Today"):**
1. Extend `ReminderView.render()` in `src/view.ts:41` — add another `this.renderSection(...)` call with a new filtered array.
2. Add any new CSS classes to `styles.css` following the `qr-view-*` pattern.

**New persistence field (non-reminder, non-settings):**
1. Extend `PluginData` in `src/types.ts`.
2. Update `ReminderStore.init()` to hydrate the new field (`src/store.ts:34`).
3. Ensure `persist()` saves the full `data` object (already does via `this.save(this.data)`).

**Utilities:**
- No dedicated `utils.ts` exists. Small helpers currently live as file-local functions (`genId`, `formatWhen`, `formatDate`, `stripMatchedPhrase`). Add new helpers next to their primary caller; create `src/utils.ts` only if something is shared across 3+ files.

## Special Directories

**`node_modules/`:**
- Purpose: npm dependencies.
- Generated: Yes (`npm install`).
- Committed: No.

**`.planning/`:**
- Purpose: GSD workflow artifacts (codebase analysis, phase plans, etc.).
- Generated: Yes (by `/gsd-*` commands).
- Committed: Typically yes.

**`main.js` (root):**
- Purpose: esbuild output consumed by Obsidian at runtime.
- Generated: Yes (from `src/main.ts`).
- Committed: Varies — for release builds, Obsidian community plugins typically commit `main.js` + `manifest.json` + `styles.css`. Development builds should not be committed.

---

*Structure analysis: 2026-04-18*
