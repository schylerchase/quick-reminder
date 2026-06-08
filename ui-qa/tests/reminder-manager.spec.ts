import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const scenarioUrl = pathToFileURL(
  path.join(__dirname, "../scenarios/reminder-manager.html"),
).toString();

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(scenarioUrl);
});

test("reminder manager exposes lifecycle actions on a phone viewport", async ({ page }) => {
  const manager = page.locator("[data-qa='reminder-manager']");
  const pending = page.locator("[aria-labelledby='pending-reminders']");
  const history = page.locator("[aria-labelledby='history-reminders']");

  await expect(manager.getByRole("heading", { name: "Reminders", exact: true })).toBeVisible();
  await expect(manager.getByRole("heading", { name: "Pending reminders" })).toBeVisible();
  await expect(manager.getByRole("heading", { name: "Completed and notified" })).toBeVisible();

  for (const name of ["Done", "Snooze 15m", "Edit", "Delete"]) {
    await expect(pending.getByRole("button", { name })).toBeVisible();
  }

  for (const name of ["Restore", "Re-add", "Delete"]) {
    await expect(history.getByRole("button", { name })).toBeVisible();
  }

  const overflowing = await manager.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflowing).toBe(false);
});

test("reminder manager has no serious accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .include("[data-qa='fixture-root']")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const serious = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious).toEqual([]);
});
