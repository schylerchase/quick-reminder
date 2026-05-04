# Stack Research

**Domain:** Obsidian plugin extension — engineer task & project management layer
**Researched:** 2026-04-18
**Scope:** NEW capabilities only (ICS parsing, Google OAuth, TODO scanning, view scaling, schema migration). Existing stack (TypeScript, Obsidian API, chrono-node, esbuild, Electron Notification) is in `.planning/codebase/STACK.md` and is NOT re-researched here.
**Overall confidence:** MEDIUM

## Research Conditions — Honesty Note

WebSearch, WebFetch, and outbound `npm view` calls were all denied in this research run. Context7 MCP was declared in the environment but not accessible as a callable tool in this session. Recommendations below therefore derive from model training data (cutoff January 2026) without live verification.

**Implication for versions:** Exact current version numbers are given as "known-stable at cutoff" with a MUST-verify flag before `npm install`. Library selections and API shape guidance are much higher confidence than pinned versions — API stability for these packages is strong.

**Each phase's research step should run `npm view <pkg> version` + changelog check before locking a version into `package.json`.** This is the intended division of labor: project-level research picks the library; phase-level research pins the version.

## Recommended Stack

### Core New Dependencies

| Technology | Version (verify) | Purpose | Confidence | Why |
|------------|------------------|---------|------------|-----|
| `ical.js` | `^2.1.x` (Mozilla) | ICS parse + RRULE expansion + VTIMEZONE | HIGH on choice, MEDIUM on version | Mozilla-owned, battle-tested in Thunderbird/Lightning calendar. Handles VTIMEZONE, floating time, recurrence via `ICAL.RecurExpansion` / `ICAL.Time`. Pure JS, browser+node compatible. |
| `googleapis` | `^144.x` or current | Google Calendar API v3 service | HIGH on choice, MEDIUM on version | Official Google-maintained SDK. Includes `google-auth-library` transitively for OAuth2 token handling and automatic refresh. |
| `globby` | `^14.x` | Glob-based filesystem walk for TODO scanner roots | HIGH | ESM-first, built on `fast-glob`, handles `.gitignore` via `gitignore: true` option — important to avoid scanning `node_modules`/build output. |
| None for OAuth flow UI | — | Loopback redirect handled manually | HIGH | Electron renderer can open the system browser via `electron.shell.openExternal`; a short-lived local HTTP listener on `127.0.0.1:<ephemeral>` catches the redirect. No framework needed; ~80 LOC. |

### Supporting Libraries

| Library | Version (verify) | Purpose | When to Use | Confidence |
|---------|------------------|---------|-------------|------------|
| `luxon` | `^3.x` | Timezone-aware datetime math | Wrap ICS `DTSTART`/`DTEND` results, daily-note date windowing, cross-tz meeting display | MEDIUM — only adopt if `ICAL.Time.convertToZone()` proves insufficient. Otherwise skip and keep the dep list lean. |
| `rrule` (npm `rrule`) | `^2.8.x` | Alternative/adjunct RRULE expander | Only if `ical.js` RRULE handling hits edge cases (rare COUNT/UNTIL combos) | LOW — default to `ical.js` built-in; add `rrule` only if a specific feed breaks |
| Node built-in `http` | — | Loopback OAuth listener | Implement the PKCE redirect catcher | HIGH |
| Node built-in `crypto` | — | PKCE `code_verifier` / `code_challenge` | SHA-256 + base64url encoding of verifier | HIGH |
| Electron `safeStorage` | — | Encrypted token storage at rest | Store OAuth refresh tokens encrypted (OS keychain on macOS, DPAPI on Windows, libsecret on Linux) | MEDIUM — Obsidian plugins run in renderer; `safeStorage` access pattern inside Obsidian needs phase-0 spike validation |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `esbuild` (existing) | Already bundling; externalize `electron` as before | No change. Add any new Node-built-in externals only if they surface in bundle errors. |
| `@types/node` (existing) | Types for `http`, `crypto`, `fs/promises` used by scanner and OAuth listener | Already at `^20.11.0` — adequate |

## Installation (planned, not yet run)

```bash
# ICS calendar parsing
npm install ical.js

# Google Calendar API + OAuth2
npm install googleapis
#   pulls google-auth-library as a transitive dep — use that for OAuth2Client

# TODO scanner filesystem walk
npm install globby

# Optional, only if ical.js timezone math is insufficient
# npm install luxon
```

**Total new runtime deps at minimum:** 3 (`ical.js`, `googleapis`, `globby`).
**Avoid bloat:** do NOT add `luxon`, `date-fns`, or `rrule` unless a concrete gap surfaces in a phase spike.

## Dimension-by-Dimension Research

### 1. ICS Calendar Parsing

**Recommendation: `ical.js` (Mozilla)** — HIGH confidence on choice.

**Why ical.js over alternatives:**

| Library | Verdict | Reasoning |
|---------|---------|-----------|
| `ical.js` | **Choose** | Mozilla-maintained, powers Thunderbird. Handles VTIMEZONE (built-in Olson DB), RRULE (`RecurExpansion`), EXDATE, floating time distinction via `ICAL.Time.isDate`/`zone`, all-day events. Pure parser — no HTTP client coupling. |
| `node-ical` | Avoid | Wraps `ical.js` internally but adds HTTP fetching and a less predictable API surface. Historically had inconsistent RRULE handling (delegated to `rrule` npm, mixing zone logic). |
| `ical-expander` | Avoid | Thin wrapper on `ical.js` — the thing it saves you (`between(start, end)`) is ~20 lines of your own `RecurExpansion` loop. Abandoned-looking repo. |
| `icalendar` | Avoid | Very old, not maintained, partial RFC5545 coverage. |
| Custom parser | Avoid | RFC 5545 is deceptively simple-looking; VTIMEZONE + RRULE + folded lines + escape rules are a tar pit. |

**What ical.js handles well (from RFC 5545 conformance):**
- **VTIMEZONE**: Parsed into `ICAL.Timezone` objects; `ICAL.Time.convertToZone(tz)` does correct DST math.
- **RRULE**: `ICAL.RecurExpansion` iterates occurrences; handles FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY.
- **All-day events**: `ICAL.Time.isDate === true` when DTSTART has VALUE=DATE.
- **Floating time** (DTSTART with no TZID and no Z suffix): represented with `zone === ICAL.Timezone.localTimezone`. **This is the single biggest Outlook trap** (see gotchas).
- **EXDATE**: Honored by `RecurExpansion` automatically.

**What to watch / manual handling needed:**
- **RECURRENCE-ID overrides** (edited occurrences of a recurring event): need explicit merge logic — `ical.js` gives you the components but you iterate and replace matching occurrences yourself.
- **Embedded/inline VTIMEZONE definitions that miss DST rules** — some corporate feeds ship incomplete VTIMEZONE blocks. `ical.js` falls back to the name if it matches an Olson zone it knows, but unknown zones fail silently to UTC. Log a warning when a zone isn't resolvable.
- **VALARM**: present in the tree but ignore entirely — this plugin owns its own alarms via the existing Scheduler.
- **Line unfolding** (RFC 5545 §3.1): handled automatically; don't pre-normalize.

**Outlook-ICS specific gotchas (HIGH priority, called out per quality gate):**

1. **Corporate Outlook "Published calendar" URLs are sanitized and lossy.** They drop accepted/declined status, strip many custom X-props, and sometimes collapse recurring masters into expanded instances for the next ~6 months only. Plan for "this feed's horizon is limited" in the UI (e.g., show "Outlook feed ends YYYY-MM-DD").
2. **Windows timezone names instead of Olson** — Outlook often emits `TZID:Eastern Standard Time` (Windows tz name), not `America/New_York` (Olson). `ical.js` does NOT auto-map these. Maintain a small Windows→Olson lookup table (the CLDR `windowsZones.xml` 30-ish common entries cover 99% of corporate calendars), or fall back to `UTC` with a visible warning.
3. **Floating time on all-day OOO events** — some Outlook clients emit whole-day events with floating (zone-less) times. If you assume UTC, a 9am CT all-day meeting shows up as "yesterday 10pm" in the east. Treat `isDate === true` events as "display-in-local-zone only, don't convert."
4. **Secret URL rotation** — Outlook lets users reset the published-calendar URL. Expect 401/404 and surface a "re-paste your Outlook URL" action.
5. **Modified occurrence instability** — corporate feeds often dump a dozen RECURRENCE-ID overrides. Expand once per fetch, cache the resolved occurrences, do not re-expand per render.
6. **Large feeds** — some team calendars are >500KB ICS. Parse off the main thread if possible (in Obsidian: simplest path is to chunk work with `requestIdleCallback` or schedule via `setTimeout(..., 0)` between events, since plugins can't easily use Web Workers with the current bundler config).

**Fetching ICS feeds:** Use `fetch()` (available in Electron renderer). Respect HTTP caching headers (`ETag`, `Last-Modified`) — corporate feeds are rate-limited in some tenants. Store last-known ETag per feed URL in plugin data.

### 2. Google Calendar OAuth

**Recommendation: loopback redirect + PKCE, using `googleapis` + its embedded `google-auth-library`** — HIGH confidence on flow, MEDIUM on exact code shape inside Obsidian.

**Flow choice: Loopback, not device code, not implicit.**

| Flow | Verdict | Reasoning |
|------|---------|-----------|
| **Loopback (127.0.0.1) + PKCE** | **Choose** | Google's current recommendation for installed apps (RFC 8252). UX: single browser redirect, fast, no code to copy. Works inside Obsidian by opening system browser via `window.open()` or Electron's `shell.openExternal`, running a short-lived Node `http.createServer` on an ephemeral port on loopback. |
| Device code flow | Avoid for this UX | Works, but requires user to copy a code — worse UX than loopback on desktop. Reserve for headless environments. |
| Implicit grant / auth code without PKCE | Avoid | Deprecated for native/installed apps; Google has been narrowing acceptance. |
| Service account | N/A | For server-to-server, not personal calendar access. |
| Web flow with client secret | Avoid | An OSS plugin cannot keep a client secret. Google treats "Desktop app" client type as public — no secret required when combined with PKCE. |

**Concrete flow:**
1. User clicks "Connect Google Calendar" in settings.
2. Plugin generates PKCE `code_verifier` (43-128 chars) + `code_challenge` (S256).
3. Plugin starts `http.createServer` on `127.0.0.1:0` (ephemeral port), records actual port.
4. Plugin opens system browser to Google's auth URL with `redirect_uri=http://127.0.0.1:<port>/callback`, `code_challenge`, `code_challenge_method=S256`, `scope=https://www.googleapis.com/auth/calendar.readonly`, `access_type=offline` (critical for refresh token), `prompt=consent` (first time only, to guarantee refresh token).
5. User approves in browser → Google redirects to loopback with `?code=...`.
6. Loopback server receives code, responds with a simple "You can close this tab" HTML, shuts down.
7. Plugin exchanges code + verifier for `access_token` + `refresh_token` via `oauth2Client.getToken()`.
8. Plugin stores both tokens (encrypted, see below) and sets `oauth2Client.setCredentials({access_token, refresh_token})`.
9. `google-auth-library` auto-refreshes when `access_token` expires — listen for the `tokens` event to re-persist the (new) access token.

**Scopes:** `https://www.googleapis.com/auth/calendar.readonly` is the least-privilege scope sufficient for read-only calendar view. Do not request `/calendar` (read-write) until write-back is actually being shipped.

**Token storage inside an Obsidian plugin:**

This is the one area where MEDIUM confidence applies — Obsidian plugins have three storage options, each with tradeoffs:

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| `plugin.saveData()` (JSON in vault) | Simple, consistent with existing pattern | **Plaintext in `.obsidian/plugins/<id>/data.json`** — readable by any vault-sync tool. Refresh tokens are long-lived credentials. | Acceptable only if user explicitly opts-in with an "I understand" checkbox. |
| Electron `safeStorage` via IPC | OS-level encryption (keychain/DPAPI/libsecret); ciphertext can sit in the data.json safely | Needs `@electron/remote` or a main-process bridge; **Obsidian plugin sandboxing restricts main-process access**. Spike required. | **Preferred if spike proves viable**; fall back otherwise. |
| `localStorage` via Obsidian `app.saveLocalStorage` | Stays on device (not synced via Obsidian Sync) | Still plaintext; no encryption benefit over `saveData`; harder to clear | Skip — provides no real security gain. |

**Recommended approach:** `safeStorage` spike in phase 0 of calendar work. If `safeStorage.isEncryptionAvailable()` returns true from the plugin's JS context, encrypt refresh token to a `Buffer`, store base64 in `data.json`. If not available, fall back to `saveData` with a clear disclosure string in settings.

**Refresh handling — do NOT hand-roll:**
- `google-auth-library`'s `OAuth2Client` has built-in refresh logic; it auto-retries requests when `access_token` is expired.
- Subscribe to its `tokens` event and re-persist **every time** a new access token arrives. Missing this = tokens drift, next launch re-auths.
- Handle `invalid_grant` explicitly: means refresh token was revoked (user removed app access, or token >6 months idle). Prompt re-authorization.

**Rate limits to respect:** Google Calendar v3 allows ~1M requests/day per project, ~600 req/min/user (generous). Use `timeMin`/`timeMax` query params to fetch only a 7-day window, not the full calendar. Etag the response and send `If-None-Match` to get 304s for free.

**OAuth client registration:** User must create their own Google Cloud project + OAuth "Desktop app" client ID. Document this in a setup guide — do NOT ship a shared client ID in an OSS plugin (OAuth consent screens get flagged, verification is annoying, and any single user hitting quota starves everyone else).

### 3. TODO Comment Scanner

**Recommendation: `globby` + custom regex** — HIGH confidence.

**Why not `leasot`:**
- `leasot` is a full parser that walks ASTs per language, supports many extensions, and emits structured output. It's overkill for "find `// TODO:` and `# TODO:` in configured paths."
- Pulls a dependency graph including Babel parsers for JS/TS — adds tens of MB to `node_modules`.
- Treats each language via its own parser — means on an unsupported file type (Rust, Go, HCL, etc.) you get nothing or errors.
- Maintenance cadence has slowed in recent years; project is functional but not vibrant.

**Why not `todocheck`:**
- Go binary, not an npm lib — wrong stack for an Obsidian plugin.

**Simple regex-based approach is clearly better here because:**
- Requirements are "find TODO comments" — comment syntax is `//`, `#`, `--`, `/* */`, `<!-- -->`. A regex covers 95% of real-world use in ~15 LOC.
- User-configured paths only (per PROJECT.md decision) — deterministic input, no need for smart language detection.
- No AST = no parser bugs across TS/JS/Python/Rust/Go/Bash/YAML/Terraform/etc.
- Streaming line-by-line (`fs.createReadStream` + `readline`) keeps memory flat on large monorepos.

**Proposed implementation shape:**
```ts
// ~50 LOC total
const TODO_RE = /(?:^|\s)(?:\/\/|#|--|\/\*|<!--)\s*(TODO|FIXME|HACK|XXX)\b[(:]?\s*([^*]*?)\s*(?:\*\/|-->|$)/i;

async function scanPath(rootAbs: string): Promise<TodoHit[]> {
  const files = await globby(['**/*', '!**/node_modules/**', '!**/dist/**', '!**/.git/**'], {
    cwd: rootAbs,
    gitignore: true,   // honor .gitignore
    absolute: true,
    onlyFiles: true,
  });
  const hits: TodoHit[] = [];
  for (const file of files) {
    const rl = readline.createInterface({ input: fs.createReadStream(file) });
    let lineNo = 0;
    for await (const line of rl) {
      lineNo++;
      const m = TODO_RE.exec(line);
      if (m) hits.push({ file, line: lineNo, kind: m[1].toUpperCase(), text: m[2] });
    }
  }
  return hits;
}
```

**Performance — meeting the <2s full-vault constraint:**
- `globby` with `gitignore: true` trims 80-95% of files in a typical JS/TS monorepo.
- Line-stream each file in parallel with a bounded concurrency (e.g. `p-limit` at 8) — or just serial, since disk is usually the bottleneck and 10k files at ~0.1ms/file ≈ 1s.
- Skip binaries cheaply: check first 512 bytes for null bytes or use extension allowlist.
- Cache per-file `mtime` keyed by absolute path; re-scan only on `mtime` change. This is the single biggest win for repeated scans.
- Run on plugin load + an explicit "Rescan" button; do NOT watch with `fs.watch` (too invasive, cross-platform quirks).

**Supporting deps:**
- `globby@^14` (ESM) — glob + gitignore.
- Optional: `p-limit` — only if benchmarks show serial disk reads are too slow.
- Node built-in `fs`, `readline` — no new deps.

**What to avoid:**
- `chokidar` / live watching — scope creep, cross-platform pain, battery drain.
- `ripgrep` child-process — fast but adds a binary dep and complicates distribution; plugin would need to ship or require `rg` installed.
- Language-specific parsers (`@babel/parser`, `tree-sitter`) — way out of scope.

### 4. Obsidian ItemView at Scale (~500 tasks)

**Recommendation: plain DOM + manual windowing** — HIGH confidence at this scale.

**The 500-item question — answer: no virtualization required.**

- Native DOM comfortably renders ~5,000 moderately-styled list items before jank. 500 is a non-issue even on a 2015 MacBook.
- Existing `ReminderView` uses `createEl`/`createDiv` — same pattern scales fine.
- The bottleneck at 500 items is **re-render cost on every store change**, not initial paint.

**What to actually optimize:**

1. **Diff, don't rebuild.** The current `refreshHandler` likely does `container.empty(); render()` on every change. At 500 items that's ~5-15ms per store event, and you're getting multiple events per fetch cycle. Switch to a keyed reconciliation: keep a `Map<taskId, HTMLElement>` and only add/remove/update what changed.
2. **Debounce store notifications** when doing bulk operations (e.g. "ingest 200 Outlook events") — coalesce to a single `requestAnimationFrame` render.
3. **Indexed data.** The store currently returns sorted copies on `get pending()`. At 500 items × filter-on-keystroke, that's still fine, but: precompute sort keys, and keep a separate `byProject` / `byDueBucket` index rebuilt on mutation rather than filtering the whole array per render.
4. **Lazy-render hidden sections.** History can be collapsed with `<details>` — browsers skip paint for closed details.

**When to introduce virtualization:**

Only if: (a) item count crosses ~3000, or (b) per-row DOM gets heavy (inline editors, rich previews). v1 target is 500 — skip it.

**If virtualization is ever needed:**

| Library | Verdict | Reasoning |
|---------|---------|-----------|
| `@tanstack/virtual-core` (framework-agnostic) | **Choose if needed** | Framework-agnostic core; works with plain DOM. Lightweight (~8KB). Does variable-height rows. |
| `react-window` / `react-virtualized` | Avoid | Would force adopting React — major stack change against PROJECT.md constraint. |
| `virtual-scroller` (web component) | Avoid | Less mature, thin ecosystem, browser-support quirks. |
| `lit-html` / `preact` templating | Avoid for virtualization | They're rendering libs, not virtualizers. Adding them for this is backwards. |

**On lit-html / preact as a diff engine:**

Tempting for "just add a tiny diff engine so we don't have to hand-write keyed reconciliation." Counter-arguments:
- Adds ~5-10KB to the bundle and a mental model mismatch (existing code is imperative DOM).
- Hand-written reconciliation for 500 keyed rows is ~40 LOC and stays in the existing style.
- **Reserve framework adoption for a real forcing function**, not a convenience.

**Recommendation: stay plain-DOM, adopt keyed-reconciliation + debounced store events. Revisit only if concrete performance numbers justify a framework.**

### 5. JSON Schema Migration

**Recommendation: versioned schema + lazy migration chain** — HIGH confidence.

**The constraint (per PROJECT.md):** "Keep the existing `Reminder` data shape migratable — do not break user data on upgrade; additive schema changes only."

**Pattern: Persisted `schemaVersion` field + linear migration functions.**

```ts
// types.ts
type PluginDataV1 = { /* current shape */ };
type PluginDataV2 = PluginDataV1 & { projects: Project[]; ... };
type PluginDataV3 = /* etc */;
type PluginData = PluginDataVN;  // latest alias

interface PersistedData {
  schemaVersion: number;
  data: PluginData;
}

// store.ts init()
async function init() {
  const raw = await this.load();
  const current = migrate(raw);   // runs chain if needed
  this.data = current.data;
  if (current.schemaVersion !== raw?.schemaVersion) {
    await this.persist();          // write back the migrated shape
  }
}

const MIGRATIONS: Record<number, (d: any) => any> = {
  // 1 -> 2: introduce projects[] and task.projectId
  1: (d) => ({
    ...d,
    projects: [],
    reminders: d.reminders.map(r => ({ ...r, projectId: null })),
  }),
  // 2 -> 3: rename reminder.text -> reminder.title
  2: (d) => ({
    ...d,
    reminders: d.reminders.map(({ text, ...r }) => ({ ...r, title: text })),
  }),
};

function migrate(raw: any): PersistedData {
  // Handle first-ever load (no schemaVersion field)
  if (!raw || !raw.schemaVersion) {
    raw = { schemaVersion: 1, data: raw ?? {} };
  }
  let { schemaVersion, data } = raw;
  while (MIGRATIONS[schemaVersion]) {
    data = MIGRATIONS[schemaVersion](data);
    schemaVersion++;
  }
  return { schemaVersion, data };
}
```

**Why this shape over alternatives:**

| Approach | Verdict | Reasoning |
|----------|---------|-----------|
| **Versioned schema + linear migrations** | **Choose** | Explicit, testable, every version jump is a pure function. Easy to reason about. Standard in Redux Persist, IndexedDB wrappers, and most plugin ecosystems. |
| Additive-only / no versions | Avoid | Works until the first real rename or field move. Then you're stuck supporting the old shape forever with compatibility shims scattered across the codebase. |
| Zod schema with `.transform()` chains | Overkill | Zod is excellent for input validation, but for internal persisted data, runtime parsing on every load is wasted cost. Use TS types + migrations. |
| External migration tool (`umzug`, etc.) | Avoid | Database-oriented; way too much infrastructure for a plugin's `data.json`. |

**Critical rules (from experience with plugins that broke user data):**

1. **Always back up before migrating.** On first load after a version bump, write a copy of the pre-migration JSON to `.obsidian/plugins/quick-reminder/backup-v<N>-<timestamp>.json`. Keep the last 3 backups. Zero cost, saves the user when a migration has a bug.
2. **Migrations are pure functions** — no I/O, no randomness beyond `genId`, no time-based logic.
3. **Never delete a migration.** Even if v4 is current, a user loading the plugin after a year might be on v1. Keep the whole chain.
4. **Forward-compatibility: if `schemaVersion > KNOWN_LATEST`, refuse to load and show a clear "please upgrade" notice.** Do not silently downgrade. Do not try to run the user's v6 data through v4 code.
5. **Write a unit test per migration** with a captured snapshot of the prior shape as input.
6. **Migrate on read, persist on next write.** Don't force a write on load — but next save should be the new shape.
7. **Additive to existing fields, even mid-schema.** Adding an optional `priority?: number` to `Reminder` does not require a migration — just default it in read paths. Reserve migrations for renames, type changes, and structural moves.

**Initial migration (v0 or unversioned → v1):** Detect "no `schemaVersion` key" = existing shipped plugin data; wrap it as `{schemaVersion: 1, data: <existing>}` and treat the current shipped shape as v1.

## Alternatives Considered (summary)

| Recommended | Alternative | When alternative might win |
|-------------|-------------|----------------------------|
| `ical.js` | `node-ical` | If you also want HTTP fetch in one call (but you'll add it yourself anyway) |
| `ical.js` RRULE | `rrule` npm | Only if a specific corporate feed trips `ical.js` — add as a supplement, not replacement |
| Loopback + PKCE | Device code flow | Headless servers or locked-down environments with no browser |
| `globby` + regex | `leasot` | Projects that need AST-accurate extraction including JSDoc `@todo` tags and structured priority parsing |
| Plain DOM | `@tanstack/virtual-core` | Item count climbs past ~3000 or per-row DOM becomes expensive |
| Versioned migrations | `zod` transforms | Public API where incoming external JSON needs validation on every boundary |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `node-ical` | Bundles HTTP coupling, inconsistent RRULE delegation, less explicit API | `ical.js` directly |
| `ical-expander` | Thin wrapper on top of `ical.js`, abandoned-looking repo | Write the 20-line `RecurExpansion` loop yourself |
| `moment.js` | Deprecated; ~290KB; tz math fraught | `luxon` (only if needed), or native `Intl.DateTimeFormat` + `ical.js` zone support |
| `request` / `axios` for ICS fetch | Unnecessary dep; Electron renderer has native `fetch` | Native `fetch` |
| Shared/embedded Google OAuth client secret in plugin bundle | Any user can extract it; Google will flag and disable; single-client quota is shared | Document user-provided OAuth client ID in setup |
| `chokidar` for TODO file watching | Cross-platform file-watching edge cases; scope creep | On-demand rescan with `mtime` cache |
| `react-window` / any React virtualizer | Forces React adoption, violates existing plain-DOM convention | `@tanstack/virtual-core` (only if virtualization is actually needed) |
| Unversioned schema with "optional field" drift | Debt compounds; first rename is a user-data catastrophe | Explicit `schemaVersion` + migration chain |
| Electron `nodeIntegration`-based token storage hacks | Obsidian's plugin sandbox restricts these; unreliable across versions | Spike `safeStorage` accessibility first; fall back to plaintext with disclosure |

## Stack Patterns by Variant

**If the corporate Outlook feed uses Windows timezone names (common):**
- Ship a Windows→Olson mapping table (CLDR `windowsZones.xml`, ~30 entries cover >99%).
- Fall back to UTC with a visible warning banner per affected feed.

**If Obsidian Sync is the target deployment:**
- Do NOT store OAuth refresh tokens in synced `data.json`. Use `localStorage`-scoped storage or a sync-excluded path. (Obsidian Sync syncs `data.json` by default.)
- Plaintext disclosure strings become a hard requirement, not just a nicety.

**If user opts out of Google OAuth:**
- Google Calendar also offers secret ICS URLs (Settings → Integrate calendar → Secret address in iCal format). Support this as a fallback input — same `ical.js` path.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `ical.js@^2.x` | Node ≥ 14, all modern browsers, Electron renderer | Published as ESM + CJS. Pick the CJS build for esbuild CommonJS output (matching existing bundle config). |
| `googleapis@^144.x` | Node ≥ 18 | Uses native `fetch`. Check once your user's Obsidian Electron version exposes Node ≥ 18 (recent Obsidian versions do; verify at build time). |
| `globby@^14.x` | ESM-only | **esbuild config currently outputs CJS.** Either (a) let esbuild bundle `globby` into the CJS output (works — esbuild handles ESM-to-CJS in bundle), or (b) stay on `globby@^13.x` which is CJS if bundling issues arise. Verify in spike. |
| Obsidian `^1.4.11` | All of the above | No known conflicts. `isDesktopOnly: true` already present — required for Node built-ins in scanner. |

## Phase Flags — where phase-level research must dig deeper

| Phase topic | Why it needs its own research before build | Open question to resolve |
|-------------|---------------------------------------------|--------------------------|
| Google OAuth | Token storage viability | Does `safeStorage` work from an Obsidian plugin renderer context? Or require IPC scaffolding? |
| Outlook ICS | Corporate feed diversity | Grab 2-3 real ICS samples from the user's actual employer feed early; confirm Windows-tz mapping is sufficient |
| TODO scanner | Large-monorepo perf | Run the prototype against the user's actual configured paths; verify <2s; decide if `p-limit` concurrency is needed |
| Schema migration | Existing data shape | Lock in current shape as v1 BEFORE any new fields ship; capture a fixture |
| ItemView scale | Actual item count distribution | If user has 2000+ open TODOs in code, revisit virtualization |

## Sources

- **Training data (model cutoff Jan 2026)** — all recommendations. Live verification was attempted via WebSearch, WebFetch, `npm view`, and Context7; none were reachable in this session (see "Research Conditions — Honesty Note" above).
- **RFC 5545** (iCalendar) — structure knowledge for VTIMEZONE/RRULE/floating-time behavior.
- **RFC 8252** (OAuth 2.0 for Native Apps) — loopback + PKCE flow guidance.
- **RFC 7636** (PKCE) — `code_verifier` / `code_challenge` construction.
- **Obsidian Plugin API** (existing codebase usage in `.planning/codebase/`) — view / storage / data patterns.
- **Existing `.planning/codebase/STACK.md` and `ARCHITECTURE.md`** — for alignment; not re-researched.

## Confidence Breakdown

| Recommendation | Confidence | Basis |
|----------------|------------|-------|
| Use `ical.js` for ICS parsing | HIGH | Widely known standard, Mozilla-maintained, well-understood API |
| Outlook Windows-tz trap exists | HIGH | Documented RFC deviation by Microsoft for ~20 years |
| Loopback + PKCE for Google OAuth | HIGH | Google's explicit current recommendation for installed apps |
| `googleapis` SDK auto-refreshes tokens | HIGH | Well-known library behavior |
| `safeStorage` availability inside Obsidian plugin renderer | MEDIUM | Requires spike — plugin sandboxing may restrict |
| Plain DOM scales to 500 items | HIGH | Well-established browser performance headroom |
| `globby` + regex beats `leasot` for this use case | HIGH | Clear requirements match |
| Versioned migration chain pattern | HIGH | Industry-standard approach |
| Exact version numbers (e.g. `ical.js@^2.1.x`, `googleapis@^144.x`) | **LOW-MEDIUM** | **Verify via `npm view` before `npm install`.** Training data is stale by months. Use ranges, not pins; test in a spike. |
| Luxon adoption is unnecessary | MEDIUM | Depends on how well `ical.js` zone math covers the user's actual feeds |

---

*Stack research for: Obsidian plugin extension — task/project/calendar/TODO layer over existing quick-reminder*
*Researched: 2026-04-18*
*Next step: phase-level research should verify current versions and run the spike flags above before committing to implementation.*
