import assert from "node:assert/strict";
import { test } from "node:test";

import { diffFeatures, liveFeatures } from "./diff.ts";

import type { FeatureMeta } from "./features.ts";

const FEATURES: readonly FeatureMeta[] = [
  { id: "clientLive", group: "conversation", client: true },
  { id: "hostLive", group: "host", host: true },
  { id: "bothLive", group: "shell", host: true, client: true },
  { id: "hostRestart", group: "host", host: true, reload: "restart" },
  { id: "clientRestart", group: "sidebar", client: true, reload: "restart" },
];

test("initial snapshot mounts only the features that are ON", () => {
  assert.deepEqual(diffFeatures(FEATURES, {}, {}), { mount: [], dispose: [] });
  assert.deepEqual(diffFeatures(FEATURES, {}, { hostLive: true, bothLive: true }), {
    mount: ["hostLive", "bothLive"],
    dispose: [],
  });
});

test("only real ON/OFF edges produce work", () => {
  assert.deepEqual(diffFeatures(FEATURES, { hostLive: true }, { hostLive: true }), {
    mount: [],
    dispose: [],
  });
  assert.deepEqual(diffFeatures(FEATURES, { hostLive: true }, { hostLive: false }), {
    mount: [],
    dispose: ["hostLive"],
  });
  assert.deepEqual(diffFeatures(FEATURES, { hostLive: true, bothLive: true }, {}), {
    mount: [],
    dispose: ["hostLive", "bothLive"],
  });
  assert.deepEqual(diffFeatures(FEATURES, {}, { hostLive: false }), { mount: [], dispose: [] });
});

test("unknown keys and non-boolean values are ignored", () => {
  assert.deepEqual(
    diffFeatures(FEATURES, { notAFeature: true }, { notAFeature: false, hostLive: "true" }),
    { mount: [], dispose: [] },
  );
});

test("an empty registry never produces work", () => {
  assert.deepEqual(diffFeatures([], { hostLive: true }, {}), { mount: [], dispose: [] });
});

test("liveFeatures keeps one side and excludes restart-only features", () => {
  assert.deepEqual(
    liveFeatures(FEATURES, "host").map((feature) => feature.id),
    ["hostLive", "bothLive"],
  );
  assert.deepEqual(
    liveFeatures(FEATURES, "client").map((feature) => feature.id),
    ["clientLive", "bothLive"],
  );
});
