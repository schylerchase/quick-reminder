# Phase 16 — Screenshots + Final Docs Pass

**Prerequisites:** All prior phases complete.

**Goal:** Screenshots, cross-link existing per-phase README sections, ship Dataview-rollup snippet (Phase 13 cut replacement), final CHANGELOG collation.

**Files:** `README.md`, `installers/screenshots/*`, `CHANGELOG.md`.

---

### Task 1: Screenshots

- [ ] **Step 1:** Capture in test vault:
  - `dashboard-main.png` — main pane with nav rail, priority/due chips, completed section.
  - `dashboard-sidebar.png` — sidebar variant.
  - `settings-tabs.png` — Safety tab with all toggles.
  - `health-page.png` — Health view.
  - `keyboard-cheat-sheet.png` — `?` modal.
  - `archive-confirm.png` — hard-delete confirm modal.

- [ ] **Step 2:** Place in `installers/screenshots/`. Optimize via squoosh or similar.

- [ ] **Step 3:** Commit `docs: add polish screenshots`.

---

### Task 2: README cross-linking

- [ ] **Step 1:** Add table of contents at top of README linking to each capability section that prior phases added. Example structure:

```markdown
## Quick Reminder

A unified Obsidian dashboard for time-based reminders, checkbox tasks, and TODO comments.

## Features

- [Sidebar reminder manager](#sidebar)
- [Task dashboard](#dashboard)
- [Adding tasks from the dashboard](#new-task)
- [Inline edit](#inline-edit)
- [Move-on-status behavior](#move-on-status)
- [Priority and due date chips](#chips)
- [Sort and filter](#sort-filter)
- [Saved views](#saved-views)
- [Project nav rail](#nav-rail)
- [Keyboard shortcuts](#keyboard)
- [Bulk actions](#bulk)
- [Stale detection](#stale)
- [Auto-clean orphans](#orphans)
- [Health page](#health)
- [Archive vs delete](#archive)

## Settings

The settings panel is organized into four tabs:
- **Safety** — fire-missed-on-launch, move-on-status default, archive confirm, orphan cleanup mode.
- **Metadata** — mirror to markdown, task section headings, completion timestamp.
- **Display** — sound, auto-reveal, stale threshold.
- **Integrations** — Tasks plugin, update check, install latest release.
```

- [ ] **Step 2:** Verify each anchor section exists from prior phases' README updates. Fix any missing.

- [ ] **Step 3:** Commit `docs: cross-link README features and settings`.

---

### Task 3: Dataview rollup snippet (Phase 13 cut replacement)

- [ ] **Step 1:** Add to README:

```markdown
### Daily task rollup (Dataview)

Quick Reminder doesn't ship a built-in daily rollup command. If you have the Dataview plugin installed, paste this into your daily note template:

```dataview
TASK
FROM "" 
WHERE !completed
GROUP BY file.folder
SORT priority DESC, due ASC
```

This renders all incomplete tasks across your vault grouped by folder, sorted by priority then due date. No additional configuration needed.
```

- [ ] **Step 2:** Commit `docs: add Dataview rollup snippet`.

---

### Task 4: CHANGELOG collation

- [ ] **Step 1:** Open `CHANGELOG.md`. Confirm each phase has its entry. Add a top-level summary block:

```markdown
## v0.2.0 — Polish roadmap complete

Polish roadmap landed across 16 phases. Highlights:
- Safe edits via vault.process and hash-trio verification.
- New task / inline edit / move-on-status / completion timestamps.
- Priority + due chips, sort, filter, saved views, project nav rail.
- Keyboard shortcuts, bulk actions, stale detection.
- Orphan cleanup, health page, archive-vs-delete.

Cuts:
- Daily rollup → use the Dataview snippet in README.
- Kanban lanes → use the official Kanban plugin.

See per-phase entries below.
```

- [ ] **Step 2:** Bump version to v0.2.0 in manifest + package.

- [ ] **Step 3:** Commit `chore: bump to v0.2.0 — polish roadmap complete`.

---

### Task 5: Tag the release

- [ ] **Step 1:** Tag and push:

```bash
git tag v0.2.0
git push origin main --tags
```

- [ ] **Step 2:** Draft a GitHub release with the v0.2.0 CHANGELOG block as the body.

## Verification

- [ ] All 16 phases shipped.
- [ ] Screenshots present.
- [ ] README cross-linked, Dataview snippet included.
- [ ] CHANGELOG collated.
- [ ] v0.2.0 tagged.
- [ ] GitHub release published.

## Roadmap retrospective

After v0.2.0 ships, dogfood for 2-3 weeks before deciding whether to:
- Revisit cut Phase 17 (kanban) if visual triage proves insufficient with Phase 4 + 9.
- Revisit cut Phase 13 (rollup) if Dataview snippet proves insufficient.
- Plan v0.3.0 around feedback gathered during dogfood period.
