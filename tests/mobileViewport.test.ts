import test from "node:test";
import assert from "node:assert/strict";
import * as viewHelpers from "../src/lib/viewHelpers";

const { shouldUseMobileTaskViewport } = viewHelpers;

test.afterEach(() => {
  delete (globalThis as typeof globalThis & { document?: unknown }).document;
  delete (globalThis as typeof globalThis & { window?: unknown }).window;
});

test("mobile task layout is for phone-sized surfaces, not all Obsidian mobile app surfaces", () => {
  installViewport({ bodyClasses: ["is-mobile"], matchesNarrow: false });

  assert.equal(shouldUseMobileTaskViewport(), false);
});

test("mobile task layout stays enabled for phone class and narrow viewports", () => {
  installViewport({ bodyClasses: ["is-mobile", "is-phone"], matchesNarrow: false });
  assert.equal(shouldUseMobileTaskViewport(), true);

  installViewport({ bodyClasses: [], matchesNarrow: true });
  assert.equal(shouldUseMobileTaskViewport(), true);
});

test("task editing uses Quick Reminder native surface on iPad-class Obsidian mobile", () => {
  const shouldUseNativeTaskEditingSurface = (
    viewHelpers as typeof viewHelpers & {
      shouldUseNativeTaskEditingSurface?: () => boolean;
    }
  ).shouldUseNativeTaskEditingSurface;
  assert.equal(typeof shouldUseNativeTaskEditingSurface, "function");

  installViewport({ bodyClasses: ["is-mobile"], matchesNarrow: false });
  assert.equal(shouldUseNativeTaskEditingSurface(), true);
});

test("task editing can use external Tasks plugin editor on desktop surfaces", () => {
  const shouldUseNativeTaskEditingSurface = (
    viewHelpers as typeof viewHelpers & {
      shouldUseNativeTaskEditingSurface?: () => boolean;
    }
  ).shouldUseNativeTaskEditingSurface;
  assert.equal(typeof shouldUseNativeTaskEditingSurface, "function");

  installViewport({ bodyClasses: [], matchesNarrow: false });
  assert.equal(shouldUseNativeTaskEditingSurface(), false);
});

function installViewport(options: {
  bodyClasses: string[];
  matchesNarrow: boolean;
}): void {
  const classSet = new Set(options.bodyClasses);
  (globalThis as typeof globalThis & { document: unknown }).document = {
    body: {
      classList: {
        contains: (name: string) => classSet.has(name),
      },
    },
  };
  (globalThis as typeof globalThis & { window: unknown }).window = {
    matchMedia: () => ({ matches: options.matchesNarrow }),
  };
}
