import assert from "node:assert/strict";
import { test } from "node:test";

import { startClientRuntime } from "./client/runtime.ts";
import { createFakeForm, createFakeRunContext } from "./testing.ts";

import type { FeatureMeta } from "./features.ts";

const FEATURES: readonly FeatureMeta[] = [
  { id: "clientLive", group: "conversation", client: true },
  { id: "clientRestart", group: "sidebar", client: true, reload: "restart" },
  { id: "hostLive", group: "host", host: true },
];
const IMPLEMENTATIONS = {
  clientLive: { name: "optimize/client-live", apply() {} },
};

test("client runtime waits for the Host value before applying anything", () => {
  const run = createFakeRunContext();
  const fake = createFakeForm(undefined);
  startClientRuntime(run.ctx, fake.form, { features: FEATURES, implementations: IMPLEMENTATIONS });
  assert.equal(run.fibers.length, 0, "a loading snapshot must not mount features");

  fake.setSnapshot({ clientLive: true });
  assert.equal(run.fibers.length, 1);
  assert.equal(run.fibers[0].name, "optimize/client-live");
  run.dispose();
});

test("client runtime mounts and disposes on ON/OFF edges only", () => {
  const run = createFakeRunContext();
  const fake = createFakeForm({ clientLive: false });
  startClientRuntime(run.ctx, fake.form, { features: FEATURES, implementations: IMPLEMENTATIONS });
  assert.equal(run.fibers.length, 0);

  fake.setSnapshot({ clientLive: true });
  assert.equal(run.fibers.length, 1);
  const fiber = run.fibers[0];

  fake.setSnapshot({ clientLive: true });
  assert.equal(run.fibers.length, 1, "an unchanged snapshot must not remount");

  fake.setSnapshot({ clientLive: false });
  assert.equal(run.fibers.length, 1);
  assert.equal(fiber.disposed, true, "OFF disposes the running feature fiber");
  run.dispose();
});

test("client runtime ignores restart-only features and the other side", () => {
  const run = createFakeRunContext();
  const fake = createFakeForm({ clientLive: false });
  startClientRuntime(run.ctx, fake.form, { features: FEATURES, implementations: IMPLEMENTATIONS });
  fake.setSnapshot({ clientRestart: true, hostLive: true });
  assert.equal(run.fibers.length, 0);
  run.dispose();
});

test("client runtime cleanup unsubscribes and disposes live features", () => {
  const run = createFakeRunContext();
  const fake = createFakeForm({ clientLive: true });
  startClientRuntime(run.ctx, fake.form, { features: FEATURES, implementations: IMPLEMENTATIONS });
  assert.equal(run.fibers.length, 1);
  run.dispose();
  assert.equal(run.fibers[0].disposed, true);
  fake.setSnapshot({ clientLive: true });
  assert.equal(run.fibers.length, 1, "a disposed runtime must ignore later snapshots");
});

test("client runtime fails loudly on a registry/implementation mismatch", () => {
  const run = createFakeRunContext();
  const fake = createFakeForm({ clientLive: false });
  startClientRuntime(run.ctx, fake.form, { features: FEATURES, implementations: {} });
  assert.throws(() => fake.setSnapshot({ clientLive: true }), /no implementation registered/);
  run.dispose();
});
