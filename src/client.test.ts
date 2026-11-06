import assert from "node:assert/strict";
import { test } from "node:test";

import React from "react";
import { act, create } from "react-test-renderer";

import { SiwcSettingsPage } from "./clientView.ts";

import type { SiwcStatus } from "./settingsContract.ts";
import type { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";

function form<T extends object>(value: T) {
  const writes: [string, unknown][] = [];
  const listeners = new Set<() => void>();
  let snapshot = {
    status: "ready" as const,
    value,
    base: {},
    user: {},
    revision: 1,
    writable: true,
  };
  const scope: ConfigForm<T> = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: async (field, next) => {
      writes.push([field, next]);
      snapshot = {
        ...snapshot,
        value: { ...snapshot.value, [field]: next },
        revision: snapshot.revision + 1,
      };
      listeners.forEach((listener) => listener());
      return true;
    },
    unset: async (field) => {
      writes.push([field, undefined]);
      return true;
    },
    mutate: async () => {
      throw new Error("not used");
    },
  };
  return { scope, writes };
}
const status: SiwcStatus = {
  account: { id: "one", label: "one@example.test (one)" },
  models: [
    { id: "model-one", name: "Model One" },
    { id: "model-two", name: "Model Two" },
  ],
  usageUrl: "https://chatgpt.com/settings/usage",
};

test("Settings keep the normal view concise and account actions grouped", async () => {
  const siwc = form({ searchModel: "model-one" });
  const web = form({ searchProvider: "siwc" });
  let view: ReturnType<typeof create>;
  await act(async () => {
    view = create(
      React.createElement(SiwcSettingsPage, {
        form: siwc.scope,
        web: web.scope,
        loadStatus: async () => status,
      }),
    );
  });
  const content = JSON.stringify(view!.toJSON());
  assert.doesNotMatch(
    content,
    /The search model is separate|Availability depends|Saving a model does not change/,
  );
  const accountActions = view!.root.findAllByProps({ className: "siwc-actions" })[0]!;
  assert.equal(accountActions.findByType("button").children.join(""), "Refresh account");
  assert.equal(accountActions.findByType("a").props.href, status.usageUrl);
  const groups = view!.root.findAllByProps({ className: "siwc-group" });
  assert.deepEqual(
    groups.map((group) => group.children.map((child) => typeof child === "object" && child.type)),
    [
      ["h3", "p", "div"],
      ["label", "p", "select"],
      ["h3", "p", "div"],
    ],
  );
  const modelDescription = groups[1]!.findByProps({ className: "siwc-hint" });
  assert.equal(
    modelDescription.props.id,
    view!.root.findByType("select").props["aria-describedby"],
  );
  for (const group of [groups[0]!, groups[2]!]) {
    const state = group.findByProps({ className: "siwc-state" });
    assert.equal(state.props.role, "status");
  }
  assert.match(content, /ChatGPT plan/);
  await act(async () => view!.unmount());
});

test("Settings select account models without automatically changing search provider", async () => {
  const siwc = form({ searchModel: "" });
  const web = form({ searchProvider: "deepseek-official", fetchProvider: "http" });
  let view: ReturnType<typeof create>;
  await act(async () => {
    view = create(
      React.createElement(SiwcSettingsPage, {
        form: siwc.scope,
        web: web.scope,
        loadStatus: async () => status,
      }),
    );
  });
  assert.deepEqual(siwc.writes, []);
  assert.deepEqual(web.writes, []);
  const select = view!.root.findByType("select");
  assert.deepEqual(
    select.findAllByType("option").map((node) => node.props.value),
    ["", "model-one", "model-two"],
  );
  await act(async () => {
    await select.props.onChange({ currentTarget: { value: "model-two" } });
  });
  assert.deepEqual(siwc.writes, [["searchModel", "model-two"]]);
  const use = view!.root
    .findAllByType("button")
    .find((node) => node.props["data-action"] === "use-siwc")!;
  assert.equal(use.props.disabled, false);
  await act(async () => {
    await use.props.onClick();
  });
  assert.deepEqual(web.writes, [["searchProvider", "siwc"]]);
  assert.equal(web.scope.getSnapshot().value?.fetchProvider, "http");
  assert.ok(JSON.stringify(view!.toJSON()).includes("one@example.test"));
  assert.equal(view!.root.findByType("a").props.href, status.usageUrl);
  await act(async () => view!.unmount());
});

test("Settings distinguish status failures from sign-out and refresh on connection reset", async () => {
  const siwc = form({ searchModel: "model-one" });
  const web = form<{ searchProvider?: string }>({});
  let reset: (() => void) | undefined;
  let signal: AbortSignal | undefined;
  let calls = 0;
  let disposed = false;
  let view: ReturnType<typeof create>;
  await act(async () => {
    view = create(
      React.createElement(SiwcSettingsPage, {
        form: siwc.scope,
        web: web.scope,
        subscribeReset: (listener) => {
          reset = listener;
          return () => {
            disposed = true;
          };
        },
        loadStatus: async (nextSignal) => {
          signal = nextSignal;
          if (++calls === 1) throw new Error("transport unavailable");
          return status;
        },
      }),
    );
  });
  assert.match(JSON.stringify(view!.toJSON()), /Account status unavailable/);
  assert.doesNotMatch(JSON.stringify(view!.toJSON()), /Not signed in|chatgpt login/);
  assert.ok(view!.root.findByProps({ role: "alert" }));
  await act(async () => reset!());
  assert.equal(calls, 2);
  assert.match(JSON.stringify(view!.toJSON()), /one@example.test/);
  assert.match(JSON.stringify(view!.toJSON()), /default may select SIWC automatically/);
  assert.deepEqual(web.writes, []);
  await act(async () => view!.unmount());
  assert.equal(signal?.aborted, true);
  assert.equal(disposed, true);
});

test("Settings restore the host default and respect read-only forms", async () => {
  const siwc = form({ searchModel: "model-one" });
  const web = form({ searchProvider: "siwc", fetchProvider: "http" });
  let view: ReturnType<typeof create>;
  await act(async () => {
    view = create(
      React.createElement(SiwcSettingsPage, {
        form: siwc.scope,
        web: web.scope,
        loadStatus: async () => status,
      }),
    );
  });
  const restore = view!.root
    .findAllByType("button")
    .find((node) => node.children.includes("Restore deployment default"))!;
  await act(async () => {
    await restore.props.onClick();
  });
  assert.deepEqual(web.writes, [["searchProvider", undefined]]);
  assert.equal(web.scope.getSnapshot().value?.fetchProvider, "http");
  await act(async () => view!.unmount());
  const snapshot = { ...siwc.scope.getSnapshot(), writable: false };
  siwc.scope.getSnapshot = () => snapshot;
  await act(async () => {
    view = create(
      React.createElement(SiwcSettingsPage, {
        form: siwc.scope,
        web: web.scope,
        loadStatus: async () => status,
      }),
    );
  });
  assert.equal(view!.root.findByType("select").props.disabled, true);
  assert.match(JSON.stringify(view!.toJSON()), /read-only/);
  await act(async () => view!.unmount());
});

test("Settings require reselection after an account model becomes unavailable", async () => {
  const siwc = form({ searchModel: "model-no-longer-available" });
  const web = form({ searchProvider: "deepseek-official" });
  let view: ReturnType<typeof create>;
  await act(async () => {
    view = create(
      React.createElement(SiwcSettingsPage, {
        form: siwc.scope,
        web: web.scope,
        loadStatus: async () => status,
      }),
    );
  });
  assert.equal(view!.root.findByType("select").props.value, "");
  const use = view!.root
    .findAllByType("button")
    .find((node) => node.props["data-action"] === "use-siwc")!;
  assert.equal(use.props.disabled, true);
  assert.match(JSON.stringify(view!.toJSON()), /select.*model|モデル.*選択/i);
  assert.deepEqual(siwc.writes, []);
  assert.deepEqual(web.writes, []);
  await act(async () => view!.unmount());
});

test("Settings surface refused writes and signed-out status without a billing fallback", async () => {
  const siwc = form({ searchModel: "model-one" });
  const web = form({ searchProvider: "deepseek-official" });
  web.scope.set = async () => false;
  let view: ReturnType<typeof create>;
  await act(async () => {
    view = create(
      React.createElement(SiwcSettingsPage, {
        form: siwc.scope,
        web: web.scope,
        loadStatus: async () => status,
      }),
    );
  });
  const use = view!.root
    .findAllByType("button")
    .find((node) => node.props["data-action"] === "use-siwc")!;
  await act(async () => {
    await use.props.onClick();
  });
  assert.ok(view!.root.findByProps({ role: "alert" }));
  await act(async () => view!.unmount());
  await act(async () => {
    view = create(
      React.createElement(SiwcSettingsPage, {
        form: siwc.scope,
        web: web.scope,
        loadStatus: async () => ({ models: [], usageUrl: status.usageUrl }),
      }),
    );
  });
  assert.equal(view!.root.findByType("select").props.disabled, true);
  assert.match(JSON.stringify(view!.toJSON()), /chatgpt login/);
  assert.deepEqual(web.writes, []);
  await act(async () => view!.unmount());
});
