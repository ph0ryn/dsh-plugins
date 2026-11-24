import assert from "node:assert/strict";
import { test } from "node:test";

import React from "react";
import { act, create } from "react-test-renderer";

import { SiwcSettingsPage } from "./clientView.ts";

import type { SiwcActionResult, SiwcStatus } from "./settingsContract.ts";
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
  const publish = () => listeners.forEach((listener) => listener());
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
      publish();
      return true;
    },
    unset: async (field) => {
      writes.push([field, undefined]);
      const next = { ...snapshot.value } as Record<string, unknown>;
      delete next[field];
      snapshot = { ...snapshot, value: next as T, revision: snapshot.revision + 1 };
      publish();
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
  accounts: [
    { id: "one", label: "one@example.test (one)", active: true, signedIn: true },
    { id: "two", label: "two@example.test (two)", active: false, signedIn: true },
  ],
  models: [
    { id: "model-one", name: "Model One" },
    { id: "model-two", name: "Model Two" },
  ],
  usageUrl: "https://chatgpt.com/settings/usage",
};

function text(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  if (node && typeof node === "object" && "children" in node)
    return text((node as { children: unknown[] }).children);
  return "";
}

function actions() {
  const calls: [string, ...unknown[]][] = [];
  const action =
    (name: string, value: SiwcStatus = status) =>
    async (arg?: unknown) => {
      calls.push(arg === undefined ? [name] : [name, arg]);
      return { status: value };
    };
  return {
    calls,
    authorize: async (method: "oauth" | "select", accountId?: string) => {
      calls.push(["authorize", method, accountId]);
      return {
        status: {
          ...status,
          attempt: {
            id: "attempt-one",
            method,
            phase: "running",
            notice: {
              message: "Continue with ChatGPT",
              url: "http://127.0.0.1:4321/auth/start?state=fixture",
            },
          },
        },
      } satisfies SiwcActionResult;
    },
    answer: action("answer"),
    cancel: action("cancel", {
      ...status,
      attempt: { id: "attempt-one", method: "oauth", phase: "cancelled" },
    }),
    logout: action("logout", {
      accounts: [{ id: "one", label: "one@example.test (one)", active: false, signedIn: false }],
      models: [],
      usageUrl: status.usageUrl,
    }),
  };
}

async function mount(
  siwc: ConfigForm<{ searchModel?: string }> = form({ searchModel: "model-one" }).scope,
  web: ConfigForm<{ searchProvider?: string; fetchProvider?: string }> = form({
    searchProvider: "siwc",
  }).scope,
  overrides: Partial<React.ComponentProps<typeof SiwcSettingsPage>> = {},
) {
  let view!: ReturnType<typeof create>;
  await act(async () => {
    view = create(
      React.createElement(SiwcSettingsPage, {
        form: siwc,
        web,
        loadStatus: async () => status,
        ...actions(),
        ...overrides,
      }),
    );
  });
  return view;
}

function button(view: ReturnType<typeof create>, label: string) {
  const found = view.root.findAllByType("button").find((node) => text(node) === label);
  assert.ok(found, `Missing button: ${label}`);
  return found;
}

test("Settings center the account and place icon refresh beside the identity", async () => {
  const view = await mount();
  const content = JSON.stringify(view.toJSON());
  assert.match(content, /one@example\.test/);
  assert.match(content, /ChatGPT plan/);
  assert.doesNotMatch(text(view.root), /\/chatgpt|Refresh account/);
  const identity = view.root.findByProps({ className: "siwc-account-line" });
  assert.deepEqual(
    identity.children.map((child) => (typeof child === "string" ? child : child.type)),
    ["p", "button"],
  );
  const refresh = identity.findByProps({ "data-action": "refresh-account" });
  assert.equal(refresh.props["aria-label"], "Refresh account");
  assert.equal(refresh.props.title, "Refresh account");
  assert.equal(refresh.findAllByType("svg").length, 1);
  assert.equal(text(button(view, "Add account")), "Add account");
  assert.equal(text(button(view, "Sign out")), "Sign out");
  assert.equal(view.root.findByType("a").props.href, status.usageUrl);
  assert.equal(view.root.findAllByProps({ className: "siwc-group" }).length, 3);
  await act(async () => view.unmount());
});

test("Settings select account models without automatically changing search provider", async () => {
  const siwc = form({ searchModel: "" });
  const web = form({ searchProvider: "deepseek-official", fetchProvider: "http" });
  const view = await mount(siwc.scope, web.scope);
  assert.deepEqual(siwc.writes, []);
  assert.deepEqual(web.writes, []);
  const select = view.root.findByType("select");
  assert.deepEqual(
    select.findAllByType("option").map((node) => node.props.value),
    ["", "model-one", "model-two"],
  );
  await act(async () => {
    await select.props.onChange({ currentTarget: { value: "model-two" } });
  });
  assert.deepEqual(siwc.writes, [["searchModel", "model-two"]]);
  const use = view.root.findByProps({ "data-action": "use-siwc" });
  assert.equal(use.props.disabled, false);
  await act(async () => use.props.onClick());
  assert.deepEqual(web.writes, [["searchProvider", "siwc"]]);
  assert.equal(web.scope.getSnapshot().value?.fetchProvider, "http");
  await act(async () => view.unmount());
});

test("Settings distinguish status failures from sign-out and refresh on connection reset", async () => {
  const siwc = form({ searchModel: "model-one" });
  const web = form<{ searchProvider?: string }>({});
  let reset: (() => void) | undefined;
  let signal: AbortSignal | undefined;
  let calls = 0;
  let disposed = false;
  const view = await mount(siwc.scope, web.scope, {
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
  });
  assert.match(JSON.stringify(view.toJSON()), /Could not load your ChatGPT account/);
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /Not signed in|chatgpt login/);
  assert.ok(view.root.findByProps({ role: "alert" }));
  await act(async () => reset!());
  assert.equal(calls, 2);
  assert.match(JSON.stringify(view.toJSON()), /one@example.test/);
  assert.deepEqual(web.writes, []);
  await act(async () => view.unmount());
  assert.equal(signal?.aborted, true);
  assert.equal(disposed, true);
});

test("Settings restore the host default and respect read-only forms", async () => {
  const siwc = form({ searchModel: "model-one" });
  const web = form({ searchProvider: "siwc", fetchProvider: "http" });
  const view = await mount(siwc.scope, web.scope);
  const restore = button(view, "Restore deployment default");
  await act(async () => restore.props.onClick());
  assert.deepEqual(web.writes, [["searchProvider", undefined]]);
  assert.equal(web.scope.getSnapshot().value?.fetchProvider, "http");
  await act(async () => view.unmount());
  const snapshot = { ...siwc.scope.getSnapshot(), writable: false };
  siwc.scope.getSnapshot = () => snapshot;
  const readOnly = await mount(siwc.scope, web.scope);
  assert.equal(readOnly.root.findByType("select").props.disabled, true);
  assert.match(JSON.stringify(readOnly.toJSON()), /read-only/);
  await act(async () => readOnly.unmount());
});

test("Settings require reselection after an account model becomes unavailable", async () => {
  const siwc = form({ searchModel: "model-no-longer-available" });
  const web = form({ searchProvider: "deepseek-official" });
  const view = await mount(siwc.scope, web.scope);
  assert.equal(view.root.findByType("select").props.value, "");
  const use = view.root.findByProps({ "data-action": "use-siwc" });
  assert.equal(use.props.disabled, true);
  assert.match(JSON.stringify(view.toJSON()), /Select a search model/i);
  assert.deepEqual(siwc.writes, []);
  assert.deepEqual(web.writes, []);
  await act(async () => view.unmount());
});

test("Settings surface refused writes and signed-out status without a billing fallback", async () => {
  const siwc = form({ searchModel: "model-one" });
  const web = form({ searchProvider: "deepseek-official" });
  web.scope.set = async () => false;
  const view = await mount(siwc.scope, web.scope);
  const use = view.root.findByProps({ "data-action": "use-siwc" });
  await act(async () => use.props.onClick());
  assert.ok(view.root.findByProps({ role: "alert" }));
  await act(async () => view.unmount());
  const signedOut = await mount(siwc.scope, web.scope, {
    loadStatus: async () => ({
      accounts: [{ id: "one", label: "one@example.test (one)", active: false, signedIn: false }],
      models: [],
      usageUrl: status.usageUrl,
    }),
  });
  assert.equal(signedOut.root.findByType("select").props.disabled, true);
  assert.equal(text(button(signedOut, "Sign in with ChatGPT")), "Sign in with ChatGPT");
  assert.match(JSON.stringify(signedOut.toJSON()), /Reconnect/);
  assert.deepEqual(web.writes, []);
  await act(async () => signedOut.unmount());
});

test("Settings start and cancel OAuth without leaving the page", async () => {
  const accountActions = actions();
  const view = await mount(undefined, undefined, accountActions);
  await act(async () => button(view, "Add account").props.onClick());
  assert.deepEqual(accountActions.calls, [["authorize", "oauth", "new"]]);
  assert.match(JSON.stringify(view.toJSON()), /Connecting account/);
  const link = view.root
    .findAllByType("a")
    .find((node) => node.props.href === "http://127.0.0.1:4321/auth/start?state=fixture")!;
  assert.equal(link.props.target, "_blank");
  await act(async () => button(view, "Cancel sign-in").props.onClick());
  assert.deepEqual(accountActions.calls.at(-1), ["cancel"]);
  assert.match(JSON.stringify(view.toJSON()), /Sign-in cancelled/);
  await act(async () => view.unmount());
});

test("Settings switch or reconnect saved accounts inline", async () => {
  const accountActions = actions();
  const view = await mount(undefined, undefined, accountActions);
  const switchButton = view.root.findByProps({ "data-action": "switch-account" });
  await act(async () => switchButton.props.onClick());
  assert.deepEqual(accountActions.calls.at(-1), ["authorize", "select", "two"]);
  await act(async () => view.unmount());

  const accountStatus: SiwcStatus = {
    ...status,
    account: undefined,
    accounts: [
      { id: "one", label: "one@example.test (one)", active: false, signedIn: false },
      { id: "two", label: "two@example.test (two)", active: true, signedIn: true },
    ],
  };
  const reconnect = await mount(undefined, undefined, {
    ...accountActions,
    loadStatus: async () => accountStatus,
  });
  await act(async () =>
    reconnect.root.findByProps({ "data-action": "reconnect-account" }).props.onClick(),
  );
  assert.deepEqual(accountActions.calls.at(-1), ["authorize", "oauth", "one"]);
  await act(async () => reconnect.unmount());
});

test("Settings answer account choices and confirm sign out before deleting tokens", async () => {
  const accountActions = actions();
  const prompted: SiwcStatus = {
    ...status,
    attempt: {
      id: "attempt-one",
      method: "oauth",
      phase: "running",
      prompt: {
        kind: "select",
        message: "Choose your ChatGPT account",
        options: [
          { id: "one", label: "one@example.test (one)" },
          { id: "new", label: "Add ChatGPT account or workspace" },
        ],
      },
    },
  };
  const view = await mount(undefined, undefined, {
    ...accountActions,
    loadStatus: async () => prompted,
  });
  await act(async () => button(view, "Add ChatGPT account or workspace").props.onClick());
  assert.deepEqual(accountActions.calls, [["answer", "new"]]);
  await act(async () => view.unmount());

  const confirmView = await mount(undefined, undefined, accountActions);
  accountActions.calls.length = 0;
  await act(async () => button(confirmView, "Sign out").props.onClick());
  assert.deepEqual(accountActions.calls, []);
  assert.ok(confirmView.root.findByProps({ role: "group", "aria-label": "Confirm sign out" }));
  const confirmButtons = confirmView.root
    .findAllByProps({ role: "group", "aria-label": "Confirm sign out" })[0]!
    .findAllByType("button");
  await act(async () => confirmButtons.find((node) => text(node) === "Sign out")!.props.onClick());
  assert.deepEqual(accountActions.calls, [["logout"]]);
  assert.match(JSON.stringify(confirmView.toJSON()), /Not signed in/);
  await act(async () => confirmView.unmount());
});
