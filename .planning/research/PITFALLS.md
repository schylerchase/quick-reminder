# Pitfalls Research

**Domain:** Obsidian plugin — personal engineer task & PM layer (quick-reminder extension)
**Researched:** 2026-04-21
**Confidence:** MEDIUM-HIGH (HIGH on Obsidian and existing codebase concerns; MEDIUM on ICS/OAuth edge cases from training data)

## Critical Pitfalls

### Pitfall 1: Event-listener leaks across hot-reload

**What goes wrong:**
During development, Obsidian reloads the plugin on every build. Listeners registered with `plugin.registerEvent`, `store.onChange`, `setInterval`, or `ItemView.onOpen` accumulate across reloads. Leaked listeners keep the old plugin instance alive, referencing stale store state and firing double.

**Why it happens:**
Developers call `store.onChange(handler)` without pairing it with `store.offChange(handler)` in `onClose`/`onunload`. The scheduler's `setTimeout` handles and the feed-refresh interval are particularly easy to forget.

**How to avoid:**
- Every `addEventListener`, `onChange`, `setInterval`, or `setTimeout` registration must have a matching teardown stored in `this.register(() => clearTimeout(handle))` or an explicit `offChange` call in `onunload`.
- Audit checklist: for each new subsystem (feeds, scanner, dashboard block), verify `onunload` removes all handlers it created.
- Use Obsidian's `plugin.registerInterval` and `plugin.registerEvent` where possible — Obsidian cleans those up automatically.

**Warning signs:**
Development-mode duplicate notifications. `Notification` constructor called twice per due time. Dev console shows two `[qr]` log lines per action. Process memory climbs during a dev session.

**Phase to address:** Phase 1 (Task store refactor) sets the pattern; every subsequent phase enforces it in code review.

---

### Pitfall 2: Main-thread block from TODO scanner

**What goes wrong:**
Scanning a monorepo synchronously walks thousands of files and blocks the Obsidian renderer for 5–30 seconds. UI freezes, notifications queue, user thinks the plugin crashed.

**Why it happens:**
Naive `fs.readdirSync` + `fs.readFileSync` in a loop. Even async versions without yielding still saturate the event loop if called back-to-back without batching.

**How to avoid:**
- Use `globby` or `readdir` async + `setImmediate` yield every N files (N ~100) to keep the renderer responsive.
- Hard cap: file count and total bytes scanned. Default 10,000 files / 50MB text; fail loud if exceeded.
- Skip by default: `node_modules`, `.git`, `dist`, `build`, `.next`, `.obsidian`, anything in `.gitignore`. Respect a user-configurable additional ignore list.
- Binary file detection: check first 1KB for NUL byte before treating as text.
- Budget: 2 seconds for a typical monorepo (per PROJECT.md). Measure with `performance.now()`, log if exceeded.

**Warning signs:**
Scanner run > 2s. Obsidian UI frame drops during scan. Memory spike on scan. `fs.ENOENT` or `EACCES` errors in console mid-scan.

**Phase to address:** Phase 3 (TODO scanner) — performance budget is part of phase acceptance criteria.

---

### Pitfall 3: Outlook ICS timezone (Windows TZ names)

**What goes wrong:**
Outlook corporate ICS feeds use Microsoft Windows timezone names (`Eastern Standard Time`, `Pacific Standard Time`) instead of IANA/Olson names (`America/New_York`, `America/Los_Angeles`). Standard ICS parsers including `ical.js` do NOT auto-map these, so times are interpreted as the local vault timezone or silently dropped.

**Why it happens:**
The iCalendar spec permits custom `TZID` values. Outlook uses Microsoft's. The industry mostly uses Olson. No parser ships a mapping by default.

**How to avoid:**
- Ship a CLDR-derived Windows→Olson mapping table (~100 entries, static JSON) in the plugin.
- On ICS parse, detect Windows TZ IDs via pattern (`/^[A-Z][a-z]+ (Standard|Daylight) Time$/`) and translate before handing to the parser.
- Keep a fallback: if mapping lookup fails, log a warning and treat the event as floating-time in the vault's local zone, marked with a visible "timezone unknown" badge in the dashboard.
- Phase-start: collect 2–3 real Outlook ICS samples from the user's actual corporate calendar before writing the parser; shapes vary by tenant.

**Warning signs:**
Events showing up at wrong hours (usually off by 4–8 hours). DST transition weeks where some events shift and others don't. User reports "meeting at 9am shows up as 2pm."

**Phase to address:** Phase 4 (calendar integration) — Outlook ICS sub-phase.

---

### Pitfall 4: Google OAuth refresh-token storage

**What goes wrong:**
OAuth access tokens expire in 1 hour; refresh tokens must persist for weeks or months. Storing refresh tokens in plain JSON via `plugin.saveData` writes them to `.obsidian/plugins/quick-reminder/data.json` — which Obsidian Sync, iCloud, Git, Dropbox will then replicate. Anyone with filesystem access to one sync endpoint can steal the token and impersonate the Google account.

**Why it happens:**
Plugin APIs make `saveData` the obvious path. Electron's `safeStorage` is not advertised in Obsidian's plugin docs and requires `ipcRenderer` access from the plugin's renderer context, which has caveats.

**How to avoid:**
- Phase-start spike: verify `safeStorage.isEncryptionAvailable()` from within the plugin renderer. If available, encrypt the refresh token at rest.
- If `safeStorage` is unavailable: store refresh token in a separate file under the plugin directory with a clear `.gitignore`/`.obsidianignore` pattern; document that corporate IT or sync-service compromise exposes it.
- Never ship a shared OAuth client secret in the plugin bundle. User supplies their own Google Cloud OAuth client ID and secret in settings. The plugin brokers the flow, never distributes the secret.
- Use PKCE + loopback redirect (port 0, ephemeral). OOB flow is deprecated.
- On refresh failure: drop the token cleanly, surface a "reauthenticate" banner in the dashboard; do not silently stop syncing.

**Warning signs:**
Token present but all API calls 401. Plugin log shows `invalid_grant` errors. Silent calendar-feed staleness (dashboard empty but no error).

**Phase to address:** Phase 4 (calendar integration) — gcal OAuth sub-phase. Spike in phase-start research.

---

### Pitfall 5: Schema migration partial-write corruption

**What goes wrong:**
During the `reminders[]` → `tasks[]` migration, `plugin.saveData` is called mid-migration. Obsidian crashes or the user force-quits. The data file contains a half-migrated shape — some entries in the old key, some in the new, schemaVersion unclear. Next launch, the migration runs again and double-migrates, or refuses to run and the user sees an empty inbox.

**Why it happens:**
Migration writes directly to the live file. No atomic swap. No backup. Schema version is set before migration completes.

**How to avoid:**
- Before migration: copy `data.json` to `data.json.pre-v{N}.bak` — keep at least the last 2 backups.
- Migration is a pure function: `migrate(oldData) -> newData`. No partial writes. Compute the full new shape in memory, then `saveData` once atomically.
- Update `schemaVersion` LAST, after the new shape is successfully written.
- On load: if `schemaVersion < CURRENT`, run chained migrations (`v1 -> v2 -> v3`). Each migration is idempotent (detectable by key presence).
- If migration throws, refuse to start the plugin; show a "manual recovery" dialog pointing to the backup file and a restore command. Never wipe user data on migration error.
- Preserve reminder IDs across rename — a `Task` migrated from a `Reminder` keeps the same `id`. This prevents scheduler timer orphaning.

**Warning signs:**
`data.json` file size spikes or drops after load. User reports "all my reminders disappeared." Schema version skips (e.g., 1 → 3 with no 2).

**Phase to address:** Phase 1 (Task store refactor) — migration is the first thing that ships.

---

### Pitfall 6: Dashboard code-block processor lifecycle leak

**What goes wrong:**
Obsidian's `registerMarkdownCodeBlockProcessor` returns a DOM subtree; when the note closes, Obsidian disposes the DOM but the processor's subscriptions to `store.onChange` remain. Next dashboard render adds another. Memory grows, and each store change fires N re-renders.

**Why it happens:**
`MarkdownRenderChild` exists to solve this, but its lifecycle (`onload` → `onunload`) is not well-known. Most tutorials show the naive pattern without it.

**How to avoid:**
- Wrap every dashboard subtree in a `MarkdownRenderChild`. Register subscriptions in `onload`, unsubscribe in `onunload`.
- Use `ctx.addChild(new DashboardRenderChild(...))` pattern — Obsidian handles lifecycle.
- Idempotency: if the same note opens twice (split pane), both render independently. They must subscribe separately and unsubscribe separately; avoid module-level singletons.
- Anchor deletion: if user deletes the `` ```qr-dashboard `` block, the processor is simply not called again — no special handling needed, do not auto-reinsert.

**Warning signs:**
Dev-tools memory snapshot shows growing DashboardRenderChild count after pane open/close cycles. Store change fires multiple renders for one dashboard. Console warnings about "update on unmounted component" equivalents.

**Phase to address:** Phase 5 (daily dashboard).

---

### Pitfall 7: Catch-up notification flooding

**What goes wrong:**
User opens Obsidian after a vacation. 47 reminders were due during the week away. The plugin fires 47 native notifications back-to-back. The OS either groups them into a useless stack or spams for minutes.

**Why it happens:**
Existing launch-time catch-up (in the shipped reminder plugin) scans `pending` where `dueAt < now` and calls `scheduler.fire()` on each. No throttle, no digest.

**How to avoid:**
- Threshold: if overdue count > 3, show one aggregated native notification ("5 reminders overdue, open Obsidian to triage") and surface the list in the inbox view.
- Threshold is a setting with a sensible default (3 or 5).
- For async owes with stale-threshold nudges, the same rule applies — batch into one notification when many fire simultaneously.
- Separately: if the user has focus-assist / Do Not Disturb active, notifications may silently drop — fall back to an in-app banner on next focus.

**Warning signs:**
User complaint "got spammed after vacation." Native notification API returning errors from rate limiting. Multiple notifications with identical timestamps.

**Phase to address:** Phase 5 (daily dashboard and nudge logic) — tied to the stale-owe system.

---

### Pitfall 8: Daily-note filename localization

**What goes wrong:**
Dashboard targets today's daily note. User's Daily Notes plugin is configured with format `YYYY-MM-DD` (default) but could equally be `DD-MM-YYYY`, `YYYY/MM/DD` in a folder, or a non-English locale. Plugin hardcodes the format and creates or overwrites the wrong file.

**Why it happens:**
Developers assume their own Daily Notes format is universal.

**How to avoid:**
- Do not write into the note file. Use the code-block processor pattern (see Pitfall 6) — the user places `` ```qr-dashboard `` in their daily note template, plugin renders live.
- Never auto-create daily notes. If the code block is present, render. If not, do nothing.
- For "what is today's daily note" reads (meeting context pulls): integrate with Obsidian's Daily Notes plugin API (`obsidian-daily-notes-interface`) rather than constructing the path yourself.

**Warning signs:**
File-not-found errors when rendering dashboard. Duplicate daily notes with different formats. Users on non-English Obsidian reporting "dashboard doesn't work."

**Phase to address:** Phase 5 (daily dashboard).

---

### Pitfall 9: ICS RRULE edge cases

**What goes wrong:**
`ical.js` handles basic RRULE expansion but specific rules trip it or produce surprising results: `BYDAY=1MO` (first Monday of month), `BYSETPOS=-1` (last occurrence), `EXDATE` with timezone mismatch, DST-crossing weekly recurrences that shift by an hour twice a year, `COUNT` + `UNTIL` interaction.

**Why it happens:**
The RFC is vast. Library maintainers implement 90% and punt on the long tail. Corporate Outlook exporters emit unusual rules (all-day recurring events with embedded timezones are a known hot spot).

**How to avoid:**
- Treat `ical.js` output as authoritative within a reasonable window: expand recurrences only for today ± 14 days. Longer windows amplify bugs.
- For each recurring event: log the original RRULE and the expanded instances in debug mode — makes it auditable.
- Known bugs to guard against: add a unit test per edge case the first time it's spotted in user feeds.
- Defer: do not try to implement RRULE yourself. If `ical.js` handles 95%, accept the 5% and display a "recurring — verify details in source calendar" badge for expanded instances.

**Warning signs:**
Recurring meeting shows up on wrong day of month. Meeting visible in source calendar but missing in dashboard. DST transition weeks where meetings shift unexpectedly.

**Phase to address:** Phase 4 (calendar integration).

---

### Pitfall 10: Vault-file write collisions

**What goes wrong:**
The existing plugin writes `Reminders.md` on every persist. When the scanner, feed refresh, and manual add all fire in quick succession, multiple writes race. Either the last write wins and mid-writes are lost, or Obsidian's file watcher flags the file as externally modified and throws a reconciliation conflict.

**Why it happens:**
Every mutation calls `persist()` which calls both `saveData` and `mirrorToMarkdown`. No write queue.

**How to avoid:**
- Debounce the markdown mirror write: 250ms trailing debounce, so a burst of adds coalesces to one write.
- Keep `saveData` synchronous per-mutation (fast, no flicker) but batch the mirror.
- Use Obsidian's `Vault.process()` for mirror writes — it handles file-lock semantics internally.
- The mirror is write-only by design (see codebase CONCERNS.md). Warn if the user edits it manually.

**Warning signs:**
`Reminders.md` shows stale content. File-modification conflicts from Obsidian. Sync service (iCloud/Dropbox) conflict-copy files appearing.

**Phase to address:** Phase 1 (Task store refactor) — bake debounce into `TaskStore.persist()`.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `Math.random()` for IDs (existing code) | Simple, no crypto import | Collisions across synced vaults | Never — switch to `crypto.randomUUID()` in Phase 1 |
| Full markdown-mirror rewrite on every mutation | No diff tracking, simple | Growing file write cost, sync conflicts | Only under ~50 tasks; debounce + segmented writes beyond |
| Hardcode calendar poll interval | Predictable | User can't tune; drains battery if too fast | Only with a sensible default (15 min) and a settings override |
| Skip `.gitignore` parsing in scanner | Fast to ship | Scans vendored code, leaks secrets from commented credentials | Never — respect `.gitignore` from v1 |
| Single JSON data file (no split) | Simple | Grows large; every write rewrites whole file | Acceptable to ~10k tasks; split by source beyond |
| In-memory only feed cache | Simple, no storage layer | Every launch re-fetches — slow startup on poor connections | Acceptable for v1; persist cache in Phase 4.5 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Google Calendar | Share a single OAuth client secret in plugin bundle | User provides own Google Cloud OAuth client; plugin brokers PKCE flow |
| Google Calendar | OOB flow (copy-paste code) | Deprecated 2022. Use PKCE + loopback redirect |
| Outlook ICS | Assume Olson timezone names | Ship CLDR Windows→Olson map; translate before parsing |
| Outlook ICS | Poll with `fetch` from plugin | Use Obsidian's `requestUrl` (handles CORS, proxy, auth) |
| Obsidian vault writes | Use `fs.writeFile` directly | Use `Vault.process()` / `Vault.modify()` (lock-aware) |
| Obsidian file paths | Hardcode `/` separator | Use `normalizePath()` from Obsidian API |
| Obsidian events | Forget to unsubscribe | Use `plugin.registerEvent()` or pair every `on` with `off` in `onunload` |
| Native Notification | Call `new Notification()` without permission check | Check `Notification.permission`; request once; fall back to `Notice` if denied |
| chrono-node | Trust parse result without validating `dueAt > now` | Explicit validation already present — preserve in Task adapter |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-rerender on every store change | UI flash on any mutation | Debounce listener; diff-based DOM update keyed by task id | ~200 visible tasks |
| Unbounded `setTimeout` chain for reminders | Browser timer table bloat | Schedule only next 24h of timers; reschedule on launch/midnight | ~500 pending reminders |
| Synchronous TODO scan on plugin load | Obsidian startup pause | Scanner runs on-demand and via debounced file-watcher, never at load | Any monorepo |
| Calendar feed full-fetch on every open | Slow inbox open over bad connection | Cache with TTL (15 min); stale-while-revalidate | Always if no cache |
| Markdown mirror per-keystroke write | File-system I/O spike | 250ms trailing debounce on mirror writes | ~30 adds/min |
| All tasks in one flat array scan | `.filter` O(n) on every render | Pre-compute indexes (`byProject`, `byDueDate`) on store change | ~1000 tasks |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Store OAuth refresh token in `plugin.saveData` plaintext | Token theft via sync/filesystem access | `safeStorage.encryptString` if available; else document risk + separate file with `.obsidianignore` |
| Ship shared Google OAuth client secret in plugin bundle | Mass revocation if leaked; violates Google ToS | User supplies own client ID/secret in settings |
| Execute or eval scanner findings | Arbitrary code execution if a repo contains a crafted comment | Never eval; treat all scan output as untrusted text |
| Follow symlinks during scan | Path traversal out of configured roots; infinite loop | `fs.lstat` + symlink detection; skip or bound depth |
| Log full OAuth tokens in debug mode | Token in log files, then in support bundles | Never log raw tokens; log first/last 4 chars for debug correlation |
| Dashboard code block runs arbitrary calendar URLs | SSRF via malicious ICS URL | Allowlist `https://` only; reject `file://`, `gopher://`, internal IPs |
| Write scanner config paths without sanitization | User accidentally points at `~/.ssh` or `/etc` and the mirror leaks filenames | Warn on paths matching known-sensitive patterns; require explicit confirmation |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent calendar-sync failure | Dashboard silently stale; missed meetings | Visible "sync failed" badge in dashboard with last-success time |
| Notification storm after long offline period | User annoyed, disables notifications, never sees real ones | Aggregate overdue > threshold into one notification |
| Inbox shows all sources mixed with no filtering | Cognitive overload; user can't find what matters | Filter chips (source, project, due-today) visible by default |
| TODO scanner adds noise from stale comments | Inbox fills with years-old `// TODO: refactor this` | Dedup by file+line; allow "snooze this TODO" per task; optional mtime-ignores |
| Task completion doesn't propagate to code TODO | User marks done in Obsidian, TODO comment stays in code | Make this explicit — v1 does not edit source files. Closing a code TODO in inbox only hides it in the plugin |
| Dashboard auto-inserts into daily note | Overwrites user edits | Code-block processor pattern only — user places the block where they want it |
| Too many keyboard shortcuts, all global | Collisions with Obsidian core shortcuts | Scope hotkeys to the InboxView; only capture modal uses a global binding |

---

## "Looks Done But Isn't" Checklist

- [ ] **Migration:** Often missing backup-before-migrate — verify `.pre-v{N}.bak` exists after first launch on old data
- [ ] **OAuth flow:** Often missing refresh-failure handling — verify dashboard shows reauth banner when token invalid
- [ ] **ICS parser:** Often missing Windows timezone mapping — verify with a real Outlook corporate feed
- [ ] **Scanner:** Often missing `.gitignore` respect — verify `node_modules` and `.git` not scanned
- [ ] **Dashboard:** Often missing `MarkdownRenderChild` lifecycle — verify listener count stable after 10 pane open/close cycles
- [ ] **Notifications:** Often missing permission check — verify graceful fallback when `Notification.permission === 'denied'`
- [ ] **Inbox view:** Often missing keyboard navigation — verify j/k/space/enter work without mouse
- [ ] **Task completion:** Often missing timer cancellation — verify scheduled `setTimeout` cleared when task marked done
- [ ] **Feed refresh:** Often missing stale-while-revalidate — verify dashboard shows cached data during refresh, not empty
- [ ] **Settings:** Often missing validation — verify empty OAuth client ID shows inline error, doesn't crash

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Migration corruption | MEDIUM | Restore from `.pre-v{N}.bak`; ship a hotfix that detects half-migrated state and re-runs |
| OAuth token leak via sync | HIGH | Revoke the OAuth client in Google Cloud Console; user re-authenticates; audit log for unauthorized access |
| Catch-up notification flood | LOW | User disables notifications once; threshold already protects; no data loss |
| Wrong Outlook TZ mapping | LOW | Update CLDR table in a patch release; past events re-fetch on next refresh |
| Scanner false-positive flood in inbox | LOW | User configures additional ignore patterns; scanner de-indexes on next run |
| Dashboard code-block removed by user | LOW | No-op — plugin doesn't re-insert; user places block again when ready |
| `safeStorage` unavailable on user's OS | MEDIUM | Fall back to plain-file storage with a visible "tokens not encrypted at rest" warning; document in README |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Event-listener leaks | Phase 1 (foundation) | Unit test: open/close view 10x, listener count unchanged |
| Main-thread block from scanner | Phase 3 (scanner) | Perf test: 5000-file repo scans under 2s |
| Outlook TZ names | Phase 4 (calendar) | Integration test with real corporate Outlook ICS sample |
| OAuth refresh-token storage | Phase 4 (calendar) | Verify encrypted storage; verify reauth banner on invalid_grant |
| Schema migration corruption | Phase 1 (foundation) | Test: simulate crash mid-migrate, backup restores cleanly |
| Dashboard lifecycle leak | Phase 5 (dashboard) | Memory profile: 10 pane cycles, no growth |
| Notification flooding | Phase 5 (nudges) | Test: 20 overdue items, one aggregate notification fires |
| Daily-note localization | Phase 5 (dashboard) | Test with `DD-MM-YYYY` and folder-based formats |
| ICS RRULE edge cases | Phase 4 (calendar) | Unit tests per known edge case; expand ±14d only |
| Vault file-write collisions | Phase 1 (foundation) | Test: 30 adds/sec, mirror writes debounced to ~4 writes |

---

## Sources

- Existing codebase concerns analysis: `.planning/codebase/CONCERNS.md` (known tech debt)
- Stack research findings: `.planning/research/STACK.md` (ical.js limitations, OAuth patterns, safeStorage spike)
- Architecture research findings: `.planning/research/ARCHITECTURE.md` (MarkdownRenderChild lifecycle, scanner isolation)
- Obsidian plugin development conventions (training data, cutoff Jan 2026)
- Known Outlook ICS quirks from corporate tenant experience (training data)
- Google OAuth 2.0 for installed apps (RFC 8252, PKCE)

---
*Pitfalls research for: Obsidian personal engineer task/PM plugin*
*Researched: 2026-04-21*
