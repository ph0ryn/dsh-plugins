import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { act, create } from "react-test-renderer";

import { PAGE } from "./page/copy.ts";
import { SettingsPageView } from "./page/view.tsx";
import { createFakeForm } from "./testing.ts";

import type { FeatureMeta } from "./features.ts";
import type { FeatureCopy } from "./page/copy.ts";
import type { Button, Input, Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ComponentProps, ReactElement } from "react";
import type { ReactTestInstance, ReactTestRenderer } from "react-test-renderer";

const FEATURES: readonly FeatureMeta[] = [
  { id: "alpha", group: "shell", client: true },
  { id: "beta", group: "host", host: true, reload: "restart" },
  { id: "gamma", group: "conversation", host: true, client: true },
];
const COPY = {
  alpha: { name: "Alpha spacing", description: "Adjusts message spacing." },
  beta: { name: "Beta retention", description: "Keeps session logs longer." },
  gamma: { name: "Gamma badge", description: "Shows a small badge." },
};

type SwitchProps = ComponentProps<typeof Switch>;
type InputProps = ComponentProps<typeof Input>;
type ButtonProps = ComponentProps<typeof Button>;

function StubSwitch({ checked, onChange, label, disabled }: SwitchProps) {
  return createElement("button", {
    "data-test-switch": label,
    "data-checked": String(checked),
    disabled,
    onClick: () => onChange(!checked),
  });
}

function StubInput({ onChange, ...rest }: InputProps) {
  return createElement("input", { ...rest, onChange });
}

function StubButton({ children, ...rest }: ButtonProps) {
  return createElement("button", rest, children);
}

async function render(element: ReactElement): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(element);
  });
  return renderer!;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function view(
  form: ReturnType<typeof createFakeForm>["form"],
  features: readonly FeatureMeta[] = FEATURES,
  copy: Readonly<Record<string, FeatureCopy>> = COPY,
) {
  return createElement(SettingsPageView, {
    form,
    features,
    copy,
    controls: { Switch: StubSwitch, Input: StubInput, Button: StubButton },
  });
}

function textOf(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function buttons(renderer: ReactTestRenderer): ReactTestInstance[] {
  return renderer.root.findAllByType(StubButton);
}

function labeledButton(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const found = buttons(renderer).find((node) => node.props.children === label);
  assert.ok(found, `missing button: ${label}`);
  return found;
}

test("an empty registry renders the empty state and disables bulk actions", async () => {
  const fake = createFakeForm({ schemaVersion: 1 });
  const renderer = await render(view(fake.form, [], {}));
  try {
    const text = textOf(renderer);
    assert.ok(text.includes(PAGE.empty));
    assert.ok(text.includes(PAGE.title));
    assert.equal(renderer.root.findAllByType(StubSwitch).length, 0);
    for (const button of buttons(renderer)) assert.equal(button.props.disabled, true);
  } finally {
    renderer.unmount();
  }
});

test("feature rows keep registry order and show side and restart facts", async () => {
  const fake = createFakeForm({ schemaVersion: 1, alpha: false, beta: true, gamma: false });
  const renderer = await render(view(fake.form));
  try {
    const items = renderer.root.findAll(
      (node) => node.props["data-optimizations-feature"] !== undefined,
    );
    assert.deepEqual(
      items.map((node) => node.props["data-optimizations-feature"]),
      ["alpha", "beta", "gamma"],
    );
    const switches = renderer.root.findAllByType(StubSwitch);
    assert.deepEqual(
      switches.map((node) => node.props.label),
      ["Alpha spacing", "Beta retention", "Gamma badge"],
    );
    assert.deepEqual(
      switches.map((node) => node.props.checked),
      [false, true, false],
    );
    const text = textOf(renderer);
    assert.ok(text.includes("Host and Client"));
    assert.ok(text.includes("Requires a DSH restart"));
    assert.equal(switches[1].props.disabled, false);
  } finally {
    renderer.unmount();
  }
});

test("search narrows rows by name and description", async () => {
  const fake = createFakeForm({ schemaVersion: 1 });
  const renderer = await render(view(fake.form));
  try {
    const input = renderer.root.findAllByType(StubInput)[0];
    await act(async () => {
      input.props.onChange({ currentTarget: { value: "session logs" } });
    });
    let items = renderer.root.findAll(
      (node) => node.props["data-optimizations-feature"] !== undefined,
    );
    assert.deepEqual(
      items.map((node) => node.props["data-optimizations-feature"]),
      ["beta"],
    );
    await act(async () => {
      input.props.onChange({ currentTarget: { value: "gamma" } });
    });
    items = renderer.root.findAll((node) => node.props["data-optimizations-feature"] !== undefined);
    assert.deepEqual(
      items.map((node) => node.props["data-optimizations-feature"]),
      ["gamma"],
    );
  } finally {
    renderer.unmount();
  }
});

test("one Switch writes exactly one field with form.set", async () => {
  const fake = createFakeForm({ schemaVersion: 1 });
  const renderer = await render(view(fake.form));
  try {
    await act(async () => {
      renderer.root.findAllByType(StubSwitch)[0].props.onChange(true);
    });
    await settle();
    assert.deepEqual(fake.writes, [{ kind: "set", payload: ["alpha", true] }]);
    assert.equal(renderer.root.findAllByType(StubSwitch)[0].props.checked, true);
  } finally {
    renderer.unmount();
  }
});

test("bulk actions send one mutate each", async () => {
  const fake = createFakeForm({ schemaVersion: 1 });
  const renderer = await render(view(fake.form));
  try {
    await act(async () => {
      labeledButton(renderer, PAGE.enableAll).props.onClick();
    });
    await settle();
    assert.equal(fake.writes.length, 1);
    assert.equal(fake.writes[0].kind, "mutate");
    assert.deepEqual(fake.writes[0].payload, [
      { op: "set", path: ["alpha"], value: true },
      { op: "set", path: ["beta"], value: true },
      { op: "set", path: ["gamma"], value: true },
    ]);

    await act(async () => {
      labeledButton(renderer, PAGE.restoreDefaults).props.onClick();
    });
    await settle();
    assert.equal(fake.writes.length, 2);
    assert.equal(fake.writes[1].kind, "mutate");
    assert.deepEqual(fake.writes[1].payload, [
      { op: "unset", path: ["alpha"] },
      { op: "unset", path: ["beta"] },
      { op: "unset", path: ["gamma"] },
    ]);
  } finally {
    renderer.unmount();
  }
});

test("a read-only document disables every control and explains why", async () => {
  const fake = createFakeForm({ schemaVersion: 1 }, { writable: false });
  const renderer = await render(view(fake.form));
  try {
    for (const node of renderer.root.findAllByType(StubSwitch)) {
      assert.equal(node.props.disabled, true);
    }
    for (const node of buttons(renderer)) assert.equal(node.props.disabled, true);
    assert.ok(textOf(renderer).includes(PAGE.readOnly));
  } finally {
    renderer.unmount();
  }
});

test("a refused write keeps the current state and shows a retryable error", async () => {
  const fake = createFakeForm({ schemaVersion: 1 }, { accept: false });
  const renderer = await render(view(fake.form));
  try {
    await act(async () => {
      renderer.root.findAllByType(StubSwitch)[0].props.onChange(true);
    });
    await settle();
    assert.ok(textOf(renderer).includes(PAGE.writeFailed));
    const alert = renderer.root.findAll((node) => node.props.role === "alert");
    assert.equal(alert.length, 1);
    assert.equal(renderer.root.findAllByType(StubSwitch)[0].props.checked, false);
  } finally {
    renderer.unmount();
  }
});

test("a loading snapshot shows the loading note", async () => {
  const fake = createFakeForm(undefined, { status: "loading" });
  const renderer = await render(view(fake.form));
  try {
    assert.ok(textOf(renderer).includes(PAGE.loading));
  } finally {
    renderer.unmount();
  }
});
