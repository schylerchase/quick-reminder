# Requirements

**Project:** Quick Reminder — Engineer Task & Project Management
**Version:** v1
**Last updated:** 2026-04-21

## v1 Requirements

### Data Foundation

- [ ] **DATA-01**: Plugin migrates existing `reminders[]` data to `tasks[]` on first launch of v1, preserving every reminder's ID, text, due time, and state
- [ ] **DATA-02**: Plugin writes `data.json.pre-v1.bak` before running the migration; refuses to start and surfaces a recovery dialog if migration throws
- [ ] **DATA-03**: `schemaVersion` field is updated last, after the new data shape is successfully written to disk
- [ ] **DATA-04**: Plugin generates IDs with `crypto.randomUUID()` (replaces `Math.random()` used today)
- [ ] **DATA-05**: `TaskStore` persists to `plugin.saveData` with debounced (250ms trailing) markdown mirror writes
- [ ] **DATA-06**: `Task` model is a discriminated union with `source: "manual" | "meeting" | "code" | "owe"` and an optional `sourceRef` payload
- [ ] **DATA-07**: `Project` model exists with fields `id`, `name`, `status`, optional `noteLink`
- [ ] **DATA-08**: Markdown mirror is write-only; warns on user edits detected via mtime drift (does not round-trip parse)

### Capture

- [ ] **CAP-01**: Global hotkey opens the quick-capture modal (existing) — unchanged
- [ ] **CAP-02**: Quick-capture modal parses natural-language due times via chrono-node with live preview (existing) — unchanged
- [ ] **CAP-03**: Quick-capture modal exposes optional project selector and priority (1-5) fields
- [ ] **CAP-04**: User can convert a selected editor line to a task via command (existing pattern extended)
- [ ] **CAP-05**: Quick-capture modal can pre-populate `sourceRef.calendarEventId` when invoked from a meeting context (Dashboard button)

### Task Model

- [ ] **TASK-01**: Task has a due date with optional time component (all-day vs timed)
- [ ] **TASK-02**: Task has priority across 5 levels aligned with Obsidian Tasks emoji schema (🔺⏫🔼🔽⏬)
- [ ] **TASK-03**: Task has `status: "open" | "done" | "cancelled"` with completion timestamp when marked done
- [ ] **TASK-04**: User can edit a task in place (text, due, priority, project) without delete+recreate
- [ ] **TASK-05**: Overdue tasks receive visible treatment (color or icon) in every list view that shows them
- [ ] **TASK-06**: Task text supports `#tag` tokens parsed as facets and surfaced as filter options
- [ ] **TASK-07**: User can snooze a task to presets (later today, tomorrow morning, next week) or a custom time (existing pattern extended)
- [ ] **TASK-08**: User can undo the last destructive action (delete, bulk done) within the session via an in-memory undo stack

### Inbox View

- [ ] **INBOX-01**: Sidebar inbox view renders all open tasks from all sources in one list
- [ ] **INBOX-02**: Inbox view supports filter chips for status (open/done/all), due (today/overdue/this week/no date), project, source, and priority; last-used filter persists
- [ ] **INBOX-03**: Inbox view supports stable multi-key sort by due / priority / created / project
- [ ] **INBOX-04**: Keyboard navigation works scoped to the focused inbox view: `j`/`k` move, `Enter` open, `d` done, `s` snooze, `e` edit, `Delete` delete; does not fight Obsidian global shortcuts
- [ ] **INBOX-05**: User can multi-select (shift-click, shift-j/k) and run bulk done / delete / reschedule on the selection
- [ ] **INBOX-06**: Inbox view supports full-text search across task text, tags, and project name
- [ ] **INBOX-07**: Empty states display a helpful message when the filter returns no tasks
- [ ] **INBOX-08**: Clicking a task reveals its origin: file+line for code TODOs (opens in editor), calendar event for meeting follow-ups, originating note for manual tasks

### Projects

- [ ] **PROJ-01**: User can create, rename, and delete projects via a dedicated modal or settings tab
- [ ] **PROJ-02**: Task can be assigned to exactly one project or no project
- [ ] **PROJ-03**: Inbox filter chip "project" allows per-project focus
- [ ] **PROJ-04**: Project optionally links to an Obsidian note via `[[link]]` that the user can open from the project UI

### Code TODO Scanner

- [ ] **SCAN-01**: User configures absolute paths to scan in settings; no auto-detection of repos
- [ ] **SCAN-02**: Scanner detects `// TODO:`, `# TODO:`, `/* TODO: */`, `<!-- TODO: -->` and similar patterns across text files
- [ ] **SCAN-03**: Scanner respects `.gitignore` rules and never walks `node_modules`, `.git`, `dist`, `build`, `.next`, `.obsidian`
- [ ] **SCAN-04**: Scanner skips binary files via NUL-byte detection in the first 1KB
- [ ] **SCAN-05**: Scanner completes a full run against the user's configured paths within 2 seconds on a typical monorepo, verified with `performance.now()` instrumentation
- [ ] **SCAN-06**: Scanner yields to the event loop every ~50 files so the Obsidian renderer stays responsive
- [ ] **SCAN-07**: Scanner hard caps at 10,000 files / 1MB per file / 50MB total text; fails loud with a notice when exceeded
- [ ] **SCAN-08**: Scanner maintains an mtime cache so unchanged files are not re-read on subsequent runs
- [ ] **SCAN-09**: Scanner runs on-demand (command and inbox button) and via a debounced file-watcher when `fs.watch` `recursive: true` is supported, falling back to on-demand-only otherwise
- [ ] **SCAN-10**: Scanner results dedupe by `path:line`; a task whose source TODO has been removed from code is auto-marked done
- [ ] **SCAN-11**: Scanner parses `TODO(@name)` as an assignee signal and classifies matching tasks as `source: "owe"` when the name matches the user's configured handle

### Calendar Feeds

- [ ] **CAL-01**: User can configure one or more ICS feed URLs in settings; feeds fetched via Obsidian `requestUrl` with ETag / `If-None-Match`
- [ ] **CAL-02**: ICS parser handles Outlook corporate feeds with Windows timezone names (`Eastern Standard Time` → `America/New_York`) via a bundled CLDR Windows→Olson mapping table
- [ ] **CAL-03**: ICS parser expands recurring events within a ±14-day window; out-of-window events are ignored
- [ ] **CAL-04**: User configures their own Google Cloud OAuth client ID and secret in settings; the plugin never ships a shared secret
- [ ] **CAL-05**: Google Calendar authentication uses PKCE + loopback redirect on an ephemeral localhost port; no OOB flow
- [ ] **CAL-06**: Plugin requests only the `calendar.readonly` scope; calendar is never written to
- [ ] **CAL-07**: Google OAuth refresh token is encrypted at rest via Electron `safeStorage` when available; otherwise stored in a separate file with an explicit in-app disclosure
- [ ] **CAL-08**: Plugin detects `invalid_grant` / refresh failure and surfaces a visible reauthentication banner in the dashboard
- [ ] **CAL-09**: Feed caches refresh lazily on view open when stale (default TTL 15 min) and via a manual "refresh feeds" command; no background interval polling
- [ ] **CAL-10**: Stale-while-revalidate: dashboard renders cached data during refresh, not an empty state

### Daily Dashboard

- [ ] **DASH-01**: Plugin registers a markdown code-block processor for the language `qr-dashboard`; user places `` ```qr-dashboard ` ` `` in their daily note template
- [ ] **DASH-02**: Plugin does not write into note files and does not auto-create daily notes; presence of the code block is the sole render trigger
- [ ] **DASH-03**: Dashboard shows three sections: today's meetings (timed from calendar feeds), tasks due today (sorted by priority), and stale owes past the configured threshold
- [ ] **DASH-04**: Dashboard subscription to `TaskStore.onChange` uses `MarkdownRenderChild` lifecycle; subscriptions clean up in `onunload`; 10 pane open/close cycles leave listener count stable
- [ ] **DASH-05**: Dashboard exposes a "Capture follow-up" action on each meeting row that opens the quick-capture modal pre-populated with `sourceRef.calendarEventId`
- [ ] **DASH-06**: Dashboard reads current daily-note path via `obsidian-daily-notes-interface` when available; works across user-configured daily-note formats
- [ ] **DASH-07**: Dashboard shows a "last synced" badge per feed and a visible warning when a feed is stale beyond 2× its TTL

### Async Owes & Nudges

- [ ] **OWE-01**: User can capture a task with `source: "owe"` explicitly via capture modal flag or automatically via `TODO(@name)` scan match
- [ ] **OWE-02**: Owe tasks track `createdAt`; staleness threshold is user-configurable (default 3 days)
- [ ] **OWE-03**: Stale owes surface in the dashboard regardless of due date
- [ ] **OWE-04**: Stale owe past threshold fires one native OS notification per owe per day (per-day dedup)
- [ ] **OWE-05**: When ≥3 reminders or stale owes would fire simultaneously (e.g., launch-time catch-up), plugin aggregates them into one digest notification

### Notifications (foundation — existing behaviour preserved)

- [ ] **NOTIF-01**: Native OS notifications fire at task due time on macOS, Windows, Linux (existing) — unchanged
- [ ] **NOTIF-02**: Launch-time catch-up fires for reminders that went overdue while Obsidian was closed (existing) — extended with OWE-05 aggregation
- [ ] **NOTIF-03**: Plugin checks `Notification.permission` before firing and falls back to an in-app `Notice` when denied

### Quality

- [ ] **QUAL-01**: Unit tests cover the parser, store migration, ICS parsing (including Windows TZ mapping), scanner regex, and scheduler timer math
- [ ] **QUAL-02**: Integration test covers `data.json` v0-to-v1 migration against a captured legacy fixture
- [ ] **QUAL-03**: Performance test verifies scanner <2s on a 5000-file monorepo fixture
- [ ] **QUAL-04**: Hot-reload smoke test: reload the plugin 10 times during dev; listener counts and in-flight timers remain bounded

## v1.x (deferred)

These are proven-valuable features the research surfaced; shipped if a specific pain point emerges post-v1.

- Per-repo context on code TODO tasks (repo name, file, branch) — D5
- Commit-time standup summary view ("what did I close since last standup") — D7
- Standup-mode markdown export for Slack paste — D8
- Per-project markdown mirror (`Projects/<name>.md`) — D11
- `` ```qr-tasks `` code-block DSL for in-note task views — D12
- OAuth write-back to calendar — deferred beyond v1.x

## Out of Scope

Explicit boundaries with reasoning (see also `.planning/research/FEATURES.md` anti-features section).

- **AI auto-scheduling** — requires LLM dependency, opaque state transitions; user schedules in their head
- **Gamification, streaks, XP, productivity scores** — dark patterns; senior-engineer user context rejects them
- **Team collaboration, shared visibility, multi-user sync** — personal scope; eliminates auth, conflict resolution, and a backend explicitly unwanted
- **Mobile support** — desktop-only; Electron APIs and Node `fs` unavailable on Obsidian mobile
- **Recurring tasks in v1** — cron-like state management distracts from core inbox value; consider v1.x
- **Bidirectional Jira, Linear, or Asana sync** — couples the tool to employer-specific systems; deferred indefinitely
- **Outlook OAuth app registration** — corporate IT rarely grants it; ICS feed covers the need
- **Cloud backend or sync service** — vault is source of truth by explicit design
- **Email-to-task bridge** — not v1
- **Writable calendar integration** — read-only is the v1 constraint
- **LLM features (auto-categorization, auto-tagging, smart scheduling)** — no LLM dependencies in v1
- **Kanban view** — the inbox IS the view; Kanban is a parallel product
- **Obsidian mobile** — see above

## Requirement Count

- v1 requirements: **60** across 10 categories
- Already-shipped preserved: **6** (CAP-01, CAP-02, TASK-07 partial, DATA-05 partial, NOTIF-01, NOTIF-02)
- New: **54**

## Traceability

(Populated by the roadmapper — each REQ maps to exactly one phase.)

| REQ-ID | Phase |
|--------|-------|
| (pending roadmap) | — |
