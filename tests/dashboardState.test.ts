import test from "node:test";
import assert from "node:assert/strict";
import {
  getDashboardOpenFailedNotice,
  getDashboardPaneMissingNotice,
  getDashboardRefreshFailedNotice,
  getDashboardScanFailedNotice,
  getDashboardScanRefreshFailedNotice,
  getDashboardScanSuccessNotice,
  getScopedEmptyTaskAction,
  shouldShowFirstRunActions,
} from "../src/lib/dashboardState";

test("first-run actions show only on an unfiltered empty dashboard", () => {
  assert.equal(
    shouldShowFirstRunActions({
      pendingCount: 0,
      activeTaskCount: 0,
      completedTaskCount: 0,
      ignoredTaskCount: 0,
      search: "",
      sourceFilter: "all",
    }),
    true,
  );

  assert.equal(
    shouldShowFirstRunActions({
      pendingCount: 0,
      activeTaskCount: 1,
      completedTaskCount: 0,
      ignoredTaskCount: 0,
      search: "",
      sourceFilter: "all",
    }),
    false,
  );
});

test("first-run actions stay hidden while filters are active", () => {
  assert.equal(
    shouldShowFirstRunActions({
      pendingCount: 0,
      activeTaskCount: 0,
      completedTaskCount: 0,
      ignoredTaskCount: 0,
      search: "backup",
      sourceFilter: "all",
    }),
    false,
  );

  assert.equal(
    shouldShowFirstRunActions({
      pendingCount: 0,
      activeTaskCount: 0,
      completedTaskCount: 0,
      ignoredTaskCount: 0,
      search: "",
      sourceFilter: "checkbox",
    }),
    false,
  );
});

test("scoped empty task action offers vault fallback when tasks exist elsewhere", () => {
  assert.deepEqual(
    getScopedEmptyTaskAction({
      scope: "active",
      scopedActiveTaskCount: 0,
      vaultActiveTaskCount: 3,
      search: "",
      sourceFilter: "all",
    }),
    {
      label: "Show whole vault",
      nextScope: "vault",
      text: "No tasks in this note.",
    },
  );

  assert.deepEqual(
    getScopedEmptyTaskAction({
      scope: "folder",
      scopedActiveTaskCount: 0,
      vaultActiveTaskCount: 2,
      search: "",
      sourceFilter: "all",
    }),
    {
      label: "Show whole vault",
      nextScope: "vault",
      text: "No tasks in this folder.",
    },
  );
});

test("scoped empty task action stays hidden for filters, vault scope, and true empty vaults", () => {
  assert.equal(
    getScopedEmptyTaskAction({
      scope: "active",
      scopedActiveTaskCount: 0,
      vaultActiveTaskCount: 3,
      search: "invoice",
      sourceFilter: "all",
    }),
    null,
  );

  assert.equal(
    getScopedEmptyTaskAction({
      scope: "active",
      scopedActiveTaskCount: 0,
      vaultActiveTaskCount: 3,
      search: "",
      sourceFilter: "checkbox",
    }),
    null,
  );

  assert.equal(
    getScopedEmptyTaskAction({
      scope: "vault",
      scopedActiveTaskCount: 0,
      vaultActiveTaskCount: 3,
      search: "",
      sourceFilter: "all",
    }),
    null,
  );

  assert.equal(
    getScopedEmptyTaskAction({
      scope: "folder",
      scopedActiveTaskCount: 0,
      vaultActiveTaskCount: 0,
      search: "",
      sourceFilter: "all",
    }),
    null,
  );
});

test("dashboard open failure notices describe the failed surface and next step", () => {
  const dashboardNotice = getDashboardOpenFailedNotice("dashboard");
  assert.match(dashboardNotice, /could not open the dashboard/i);
  assert.match(dashboardNotice, /try again/i);

  const sidebarNotice = getDashboardOpenFailedNotice("sidebar");
  assert.match(sidebarNotice, /could not open the sidebar/i);
  assert.match(sidebarNotice, /command palette/i);

  const paneNotice = getDashboardPaneMissingNotice();
  assert.match(paneNotice, /could not find a note pane/i);
  assert.match(paneNotice, /open any note/i);
});

test("dashboard refresh failure notice says the view already opened", () => {
  const notice = getDashboardRefreshFailedNotice("dashboard");

  assert.match(notice, /dashboard opened/i);
  assert.match(notice, /could not refresh/i);
  assert.match(notice, /scan/i);
});

test("dashboard scan failure notice avoids reporting stale task counts", () => {
  const notice = getDashboardScanFailedNotice();

  assert.match(notice, /could not scan/i);
  assert.match(notice, /try again/i);
  assert.doesNotMatch(notice, /found/i);
});

test("dashboard scan success notice reports the completed scan count", () => {
  assert.equal(getDashboardScanSuccessNotice(1), "Scanned 1 vault task.");
  assert.equal(getDashboardScanSuccessNotice(3), "Scanned 3 vault tasks.");
});

test("dashboard scan refresh failure notice says the scan already completed", () => {
  const notice = getDashboardScanRefreshFailedNotice(9);

  assert.match(notice, /scan found 9/i);
  assert.match(notice, /could not refresh/i);
  assert.match(notice, /reload Obsidian/i);
});
