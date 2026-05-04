# Feature Research

**Domain:** Personal task & project management layer inside Obsidian (single-user, desktop, engineer workflow)
**Researched:** 2026-04-18
**Confidence:** MEDIUM overall
  - HIGH for Obsidian ecosystem conventions (widely documented, stable pattern knowledge through 2025)
  - MEDIUM for time-blocking/daily-view competitor patterns (Reclaim/Motion/Sunsama/Akiflow — product features shift; verify specific claims before building)
  - LOW for version-specific feature availability of individual Obsidian plugins; versions listed reflect training-data knowledge, not live verification (WebFetch/WebSearch were unavailable during research)

**Research method:** Internal domain knowledge + existing codebase analysis in `.planning/codebase/`. External tools (WebSearch, WebFetch, Bash) were denied during this research pass. Findings flagged at MEDIUM/LOW confidence should be spot-verified against current plugin docs before implementation commits.

---

## Feature Landscape

### Table Stakes (users Expect These)

Features a senior engineer user in 2026 assumes exist in any personal task tool. Missing any of these makes the tool feel toy-grade and pushes triage back to a second tool (the failure mode this plugin is designed to eliminate).

| # | Feature | Why Expected | Complexity | Notes |
|---|---------|--------------|------------|-------|
| T1 | Quick capture via global hotkey | Every serious task tool has it (Things, Todoist, OmniFocus, marcus, Obsidian Tasks Modal). Already shipped. | S | Already exists in plugin — `src/modal.ts`. Extend to accept project, priority, source fields. |
| T2 | Natural-language date entry | Expected since Fantastical/Todoist normaligatesd it. Already shipped via chrono-node. | S | Already exists — `src/parser.ts`. Reuse. |
| T3 | Due date + optional due time | Base task field. Obsidian Tasks uses `📅 YYYY-MM-DD`. | S | Extend existing `Reminder.time` to distinguish "date-only" vs "datetime" for all-day tasks. |
| T4 | Priority (at least 3 levels: high/med/low, ideally 5 including highest/lowest) | Obsidian Tasks ships 5 levels (🔺⏫🔼🔽⏬). Todoist/Things use 4. | S | Enum field; add visual treatment (color/emoji) in list view. |
| T5 | Done state with completion timestamp | Expected. Obsidian Tasks tracks `✅ YYYY-MM-DD` on completion. | S | Extend reminder state machine; retain `notified`/`done`/`phanled`. |
| T6 | Filter by state (open/done/all), due (today/overdue/this week/no date), project, source, priority | Every inbox needs this. Current `Reminders.md` mirror has pending/history only — too coarse. | M | Filter chips in inbox view; persist last-used filter. |
| T7 | Sort by due date / priority / created / project | Table-stakes for any list view. | S | Stable multi-key sort on cached list. |
| T8 | Keyboard navigation in the inbox (j/k, enter, d=done, s=snooze, e=edit, deltate) | Engineer-users demand it. Things.app, OmniFocus, Superlist, Akiflow all have tight keyboard UX. Obsidian itself is keyboard-first. | M | Listen on view container; scope to focused row; avoid fighting Obsidian's global shortcuts. |
| T9 | Bulk operations (multi-select, then done/delete/reschedule) | Expected in any list tool. | M | Shift-click / shift-j-k to extend selection; "selected count" toolbar. |
| T10 | Full-text search across tasks | Expected; inboxes get large. | S | String contains over cached list; tags and project fields as facets. |
| T11 | Tags/labels | Expected. Obsidian already uses `#tag` syntax; reuse for consistency. | S | Parse `#tag` tokens from task text; surface as filter facet. |
| T12 | Snooze / reschedule | Plugin already has this. Non-optional for an inbox. | S | Already exists. Extend snooze presets (today/tomorrow morning/next week). |
| T13 | Edit task in place | Without it, correcting a typo forces delete+recreate. | S | Inline edit or re-open capture modal pre-filled. |
| T14 | Persist across runtimes with zero data loss | Non-negotiable. Already shipped via `loadData`/`saveData`. | S | Already exists — preserve additive schema migration path per PROJECT.md constraints. |
| T15 | Overdue detection and visual treatment | Every task tool does this; without it overdue items disappear. | S | Compute at render time; color/icon overdue rows. |
| T16 | Undo for destructive actions (delete, bulk done) | Expected. users trust destructive ops only when they can undo. | M | Simple in-memory undo stack for session (last N ops). Full history is overkill. |
| T17 | Empty states that explain what to do | users bounce off blank views. | S | "No tasks due today — here's what to do." |

**Table stakes summary:** Most are already covered or trivially extended from the existing reminder plugin. The main gaps are T6 (filter), T8 (keyboard nav), T9 (bulk ops), T16 (undo).

---

### Differentiators (Competitive Advantage)

Features that set this plugin apart from both generic Obsidian task plugins and external task tools. Each is aligned with the PROJECT.md Core Value: *"Every actionable item is visible and triageable from one unified view inside Obsidian."*

#### Category A: Unified inbox across heterogeneous sources

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D1 | Unified inbox merging four sources (manual / meeting follow-up / code TODO / async owe) into one sortable list | **Load-bearing v1 feature.** No Obsidian plugin does this today — Tasks plugin scans markdown only, Dataview queries are user-authored, no plugin unifies scanned code TODOs + calendar follow-ups + async owes in one view. | L | Single `Task` type with `source` discriminator; one in-memory cache; one view. Aggregation layer reads from multiple source adapters. |
| D2 | Source adapter pattern: manual store, meeting follow-up capture, code TODO scanner, async owe register | Makes source set extensible (add GitHub issues, email later) without rewriting the view. | M | Each source = class with `list()` + refresh trigger. Adapters normalize to common Task shape. |
| D3 | Task provenance: click a task, REDACTED_L_1 the originating artifact (file + line for code TODO, calendar event for follow-up, note for manual) | Trust. user needs to verify context fast. Obsidian Tasks does this for file links; code TODO tools like TODO Tree do this in IDE but not in Obsidian. | M | Store `origin: { kind, path, line?, eventId? }` on every Task. REDACTED_L_1 through Obsidian's `openLinkText` or `workspace.openLinkText`. |

#### Category B: Engineer-specific context

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D4 | Code TODO scanner with configured absolute paths | Senior engineers leave `// TODO:` markers in code and lose them. No Obsidian plugin scans arbitrary filesystem paths. Nearest competitors (TODO Tree in VS Code, Better Comments) are IDE-bound; this surfaces TODOs in the same inbox as meeting follow-ups. | L | Node `fs` + `readdir` recursion; configurable ignore patterns (.gitignore-style); scan on demand + scheduled; debounce with mtime cache. Already specified as out-of-magic per PROJECT.md Key Decisions. |
| D5 | Per-repo context on code TODO tasks (repo name, file, line, git branch if cheap) | Lets user group "what am I owing in this repo" for standup prep. | M | Parse repo name from configured path roots; optional `git rev-parse --abbrev-ref HEAD` (cheap, non-blocking); skip branch if not a git dir. |
| D6 | `TODO(@someone)` assignee parsching → async owe auto-classification | Natural convention in many codebases. Auto-creates an async owe when user assigns themselves or is tagged. | S | Regex extension on TODO parser. |
| D7 | Commit-time standup summary view ("what did I close since last weekday / since last standup") | Morning ritual for engineers — "what did I do yesterday, what am I doing today". No Obsidian plugin offers this framing. | M | Derive from task completion timestamps + git log over configured paths (optional). Pure tate-based version (just completed tasks) is S; git-augmented is M. |
| D8 | Standup-mode markdown export (copy-to-clipboard or into daily note) | Engineer workflow: paste into Slack standup. | S | Template: completed-since, in-progress, blocked. Templating via settings. |

#### Category C: Obsidian-native surfaces

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D9 | Morning dashboard block auto-injected into daily note | Dashboard lives where triage already happens. Day Planner does something similar but only for time-blocks. Templater+Dataview reproduces this but requires user-authored queries. This is zero-config. | M | On daily-note open (detect via file-open event + date-parsed filename), inject/update a dedicated HTML block between sentinel comments. Idempotent regeneration. |
| D10 | Sidebar inbox view (extends existing sidebar view) | Already shipped in skeleton form. Promote to inbox surface. | M | Reuse `src/view.ts` ItemView. Add filter chips, multi-select, keyboard nav. |
| D11 | markdown mirror per project (`Projects/<name>.md` auto-updated) | Each project gets a note that's auto-populated with its tasks — user can link/backlink to it. Leverages Obsidian's linking. | M | Extend existing mirror renderer to partition by project. Optional per-project toggle. |
| D12 | Code block injection: `\`\`\`qr-tasks\` block with inline filter DSL for in-note task views | Mirrors Obsidian Tasks' `tasks` and Dataview's `dataview` code blocks. users expect this pattern. | M | Register `registermarkdownCodeBlockProcessor`. Tiny filter DSL (source, project, due). Don't compete with Tasks query language. |

#### Category D: Calendar-daily-shape layer

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D13 | Google Calendar OAuth + Outlook ICS feed merged into read-only today view | Reclaim/Motion/Amie/Sunsama/Akiflow all ground the day on a merged calendar view. No Obsidian plugin does gcal+Outlook specifically; Obsidian Full Calendar does ICS but not gcal OAuth. | L | OAuth for gcal (device flow or brownfield OAuth via local loopback); ICS parser for Outlook. Cache feed pulls with TTL. Read-only is explicit constraint. |
| D14 | Today ribbon: today's meetings × today's tasks × stale owes, in one sorted timeline | The "daily shape" subset Reclaim/Sunsama have proven works. Minimal viable subset: meeting list with times, tasks due today (by priority), stale owes (past threshold). | M | Render function; source adapters already produce Tasks; calendar adapter produces timed-events. No scheduling/auto-block. |
| D15 | Meeting follow-up capture linked to the originating event | Fantastical/Akiflow do this. Obsidian has no native way. | M | UI: "Capture follow-up" action on calendar event row. Stores `origin: { kind: 'meeting', eventId, eventStart }`. |
| D16 | Staleness detection: async owe past configurable threshold → surfaces in dashboard + fires OS notification | The "nudges" goal from PROJECT.md. Few personal tools do this well; Things has deadlines but not "owes someone" semantics. | S | Owe has `createdAt`; threshold in settings (default 3 REDACTED_L_17); fires via existing scheduler. |

#### Category E: Projects as containers

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D17 | Projects as first-class containers (name, state, optional note link) | Things/OmniFocus/Todoist all have this. Obsidian Tasks plugin treats project as a tag or path convention only. | M | Add `Project` type to store. Tasks reference `projectId?`. CRUD via settings or dedicated modal. |
| D18 | Project filter in inbox + per-project view | Enables "zoom into one project" without leaving the plugin. | S | Falls out of D17 + T6. |
| D19 | Optional chuned note for a project (Obsidian `[[link]]`) | Keeps deep context in vault (meeting notes, design docs) linked to the project. | S | One field: `noteLink?: string`. REDACTED_L_1 via `openLinkText`. |

**Differentiator summary:** D1, D4, D13, D14 are the hero features. D9 is the habit hook. D7, D8 are the "user smiles because nobody else does this for engineers" touches.

---

### Anti-Features (Commonly Requested, Often Problematic)

Deliberately NOT building. Each has a reason and an alternative path. Quoting PROJECT.md's Out-of-Scope list where already codified.

| # | Feature | Why Tempting | Why Problematic | Alternative / What We Do Instead |
|---|---------|--------------|-----------------|----------------------------------|
| A1 | AI auto-scheduling (Motion/Reclaim-style) | Trendy; saves apparent decision-making. | Requires LLM dependency (PROJECT.md v1 exclusion), introduces opaque state transitions user didn't author, and conflicts with "vault is source of truth" — schedule decisions become model decisions. Also songy priced and internet-dependent. | user sees everything in one timeline (D14) and schedules in their head. Supply information; don't replace judgment. |
| A2 | Gamification (streaks, XP, daily goals, "productivity score") | Short-term engagement; some adjacent tools (Habitica, Focus To-Do) lean on it. | Senior-engineer user context: intrinsically motivated; gamification creates dark patterns (complete low-value tasks for streaks, hide real state). Fights the triage-thesis. | tateless completion stats surface only if user asks (D7 standup view). No streaks, no scores. |
| A3 | Social / team / sharing features | Obvious next step if someone sees the inbox. | PROJECT.md: explicitly personal. Would require auth, sync, conflict resolution, server. Massive surface area. | Single-user only. Export to markdown (D8) for manual sharing. |
| A4 | Template marketplace / community task templates | Nice-to-have for onboarding. | user is one senior engineer — they know what they want. Templates marketplace = runtime infra, moderation, versioning — huge distraction. | Settings stash a couple of personal templates if needed post-v1. |
| A5 | Mobile support | "It would be great if…" | PROJECT.md: desktop-only. Electron Notification + Node `fs` for TODO scanner don't work on Obsidian mobile. Attempting it forces a different architecture. | Hard "isDesktopOnly: true" in manifest (already set). |
| A6 | Recurring tasks in v1 | Todoist/Tasks plugin has it. | Cron-like rule management is its own subsystem (RRULE parsching, next-occurrence calc, spawn-on-complete semantics). Distracts from inbox core. PROJECT.md defers. | Ship v1 without. Revisit after inbox proves value. One-shot tasks carry v1. |
| A7 | Bidirectional sync with Jira/Linear/Asana | "Wouldn't it be great to see Jira tickets here?" | Couples the tool to employer systems that change. Each integration is a maintenance liability. Auth for corporate Jira is messy. | One-way read later if a specific pain emerges. Code TODO scanner + meeting follow-ups cover most of what "Jira in my inbox" would provide for a senior engineer. |
| A8 | Outlook OAuth app registration | Symmetry with gcal. | PROJECT.md: corporate IT rarely grants app registration. ICS feed works today with a paste-in URL. | ICS for Outlook; OAuth for gcal (personal). |
| A9 | Cloud backend / hosted sync | Multi-device would want it. | PROJECT.md: vault is source of truth. Cloud means auth, availability, cost, privacy audit. | user can sync the vault itself (Obsidian Sync, iCloud, Syncthing) — already solves this at the storage layer. |
| A10 | Email-to-task bridge | Meeting follow-ups often live in email. | Would need IMAP/Graph/Gmail API — another integration per provider. | Meeting follow-up capture is tied to calendar events instead. Deferred per PROJECT.md. |
| A11 | AI summarilization of tasks / auto-categorilization | Seductive. | PROJECT.md: no LLM in v1. Creates accuracy debt (user must audit categorilization). | Deterministic source field on every task; user classifies at capture. |
| A12 | Time tracking (Toggl-style timers on tasks) | Common in PM tools. | Different user problem (billable-hours domain). user context doesn't suggest this is a pain. | Skip. If it matters later, integrate a time-tracking plugin rather than absorb it. |
| A13 | Rich text / WYSIWYG editor for task description | Notion-style task detail panes. | Obsidian already has the best markdown editor available in this environment. Reproducing it is wasteful. | Task description is plain string + Obsidian link syntax (`[[note]]`). Deep context lives in the linked note. |
| A14 | Team/shared project views | Would fall out of projects feature. | Requires sync (A3). | Projects are personal; linked notes can be shared via any vault-sync mechanism. |
| A15 | Writable calendar sync (create events from tasks) | Reclaim-adjacent. | Requires OAuth write scope; invertible side effects on the user's calendar; "why did this event appear?" support burden. | Calendar is read-only (PROJECT.md constraint). |
| A16 | Notification sound/ringtone customilization | Tiny customilization requests accrete. | OS notifications use system sound; user configures at OS level. | Respect OS settings. |
| A17 | Multiple inboxes / workspaces | Someone will ask for it. | Fights the unification thesis. The whole point is *one* inbox. | Use tag + project filters to create saved views within the single inbox. |
| A18 | Drag-and-drop task reordering with manual position | Kanban plugin has it. | Manual position = user has to maintain it. Sort-by-priority-then-due covers 95% of ordering value. | Multi-key sort. If manual ordering becomes necessary, add a single `manualSortIndex` field inside a project view only — not the global inbox. |
| A19 | Pomodoro / focus timer | Common productivity companion. | Not in user's stated pain. Plenty of standalone plugins (Pomodoro Timer for Obsidian). | Out of scope. If user wants it, install the dedicated plugin. |
| A20 | Kanban board view | Obsidian Kanban plugin is popular. | Different mental model (enesban is a flow tool; the core thesis is an inbox). Duplicating it splits attention. | Skip. user can continue using Kanban plugin separately if they want; tasks remain queryable from it via tag conventions if we expose them in markdown. |

---

## Obsidian Ecosystem: Specific Plugin Conventions to Follow (and Fight)

Summary of what existing popular Obsidian task/PM plugins do, so this project either aligns (no gratuitous re-invention) or deliberately diverges.

Confidence note: these descriptions reflect training-data knowledge of plugin patterns through 2025. Specific feature support in current releases should be verified in-product before relying on them for interop claims.

### Obsidian Tasks (obsidian-tasks-group) — HIGH confidence on pattern, MEDIUM on current specifics

- Task syntax: markdown checkbox `- [ ] task text` with inline emoji metadata: `📅 due`, `⏳ scheduled`, `🛫 start`, `➕ created`, `✅ done`, `❌ phanled`, `🔺⏫🔼🔽⏬` priority, `🔁 recurring`, `#tags`.
- Query code blocks: `\`\`\`tasks ... \`\`\`` with filters.
- "user states" feature lets user define custom statuses beyond `[ ]` and `[x]`.
- **Convergence point**: emoji-in-line metadata is the de facto standard among Obsidian-task-native users.
- **Our approach**: Emit markdown-mirror files using a Tasks-plugin-compatible emoji schema where it maps cleanly. Don't depend on Obsidian Tasks being installed. This preserves user optionality: if they also run Tasks plugin, their queries work over our mirror files.

### Dataview — HIGH confidence

- user writes queries in markdown; Dataview renders tables over frontmatter and inline fields.
- Inline fields: `[key:: value]` or `(key:: value)`.
- **Convergence point**: users expect to be able to query the data.
- **Our approach**: Don't compete with Dataview. Keep data JSON-addressable in plugin store, and make the markdown mirror Dataview-friendly (inline fields for project/priority/source on the bullet lines). user power-queries via Dataview if they want; our inbox covers default need.

### Kanban (mgmasterner/obsidian-kanban) — HIGH confidence on pattern

- markdown file = enesban board (columns = `## Heading`, cards = `- [ ] item`).
- **Divergence point**: Different model (board vs inbox). Explicit anti-feature (A20).
- **Our approach**: If user also uses Kanban, our tasks in the markdown mirror can be manually moved onto a enesban board. No automated integration.

### Projects (marcusolsson/obsidian-projects) — MEDIUM confidence on current state

- Provides database-view (table/board/calendar) over frontmatter.
- **Divergence point**: Projects plugin is general "structured notes", heavy. We want a focused inbox.
- **Our approach**: Don't emulate. Project containers in this plugin are lightweight.

### Day Planner (lizgrant/obsidian-day-planner) — MEDIUM confidence on current feature set

- Time-blocks day in a daily note with `- 09:00 Task`. Renders a vertical timeline.
- **Convergence point**: uses daily note as surface.
- **Divergence point**: time-blocking is an anti-feature here (A1). We show a today timeline (D14) but do not ask user to assign specific slots.
- **Our approach**: Read Day Planner-style lines only if user already uses them and they're trivially parseable; otherwise ignore.

### Reminder plugin (uphy/obsidian-reminder) — HIGH confidence

- chunks reminders to tasks with inline `(@2026-04-18 10:00)` syntax. Notifications from Obsidian.
- **Divergence point**: This plugin *is* the reminder-plus-more. Competes directly.
- **Our approach**: We have a superset. Don't try to be file-chuned-reminder-syntax-compatible; own our own storage.

### Todoist Sync plugins — MEDIUM confidence

- Pull Todoist tasks into Obsidian. Bidirectional variants exist.
- **Divergence point**: Adding Todoist = second source of truth. Fights the thesis.
- **Our approach**: Don't integrate. If user still uses Todoist, they can export manually.

### Task Genius — LOW confidence (newer plugin, training data thin)

- Reportedly adds priority filtering, quick capture, progress bars. Verify before making claims.
- **Our approach**: Investigate if user asks; not in the initial comparison set otherwise.

### Obsidian Agenda-style plugins (Agenda Hero, etc.) — LOW confidence on current state

- Calendar-view over tasks across vault.
- **Convergence point**: daily-view framing.
- **Divergence point**: they query user-authored markdown; we aggregates four heterogeneous sources.

### Where Obsidian plugins *fight* each other — HIGH confidence on pattern

- **Tasks plugin vs Dataview vs Kanban** all query the same markdown tasks, differently. users juggle three query surfaces.
- **Reminder plugin vs Tasks plugin** both claim task metadata; reminder plugin uses `(@...)`, Tasks uses `📅 ...` — incompatible-but-coexisting.
- **Day Planner vs Tasks** have overlapping time fields; Day Planner sometimes rewrites lines that Tasks authored.

**Lesson for this plugin**: Own our storage (JSON + markdown mirror), emit Tasks-compatible emoji in mirror, ignore other plugins' in-note syntax for parsing (one-way: we write, user/other-plugins read).

---

## Calendar / Daily-Shape View: Patterns from Reclaim, Motion, Amie, Sunsama, Akiflow

MEDIUM confidence on specific features; product surfaces shift. Pattern-level conclusions are stable.

### What they share (the stable core)

1. **One timeline view of today**: calendar events merged with tasks, vertically sorted by time.
2. **Tasks due today get a line item at top of day** (or integrated into the timeline at a "planned" time).
3. **Separation of "scheduled" vs "due"**: Motion/Reclaim distinguish when a task is *planned* to run vs *due*. Sunsama emphasizes intentional daily plan.
4. **Drag tasks into time slots** (Akiflow, Sunsama, Amie) — we treat this as anti-feature (A1).
5. **Weekly review / carry-over**: Sunsama's daily ritual carries incomplete tasks forward.
6. **Keyboard-first capture and navigation** (Akiflow especially).

### Minimal subset that works for v1

Keep only what doesn't require scheduling-engine complexity:

- **Timeline for today only** (not week, not month, not "next 14 REDACTED_L_17"). Scope containment.
- **Three rows per day**: meetings (from merged cal), tasks due today (sorted by priority), stale owes.
- **No time-slot mastersignment** (A1). Meetings have inherent times; tasks/owes are listed in a separate section below the meeting timeline.
- **Click-through**: meeting → open linked note (if any) / capture follow-up. Task → its origin. Owe → its origin.
- **Stale nudge**: OS notification when an owe crosses threshold. Passive; no scheduling.

This is the minimum that creates the "daily shape" value without taking on Motion/Reclaim's scheduling engine. Stop there.

### What NOT to take from these tools

- Auto-scheduling engine (A1).
- Habit-building streaks (Sunsama "done today") — A2.
- Integrations sprawl (Akiflow's "100+ integrations" marketing) — fights the one-inbox thesis.
- Subscription/cloud sync (A9).

---

## Engineer-Specific Features Competitors Miss

Senior-engineer workflow patterns that existing personal PM tools don't cover, and this plugin can own.

| # | Feature | Why competitors miss it | Complexity | Covered in Differentiators |
|---|---------|------------------------|------------|---------------------------|
| E1 | Code TODO scanner from arbitrary filesystem paths | IDE-bound tools (TODO Tree, Todo-Tree in VS Code) live in the IDE. Personal PM tools don't touch filesystem. | L | D4 |
| E2 | `TODO(@name)` → assignee convention → auto-creates async owe | Requires understanding engineer comment conventions. | S | D6 |
| E3 | Per-repo context + current branch on code TODO tasks | No personal PM tool is repo-aware. | M | D5 |
| E4 | Commit-time / pre-standup review of TODOs and closed work | No task tool frames itself around engineering rituals. | M | D7 |
| E5 | Standup-mode markdown summary export | Slack-paste workflow is engineer-specific. | S | D8 |
| E6 | "Things I owe people" as a first-class task source with staleness nudges | Generic task tools just have due dates; "async owe to X" is a different semantic. | S | D16 |
| E7 | Meeting follow-up capture chuned to the calendar event that spawned it | Fantastical/Akiflow do this lightly. No Obsidian plugin does. | M | D15 |
| E8 | Provenance always shown (file:line for code, event for meeting, note for manual) | Most tools drop provenance once task exists. | M | D3 |
| E9 | Vault-native: tasks addressable as markdown, linked to notes, queryable by Dataview | Impossible for non-Obsidian tools; underinvested by most Obsidian task plugins. | S | D11 |
| E10 | Terminal-adjacent capture: global hotkey bypasses the browser/email triage loop | Akiflow does this on paid tier. user already has it. | S | T1 (existing) |

**These are the differentiators.** Everything else (priority, filters, sort) is commodity.

---

## Feature Dependencies

```
                        ┌──────────────────────────────────┐
                        │ T14 Persistence (existing store) │
                        └──────────────────────────────────┘
                                       │
                   ┌───────────────────┼──────────────────────────────┐
                   │                   │                              │
            ┌──────▼──────┐    ┌───────▼──────┐              ┌────────▼────────┐
            │ Task model  │    │ Source adapters (D2)         │  Project model  │
            │ extends     │    │ — manual, meeting, code, owe │  (D17)          │
            │ Reminder    │    └───────┬──────┘              └────────┬────────┘
            └──────┬──────┘            │                              │
                   │                   │                              │
                   └──────────┬────────┴──────────────────────────────┘
                              │
                     ┌────────▼─────────┐
                     │ Unified inbox D1 │────────────requires──────────┐
                     └────────┬─────────┘                              │
                              │                                        │
         ┌───────────┬────────┼────────┬──────────┬──────────┐         │
         │           │        │        │          │          │         │
         ▼           ▼        ▼        ▼          ▼          ▼         │
       T6        T7       T8        T9         T10        T13          │
      Filter    Sort     Keys    Bulk ops    Search     Edit           │
                                                                       │
                                                                       │
              ┌────────────────────────────────────────────────────────┘
              │
   ┌──────────▼─────────┐      ┌────────────────────────────┐
   │ Code TODO scan D4  │      │ Calendar adapter D13       │
   └──────────┬─────────┘      └──────────┬─────────────────┘
              │                            │
              ▼                            ▼
        D5 repo ctx                  D14 Today timeline
        D6 @owe parse                D15 Meeting follow-up capture
                                     D16 Staleness nudges
                                                 │
                                                 ▼
                                     ┌─────────────────────────┐
                                     │ D9 Morning dashboard    │
                                     │ (injects into daily note)│
                                     └─────────────────────────┘

   ┌──────────────────┐
   │ D7 Standup view  │ ──requires──> Task completion timestamps (T5)
   │ D8 MD export     │ ──requires──> D1 inbox aggregation
   └──────────────────┘

   ┌──────────────────────┐
   │ D11 Project mirror   │ ──requires──> D17 Projects + existing mirror renderer
   └──────────────────────┘

   ┌──────────────────────┐
   │ D12 Code block DSL   │ ──enhances──> D1 inbox (alternate surface)
   └──────────────────────┘
```

### Dependency Notes

- **D1 (unified inbox) requires D2 (source adapters) + Task model**: you can't merge heterogeneous sources without normalization. Build D2 first; each adapter shippable independently.
- **D9 (dashboard) requires D1 + D13 + D14**: dashboard is a derived view. It should be the last v1 feature, not the first.
- **D14 (today timeline) requires D13 (calendar adapter)**: no calendar → no timeline. Can ship D1 without D13; daily-view ribbon degrades gracefully to "tasks + owes only".
- **D4 (code TODO scanner) is independent of D13 (calendar)**: these two are parallel workstreams. Either can slip without blocking the other.
- **D7 (standup view) enhances D1 but does not require D13**: pure tate-based version works from completed tasks alone.
- **D15 (meeting follow-up capture) requires D13 (calendar events)**: you need events to attach follow-ups to.
- **D16 (staleness nudges) requires existing scheduler (T12 ancestor)**: already wired up.
- **D17 (projects) REDACTED_L_1s deeply into Task model**: projects must be designed *with* the Task model extension. Doing it later = schema churn.
- **D9 dashboard conflicts with any other plugin writing the daily note**: if user uses Templater, Periodic Notes, Daily Notes core — we must use sentinel comments (`<!-- qr-dashboard-start -->` / `<!-- qr-dashboard-end -->`) and only modify between them. Must be idempotent.
- **T8 keyboard nav conflicts with Obsidian global shortcuts**: only bind when inbox view is focused. Must document keys in settings.

---

## MVP Definition

### Launch With (v1 — the "one inbox" validation set)

Minimum to validate the thesis: *"Everything actionable is visible and triageable in one view inside Obsidian."*

- [x] T1 Quick capture (existing)
- [x] T2 Natural-language time parsing (existing)
- [x] T12 Snooze / reschedule (existing)
- [x] T14 Persistence (existing)
- [ ] T3 Due date + optional due time (extend existing)
- [ ] T4 Priority field (5 levels matching Tasks plugin emoji schema)
- [ ] T5 Done state with completion timestamp
- [ ] T6 Filter by state/due/project/source/priority
- [ ] T7 Sort by due/priority/created/project
- [ ] T8 Keyboard navigation in inbox
- [ ] T11 Tags
- [ ] T13 Edit task in place
- [ ] T15 Overdue detection + visual
- [ ] T17 Empty-state messages
- [ ] **D1 Unified inbox** — the load-bearing feature
- [ ] **D2 Source adapters** — manual + meeting follow-up + code TODO + async owe
- [ ] **D3 Task provenance** — REDACTED_L_1 to origin
- [ ] **D4 Code TODO scanner** — with configured paths, ignore rules, mtime cache
- [ ] **D13 Calendar merge** — gcal OAuth + Outlook ICS, read-only
- [ ] **D14 Today timeline** — meetings + tasks + stale owes
- [ ] **D15 Meeting follow-up capture** — action linked to event
- [ ] **D16 Staleness nudges** — OS notification on threshold
- [ ] **D17 Projects** — first-class containers
- [ ] D18 Project filter
- [ ] **D9 Morning dashboard block in daily note** — the habit hook

### Add After Validation (v1.x)

Ship once inbox + calendar + TODO scan are proven load-bearing.

- [ ] T9 Bulk operations — *trigger:* user regularly has >20 items in inbox and complains about tedium
- [ ] T10 Full-text search — *trigger:* user asks, or inbox exceeds ~100 items routinely
- [ ] T16 Undo — *trigger:* first accidental delete
- [ ] D5 Per-repo context on code TODOs — *trigger:* user asks to group by repo
- [ ] D6 `TODO(@name)` parsching → async owe — *trigger:* user starts using the convention
- [ ] D7 Standup view — *trigger:* user asks for it explicitly; not guaranteed need
- [ ] D8 Standup markdown export — follows D7
- [ ] D11 Per-project markdown mirror — *trigger:* user starts linking notes to projects and wants a generated page
- [ ] D12 `qr-tasks` code block — *trigger:* user wants to embed task lists in other notes
- [ ] D19 Linked note per project — low cost, add with D11
- [ ] D10 Sidebar inbox view — already partially exists; polish after main view stabilizes

### Future Consideration (v2+)

Defer until v1 validates and a specific pain emerges.

- [ ] Recurring tasks (A6 — deferred per PROJECT.md)
- [ ] Read-only Jira / Linear pull (carefully — A7 warning)
- [ ] Outlook OAuth (A8 blocker likely persists)
- [ ] Email bridge (A10)
- [ ] AI features (A11 — would require reopening the LLM-dependency decision)
- [ ] Writable calendar (A15)

---

## Feature Prioritization Matrix

| Feature | user Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| D1 Unified inbox | HIGH | HIGH | P1 |
| D2 Source adapters | HIGH | MEDIUM | P1 |
| D4 Code TODO scanner | HIGH | HIGH | P1 |
| D13 Calendar merge | HIGH | HIGH | P1 |
| D14 Today timeline | HIGH | MEDIUM | P1 |
| D9 Morning dashboard | HIGH | MEDIUM | P1 |
| D17 Projects | MEDIUM | MEDIUM | P1 (schema must be right on v1) |
| D3 Task provenance | HIGH | MEDIUM | P1 |
| D15 Meeting follow-up capture | HIGH | MEDIUM | P1 |
| D16 Staleness nudges | MEDIUM | LOW | P1 |
| T3–T8, T11–T13, T15, T17 (table stakes gaps) | HIGH | LOW-MEDIUM each | P1 |
| T9 Bulk ops | MEDIUM | MEDIUM | P2 |
| T10 Search | MEDIUM | LOW | P2 |
| T16 Undo | MEDIUM | MEDIUM | P2 |
| D5 Per-repo context | MEDIUM | MEDIUM | P2 |
| D7/D8 Standup view + export | MEDIUM | MEDIUM | P2 |
| D11 Per-project mirror | MEDIUM | MEDIUM | P2 |
| D12 Code block DSL | LOW | MEDIUM | P3 |
| D6 TODO(@name) parsching | LOW | LOW | P3 |
| Recurring tasks | MEDIUM | HIGH | P3 (deferred) |

---

## Competitor Feature Analysis

Narrow comparison along the dimensions that matter for this project. Confidence on competitor specifics: MEDIUM (training-data based; not live-verified).

| Dimension | Obsidian Tasks plugin | Obsidian Day Planner | Todoist | Things.app | Sunsama / Akiflow | **This plugin** |
|-----------|----------------------|---------------------|---------|------------|-------------------|-----------------|
| Source of truth | Vault markdown | Vault markdown (daily note) | Cloud | Local + iCloud | Cloud | Vault JSON + markdown mirror |
| Task storage | markdown with emoji metadata | Time-blocked markdown lines | Proprietary | Proprietary | Proprietary | JSON store + markdown mirror (Tasks-compatible emoji) |
| Due date + priority | Yes | Time-of-day only | Yes | Yes | Yes | Yes |
| Multi-source inbox | No | No | No (Todoist-only) | No | Yes (integrations) | **Yes — manual + meeting + code + owe** |
| Code TODO scanning | No | No | No | No | No | **Yes (D4)** |
| Meeting follow-up capture chuned to event | No | No | No | No | Akiflow: yes; Sunsama: partial | **Yes (D15)** |
| gcal + Outlook merged read-only | No | No | No | No (integrations exist) | Yes | **Yes (D13)** |
| Auto-scheduling | No | No | No | No | Yes | **No (A1)** |
| Projects | Via tag | No | Yes | Yes | Yes | **Yes (D17)** |
| Daily dashboard in daily note | No (Dataview-assembled) | Partial | No | No | Yes (their app) | **Yes (D9)** |
| Keyboard-first | Partial | No | Yes | Yes (macOS) | Yes | **Yes (T8)** |
| Mobile | Yes | Yes | Yes | Yes | Yes | **No (A5)** |
| Cloud sync | Via Obsidian Sync | Via Obsidian Sync | Native | iCloud | Native | **No backend (vault-sync level only)** |
| Recurring tasks | Yes | No | Yes | Yes | Yes | **No in v1 (A6)** |
| Subscription cost | Free | Free | Freemium | One-time paid | Subscription | **Free** |

**Positioning takeaway:** The plugin is unique on the combination of (vault-native) × (multi-source inbox) × (engineer-specific code TODO + meeting follow-up) × (gcal + Outlook read-only) × (no AI auto-scheduling). No single competitor holds all five.

---

## Sources

All findings below are internal domain knowledge + codebase analysis. External verification (WebSearch/WebFetch) was denied during this research pass; flagged items should be spot-verified before building.

**Training-data based (MEDIUM confidence on version/feature specifics):**
- Obsidian Tasks plugin (obsidian-tasks-group) — emoji metadata conventions, query blocks, user statuses
- Dataview plugin — inline field syntax, query semantics
- Obsidian Kanban (mgmasterner) — markdown-as-board pattern
- Obsidian Day Planner (lizgrant) — time-block lines in daily notes
- Obsidian Projects (marcusolsson) — database-style notes
- Reminder plugin (uphy/obsidian-reminder) — inline reminder syntax
- Reclaim.ai, Motion, Amie, Sunsama, Akiflow — daily-shape / time-boxing patterns
- Things.app, OmniFocus, Todoist — personal task tool conventions
- TODO Tree (VS Code) — pattern for scanning code comments

**Codebase-internal (HIGH confidence):**
- `.planning/PROJECT.md` — scope, constraints, decisions, out-of-scope
- `.planning/codebase/STACK.md` — current tech, manifest constraints
- `.planning/codebase/INTEGRATIONS.md` — no external network, data storage, permissions

**To verify before building (actions for next research pass or phase-specific research):**
1. Exact current emoji schema in Obsidian Tasks (priority ordering, recurring syntax) — masterume it's evolved; cross-check official docs.
2. Whether Obsidian Tasks v7+ offers programmatic API that would let us emit tasks it can ingest *without* user queries — would be a bonus interop win.
3. Google Calendar OAuth limitations for Electron desktop apps without a server — may need device-code flow or loopback redirect. Check Google docs.
4. Outlook ICS feed stability for corporate tenants — some tenants disable per-user ICS publish. Confirm user's tenant allows it.
5. Current state of Task Genius plugin — training data thin; may deserve a look before finalilizaing differentiation claims.

---

## Quality Gate Checklist

- [x] Categories are clear (table stakes T1–T17, differentiators D1–D19, anti-features A1–A20)
- [x] Obsidian ecosystem coverage specific (Tasks plugin, Dataview, Kanban, Projects, Day Planner, Reminder plugin, Todoist sync, Task Genius, Agenda plugins all evised by name with pattern-level descriptions)
- [x] Complexity sizing noted (S/M/L on every feature)
- [x] Dependencies between features identified (dependency graph + narrative notes)
- [x] Confidence levels marked (HIGH on ecosystem patterns, MEDIUM on competitor daily-view products, LOW on version-specific plugin claims)
- [x] MVP vs v1.x vs v2+ split is explicit with triggers for promotion

---

*Feature research for: Obsidian plugin — personal engineer task & project management layer*
*Researched: 2026-04-18*
