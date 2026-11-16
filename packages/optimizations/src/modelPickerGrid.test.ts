import assert from "node:assert/strict";
import { test } from "node:test";

import { MODEL_PICKER_GRID_STYLES, modelPickerGrid } from "./features/modelPickerGrid.ts";

test("the picker popup gets a viewport-following width with room for columns", () => {
  assert.match(MODEL_PICKER_GRID_STYLES, /width: min\(660px, calc\(100vw - 32px\)\) !important;/);
  assert.match(MODEL_PICKER_GRID_STYLES, /max-width: none !important;/);
});

test("each model group lays its options out in equal columns that follow the viewport", () => {
  assert.match(MODEL_PICKER_GRID_STYLES, /repeat\(auto-fill, minmax\(min\(164px, 100%\), 1fr\)\)/);
});

test("group anchors span the full row so headings stay above their models", () => {
  assert.match(
    MODEL_PICKER_GRID_STYLES,
    /\[data-menu-group-start\],\n\[data-menu-group-heading\] \{ grid-column: 1 \/ -1; \}/,
  );
});

test("columns may shrink below their content so long names ellipsize", () => {
  assert.match(MODEL_PICKER_GRID_STYLES, /min-width: 0;/);
});

test("styles anchor on the picker's ARIA and data attributes, never on hashed classes", () => {
  assert.doesNotMatch(MODEL_PICKER_GRID_STYLES, /\.[_a-zA-Z][\w-]*_\w+_/);
  for (const anchor of [
    '[role="group"][aria-label="Model and reasoning effort"]',
    '[role="menu"][aria-label="Model"]',
    "[data-menu-group]",
    "[data-menu-group-heading]",
    '[role="menuitemradio"]',
  ]) {
    assert.ok(MODEL_PICKER_GRID_STYLES.includes(anchor), `missing anchor: ${anchor}`);
  }
});

test("the plugin installs one owned style element and removes it on cleanup", () => {
  const removed: unknown[] = [];
  const created: { dataset: Record<string, string>; textContent: string; remove(): void }[] = [];
  const head = {
    appended: [] as unknown[],
    append(node: unknown) {
      head.appended.push(node);
    },
  };
  const documentStub = {
    createElement: () => {
      const el = {
        dataset: {} as Record<string, string>,
        textContent: "",
        remove() {
          removed.push(el);
        },
      };
      created.push(el);
      return el;
    },
    head,
  };
  const globals = globalThis as { document?: unknown };
  const previousDocument = globals.document;
  globals.document = documentStub;
  const cleanups: (() => void)[] = [];
  const ctx = {
    effect(effect: () => (() => void) | void) {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
      return () => cleanup?.();
    },
  };
  try {
    modelPickerGrid.apply(ctx as never, undefined);
    assert.equal(created.length, 1, "the feature injects one owned style element");
    assert.equal(created[0].dataset.plugin, "@ph0ryn/dsh-optimizations");
    assert.equal(created[0].dataset.optimizationsFeature, "modelPickerGrid");
    assert.equal(created[0].textContent, MODEL_PICKER_GRID_STYLES);
    assert.equal(head.appended.length, 1);
    assert.deepEqual(removed, [], "nothing is removed before cleanup");
    cleanups.forEach((cleanup) => cleanup());
    assert.deepEqual(removed, created, "cleanup removes the style element");
  } finally {
    if (previousDocument === undefined) delete globals.document;
    else globals.document = previousDocument;
  }
});
