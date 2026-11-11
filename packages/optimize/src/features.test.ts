import assert from "node:assert/strict";
import { test } from "node:test";

import { Config, SCHEMA_VERSION_FIELD } from "./config.ts";
import { FEATURES, GROUPS } from "./features.ts";
import { CLIENT_IMPLEMENTATIONS } from "./features/client.ts";
import { HOST_IMPLEMENTATIONS } from "./features/host.ts";
import { COPY } from "./page/copy.ts";
import { SECTION } from "./section.ts";

test("feature registry is well-formed and both implementation maps match their side flags", () => {
  const ids = FEATURES.map((feature) => feature.id);
  assert.equal(new Set(ids).size, ids.length, "feature ids must be unique");
  for (const feature of FEATURES) {
    assert.match(feature.id, /^[a-z][a-zA-Z0-9]*$/, `feature id must be camelCase: ${feature.id}`);
    assert.ok(
      (GROUPS as readonly string[]).includes(feature.group),
      `unknown feature group: ${feature.group}`,
    );
    assert.ok(
      feature.host === true || feature.client === true,
      `feature ${feature.id} must act on at least one side`,
    );
  }
  assert.deepEqual(
    Object.keys(HOST_IMPLEMENTATIONS).sort(),
    FEATURES.filter((feature) => feature.host === true)
      .map((feature) => feature.id)
      .sort(),
  );
  assert.deepEqual(
    Object.keys(CLIENT_IMPLEMENTATIONS).sort(),
    FEATURES.filter((feature) => feature.client === true)
      .map((feature) => feature.id)
      .sort(),
  );
});

test("every feature has English copy with a name and a description", () => {
  assert.deepEqual(Object.keys(COPY).sort(), FEATURES.map((feature) => feature.id).sort());
  for (const feature of FEATURES) {
    const entry = COPY[feature.id];
    assert.ok(entry, `missing copy for feature ${feature.id}`);
    assert.ok(entry.name.trim().length > 0, `empty name for feature ${feature.id}`);
    assert.ok(entry.description.trim().length > 0, `empty description for feature ${feature.id}`);
  }
});

test("generated schema keeps one volatile OFF boolean per feature plus the serving marker", () => {
  const dict = Config.dict ?? {};
  const featureIds = FEATURES.map((feature) => feature.id);
  assert.deepEqual(
    Object.keys(dict)
      .filter((key) => key !== SCHEMA_VERSION_FIELD)
      .sort(),
    featureIds.sort(),
  );
  for (const feature of FEATURES) {
    const field = dict[feature.id];
    assert.ok(field, `missing schema field for feature ${feature.id}`);
    assert.equal(field.meta.volatile, true, `feature ${feature.id} must be volatile`);
    assert.equal(field.meta.default, false, `feature ${feature.id} must default to OFF`);
  }
  const marker = dict[SCHEMA_VERSION_FIELD];
  assert.ok(marker, "the schema needs its serving marker field");
  assert.equal(marker.meta.volatile, true);
  assert.equal(marker.meta.default, 1);
  assert.equal(Config.meta.volatile, undefined, "features stay flat; only fields are volatile");
});

test("settings section identity is fixed", () => {
  assert.deepEqual(SECTION, {
    name: "settings.section",
    id: "optimize",
    order: 25,
    label: "Optimization",
  });
});
