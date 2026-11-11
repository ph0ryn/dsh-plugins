import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  boot,
  loadProfileDirectory,
  readProfilePatches,
  type ProfileContext,
} from "@deepseek-ai/dsh-app-boot";
import ConfigEditor from "@deepseek-ai/dsh-config-editor";
import SettingsForms, { SettingsConflictError } from "@deepseek-ai/dsh-settings";

import * as optimizations from "./index.ts";

import type { Context } from "@deepseek-ai/cordis";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));

// The actual plugin is loaded as a public Loader builtin, not a fabricated entry or fiber.
async function start(profile: ProfileContext, rootPath: string): Promise<Context> {
  return boot(
    "optimizations-settings-fixture",
    rootPath,
    readProfilePatches("fixture", profile),
    async (ctx) => {
      ctx.provide("profileContext", profile);
      ctx.loader.builtins["fixture-optimizations"] = optimizations;
      await ctx.plugin(ConfigEditor);
      await ctx.plugin(SettingsForms);
    },
  );
}

function descriptor(ctx: Context, namespace: string) {
  const value = ctx.settings.describe({ redactSecrets: true }).find((row) => row.ns === namespace);
  assert.ok(value, `Missing live Settings descriptor for ${namespace}`);
  return value;
}

function entry(ctx: Context, namespace: string) {
  const value = ctx.configEditor.entries().find((row) => row.options.id === namespace);
  assert.ok(value?.fiber, `Missing live Loader entry for ${namespace}`);
  return value;
}

test(
  "Optimizations settings are served by the real Loader and persist without remounting",
  { timeout: 30_000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), "dsh-optimizations-persistence-"));
    const dir = join(home, "profiles", "fixture");
    const rootPath = join(home, "cordis.yml");
    const profile: ProfileContext = {
      name: "fixture",
      dir,
      patchPath: join(dir, "cordis.patch.yml"),
      installAnchor: join(repo, "package.json"),
      cwd: repo,
      home,
      startedBundles: [],
      overlays: [],
      telemetryDisabledEnv: undefined,
    };
    let ctx: Context | undefined;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "optimizations-settings-fixture",
          type: "module",
          dsh: { profile: { bundles: [] } },
        }),
      );
      await writeFile(rootPath, "[]\n");
      await writeFile(
        profile.patchPath,
        JSON.stringify([
          { insert: [{ id: "optimizations", name: "cordis:fixture-optimizations" }] },
        ]),
      );
      ctx = await start(profile, rootPath);

      const before = descriptor(ctx, "optimizations");
      assert.equal(before.autoGenerate, false, "the custom page suppresses automatic schema UI");
      assert.equal(before.applies, "live");
      assert.deepEqual(before.value, { schemaVersion: 1, compactSidebar: false });
      // The serving marker keeps this namespace visible in every composition:
      // settings.describe() drops namespaces whose form has no volatile field.
      const schema = before.schema as { refs?: Record<string, { dict?: Record<string, unknown> }> };
      const root = Object.values(schema.refs ?? {}).find((node) => node.dict !== undefined);
      assert.deepEqual(Object.keys(root?.dict ?? {}).sort(), ["compactSidebar", "schemaVersion"]);

      const pluginEntry = entry(ctx, "optimizations");
      const fiber = pluginEntry.fiber;
      assert.equal(fiber!.config.schemaVersion.get(), 1);

      await ctx.settings.mutate(
        "optimizations",
        [{ op: "set", path: ["schemaVersion"], value: 2 }],
        before.revision,
      );
      const saved = descriptor(ctx, "optimizations");
      assert.ok(saved.revision > before.revision);
      assert.deepEqual(saved.value, { schemaVersion: 2, compactSidebar: false });
      await ctx.settings.mutate(
        "optimizations",
        [{ op: "set", path: ["compactSidebar"], value: true }],
        saved.revision,
      );
      const toggled = descriptor(ctx, "optimizations");
      assert.deepEqual(toggled.value, { schemaVersion: 2, compactSidebar: true });
      assert.equal(fiber!.config.compactSidebar.get(), true);
      assert.equal(
        entry(ctx, "optimizations").fiber,
        fiber,
        "volatile edits must not remount the plugin",
      );
      assert.equal(fiber!.config.schemaVersion.get(), 2);

      const durable = loadProfileDirectory("fixture", dir, profile.installAnchor);
      assert.deepEqual(durable.patches.find((row) => row.id === "optimizations")?.config, {
        schemaVersion: 2,
        compactSidebar: true,
      });
      const beforeConflict = await readFile(profile.patchPath, "utf8");
      await assert.rejects(
        ctx.settings.mutate(
          "optimizations",
          [{ op: "set", path: ["schemaVersion"], value: 3 }],
          before.revision,
        ),
        SettingsConflictError,
      );
      assert.equal(
        await readFile(profile.patchPath, "utf8"),
        beforeConflict,
        "conflicts cannot alter the durable document",
      );
      assert.equal(fiber!.config.schemaVersion.get(), 2);

      await ctx.fiber.dispose();
      ctx = await start(profile, rootPath);
      assert.notEqual(
        entry(ctx, "optimizations").fiber,
        fiber,
        "the second boot must use fresh runtime instances",
      );
      assert.deepEqual(descriptor(ctx, "optimizations").value, {
        schemaVersion: 2,
        compactSidebar: true,
      });
      assert.equal(descriptor(ctx, "optimizations").autoGenerate, false);

      const active = entry(ctx, "optimizations");
      await ctx.loader.update(active.id, { disabled: true });
      await ctx.loader.await();
      assert.equal(
        ctx.settings.describe().some((row) => row.ns === "optimizations"),
        false,
        "a disabled entry cannot keep a stale Settings form",
      );
    } finally {
      await ctx?.fiber.dispose();
      await rm(home, { recursive: true, force: true });
    }
  },
);
