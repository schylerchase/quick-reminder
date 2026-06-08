import test from "node:test";
import assert from "node:assert/strict";
import {
  getProjectCreateFailedNotice,
  getProjectCreateRefreshFailedNotice,
  getProjectCreatedNotice,
  getProjectMarkdownCopiedNotice,
  getProjectMarkdownCopyFailedNotice,
  getProjectTargetExistsNotice,
} from "../src/lib/projectPlannerMessages";
import { runProjectNoteCreateWorkflow } from "../src/lib/projectPlannerWorkflow";

test("project planner create workflow reports vault create failure without refresh work", async () => {
  let refreshed = false;
  const createError = new Error("vault create failed");
  let captured: unknown = null;

  const result = await runProjectNoteCreateWorkflow({
    createNote: async () => {
      throw createError;
    },
    afterCreate: async () => {
      refreshed = true;
    },
    onCreateError: (error) => {
      captured = error;
    },
  });

  assert.deepEqual(result, { ok: false, created: false, error: createError });
  assert.equal(refreshed, false);
  assert.equal(captured, createError);
});

test("project planner create workflow blocks existing targets before create work", async () => {
  let created = false;
  let refreshed = false;
  let captured = false;

  const result = await runProjectNoteCreateWorkflow({
    targetExists: () => true,
    createNote: async () => {
      created = true;
      return { path: "Projects/Client onboarding.md" };
    },
    afterCreate: async () => {
      refreshed = true;
    },
    onTargetExists: () => {
      captured = true;
    },
  });

  assert.deepEqual(result, {
    ok: false,
    created: false,
    alreadyExists: true,
  });
  assert.equal(created, false);
  assert.equal(refreshed, false);
  assert.equal(captured, true);
});

test("project planner create workflow distinguishes refresh failure after note exists", async () => {
  const file = { path: "Projects/Client onboarding.md" };
  const refreshError = new Error("dashboard refresh failed");
  let captured: unknown = null;

  const result = await runProjectNoteCreateWorkflow({
    createNote: async () => file,
    afterCreate: async () => {
      throw refreshError;
    },
    onAfterCreateError: (error) => {
      captured = error;
    },
  });

  assert.deepEqual(result, {
    ok: false,
    created: true,
    file,
    error: refreshError,
  });
  assert.equal(captured, refreshError);
});

test("project planner create workflow succeeds after note creation and dashboard refresh", async () => {
  const file = { path: "Projects/Client onboarding.md" };
  let refreshed = false;

  const result = await runProjectNoteCreateWorkflow({
    createNote: async () => file,
    afterCreate: async () => {
      refreshed = true;
    },
  });

  assert.deepEqual(result, { ok: true, created: true, file });
  assert.equal(refreshed, true);
});

test("project planner create notices distinguish create and refresh recovery", () => {
  const created = getProjectCreatedNotice("Projects/Client onboarding.md");
  assert.match(created, /project note created/i);
  assert.match(created, /Projects\/Client onboarding\.md/);
  assert.doesNotMatch(created, /console/i);

  const exists = getProjectTargetExistsNotice("Projects/Client onboarding.md");
  assert.match(exists, /will not overwrite/i);
  assert.match(exists, /choose a different/i);
  assert.match(exists, /Projects\/Client onboarding\.md/);

  const failed = getProjectCreateFailedNotice("Projects/Client onboarding.md");
  assert.match(failed, /could not create/i);
  assert.match(failed, /Projects\/Client onboarding\.md/);
  assert.match(failed, /check the folder path/i);

  const refreshFailed = getProjectCreateRefreshFailedNotice("Projects/Client onboarding.md");
  assert.match(refreshFailed, /created/i);
  assert.match(refreshFailed, /could not refresh/i);
  assert.match(refreshFailed, /reload Obsidian/i);
});

test("project planner copy notices keep clipboard failures recoverable", () => {
  assert.match(getProjectMarkdownCopiedNotice(), /project markdown copied/i);

  const failed = getProjectMarkdownCopyFailedNotice();
  assert.match(failed, /could not copy/i);
  assert.match(failed, /select the preview/i);
  assert.doesNotMatch(failed, /console/i);
});
