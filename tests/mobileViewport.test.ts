import test from "node:test";
import assert from "node:assert/strict";
import { shouldUseMobileTaskViewport } from "../src/lib/viewHelpers";

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
