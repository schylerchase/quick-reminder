import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const scenarioUrl = pathToFileURL(
  path.join(__dirname, "../scenarios/mobile-task-dashboard.html"),
).toString();

test.beforeEach(async ({ page }) => {
  await page.goto(scenarioUrl);
});

test("mobile task cards expand to reveal details and actions", async ({ page }) => {
  const list = page.getByLabel("Open tasks");
  const firstTask = page.locator("[data-qa='task-card']").first();

  await expect(firstTask.locator(".qr-view-row-actions")).toBeHidden();
  await firstTask.locator(".qr-mobile-task-toggle").click();
  await expect(firstTask).toHaveClass(/qr-mobile-task-expanded/);
  await expect(firstTask.locator(".qr-view-row-actions")).toBeVisible();
  await expect(list).toHaveScreenshot("quick-reminder-mobile-task-expanded.png");
});

test("show source closes the mobile drawer", async ({ page }) => {
  const firstTask = page.locator("[data-qa='task-card']").first();

  await firstTask.locator(".qr-mobile-task-toggle").click();
  await page.locator("[data-qa='show-source']").click();

  await expect(page.locator("[data-qa='source-note']")).toBeVisible();
  await expect(page.locator("[data-qa='mobile-drawer']")).not.toHaveClass(/is-open/);
});

test("edit task modal fits a phone viewport without auto-focusing notes", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { showEditModal: () => void }).showEditModal());

  const modal = page.locator("[data-qa='edit-modal']");
  await expect(modal).toBeVisible();
  await expect(page.locator("#qa-task-note")).not.toBeFocused();

  const box = await modal.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(852);
  await expect(page.locator("[data-qa='edit-stage']")).toHaveScreenshot("quick-reminder-mobile-edit-modal.png");
});

test("mobile dashboard has no serious accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .include("[data-qa='fixture-root']")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const serious = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious).toEqual([]);
});
