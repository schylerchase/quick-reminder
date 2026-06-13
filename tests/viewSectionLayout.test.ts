import test from "node:test";
import assert from "node:assert/strict";
import { getDashboardSectionClassNames } from "../src/lib/viewHelpers";

test("dashboard section classes expose a stable slug for responsive layout", () => {
  assert.deepEqual(
    getDashboardSectionClassNames("Completed vault tasks", false),
    ["qr-view-section", "qr-view-section-completed-vault-tasks"],
  );
});

test("dashboard section classes mark empty sections for density rules", () => {
  assert.deepEqual(
    getDashboardSectionClassNames("Upcoming", true),
    ["qr-view-section", "qr-view-section-upcoming", "qr-view-section-empty"],
  );
});
