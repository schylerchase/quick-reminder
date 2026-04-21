# Project Research Summary

**Project:** quick-reminder — Engineer Task & Project Management (Obsidian plugin extension)
**Domain:** Desktop Obsidian plugin — personal PM layer with unified inbox, calendar merge, code TODO scanner, daily-note dashboard
**Researched:** 2026-04-18 (STACK, FEATURES, ARCHITECTURE) / 2026-04-21 (PITFALLS, SUMMARY)
**Confidence:** MEDIUM overall (HIGH on patterns and existing-codebase grounding; MEDIUM on version-specific and third-party-product specifics; research ran without live web/npm/Context7 access)

## Executive Summary

This is a brownfield extension of an already-shipping Obsidian reminder plugin into a full personal task/PM layer for a senior engineer. The load-bearing thesis — "every actionable item is visible and triageable from one view inside Obsidian" — concentrates value in a **unified inbox that merges four heterogeneous sources** (manual, meeting follow-up, code TODO, async owe) alongside a **read-only calendar merge (Google Calendar OAuth + Outlook ICS)** surfaced through a **daily-note dashboard**. The four research documents converge strongly on this shape; differentiation lives in the *combination* (vault-native + multi-source + engineer-specific TODO scan + gcal/Outlook read-only + no AI auto-scheduling), not any single feature.

The recommended build path is an **evolution, not a fork**: rename `ReminderStore` → `TaskStore`, migrate the existing `Reminder` shape to a discriminated-union `Task` model with a `source` field, and plug feeds and the scanner in through a single store boundary (`mergeFromFeed`, `mergeFromScan`). New dependencies are deliberately minimal — `ical.js` for ICS, `googleapis` + `google-auth-library` for Google, `globby` for filesystem walks — with all OAuth, scanning, and timezone-mapping logic hand-written against standards rather than pulled from heavier libraries. Existing patterns (single-owner store + observer, chrono-node parse, Electron notifications, esbuild single-bundle) carry forward unchanged.

The biggest risks are concentrated and well-understood: **schema migration must be atomic and backup-first** or it wipes existing reminder data; **Outlook ICS feeds use Windows timezone names** that `ical.js` does not map (requires a bundled CLDR Windows→Olson table); **Google OAuth refresh-token storage** needs Electron `safeStorage` if available or an explicit disclosure fallback (the single most important Phase-0 spike); **code-block processor lifecycle leaks** in the dashboard will silently double-fire renders unless `MarkdownRenderChild` is used correctly. All four risks are phase-scoped with clear prevention strategies.

## Key Findings

### Recommended Stack

Three new runtime dependencies cover the entire new scope. STACK is explicit that version pins are LOW-MEDIUM confidence (cutoff-based, no live `npm view`) — phase-level research must verify current versions before `npm install`. Library *selection* is HIGH confidence.

**Core technologies:**
- **`ical.js` (^2.1.x)** — ICS parsing + RRULE expansion + VTIMEZONE — Mozilla-maintained, powers Thunderbird, correct RFC 5545 coverage. Handles floating-time distinction (critical for Outlook all-day events).
- **`googleapis` (^144.x)** — Google Calendar v3 client + transitively `google-auth-library` — official SDK with built-in token auto-refresh; subscribe to its `tokens` event to re-persist.
- **`globby` (^14.x)** — Filesystem walk for the TODO scanner with `gitignore: true` — trims 80-95% of files in a typical monorepo.
- **Node built-ins (`http`, `crypto`, `fs`, `readline`)** — Loopback OAuth listener (~80 LOC), PKCE S256, streaming file reads.
- **Electron `safeStorage`** — Encrypted OAuth refresh-token storage at rest. **MEDIUM confidence**; feasibility inside an Obsidian plugin renderer is the primary Phase-0 spike.

**Explicitly NOT adopted:** `luxon`, `rrule` npm, `node-ical`, `ical-expander`, `leasot`, `moment`, `chokidar`, `axios`, `react-window`, `zod` transforms. Lean-deps discipline matches existing codebase.

Full details: `.planning/research/STACK.md`

### Expected Features

Most table stakes are already shipped or trivially extended; **differentiators cluster around four load-bearing capabilities** (D1 unified inbox, D4 code TODO scanner, D13 calendar merge, D14 today timeline) plus D9 (daily-note dashboard) as the habit hook.

**Must have (table stakes):**
- Quick capture, natural-language dates, snooze, persistence (T1, T2, T12, T14) — already exist
- Due date/time, priority (5 levels, Tasks-plugin-compatible emoji schema), done + completion timestamp, edit in place, overdue detection, tags, empty-state messages (T3-T5, T11, T13, T15, T17)
- Filter, sort, keyboard navigation scoped to inbox (T6, T7, T8)

**Should have (the differentiators):**
- **D1 Unified inbox** merging manual + meeting + code + owe — the load-bearing v1 feature. No Obsidian plugin does this today.
- **D2 Source adapter pattern** — normalizes heterogeneous sources to one `Task` shape; v2+ extensions become one file.
- **D3 Task provenance** — click-through to origin; trust-critical behavior competitors drop.
- **D4 Code TODO scanner** with configured paths, `.gitignore` respect, mtime cache.
- **D13 Calendar merge** (gcal OAuth + Outlook ICS, read-only) + **D14 today timeline** — daily-shape minimum minus auto-scheduling.
- **D9 Morning dashboard block** via `qr-dashboard` markdown code block — habit hook; renders live over user-owned content.
- **D15 Meeting follow-up capture**, **D16 stale-owes nudges**, **D17 Projects as first-class containers**.

**Defer (v1.x by specific pain triggers, or v2+):**
- Bulk operations (T9), full-text search (T10), undo (T16)
- Per-repo context (D5), `TODO(@name)` parsing (D6), standup view + markdown export (D7, D8), per-project mirror (D11), `qr-tasks` code-block DSL (D12)
- **Explicitly never in scope**: AI auto-scheduling (A1), gamification (A2), team/sharing (A3), mobile (A5), recurring tasks in v1 (A6), Jira/Linear/Asana (A7), Outlook OAuth (A8), cloud backend (A9), email bridge (A10), writable calendar (A15).

Full details: `.planning/research/FEATURES.md`

### Architecture Approach

**Single-owner store evolution, not peer stores.** One `TaskStore` (renamed from `ReminderStore`) holds all tasks with a `source: "manual" | "meeting" | "code" | "owe"` discriminator and an optional `sourceRef` payload. Feeds and scanner write through dedicated merge methods (`mergeFromFeed`, `mergeFromScan`) that handle dedupe internally. All views subscribe to one `onChange` stream.

**Major components:**
1. **`TaskStore`** — single source of truth; tasks, projects, settings, feed caches, scan cache; persistence via `loadData`/`saveData` + debounced markdown mirror.
2. **`Scheduler`** — existing timer + notifications; reads `store.pending` filtered by `dueAt != null`; drives stale-owe nudges.
3. **`feeds/`** — per-provider `Feed` interface; `GcalFetcher` (OAuth PKCE + loopback) and `IcsFetcher` (via Obsidian `requestUrl`); cache-with-TTL + lazy refresh on view open; **no interval polling in v1**.
4. **`scanner/`** — isolated Node `fs` usage; on-demand + debounced file-watcher; chunked async with `setImmediate` yields every ~50 files; hard caps (10k files / 1MB per file).
5. **`DashboardBlock`** — `registerMarkdownCodeBlockProcessor("qr-dashboard", ...)` wrapped in a `MarkdownRenderChild`; renders live overlay, disappears cleanly when plugin disabled; does NOT write into note files.
6. **`InboxView`** — evolved from `ReminderView`; plain DOM + keyed reconciliation, no virtualization at 500-item target.
7. **`migrations/`** — versioned linear migration chain; `v0 → v1` converts `reminders[]` to `tasks[]` preserving IDs; backup-before-migrate.

Full details: `.planning/research/ARCHITECTURE.md`

### Critical Pitfalls

Top five gate phase success:

1. **Schema migration partial-write corruption** (Phase 1) — Copy `data.json` to `data.json.pre-v{N}.bak` BEFORE migration; compute full new shape in memory; single atomic `saveData`; update `schemaVersion` LAST; preserve IDs. On failure: refuse to start, surface recovery dialog, never wipe.
2. **Google OAuth refresh-token storage** (Phase 4) — Spike `safeStorage.isEncryptionAvailable()` from plugin renderer at phase start; encrypt if available; otherwise explicit user disclosure + separate file excluded from sync. Never ship a shared client secret — user supplies own Google Cloud OAuth client ID.
3. **Outlook ICS Windows timezone names** (Phase 4) — Ship a static CLDR Windows→Olson mapping (~100 entries); detect Windows TZ via regex; translate before handing to `ical.js`; fall back to local zone with visible "timezone unknown" badge.
4. **Main-thread block from TODO scanner** (Phase 3) — `globby` + chunked async + `await new Promise(setImmediate)` every ~50 files; hard caps; measure against 2s budget.
5. **Dashboard code-block processor lifecycle leak** (Phase 5) — Wrap every dashboard subtree in a `MarkdownRenderChild`; subscriptions in `onload`, unsubscribe in `onunload`; use `ctx.addChild(...)`; verify listener count stable across 10 pane open/close cycles.

Also material: event-listener leaks across hot-reload (Phase 1, cross-cutting), catch-up notification flooding (Phase 5, aggregate when > threshold), daily-note filename localization (Phase 5, use `obsidian-daily-notes-interface`, never auto-create), ICS RRULE edge cases (Phase 4, expand ±14 days only), vault-file write collisions (Phase 1, debounce mirror 250ms).

Full details: `.planning/research/PITFALLS.md`

---

## Cross-Document Convergences and Contradictions

### Strong convergences (all four documents agree)

- **Schema/storage first.** STACK ("Lock in current shape as v1 BEFORE any new fields ship"), ARCHITECTURE ("Phase 1 blocks everything"), PITFALLS ("Phase 1 is where migration ships"), and FEATURES (D17 Projects must be designed *with* the Task model extension) all put schema + store evolution first. This is the most strongly reinforced build-order signal in the research.
- **Versioned linear migration chain + backup.** Unanimous across STACK, ARCHITECTURE, PITFALLS.
- **Unified Task with discriminator, single store.** ARCHITECTURE argues it structurally; FEATURES confirms it at the feature layer (D1/D2); STACK presumes it for migration design. No document proposes peer stores.
- **Dashboard via markdown code-block processor, not write-into-note.** Unanimous.
- **Calendar is read-only in v1.** PROJECT.md constraint; reinforced by FEATURES (A15), ARCHITECTURE (anti-pattern 5), STACK (`calendar.readonly` scope), PITFALLS (OAuth complexity escalates with write).
- **No interval polling / no background timers beyond scheduler.** Unanimous.
- **No AI, no scheduling engine, no mobile, no cloud, no recurring v1.** PROJECT.md source; FEATURES codifies A1/A5/A6/A9/A11; ARCHITECTURE defers; STACK has no LLM deps. Out-of-scope boundary is rock-solid.
- **ical.js is the ICS parser.** STACK recommends definitively; ARCHITECTURE hedges; PITFALLS treats as given. STACK is the load-bearing source.
- **User-supplied Google OAuth client ID.** Unanimous.

### Tensions and contradictions

- **Google OAuth flow specifics.** ARCHITECTURE says "PKCE ... or use `urn:ietf:wg:oauth:2.0:oob` if still supported — LOW confidence." STACK and PITFALLS flatly state **OOB is deprecated; use loopback + PKCE**. **Resolution: loopback + PKCE, no OOB fallback.** STACK/PITFALLS win; ARCHITECTURE's hedge is stale.
- **ICS library confidence.** STACK HIGH on `ical.js`; ARCHITECTURE flags it as "LOW confidence without current npm data, evaluate." **Resolution: defer to STACK. ARCHITECTURE's hedge reflects earlier-pass uncertainty.**
- **`requestUrl` vs `fetch`.** ARCHITECTURE specifies `requestUrl` (CORS bypass). STACK says "use `fetch()`". **Resolution: prefer `requestUrl` per ARCHITECTURE + PITFALLS — Obsidian-idiomatic, handles CORS/proxy/auth uniformly.**
- **Worker threads for scanner.** STACK/ARCHITECTURE agree "no workers v1." ARCHITECTURE adds "LOW confidence — verify." **Resolution: no workers v1; profile and revisit only if 2s budget slips.**
- **Markdown mirror strategy during migration.** ARCHITECTURE proposes Option B (new `Tasks.md`, leave `Reminders.md`). PITFALLS mandates debounced mirror writes. **Resolution: Option B + 250ms debounce; revisit filename v1.x.**
- **`fs.watch` recursive.** ARCHITECTURE wants watcher + fallback; STACK wants on-demand only. **Resolution: on-demand primary; opportunistic watcher when `recursive: true` works; clean fallback if not.**

None of these block Phase 1. They're Phase-3/Phase-4 resolution points.

### Phase-0 spike flags

Must be resolved before their respective phases commit:

1. **`safeStorage` accessibility inside Obsidian plugin renderer** — Phase 4 kick-off spike.
2. **Current Google OAuth flow status** — verify Google Identity docs at Phase 4 kick-off.
3. **`requestUrl` current signature** — Phase 4 start.
4. **Outlook ICS feed diversity** — collect 2-3 real samples from user's corporate calendar at Phase 4 kick-off.
5. **`ical.js` CJS/ESM interop with esbuild config** — Phase 4; `globby@14` ESM hits same question in Phase 3.
6. **TODO scanner performance vs user's actual monorepo** — Phase 3 acceptance criterion.
7. **`MarkdownRenderChild` lifecycle** — Phase 5 start listener-count test.
8. **`fs.watch` recursive on user's platform** — Phase 3, with on-demand fallback baked in.

---

## Implications for Roadmap

### Phase 1: Schema & Store Foundation

**Rationale:** Unanimous "first" across research. Nothing compiles until `Task` shape stabilizes; migration is highest-risk one-way change; storage-boundary pitfalls must be solved in the store layer once.

**Delivers:**
- `types.ts` with `Task` (discriminated union), `Project`, `PluginData`, `schemaVersion`
- `TaskStore` renamed from `ReminderStore`; `mergeFromFeed` / `mergeFromScan` / `markComplete`
- `migrations/v1-reminder-to-task.ts` — pure function, preserves IDs, handles missing `schemaVersion` as v0
- Backup-before-migrate: `data.json.pre-v1.bak`
- Debounced markdown mirror (250ms trailing); `crypto.randomUUID()` replacing `Math.random()` for IDs
- Existing `ReminderView` updated to read tasks; all existing behavior preserved

**Avoids pitfalls:** #1 (listener-leak pattern established); #5 (migration corruption); #10 (vault-file write collisions).

**Acceptance:** Existing reminders survive version bump with zero data loss, IDs preserved, scheduler timers still fire.

### Phase 2: Inbox UI + Projects

**Rationale:** Once store holds tasks, UI displays them filterably. Projects slot in because CRUD surface is trivial once `Project` exists in schema. First *visible* user improvement.

**Delivers:**
- `view-inbox.ts` replacing/evolving `ReminderView` — plain DOM + keyed reconciliation
- Filter chips (status/due/project/source/priority); multi-key sort; keyboard navigation (j/k/enter/d/s/e/del) scoped to view
- Settings tab extraction + Project CRUD
- `QuickCaptureModal` extended with project selector + priority
- Overdue detection, empty-state messages, edit-in-place

### Phase 3: Code TODO Scanner

**Rationale:** Independent of feeds; unblocks D4 the moment inbox exists. Parallelizable with Phase 4.

**Delivers:**
- `scanner/todo-regex.ts` (pure, testable)
- `scanner/scanner.ts` — `globby` with `gitignore: true`, chunked async with `setImmediate` every ~50 files, mtime cache, binary detection via NUL-byte
- `TaskStore.mergeFromScan()` with file+line dedupe
- On-demand scan + debounced file-watcher (opportunistic `recursive: true`, fallback to on-demand-only)
- Hard caps: 10k files, 1MB/file, 50MB total
- `performance.now()` instrumentation against 2s budget

**Avoids pitfalls:** #2 (main-thread block); `.gitignore` bypass.

**Acceptance:** <2s scan against user's actual monorepo; no UI jank; `node_modules`/`.git` never visited.

### Phase 4: Calendar Feeds (ICS first, gcal second)

**Rationale:** ICS first — no OAuth, simpler error surface, shares `ics-parser.ts` gcal can borrow. Google OAuth is hardest integration and most pitfall-dense.

**Delivers:**
- `feeds/feed.ts` interface
- `feeds/ics-parser.ts` (pure, testable; `ical.js` wrapper; Windows→Olson CLDR table bundled)
- `feeds/ics-fetcher.ts` via Obsidian `requestUrl`; ETag + `If-None-Match`
- `feeds/gcal-fetcher.ts` — PKCE + loopback on `localhost:0`; `googleapis` with `google-auth-library`; `tokens` event re-persists; `invalid_grant` → reauth banner
- `safeStorage` encryption for refresh token if available; disclosed fallback otherwise
- User-supplied OAuth client ID in settings; setup guide documents Google Cloud Console steps
- `TaskStore.mergeFromFeed(feedId, tasks)` with `sourceRef.calendarEventId` dedupe
- Lazy refresh on view open; manual "refresh feeds" command; no interval polling
- 15-minute default TTL; stale-while-revalidate

**Avoids pitfalls:** #3 (Outlook Windows TZ); #4 (refresh-token storage); #9 (RRULE edge cases — ±14d window).

**Phase-0 spikes required:** `safeStorage`, current OAuth recommended flow, `requestUrl` signature, `ical.js` bundling, Outlook corporate ICS samples.

### Phase 5: Daily Dashboard + Stale-Owes Nudges

**Rationale:** Dashboard is derived — needs tasks from all sources. Unlock moment where "one inbox" thesis becomes visible in daily workflow.

**Delivers:**
- `ui/dashboard-block.ts` — `registerMarkdownCodeBlockProcessor("qr-dashboard", ...)` + `MarkdownRenderChild` wrapper
- Three sections: today's meetings, tasks due today (priority-sorted), stale owes
- Subscribes to `TaskStore.onChange` via the render child
- Stale-owe check on dashboard render; `Scheduler.fireOweStaleNotification()` with per-day dedup
- Catch-up notification aggregation: overdue > threshold → one digest
- Meeting follow-up capture button → `QuickCaptureModal` pre-populated with `sourceRef.calendarEventId`
- `obsidian-daily-notes-interface` integration for reading current daily-note path (never auto-create, never write-into)

**Avoids pitfalls:** #6 (dashboard lifecycle); #7 (catch-up flood); #8 (daily-note localization).

### Phase Ordering Summary

1. **Schema dependency absolute** — Phase 1 first, unanimous.
2. **Inbox UI Phase 2** unlocks visible progress; projects slot here.
3. **Scanner (3) parallel to calendar (4)** — independent sources.
4. **Calendar sequenced ICS → gcal** — no-auth before OAuth.
5. **Dashboard last** — requires all sources to be meaningful.

### Research Flags per Phase

- **Phase 1** — MEDIUM. Capture frozen v0 fixture; verify `crypto.randomUUID()`.
- **Phase 2** — LOW. Standard patterns.
- **Phase 3** — MEDIUM. `globby@14` ESM vs esbuild CJS; `fs.watch` recursive; profile budget.
- **Phase 4** — **HIGH**. Densest pitfall surface; multiple spikes required.
- **Phase 5** — MEDIUM. `MarkdownRenderChild` lifecycle; `obsidian-daily-notes-interface`.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | HIGH on library selection; LOW-MEDIUM on version pins |
| Features | MEDIUM | HIGH on Obsidian ecosystem and existing-codebase; MEDIUM on competitor specifics |
| Architecture | MEDIUM | HIGH on existing-codebase + first-principles; MEDIUM on Obsidian API signature currency |
| Pitfalls | MEDIUM-HIGH | HIGH on Obsidian + existing-codebase; MEDIUM on ICS/OAuth edge cases |

**Overall confidence:** MEDIUM — sufficient to proceed to roadmap creation.

### Gaps to Address at Phase Start

- Live version verification via `npm view` before any `npm install`
- Google OAuth current recommended flow via Google Identity docs
- `safeStorage` inside Obsidian plugin renderer spike
- Outlook corporate feed samples from user's employer
- `fs.watch` recursive on user's OS
- User's actual monorepo size vs 2s scanner budget
- Obsidian Sync behavior for plugin data directory

## Sources

### Primary (HIGH confidence)
- `.planning/codebase/` (ARCHITECTURE, CONCERNS, CONVENTIONS, INTEGRATIONS, STACK, STRUCTURE, TESTING)
- `.planning/PROJECT.md`
- RFC 5545 (iCalendar), RFC 8252 (OAuth 2.0 for Native Apps), RFC 7636 (PKCE)
- Obsidian plugin API (`registerMarkdownCodeBlockProcessor`, `MarkdownRenderChild`, `requestUrl`, `Vault.process()`, `normalizePath`, `Platform.isDesktop`, `loadData`/`saveData`, `ItemView`)

### Secondary (MEDIUM confidence)
- Model training data through January 2026
- Competitor analysis (Reclaim, Motion, Amie, Sunsama, Akiflow, Things, OmniFocus, Todoist, TODO Tree)
- CLDR `windowsZones.xml`

### Tertiary (LOW confidence — validate at phase start)
- Exact current npm versions
- Current Google OAuth accepted flows
- `safeStorage` accessibility inside plugin renderer
- `fs.watch` recursive support on Linux
- Third-party Obsidian plugin version-specific features

---

## Ready for Requirements

Synthesis complete. Roadmapper has everything needed to structure five phases with clear rationale, dependencies, and phase-start research flags.
