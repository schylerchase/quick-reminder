import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const scenarioUrl = pathToFileURL(
  path.join(__dirname, "../scenarios/project-planner.html"),
).toString();

test.beforeEach(async ({ page }) => {
  await page.goto(scenarioUrl);
});

test("project planner mobile keeps actions reachable without horizontal overflow", async ({ page }) => {
  const planner = page.locator("[data-qa='project-planner']");
  const actions = page.locator("[data-qa='project-actions']");

  await expect(planner).toBeVisible();
  await expect(actions).toBeVisible();

  const overflowing = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-qa='fixture-root']");
    if (!root) return ["missing fixture root"];
    const rootBox = root.getBoundingClientRect();
    return Array.from(root.querySelectorAll<HTMLElement>("*"))
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && (box.left < rootBox.left - 1 || box.right > rootBox.right + 1);
      })
      .map((node) => node.className || node.tagName);
  });
  expect(overflowing).toEqual([]);

  const actionBox = await actions.boundingBox();
  expect(actionBox).not.toBeNull();
  expect((actionBox?.y ?? 0) + (actionBox?.height ?? 0)).toBeLessThanOrEqual(852);

  await expect(page).toHaveScreenshot("quick-reminder-project-planner-mobile.png");
});

test("project planner desktop keeps outline and preview aligned", async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 800 });
  await page.goto(scenarioUrl);

  const outline = page.locator(".qr-project-outline-field");
  const preview = page.locator(".qr-project-preview-field");
  const outlineBox = await outline.boundingBox();
  const previewBox = await preview.boundingBox();

  expect(outlineBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(Math.abs((outlineBox?.y ?? 0) - (previewBox?.y ?? 0))).toBeLessThanOrEqual(2);

  await expect(page).toHaveScreenshot("quick-reminder-project-planner-desktop.png");
});

test("project planner has no serious accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .include("[data-qa='fixture-root']")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const serious = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious).toEqual([]);
});
