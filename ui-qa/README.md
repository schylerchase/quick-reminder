# Quick Reminder UI QA

Free local checks for mobile UX regressions:

- Playwright mobile interaction tests.
- Playwright screenshot baselines.
- axe accessibility scans.
- A static Obsidian-like harness that loads the real `styles.css`.

Run:

```bash
npm run ui-qa
```

Refresh screenshots after an intentional UI change:

```bash
npm run ui-qa:update
```

Install a browser if Playwright reports that Chromium is missing:

```bash
npx playwright install chromium
```

The harness is intentionally small. Add a new `data-qa` scenario when a mobile bug reaches the phone before tests catch it.
