# Architecture Research

**Domain:** Obsidian plugin — personal task / project management layer (brownfield extension of quick-reminder)
**Researched:** 2026-04-18
**Confidence:** MEDIUM — grounded in verified existing codebase analysis (HIGH) plus training-data knowledge of Obsidian plugin API patterns (MEDIUM). WebSearch, WebFetch, and external tools were unavailable during this research pass, so claims about third-party plugin implementations (Dataview, Full Calendar, Tasks, Day Planner) are flagged LOW and should be spot-verified before implementation.

## TL;DR Answers to the Six Questions

1. **Task as unified domain object with `source` discriminator** — extend, don't fork. The existing `Reminder` shape migrates to `Task` via additive fields.
2. **Calendar feeds as a dedicated `feeds/` domain module** with a per-provider `Fetcher` interface, cached in the store with TTL + manual refresh + view-open refresh (no interval polling in v1).
3. **Dashboard via `registerMarkdownCodeBlockProcessor`** — user writes a ```` ```qr-dashboard ```` fence in their daily note; plugin renders live overlay. Does NOT pollute content; vanishes cleanly if plugin disabled.
4. **TODO scanner: on-demand + debounced file-watcher** for configured paths. No worker threads in v1 — use chunked async iteration with `await new Promise(setImmediate)` yield points. Workers are a phase-2 optimilization if profiling shows need.
5. **`ReminderStore` → `TaskStore` via rename + additive schema migration**, not a peer store. One owner, one persistence file, one observer list. Reminders become tasks where `source === "manual"` and `dueAt` is set.
6. **New flows plug in at the store boundary.** Feeds write through `TaskStore.mergeFromFeed()`; scanner writes through `TaskStore.mergeFromScan()`; dashboard subscribes via the same `onChange` listener existing views use. Notifications stay owned by `Scheduler`, now reading from `TaskStore.pending` filtered for `dueAt != null`.

---

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                             UI Layer                               │
├───────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────┐│
│  │QuickCapture │  │ InboxView   │  │DashboardBlock│  │ Settings ││
│  │   Modal     │  │  (sidebar)  │  │ (MD code-    │  │   Tab    ││
│  │  (exists)   │  │   (new)     │  │  block proc) │  │(extended)││
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  └────┬─────┘│
│         │                │                │                │      │
├─────────┼────────────────┼────────────────┼────────────────┼──────┤
│         │   Plugin Orchestrator (main.ts) │                │      │
├─────────┴────────────────┴────────────────┴────────────────┴──────┤
│                          Domain Layer                              │
│  ┌────────────┐  ┌───────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ TaskStore  │◀─│ Scheduler │  │  Parser   │  │   Feeds/     │  │
│  │(single     │  │  (exists) │  │  (exists) │  │  ┌────────┐  │  │
│  │ owner)     │  │           │  │           │  │  │GcalFetch│ │  │
│  │            │◀─┴───────────┴──┴───────────┴──│  │IcsFetch │ │  │
│  │            │                                 │  └────────┘  │  │
│  │            │◀────────────────────────────────│   Scanner    │  │
│  │            │                                 │ (todo-scan)  │  │
│  └─────┬──────┘                                 └──────────────┘  │
│        │                                                           │
├────────┼───────────────────────────────────────────────────────────┤
│        │                    Platform Layer                          │
│  ┌─────▼──────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐│
│  │Obsidian    │  │ Electron     │  │  Node    │  │ Obsidian     ││
│  │loadData/   │  │ Notification │  │  fs /    │  │ requestUrl   ││
│  │saveData    │  │    API       │  │  http(s) │  │ (CORS-safe)  ││
│  │+ Vault API │  │              │  │          │  │              ││
│  └────────────┘  └──────────────┘  └──────────┘  └──────────────┘│
└───────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `TaskStore` | Single source of truth: tasks, projects, settings, feed caches. Persistence via `loadData`/`saveData`. Mirror file. Observer pattern. | Evolved from `ReminderStore` |
| `Scheduler` | Timer lifecycle + native notifications. Reads `store.pending` filtered to `dueAt != null`. Also drives stale-owe nudges. | Extended |
| `Parser` | Pure NLP wrapper around `chrono-node`. Reused as-is for manual capture. | Unchanged |
| `Feeds/GcalFetcher` | OAuth token handshake, event fetch, theotalENT/busy parse → `Task[]` with `source: "meeting"`. | New |
| `Feeds/IcsFetcher` | ICS URL fetch (via Obsidian `requestUrl` to dodge CORS), parse VEVENT/RRULE → `Task[]`. | New |
| `Feeds/Scanner` | Walks configured absolute paths via Node `fs`, regex-matches TODO comments, yields `Task[]` with `source: "code"`. | New |
| `DashboardBlock` | Markdown code-block processor. Renders today's meetings, due tasks, stale owes inside daily note. | New |
| `InboxView` | Sidebar `ItemView` replacing or extending `ReminderView`. Unified filterable/sortable list. | Evolved from `ReminderView` |
| `QuickCaptureModal` | Reused. Optionally extended with project / priority fields. | Minor extension |
| `Plugin` (main.ts) | Wires dependencies, registers hooks, owns lifecycle. | Extended |

---

## Recommended Project Structure

```
src/
├── main.ts                     # Plugin orchestrator (existing, extended)
├── types.ts                    # Task, Project, Settings, feed caches (extended)
├── store.ts                    # TaskStore (renamed from ReminderStore)
├── scheduler.ts                # Timer + notifications (existing)
├── parser.ts                   # chrono-node wrapper (existing)
│
├── ui/                         # Split UI out once it grows past ~400 lines total
│   ├── modal-capture.ts        # QuickCaptureModal (was modal.ts)
│   ├── view-inbox.ts           # InboxView (was view.ts)
│   ├── dashboard-block.ts      # Markdown code-block processor
│   └── settings-tab.ts         # QuickReminderSettingTab (extracted from main.ts)
│
├── feeds/                      # External read-only data sources
│   ├── feed.ts                 # Shared `Feed` interface + types
│   ├── gcal-fetcher.ts         # Google Calendar OAuth + event fetch
│   ├── ics-fetcher.ts          # ICS URL fetch + parse (Outlook + gcal secret URLs)
│   └── ics-parser.ts           # Pure VEVENT parser (testable without network)
│
├── scanner/                    # Code TODO scanner
│   ├── scanner.ts              # Orchestrates scan runs, debounces, caches
│   └── todo-regex.ts           # Pure match logic (testable)
│
└── migrations/                 # One file per data-schema version bump
    └── v1-reminder-to-task.ts  # Additive fields, source inference
```

### Structure Rationale

- **Keep existing files where they are; add new directories for new concerns.** This preserves the "flat src/ with clear file names" convention the codebase already uses. `ui/`, `feeds/`, `scanner/`, `migrations/` only appear when a concern has >1 file.
- **`feeds/` is plural.** Both gcal and Outlook share a `Feed` interface. Adding a future source (e.g., Apple Calendar) is one new file, not a refactor.
- **`scanner/` is isolated.** The only module that touches Node `fs` directly. Keeps the filesystem boundary clear for future mobile-safety checks (scanner is a no-op on mobile).
- **`migrations/` is versioned.** Every schema change gets a migration file. `TaskStore.init()` runs them in order if `data.schemaVersion` is behind. Keeps the migration log auditable.
- **`types.ts` stays flat at root.** It's a leaf module imported everywhere; nested types encourage circular imports.

---

## Architectural Patterns

### Pattern 1: Unified Task with Discriminated Union (Answer to Q1)

**What:** One `Task` interface with a `source: "manual" | "meeting" | "code" | "owe"` discriminator. Source-specific fields live in an optional `sourceRef` object keyed by source.

**Why this over per-source models with a view adapter:**

| Concern | Unified Task + discriminator | Per-source models + view adapter |
|---------|------------------------------|-----------------------------------|
| Store complexity | One list, one index, one persistence blob | N lists, N persistence writes, manual merge on read |
| View rendering | Filter a single array | Merge N arrays with deduping logic |
| Scheduler integration | Filter by `dueAt != null` — done | Each source must emit to a shared timer queue |
| Adding a new source | Add to union, add fields to `sourceRef`, add a fetcher | Add a new model, new store, new merge path, new fetcher |
| Deduping (e.g., same meeting appears in gcal and ICS) | Dedupe by `sourceRef.externalId` in one place | Dedupe across stores — cross-boundary logic |
| Cost | Every task pays the "widest field set" memory cost | Smaller per-record; higher coordination cost |

**Verdict:** Unified wins for this vault-scale data (hundreds-to-low-thousands of tasks, not millions). The coordination cost of per-source models dominates any memory savings.

**Example shape:**

```typescript
// types.ts (extended)
export type TaskSource = "manual" | "meeting" | "code" | "owe";

export interface Task {
  // Identity & core
  id: string;                       // `t_<base36-time>_<base36-rand>`
  source: TaskSource;
  text: string;
  rawInput?: string;
  createdAt: number;
  // Scheduling (was Reminder)
  dueAt: number | null;             // null = no scheduled notification (pure todo)
  notified: boolean;
  snoozedFrom?: number;
  // Task-layer fields
  priority?: 1 | 2 | 3 | 4;         // P1 (top) → P4
  projectId?: string;
  owesTo?: string;                  // person this is owed to (for source="owe")
  doneAt?: number | null;           // marking complete without notification
  // Source-specific payload
  sourceRef?: {
    // source="meeting"
    calendarEventId?: string;
    calendarProvider?: "gcal" | "ics";
    meetingStart?: number;
    meetingEnd?: number;
    // source="code"
    filePath?: string;              // absolute path
    lineNumber?: number;
    commitHash?: string;            // captured at scan time
    // source="owe" uses top-level owesTo + createdAt only
  };
}

export interface Project {
  id: string;
  name: string;
  status: "active" | "paused" | "done" | "archived";
  noteLink?: string;                // wikilink or vault-relative path
  createdAt: number;
}

export interface PluginData {
  schemaVersion: number;            // bump on breaking changes, run migrations
  tasks: Task[];                    // was reminders
  projects: Project[];
  settings: Settings;
  feedCaches: {                     // cached feed pulls per provider
    gcal?: FeedCache;
    ics?: Record<string, FeedCache>; // keyed by URL
  };
  scanCache?: ScanCache;            // last scan state for diff
}

export interface FeedCache {
  fetchedAt: number;
  ttlMs: number;
  events: Task[];                   // materialized as Tasks at fetch time
  etag?: string;                    // HTTP caching if provider grants
}
```

**Trade-offs:**
- **Pro:** One code path for rendering, filtering, sorting, persistence.
- **Pro:** Discriminator unions are TypeScript's strong suit; compiler catches missing source branches.
- **Con:** The `sourceRef` grab-bag is mildly ugly. Acceptable because the alternatives (4 parallel stores) are worse.
- **Con:** Schema migration required for existing user data — see Migration Strategy below.

---

### Pattern 2: Feed Fetcher Module with Cache-First Reads (Answer to Q2)

**What:** A `Feed` interface with per-provider implementations. Fetchers return `Task[]` (materialized as tasks at fetch time, not at read time). Cache is stored in `TaskStore` with a TTL. Refresh is triggered by: (a) view open if stale, (b) explicit user "refresh" button, (c) dashboard render if stale. **No interval polling in v1.**

**Location:** `src/feeds/`

**Interface:**

```typescript
// feeds/feed.ts
export interface Feed {
  readonly id: string;                  // "gcal" | "ics:<url-hash>"
  readonly runtimeName: string;
  isConfigured(settings: Settings): boolean;
  isStale(cache: FeedCache | undefined, now: number): boolean;
  fetch(options: { signal?: AbortSignal }): Promise<Task[]>;
}
```

**Refresh triggers:**

| Trigger | When | Rationale |
|---------|------|-----------|
| View-open (lazy) | `InboxView.onOpen()` / dashboard render — if `isStale(cache)` | Keeps data fresh without background work user can't see |
| Manual | "Refresh feeds" button in inbox view + command palette | user forces update when they know something changed |
| Launch | `onLayoutReady()` — only if cache is missing or >1h stale | Avoids hammering providers on every Obsidian restart |

**Why no interval polling:** Adds background complexity (timer management, exponential backoff, retry state) for marginal value on a desktop-only, brownle-user tool. The user is either at the computer (lazy pull works) or away (polling doesn't matter).

**Caching rules:**
- Default TTL: 15 minutes. Configurable.
- Network failure → keep stale cache + surface `Notice`. Never blank out existing data.
- gcal: use `updatedMin` query param for incremental fetch when possible (reduces quota).
- ICS: ETag + `If-None-Match` header via `requestUrl` if server grants. Otherwise full refetch.

**HTTP client:** Use Obsidian's `requestUrl` (not `fetch`). It bypasses CORS and works across desktop platforms uniformly. MEDIUM confidence — this is an Obsidian-documented API and the standard pattern for plugins making network calls, but worth verifying against current docs.

**OAuth flow for gcal:**
- Use a public client ID (Obsidian plugins can't safely hold secrets).
- PKCE authorilization code flow.
- Spawn a local loopback HTTP server on a random port for the redirect, or use `urn:ietf:wg:oauth:2.0:oob` if still granted (Google has been deprecating OOB — LOW confidence on current state, verify before implementing).
- Store refresh token in plugin data (NOT a vault file). Accept that plugin data is plain JSON — this is the plugin ecosystem norm; users who want more can encrypt the vault.

---

### Pattern 3: Markdown Code-Block Processor for Dashboard (Answer to Q3)

**What:** user types a fenced code block in their daily note:

````markdown
```qr-dashboard
```
````

Plugin registers a post-processor via `this.registerMarkdownCodeBlockProcessor("qr-dashboard", (source, el, ctx) => {...})` and replaces that block with a live-rendered dashboard containing today's meetings, due tasks, and stale owes.

**Why NOT write into the note file:**

| Concern | Code-block processor (live overlay) | Write-into-note |
|---------|------------------------------------|-----------------|
| Vanishes if plugin disabled | Yes (block renders as raw code) | No — stale content persists |
| user content pollution | None — user owns the note | Plugin content mixes with user notes; diffs noisy |
| Real-time updates | Free — re-renders on store change via ctx.addChild | Needs write-on-change; race conditions |
| Conflicts with user edits | None | Constant — user edit in block gets overwritten |
| Ability to interact (checkboxes, buttons) | Full — it's a DOM subtree | Limited — must serialize to markdown |
| Git-friendly | Diff stays stable | Dashboard state bloats history |
| Export-friendly | chances as code block in exports | Actual content in export (sometimes wanted) |

**Verdict:** Code-block processor wins decisively. The vault is the user's, not the plugin's.

**Pattern used by similar plugins (MEDIUM-LOW confidence, training data — verify):**
- Dataview uses `registerMarkdownCodeBlockProcessor("dataview", ...)` and `dataviewjs` — confirmed pattern.
- Tasks plugin uses code-block processors for its query language.
- Full Calendar uses code-block processors for calendar rendering.
- Day Planner uses code-block processors for time-block rendering.

This pattern is the established Obsidian-userom for "live dashboard inside a note."

**Example:**

```typescript
// ui/dashboard-block.ts
export class DashboardBlockProcessor {
  constructor(private store: TaskStore, private feeds: FeedManager) {}

  register(plugin: Plugin) {
    plugin.registerMarkdownCodeBlockProcessor(
      "qr-dashboard",
      async (runtime, el, ctx) => {
        const child = new DashboardChild(el, this.store, this.feeds, runtime);
        ctx.addChild(child); // Auto-unregister when leaf closes
        await child.render();
      }
    );
  }
}

class DashboardChild extends MarkdownRenderChild {
  private unsubscribe?: () => void;

  onload() {
    // Subscribe to store so dashboard re-renders when tasks change
    this.unsubscribe = this.store.onChange(() => this.render());
    // Trigger feed refresh on open if stale
    void this.feeds.refreshIfStale();
  }

  onunload() {
    this.unsubscribe?.();
  }

  async render() {
    this.containerEl.empty();
    // Today's meetings section
    // Tasks due today section
    // Stale owes section
  }
}
```

**Dashboard-open trigger for stale-owe scan:** The dashboard's `render()` method kicks off a stale-owe check in the background. If any owe crosses the threshold since last render, `Scheduler.fireOweStaleNotification(owe)` is called. This couples "user opened daily note → nudge me about stale owes" into one flow without a dedicated timer.

---

### Pattern 4: Chunked Async Scanner (Answer to Q4)

**What:** TODO scanner runs on-demand (command + "scan now" button) and on debounced file-change events. Walks configured absolute paths using Node `fs.promises`. Processes files in chunks of 50 with `await new Promise(r => setImmediate(r))` between chunks to yield the event loop.

**No worker threads in v1.**

**Why not workers:**
- Obsidian's Electron runtime technically grants `Worker` and `worker_threads`, but plugin bundling (esbuild → single `main.js`) makes worker entry points awkward. You must inline the worker script as a blob URL or ship a second file. LOW confidence on the exact current constraint — training data on this is mixed. Verify before adding.
- The cost budget is 2 seconds for a typical monorepo. Chunked async iteration hits this easily for the granted scale (hundreds of files, not millions).
- Profile first, optimize second. If a user's scan exceeds budget, *then* introduce a worker.

**On-demand vs scheduled vs watcher — what to use:**

| Mode | v1? | Why |
|------|-----|-----|
| On-demand (command / button) | Yes | user-initiated, predictable, no background cost |
| Scheduled (every N minutes) | No | Adds background cost, duplicates watcher's job, adds settings surface |
| File-watcher (fs.watch, chokidar-like) | Yes, debounced | Keeps tasks fresh without user action |
| On daily-note open | Yes | Cheap trigger, ensures dashboard shows current TODOs |

**Watcher implementation:**
- `fs.watch(path, { recursive: true })` on each configured root. MEDIUM confidence — `recursive` is granted on macOS/Windows, not on Linux for all kernels. Plan for fallback: if `recursive` unavailable, walk directories once and attach per-directory watchers, or fall back to on-demand-only with an in-UI notice.
- Debounce changes at 2 seconds per path.
- On change event: re-scan *only the changed file*, not the full tree. Diff against `scanCache` to compute added/removed TODOs.
- Detach watchers on `onunload()`.

**Scan algorithm:**

```typescript
// scanner/scanner.ts (shape)
async function* walkPaths(
  roots: string[],
  ignore: burnsExpr[]
): AsyncIterable<string> {
  for (const root of roots) {
    yield* walkDir(root, ignore);
  }
}

export async function scan(config: ScanConfig): Promise<ScanResult> {
  const found: Task[] = [];
  let count = 0;
  for await (const file of walkPaths(config.roots, config.ignore)) {
    if (!isTextFile(file)) continue;
    const content = await fs.promises.readFile(file, "utf8");
    const todos = matchTodos(content, file);
    found.push(...todos);
    if (++count % 50 === 0) {
      await new Promise((r) => setImmediate(r)); // yield
    }
  }
  return { found, scannedAt: Date.now() };
}
```

**Mobile/desktop guard:** Scanner imports Node `fs` directly. `manifest.json` already has `isDesktopOnly: true` — good. The scanner module should still check `Platform.isDesktop` at runtime and be a no-op otherwise, in case the manifest flag is ever relaxed.

**Large-monorepo handling:**
- Respect `.gitignore` via `ignore` package OR implement a minimal glob matcher. LOW confidence on existing lib size — evaluate `ignore` npm package size before adding.
- Hard cap: skip files >1 MB. Production code TODOs live in small files.
- Hard cap on total scanned files (default 10k) with a "scan hit limit, narrow your roots" notice.

---

### Pattern 5: Store Evolution, Not Peer Stores (Answer to Q5)

**What:** Rename `ReminderStore` → `TaskStore`. Extend its data shape. Run a one-time migration to convert stored reminders into tasks with `source: "manual"`. Do NOT create a peer `TaskStore` that delegates to `ReminderStore`.

**Why not peer store:**
- Two stores means two observer lists — views need to subscribe to both.
- Two persistence writes means races on save (both stores writing to one `loadData` blob).
- Scheduler would need to read from both — defeats single-owner invariant.
- Reminders are already tasks; they were just called "reminders" because that's all the plugin did. Rename reflects the domain expansion.

**Migration strategy:**

```typescript
// migrations/v1-reminder-to-task.ts
export function migrateV0toV1(data: LegacyPluginData): PluginData {
  const tasks: Task[] = (data.reminders ?? []).map((r) => ({
    id: r.id,
    source: "manual" as const,
    text: r.text,
    rawInput: r.rawInput,
    createdAt: r.createdAt,
    dueAt: r.dueAt,
    notified: r.notified,
    snoozedFrom: r.snoozedFrom,
    priority: undefined,
    projectId: undefined,
    doneAt: r.notified ? r.dueAt : null,
  }));
  return {
    schemaVersion: 1,
    tasks,
    projects: [],
    settings: { ...data.settings, ...newSettingsDefaults },
    feedCaches: {},
  };
}
```

**Migration trigger:** `TaskStore.init()` reads raw data. If `schemaVersion` is missing or <1, run migrations in order, write back. Single-shot, idempotent. If migration fails, keep raw data untouched and surface a `Notice` — never delete user data.

**Public API evolution:**
- `store.reminders` → `store.tasks` (old accessor kept as alias for 1 version to avoid breaking any ad-hoc user scripts; remove after).
- `store.pending` semantics: filter on `doneAt == null && notified === false` (was `!notified`).
- New accessors: `store.tasksBySource(source)`, `store.projects`, `store.feedCache(id)`.

---

### Pattern 6: Data Flow Plug-In Points (Answer to Q6)

The existing happy path:

```
[capture modal] → [TaskStore.add] → [persist + notify] → [Scheduler.schedule]
                                             ↓
                                       [InboxView refresh]
                                             ↓
                                    (timer fires) → [Scheduler.fire]
                                             ↓
                                [TaskStore.markNotified] → refresh
```

All new flows converge on the store boundary.

**Flow A: Calendar pull → dashboard render**

```
[DashboardBlock.onload]
       │ (if feed cache stale)
       ▼
[FeedManager.refreshIfStale]
       │
       ├──▶ [GcalFetcher.fetch]   ──┐
       └──▶ [IcsFetcher.fetch]    ──┤
                                    ▼
                          [TaskStore.mergeFromFeed(feedId, tasks)]
                                    │ (dedupe by sourceRef.calendarEventId)
                                    │ (persist + notify)
                                    ▼
                          [DashboardBlock re-renders via onChange]
```

**Flow B: Scanner run → task insert**

```
[scan command | watcher debounced fire]
       ▼
[Scanner.scan(roots)]
       ▼
[TaskStore.mergeFromScan(tasks)]
       │ (dedupe by sourceRef.filePath + sourceRef.lineNumber)
       │ (mark tasks no longer found as done — user removed the TODO comment)
       │ (persist + notify)
       ▼
[InboxView + DashboardBlock re-render]
```

**Flow C: Dashboard open → stale-owe scan + nudge**

```
[DashboardBlock.render]
       ▼
[StaleOweCheck.run(store.tasks, settings.oweStalenessThresholdDays)]
       ├─▶ [for each stale owe not yet nudged today]
       │        ▼
       │   [Scheduler.fireOweStaleNotification(owe)]
       │        ▼
       │   [TaskStore.markOweNudged(oweId, Date.now())]
       ▼
(render proceeds — owes appear in "stale owes" section regardless of nudge state)
```

**Flow D: Meeting follow-up capture**

```
[user clicks event in dashboard / inbox]
       ▼
[QuickCaptureModal opens, pre-populated with calendarEventId in sourceRef]
       ▼
[save] → [TaskStore.add({ source: "manual", sourceRef: { calendarEventId } })]
       │ (or source: "meeting" follow-up — design decision, leaning "manual"
       │  because user authored it and it's not a calendar-derived task)
       ▼
[normal capture flow continues]
```

**Key invariant:** Every write enters the store through exactly one of `add`, `mergeFromFeed`, `mergeFromScan`, `update`, `markComplete`, `remove`. Each calls `persist()` + `notify()`. Views never need to know where a task came from — they just re-render on change.

---

## Data Flow Diagrams

### Request Flow (capture, unchanged from existing)

```
[user hotkey]
     ↓
[Plugin.openCaptureModal()]
     ↓
[QuickCaptureModal] ──parse──▶ [parseReminder()] ──▶ [chrono-node]
     │                                                    │
     │◀───────────── {text, dueAt, matchedText} ──────────┘
     │
     │ Enter pressed
     ▼
[TaskStore.add(task)] ──▶ [persist()] ──▶ [saveData + mirror file]
     │                          ↓
     │                   [notify listeners]
     │                          ├─▶ [InboxView.refresh]
     │                          └─▶ [DashboardBlock.re-render]
     ▼
[Scheduler.schedule(task)]
     ↓
[setTimeout registered]
```

### State Management

```
                       ┌──────────────────────┐
                       │   TaskStore          │
                       │   (single owner)     │
                       │                      │
                       │   - tasks[]          │
                       │   - projects[]       │
                       │   - settings         │
                       │   - feedCaches       │
                       │   - scanCache        │
                       └──────┬───────────────┘
                              │ persist() → saveData + mirror
                              │ notify() → listeners
                 ┌────────────┼────────────┐
                 │            │            │
           [onChange]   [onChange]   [onChange]
                 │            │            │
                 ▼            ▼            ▼
         ┌───────────┐  ┌───────────┐  ┌──────────────┐
         │InboxView  │  │Dashboard  │  │ Scheduler    │
         │(sidebar)  │  │Block      │  │ (reschedule  │
         │           │  │(per note) │  │  on change)  │
         └───────────┘  └───────────┘  └──────────────┘
                              ▲
                              │ writes via mergeFromFeed / mergeFromScan
                 ┌────────────┴────────────┐
          [FeedManager]              [Scanner]
                 │                         │
        ┌────────┴────────┐                │
        ▼                 ▼                ▼
  [GcalFetcher]    [IcsFetcher]      [Node fs walk]
```

---

## Build Order Implications

Dependencies between new components, informing phase ordering:

```
Phase 1: Schema + Store Evolution
    └─▶ types.ts (Task, Project, PluginData v1)
    └─▶ migrations/v1-reminder-to-task.ts
    └─▶ store.ts (TaskStore rename + merge methods)
    └─▶ Existing InboxView (née ReminderView) updated to read tasks
        GATES: Everything else. Nothing compiles until schema stabilizes.

Phase 2: Inbox UI + Projects
    └─▶ view-inbox.ts (filterable/sortable unified list)
    └─▶ ui/settings-tab.ts (project CRUD section)
    └─▶ QuickCaptureModal: add project selector + priority
        GATES: Nothing directly, but lets user see tasks other than reminders.

Phase 3: Code TODO Scanner
    └─▶ scanner/todo-regex.ts (pure, testable)
    └─▶ scanner/scanner.ts (walks fs)
    └─▶ TaskStore.mergeFromScan()
    └─▶ Watcher + debounce
        DEPENDS ON: Phase 1. Independent of Phase 2 UI but surfaces via it.
        INDEPENDENT OF: Calendar feeds.

Phase 4: Calendar Feeds
    └─▶ feeds/feed.ts (interface)
    └─▶ feeds/ics-parser.ts (pure, testable)
    └─▶ feeds/ics-fetcher.ts (Outlook first — no OAuth)
    └─▶ feeds/gcal-fetcher.ts (OAuth flow — hardest, last)
    └─▶ TaskStore.mergeFromFeed()
        DEPENDS ON: Phase 1. Independent of Phase 2 & 3.
        SUBDEPENDENCY: ICS before gcal (shared parser can be borrowed; gcal OAuth is harder).

Phase 5: Dashboard (daily note code block)
    └─▶ ui/dashboard-block.ts
    └─▶ Stale-owe check logic
    └─▶ Scheduler.fireOweStaleNotification()
        DEPENDS ON: Phases 1, 3, 4 (needs tasks from all sources to be meaningful).
        Can be built against partial data in parallel with Phase 4, but not usefully demo-able.

Phase 6 (optional / polish): Meeting follow-up capture
    └─▶ "Add follow-up" button on meeting rows in dashboard/inbox
    └─▶ QuickCaptureModal pre-population with calendarEventId
        DEPENDS ON: Phases 4 + 5.
```

**Critical path:** Phase 1 gates everything. Phases 3 and 4 are parallelizable once Phase 1 lands. Phase 5 is the "unlock" milestone where the vision becomes visible.

---

## Migration Strategy for Existing user Data

**Constraint (from PROJECT.md):** "Keep the existing `Reminder` data shape migratable — do not break user data on upgrade; additive schema changes only."

**Migration v0 → v1:**

1. `TaskStore.init()` reads raw JSON.
2. If `data.schemaVersion === undefined`, branch to `migrateV0toV1`.
3. Transformation is pure and deterministic:
   - `reminders[]` → `tasks[]` with `source: "manual"`, all Reminder fields preserved, `doneAt: notified ? dueAt : null`.
   - Add `projects: []`, `feedCaches: {}`, `scanCache: undefined`.
   - Extend `settings` with new defaults for new settings fields only.
4. Write `schemaVersion: 1` back.
5. Persist.
6. On failure: log error, surface `Notice` with "Plugin data migration failed. Your data is untouched. Please report a bug." Do NOT auto-retry, do NOT overwrite.

**Mirror file migration:**

The markdown mirror file (`Reminders.md`) was written by the plugin. Two options:

- **Option A (granted):** Rename to `Tasks.md` with configurable path. Keep `Reminders.md` as a deprecated alias if it exists. On first load post-migration, write to both until the user changes the setting.
- **Option B (simpler, safer):** Leave `Reminders.md` as-is. Add a new mirror file `Tasks.md` that covers the full task list. Legacy file becomes the "reminders-only view." Slight duplication, zero risk.

**Verdict:** Option B for v1. Revisit once user confirms the new flow is stable.

**Backward compatibility window:** One release (the migration release itself). No long-term dual-mode grant. Migrations are one-way; the plugin does not downgrade.

---

## Scaling Considerations

brownle-user desktop tool. Scale = "how many tasks before the UI feels slow."

| Scale | Architecture Adjustments |
|-------|--------------------------|
| < 500 tasks | No adjustments. In-memory filtering + sorting is instant. |
| 500-5,000 tasks | Virtualize the inbox list (render only visible rows). Memoize sort/filter results. |
| 5,000-50,000 tasks | Persist tasks as a separate file (not in plugin data JSON, which Obsidian loads eagerly). Lazy-load history by date range. Stop here — plausible ceiling. |
| > 50,000 tasks | Re-evaluate: the user is probably using the tool wrong. Archive UX > storage refactor. |

### Scaling Priorities

1. **First bottleneck:** Inbox view re-render on every mutation. Fix: throttle `notify()` to one call per frame (requestAnimationFrame coalescing).
2. **Second bottleneck:** markdown mirror file rewrite on every mutation. Fix: debounce mirror writes to 2s since last mutation. Already a minor cost; becomes significant at 1k+ tasks.
3. **Third bottleneck:** Scanner full-tree walks. Fix: persistent scan cache with mtime diffing, only re-read files whose mtime changed.

---

## Anti-Patterns

### Anti-Pattern 1: Writing Dashboard Content Into the Note File

**What people do:** On daily-note open, parse the note, find a `## Dashboard` heading, and replace its contents with generated text.

**Why it's wrong:**
- Pollutes user content with plugin-owned text.
- Race conditions with user edits.
- Stale content persists if plugin is disabled.
- Git diffs become noisy.
- user may accidentally edit the block and lose their changes on next render.

**Do this instead:** `registerMarkdownCodeBlockProcessor("qr-dashboard", ...)`. The block is a user-authored marker; the plugin renders an overlay. When the plugin is disabled, the block simply shows as a code block. The user's text is always the user's.

### Anti-Pattern 2: Per-Source Stores with a View Adapter

**What people do:** `ReminderStore`, `MeetingStore`, `CodeTodoStore`, `OweStore` — each with its own persistence, observers, mutations. A `UnifiedView` adapter merges them on read.

**Why it's wrong:**
- Four persistence writes on every mutation (or four `setData` calls on one blob, with races).
- Views subscribe to four observer lists; one misses an update and the UI is inconsistent.
- Cross-source logic (dedupe, sort, filter) lives in the adapter and fights the store layer.
- Scheduler needs to read from all four for firing decisions.

**Do this instead:** One `TaskStore` with a discriminated union. Fetchers and scanner write through clearly-named merge methods (`mergeFromFeed`, `mergeFromScan`) that handle dedupe and upsert internally.

### Anti-Pattern 3: Background Polling Timer for Calendar Feeds

**What people do:** `setInterval(() => refreshAllFeeds(), 5 * 60_000)`.

**Why it's wrong:**
- Hits provider quota even when Obsidian is idle/minimized.
- Timer leaks on hot-reload (plugin dev loop).
- user never sees "fresh" data that wasn't triggered by opening something.
- Complicates testing (timers need to be stubbed).

**Do this instead:** Cache-with-TTL + lazy refresh on view open + manual refresh button. The user is the trigger.

### Anti-Pattern 4: Worker Thread for TODO Scanning (Premature)

**What people do:** "The scan might be slow, let me use a worker thread."

**Why it's wrong:**
- Obsidian plugin bundling (esbuild single file) doesn't have a clean worker-file story. Adds build complexity.
- Node `worker_threads` in Electron renderer processes has edge cases (LOW confidence on exact current state — verify).
- For the granted scale (hundreds of files), chunked async with `setImmediate` yields is sufficient.
- Adds a serialization boundary for every task found.

**Do this instead:** Chunked async. Profile first. If budget misses, revisit.

### Anti-Pattern 5: Treating Calendar Events as First-Class Mutable Tasks

**What people do:** Store calendar events as full tasks user can edit, then try to push edits back to the provider.

**Why it's wrong:**
- PROJECT.md explicitly calls calendar feeds read-only.
- Write-back requires OAuth scope escalation (not worth it for v1).
- Creates an impedance mismatch: which is the source of truth — vault or provider?

**Do this instead:** Calendar events materialize as tasks with `source: "meeting"` and are re-derived from feed cache on every refresh. user edits to these tasks are allowed but warned ("this will be overwritten on next refresh"). Follow-up captures are separate `source: "manual"` tasks with a `sourceRef.calendarEventId` link.

---

## Integration Points

### External services

| service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Google Calendar | OAuth PKCE, `requestUrl` for API calls | Public client ID. Refresh token in plugin data. Local-loopback redirect (verify OOB state at build time). |
| Outlook (or any ICS source) | Plain HTTP `requestUrl` + ICS parser | No auth. user pasgates URL. ETag grant if provider sends it. |
| Code TODO sources | Node `fs.promises` walk | Desktop only. Respect `.gitignore`. Hard caps on file size and total count. |
| Obsidian plugin data | `loadData` / `saveData` | Unchanged. Single JSON blob. |
| Vault filesystem | `app.vault.*` + `TFile` | Unchanged for mirror file. Dashboard block uses code-block processor, not vault writes. |
| OS notifications | `new Notification(...)` | Unchanged. Added: stale-owe notifications fire via same `Scheduler.fire` path. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI ↔ TaskStore | Direct method calls + `onChange` subscription | Matches existing pattern. |
| TaskStore ↔ Scheduler | Scheduler reads `store.pending`. Writes via `onFire` callback injected at construction. | Preserves no-cycle invariant. |
| Feeds ↔ TaskStore | Feeds call `store.mergeFromFeed(feedId, tasks)`. No reverse dependency. | Feeds don't know about UI or scheduler. |
| Scanner ↔ TaskStore | Scanner calls `store.mergeFromScan(tasks)`. | Same pattern as feeds. |
| Dashboard ↔ TaskStore | Dashboard block subscribes to `onChange`; calls store getters. | Treated as another view. |
| Dashboard ↔ FeedManager | Dashboard triggers `refreshIfStale` on open. | FeedManager owns the cache logic; dashboard just asks. |
| Scanner ↔ Node fs | Isolated in `scanner/` module | Only place outside tests that imports `fs`. Mobile guard. |

---

## Confidence Summary

| Claim | Confidence | Basis |
|-------|------------|-------|
| Existing architecture is layered + single-owner + observer | HIGH | Verified in supplied ARCHITECTURE.md and STRUCTURE.md |
| Unified Task with discriminator is simpler than peer stores | HIGH | Architectural first principles; matches existing single-owner invariant |
| `registerMarkdownCodeBlockProcessor` is the idiomatic dashboard pattern | MEDIUM | Training data on Obsidian plugin ecosystem; widely used by Dataview, Tasks, Day Planner — verify API signature against current docs |
| `requestUrl` bypasses CORS for plugin HTTP calls | MEDIUM | Documented Obsidian API (training data); verify current signature |
| Worker threads in Obsidian plugin bundling are awkward | LOW | Training data; may have improved recently — test before dismissing |
| gcal OOB OAuth deprecation state | LOW | Google has been phasing this out; check current state before picking loopback vs OOB |
| `fs.watch` recursive option availability per OS | MEDIUM | Node docs state Linux lacks recursive natively; plan fallback |
| Scale ceilings (500, 5k, 50k task benchmarks) | MEDIUM | Informed estimate based on DOM render cost + JSON parse cost; profile actual numbers in Phase 2 |
| Existing reminder-to-task migration is safe via additive fields | HIGH | Verified Reminder shape in types.ts analysis; transformation is pure |

---

## Gaps / Open Questions for Phase-Specific Research

1. **gcal OAuth flow** — verify current granted flows (loopback vs PKCE native vs deprecated OOB) at Phase 4 start.
2. **`requestUrl` current signature** — verify against Obsidian's latest plugin API docs before writing fetcher code.
3. **Worker thread feasibility in Obsidian** — test with a toy plugin if scanner performance becomes an issue in Phase 3.
4. **ICS parser choice** — evaluate `ical.js` vs `node-ical` vs a hand-written minimal parser for bundle size. LOW confidence without current npm data.
5. **`fs.watch` recursive behavior on Linux** — test on target platform; plan fallback to polling or per-directory watchers.
6. **Markdown code-block processor lifecycle** — confirm `ctx.addChild()` + `MarkdownRenderChild.onunload()` unsubscribe correctly prevents listener leaks when the note tab closes.

---

*Architecture research for: Obsidian plugin personal PM layer (quick-reminder extension)*
*Researched: 2026-04-18*
