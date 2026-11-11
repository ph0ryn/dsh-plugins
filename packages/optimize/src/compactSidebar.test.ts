import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { act, create } from "react-test-renderer";

import {
  COMPACT_SIDEBAR_STYLES,
  SidebarNavRows,
  compactSidebar,
  panelRows,
} from "./features/compactSidebar.tsx";

import type { StoredEntry } from "@deepseek-ai/dsh-client-ui-slots";
import type { ReactElement } from "react";
import type { ReactTestRenderer } from "react-test-renderer";

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

async function render(element: ReactElement): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(element);
  });
  assert.ok(renderer, "renderer was not created");
  return renderer;
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
  const renderer = await render(
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
  const renderer = await render(
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
    /\[data-slot="sidebar"\] > div > nav > button \{ display: none; \}/,
  );
  assert.match(
    COMPACT_SIDEBAR_STYLES,
    /\[data-slot="sidebar"\] > div > button \{[\s\S]*position: absolute;/,
  );
  assert.match(
    COMPACT_SIDEBAR_STYLES,
    /\[data-slot="sidebar\.brand\.name"\] \{ display: none !important; \}/,
  );
});

test("the plugin registers its menu rows and installs cleanup-owning styles", () => {
  const head = {
    appended: [] as unknown[],
    append(node: unknown) {
      head.appended.push(node);
    },
  };
  const documentStub = {
    createElement: () => ({
      dataset: {} as Record<string, string>,
      textContent: "",
      remove() {},
    }),
    head,
  };
  const globals = globalThis as { document?: unknown };
  const previousDocument = globals.document;
  globals.document = documentStub;
  const cleanups: (() => void)[] = [];
  const registered: { options: Record<string, unknown>; component: unknown }[] = [];
  const fake = fakeSidebar();
  const ctx = {
    effect(effect: () => (() => void) | void) {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
      return () => cleanup?.();
    },
    slots: {
      inject(_key: string, callback: () => () => void) {
        return callback();
      },
      register(options: Record<string, unknown>, component: unknown) {
        registered.push({ options, component });
        return () => {};
      },
    },
    layout: fake.layout,
  };
  try {
    compactSidebar.apply(ctx as never, undefined);
    assert.equal(head.appended.length, 1, "the feature injects one owned style element");
    assert.equal(registered.length, 1);
    assert.equal(registered[0].options.name, "sidebar.panellist.actions");
    assert.equal(registered[0].options.id, "optimize-sidebar-nav");
    assert.equal(registered[0].options.order, -100);
    assert.equal(registered[0].component, SidebarNavRows);
    cleanups.forEach((cleanup) => cleanup());
    assert.equal(head.appended.length, 1);
  } finally {
    if (previousDocument === undefined) delete globals.document;
    else globals.document = previousDocument;
  }
});
