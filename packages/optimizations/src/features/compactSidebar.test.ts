import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { act } from "react-test-renderer";

import { createFakeEffects, installFakeDocument, renderReact } from "../testing.ts";
import {
  COMPACT_SIDEBAR_STYLES,
  SidebarNavRows,
  compactSidebar,
  panelRows,
} from "./compactSidebar.tsx";

import type { StoredEntry } from "@deepseek-ai/dsh-client-ui-slots";

function storedEntry(
  id: string | undefined,
  label: string | (() => string) | undefined,
  order: number,
  icon?: (props: { size: number; active: boolean }) => null,
): StoredEntry {
  return {
    component: icon ?? (() => null),
    options: { id, label, order },
  } as unknown as StoredEntry;
}

function fakeSidebar() {
  const listeners = new Set<() => void>();
  const selectCalls: (string | null)[] = [];
  let activePanelId: string | null = null;
  const layout = {
    panelInfo: {
      getSnapshot: () => ({ activePanelId }),
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    selectPanel(panelId: string | null) {
      selectCalls.push(panelId);
    },
  };
  return {
    layout,
    selectCalls,
    setActive(id: string | null) {
      activePanelId = id;
      for (const listener of listeners) listener();
    },
  };
}

test("panel rows keep registration order and resolve string and thunk labels", () => {
  const slots = {
    entries: () => [
      storedEntry("automation", () => "Automation tasks", 20),
      storedEntry("plugins", "Plugins", 10),
      storedEntry(undefined, "Ignored", 0),
      storedEntry("context", undefined, 30),
    ],
  };
  const rows = panelRows(slots);
  assert.deepEqual(
    rows.map((row) => [row.id, row.label, row.order]),
    [
      ["plugins", "Plugins", 10],
      ["automation", "Automation tasks", 20],
      ["context", "context", 30],
    ],
  );
});

test("SidebarNavRows renders every panel with its icon and selects it on click", async () => {
  const fake = fakeSidebar();
  const iconCalls: { size: number; active: boolean }[] = [];
  const icons = (props: { size: number; active: boolean }) => {
    iconCalls.push(props);
    return null;
  };
  const slots = {
    entries: () => [
      storedEntry("plugins", "Plugins", 10, icons),
      storedEntry("automation", "Automation tasks", 20, icons),
    ],
  };
  let dismissed = 0;
  const renderer = await renderReact(
    createElement(SidebarNavRows, {
      slots,
      layout: fake.layout,
      onDismiss: () => {
        dismissed += 1;
      },
    }),
  );
  try {
    const rows = renderer.root.findAll(
      (node) => node.type === "button" && node.props.role === "menuitem",
    );
    assert.deepEqual(
      rows.map((row) => row.props.children[1].props.children),
      ["Plugins", "Automation tasks"],
    );
    assert.deepEqual(
      iconCalls.map((call) => call.size),
      [16, 16],
    );
    await act(async () => {
      rows[1].props.onClick();
    });
    assert.deepEqual(fake.selectCalls, ["automation"]);
    assert.equal(dismissed, 1);
  } finally {
    renderer.unmount();
  }
});

test("the active panel row is announced with aria-current", async () => {
  const fake = fakeSidebar();
  const slots = {
    entries: () => [
      storedEntry("plugins", "Plugins", 10),
      storedEntry("automation", "Automation tasks", 20),
    ],
  };
  const renderer = await renderReact(
    createElement(SidebarNavRows, {
      slots,
      layout: fake.layout,
      onDismiss: () => {},
    }),
  );
  try {
    await act(async () => {
      fake.setActive("automation");
    });
    const rows = renderer.root.findAll(
      (node) => node.type === "button" && node.props.role === "menuitem",
    );
    assert.deepEqual(
      rows.map((row) => row.props["aria-current"]),
      [undefined, "true"],
    );
  } finally {
    renderer.unmount();
  }
});

test("the feature moves the native controls with CSS instead of restyling them", () => {
  assert.match(COMPACT_SIDEBAR_STYLES, /@container \(min-width: 200px\)/);
  assert.match(
    COMPACT_SIDEBAR_STYLES,
    /\[data-slot="sidebar\.brand\.name"\] \{ display: none !important; \}/,
  );
  // DSH 0.2.1: the New Session button is a direct child of the sidebar root,
  // and the panel rows are direct button children of nav.
  assert.match(
    COMPACT_SIDEBAR_STYLES,
    /\[data-slot="sidebar"\] > div > button[^{]*\{[\s\S]*position: absolute;/,
  );
  assert.match(
    COMPACT_SIDEBAR_STYLES,
    /\[data-slot="sidebar"\] nav > button,\n  \[data-slot="sidebar"\] nav > div \{ display: none; \}/,
  );
  // DSH 0.2.2: New Session moved behind the sidebar.session.action HOC, and
  // the panel rows are wrapped in divs inside scrollRegion > scrollArea.
  assert.match(COMPACT_SIDEBAR_STYLES, /\[data-slot="sidebar\.session\.action"\] > button/);
  assert.match(
    COMPACT_SIDEBAR_STYLES,
    /\[data-slot="sidebar"\] > div > div:has\(nav\) \{ position: static; \}/,
  );
  assert.match(COMPACT_SIDEBAR_STYLES, /\[data-slot="sidebar"\] nav > span \{ position: absolute;/);
});

test("the plugin registers its menu rows and installs cleanup-owning styles", () => {
  const doc = installFakeDocument();
  const effects = createFakeEffects();
  const registered: { options: Record<string, unknown>; component: unknown }[] = [];
  let unregistered = 0;
  const fake = fakeSidebar();
  const ctx = {
    effect: effects.effect,
    slots: {
      inject(_key: string, callback: () => () => void) {
        return callback();
      },
      register(options: Record<string, unknown>, component: unknown) {
        registered.push({ options, component });
        return () => {
          unregistered += 1;
        };
      },
    },
    layout: fake.layout,
  };
  try {
    compactSidebar.apply(ctx as never, undefined);
    assert.equal(doc.head.appended.length, 1, "the feature injects one owned style element");
    assert.equal(doc.created[0].dataset.plugin, "@ph0ryn/dsh-optimizations");
    assert.equal(doc.created[0].dataset.optimizationsFeature, "compactSidebar");
    assert.equal(registered.length, 1);
    assert.equal(registered[0].options.name, "sidebar.panellist.actions");
    assert.equal(registered[0].options.id, "optimizations-sidebar-nav");
    assert.equal(registered[0].options.order, -100);
    assert.equal(registered[0].component, SidebarNavRows);
    for (const cleanup of effects.cleanups) cleanup();
    assert.deepEqual(doc.removed, doc.created, "cleanup removes the style element");
    assert.equal(unregistered, 1, "cleanup unregisters the menu rows");
  } finally {
    doc.restore();
  }
});
