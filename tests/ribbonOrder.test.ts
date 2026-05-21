import test from "node:test";
import assert from "node:assert/strict";
import {
  getRibbonIconIndex,
  restoreRibbonIconIndex,
  shouldManageRibbonIconIndex,
} from "../src/lib/ribbon-order";

test("restoreRibbonIconIndex moves a ribbon icon back to its saved position", () => {
  const parent = new MockParent();
  const first = new MockElement(parent);
  const reminder = new MockElement(parent);
  const last = new MockElement(parent);
  parent.children.push(first, last, reminder);

  restoreRibbonIconIndex(reminder as never, 1);

  assert.deepEqual(parent.children, [first, reminder, last]);
  assert.equal(getRibbonIconIndex(reminder as never), 1);
});

test("restoreRibbonIconIndex clamps positions past the end", () => {
  const parent = new MockParent();
  const reminder = new MockElement(parent);
  const other = new MockElement(parent);
  parent.children.push(reminder, other);

  restoreRibbonIconIndex(reminder as never, 20);

  assert.deepEqual(parent.children, [other, reminder]);
  assert.equal(getRibbonIconIndex(reminder as never), 1);
});

test("shouldManageRibbonIconIndex leaves mobile placement to Obsidian", () => {
  assert.equal(shouldManageRibbonIconIndex(true), false);
  assert.equal(shouldManageRibbonIconIndex(false), true);
});

class MockParent {
  children: MockElement[] = [];

  insertBefore(element: MockElement, target: MockElement | null): void {
    this.children = this.children.filter((child) => child !== element);
    const targetIndex = target ? this.children.indexOf(target) : -1;
    if (targetIndex === -1) {
      this.children.push(element);
    } else {
      this.children.splice(targetIndex, 0, element);
    }
  }
}

class MockElement {
  constructor(public parentElement: MockParent) {}
}
