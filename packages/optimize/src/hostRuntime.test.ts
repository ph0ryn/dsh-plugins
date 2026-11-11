import assert from "node:assert/strict";
import { test } from "node:test";

import { startHostRuntime } from "./host/runtime.ts";
import { createFakeRunContext } from "./testing.ts";

import type { Config } from "./config.ts";
import type { FeatureMeta } from "./features.ts";

const FEATURES: readonly FeatureMeta[] = [
  { id: "hostLive", group: "host", host: true },
  { id: "hostRestart", group: "host", host: true, reload: "restart" },
  { id: "clientLive", group: "conversation", client: true },
];
const IMPLEMENTATIONS = {
  hostLive: { name: "optimize/host-live", apply() {} },
  hostRestart: { name: "optimize/host-restart", apply() {} },
};

function createFakeConfig() {
  const values = new Map<string, boolean>();
  const config = new Proxy(
    {},
    {
      get: (_target, property) => ({ get: () => values.get(String(property)) === true }),
    },
  ) as Config;
  return {
    config,
    set(id: string, value: boolean) {
      values.set(id, value);
    },
  };
}

test("host runtime syncs once at startup and only follows volatile updates afterwards", () => {
  const run = createFakeRunContext();
  const fake = createFakeConfig();
  fake.set("hostLive", true);
  fake.set("hostRestart", true);
  startHostRuntime(run.ctx, fake.config, { features: FEATURES, implementations: IMPLEMENTATIONS });

  assert.deepEqual(
    run.fibers.map((fiber) => fiber.name).sort(),
    ["optimize/host-live", "optimize/host-restart"],
    "startup mounts the current ON values, including restart-only features",
  );

  fake.set("hostLive", false);
  assert.equal(run.fibers.length, 2, "no change is applied before the Loader notification");
  run.emitVolatileUpdate();
  assert.equal(run.fibers.find((fiber) => fiber.name === "optimize/host-live")?.disposed, true);
  assert.equal(run.fibers.find((fiber) => fiber.name === "optimize/host-restart")?.disposed, false);
  run.dispose();
});

test("host runtime mounts a feature turned ON and disposes it when turned OFF", () => {
  const run = createFakeRunContext();
  const fake = createFakeConfig();
  startHostRuntime(run.ctx, fake.config, { features: FEATURES, implementations: IMPLEMENTATIONS });
  assert.equal(run.fibers.length, 0);

  fake.set("hostLive", true);
  run.emitVolatileUpdate();
  assert.equal(run.fibers.length, 1);
  assert.equal(run.fibers[0].name, "optimize/host-live");

  fake.set("hostLive", false);
  run.emitVolatileUpdate();
  assert.equal(run.fibers[0].disposed, true);
  run.dispose();
});

test("restart-only features are decided at startup and never remount on toggles", () => {
  const run = createFakeRunContext();
  const fake = createFakeConfig();
  fake.set("hostRestart", true);
  startHostRuntime(run.ctx, fake.config, { features: FEATURES, implementations: IMPLEMENTATIONS });
  const restartFiber = run.fibers.find((fiber) => fiber.name === "optimize/host-restart");
  assert.ok(restartFiber);

  fake.set("hostRestart", false);
  run.emitVolatileUpdate();
  assert.equal(restartFiber.disposed, false, "a restart-only feature ignores live toggles");

  fake.set("hostRestart", true);
  run.emitVolatileUpdate();
  assert.equal(run.fibers.length, 1, "the restart-only feature must not be mounted twice");
  run.dispose();
});

test("host runtime cleanup removes the listener and disposes every feature fiber", () => {
  const run = createFakeRunContext();
  const fake = createFakeConfig();
  fake.set("hostLive", true);
  startHostRuntime(run.ctx, fake.config, { features: FEATURES, implementations: IMPLEMENTATIONS });
  assert.equal(run.listenerCount(), 1);
  run.dispose();
  assert.equal(run.listenerCount(), 0);
  assert.equal(run.fibers[0].disposed, true);
});
