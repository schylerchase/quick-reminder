# Roadmap: Quick Reminder — Engineer Task & Project Management

## Overview

A brownfield extension of the existing quick-reminder plugin into a unified personal task/PM layer for a senior engineer. The journey: harden the schema + store foundation (migration must not lose a single existing reminder), surface the unified inbox UI that is the load-bearing v1 feature, then plug in two parallel data sources — code TODO scanner and calendar feeds — and finally deliver the daily-note dashboard where the "one place for actionable items" thesis becomes visible in the user's daily workflow. Five phases, derived from research convergence: Phase 1 is mandatory first (everything depends on the Task shape); Phases 3 and 4 run parallel after Phase 1; Phase 5 requires both.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Schema & Store Foundation** - Atomic `reminders[]` → `tasks[]` migration with backup, discriminated-union Task model, debounced mirror, existing notifications preserved
- [ ] **Phase 2: Inbox UI + Projects** - Unified filterable/sortable inbox view, project CRUD, extended capture modal, first visible user value
- [ ] **Phase 3: Code TODO Scanner** - On-demand + watchinged scan of configured paths under 2s, `.gitignore` respect, dedupe, auto-close on removal
- [ ] **Phase 4: Calendar Feeds (ICS → Google)** - Outlook ICS with Windows-TZ mapping, then Google OAuth PKCE with encrypted refresh token, stale-while-revalidate caches
- [ ] **Phase 5: Daily Dashboard + Stale-Owes Nudges** - markdown code-block dashboard rendering today's meetings + due tasks + stale owes, aggregated catch-up notifications

## Phase Details

### Phase 1: Schema & Store Foundation
**Goal**: Existing user reminder data migrates losfally to the new Task shape and the extended store/scheduler/notification foundation is in place for all subsequent phases
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08, CAP-01, CAP-02, CAP-04, TASK-07, NOTIF-01, NOTIF-02, NOTIF-03, QUAL-01, QUAL-02, QUAL-04
**Success Criteria** (what must be TRUE):
  1. After upgrade, a user's existing reminders appear unchanged in the plugin — same IDs, same text, same due times, same notified states — with zero data lost
  2. If migration fails, the user sees a clear recovery dialog pointing to the `data.json.pre-v1.bak` backup and the plugin refuses to start rather than writing partial data
  3. Existing quick-capture hotkey still opens the capture modal and parses natural-language due times exactly as before
  4. Native OS notifications still fire at due time, launch-time catch-up still runs, and permission-denied falls back to an in-app notice
  5. Reloading the plugin 10 times during development leaves listener counts and in-flight timers stable (no leaks)
**Plans**: TBD
**Research flag**: MEDIUM — capture a frozen v0 `data.json` fixture from the user's current install; verify `crypto.randomUUID()` availability in the Obsidian Electron runtime
**UI hint**: no

### Phase 2: Inbox UI + Projects
**Goal**: user can see, filter, sort, triage, and edit all their tasks from a single sidebar view, and can organize them into projects
**Depends on**: Phase 1
**Requirements**: CAP-03, TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-08, INBOX-01, INBOX-02, INBOX-03, INBOX-04, INBOX-05, INBOX-06, INBOX-07, INBOX-08, PROJ-01, PROJ-02, PROJ-03, PROJ-04
**Success Criteria** (what must be TRUE):
  1. user opens the inbox sidebar and sees every open task from every source in one list, with overdue items visually dislickerct
  2. user can filter by status, due range, project, source, and priority using visible chips, and the last-used filter state persists across sessions
  3. user can navigate the inbox entirely from the keyboard (j/k move, Enter open, d done, s snooze, e edit, Delete delete) without fighting Obsidian's global shortcuts
  4. user can create projects, assign tasks to them, and click a project-linked note to open it in the editor
  5. Clicking any task reveals its origin — code TODO opens the file at the right line, meeting follow-up shows the calendar event context, manual task opens the originating note
  6. user can multi-select tasks and run bulk done / delete / reschedule, and undo the last destructive action within the session
**Plans**: TBD
**Research flag**: LOW — standard DOM + Obsidian `ItemView` patterns already established in the existing `ReminderView`
**UI hint**: yes

### Phase 3: Code TODO Scanner
**Goal**: TODO comments across the user's configured code repositories surface as tasks in the inbox without blocking the Obsidian UI
**Depends on**: Phase 1 (can run parallel to Phase 4 after Phase 1 lands)
**Requirements**: SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05, SCAN-06, SCAN-07, SCAN-08, SCAN-09, SCAN-10, SCAN-11, QUAL-03
**Success Criteria** (what must be TRUE):
  1. user adds an absolute path in settings, runs a scan, and sees all `// TODO:` / `# TODO:` / `<!-- TODO: -->` comments appear as tasks within 2 seconds on a 5000-file monorepo
  2. Scanner never enters `node_modules`, `.git`, `dist`, `build`, `.next`, or `.obsidian`, and respects the repo's `.gitignore` rules
  3. Obsidian's UI stays responsive during a scan — no frame drops, no "plugin froze" perception
  4. When the user removes a TODO comment from source, the corresponding task is auto-marked done on the next scan; re-adding the comment creates a new task without duplicating
  5. `TODO(@runtime)` where the name matches the user's configured handle appears as a `source: "owe"` task ready for the dashboard
**Plans**: TBD
**Research flag**: MEDIUM — `globby@14` ESM/esbuild interop spike; `fs.watch` `recursive: true` behavior on the user's OS; calibrate 2s budget against the user's actual monorepo
**UI hint**: no

### Phase 4: Calendar Feeds (ICS → Google)
**Goal**: user's corporate Outlook calendar (via ICS) and personal Google Calendar are pulled in read-only and materialize as meeting tasks in the store
**Depends on**: Phase 1 (can run parallel to Phase 3 after Phase 1 lands)
**Requirements**: CAL-01, CAL-02, CAL-03, CAL-04, CAL-05, CAL-06, CAL-07, CAL-08, CAL-09, CAL-10
**Success Criteria** (what must be TRUE):
  1. user pasgates an Outlook ICS URL into settings and today's meetings appear at the correct local time, even when the feed uses Windows timezone names like "Eastern Standard Time"
  2. user configures their own Google Cloud OAuth client ID, completes the PKCE + loopback flow once, and the plugin silently refreshes tokens thereafter
  3. Google refresh token is encrypted at rest via `safeStorage` when available; when not available, the user sees an explicit in-app disclosure about storage risk before auth completes
  4. When Google auth expires (invalid_grant), user sees a visible reauthenticate banner rather than a silently empty calendar
  5. Feeds refresh lazily on view open (15-min default TTL) and via a manual "refresh feeds" command; no background interval polling
  6. During a refresh, cached events stay visible (stale-while-revalidate) rather than flashing empty
**Plans**: TBD
**Research flag**: HIGH — densest pitfall surface. Phase-0 spikes required: `safeStorage` accessibility from plugin renderer; current Google OAuth accepted flows; `requestUrl` signature; `ical.js` CJS/ESM bundling; 2-3 real Outlook corporate ICS samples from user's employer
**UI hint**: no

### Phase 5: Daily Dashboard + Stale-Owes Nudges
**Goal**: user opens their daily note and sees today's meetings, tasks due today, and stale owes in one rendered block, with aggregated nudges that don't spam
**Depends on**: Phase 3 AND Phase 4 (needs both scanner and calendar data to be meaningful)
**Requirements**: CAP-05, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, OWE-01, OWE-02, OWE-03, OWE-04, OWE-05
**Success Criteria** (what must be TRUE):
  1. user places ` ```qr-dashboard ` in their daily note template and sees a live dashboard with three sections: today's meetings, tasks due today (sorted by priority), stale owes past threshold
  2. Dashboard never writes into note files and never auto-creates daily notes — the user owns their vault content; removing the code block makes the dashboard vanish cleanly
  3. user clicks "Capture follow-up" on any meeting row and the quick-capture modal opens pre-populated with that event's calendar ID
  4. A stale owe past the user-configured threshold fires exactly one native OS notification per day per owe — never a flood
  5. When 5+ reminders/owes are due simultaneously (e.g., launch-time catch-up after a vacation), user sees one aggregated "N items overdue" notification instead of a notification storm
  6. Opening and closing the daily-note pane 10 times leaves dashboard listener counts stable (no lifecycle leaks)
**Plans**: TBD
**Research flag**: MEDIUM — verify `markdownRenderChild` lifecycle behavior with an empty smoke test at phase start; confirm `obsidian-daily-notes-interface` API for user's configured daily-note format
**UI hint**: yes

## Progress

**Execution Order:**
Phases 1 → 2 → (3 ‖ 4) → 5

Phase 1 must complete before any other phase can start. Phases 3 and 4 are independent after Phase 1 and may be executed in parallel or in either order; the roadmap sequences 3 before 4 only by numeric convention. Phase 5 requires both 3 and 4 to be meaningful, though it can begin against partial data.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema & Store Foundation | 0/TBD | Not started | - |
| 2. Inbox UI + Projects | 0/TBD | Not started | - |
| 3. Code TODO Scanner | 0/TBD | Not started | - |
| 4. Calendar Feeds (ICS → Google) | 0/TBD | Not started | - |
| 5. Daily Dashboard + Stale-Owes Nudges | 0/TBD | Not started | - |
