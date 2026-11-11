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
import Authorization from "@deepseek-ai/dsh-authorization";
import ConfigEditor from "@deepseek-ai/dsh-config-editor";
import Credentials from "@deepseek-ai/dsh-credentials-local";
import Llm from "@deepseek-ai/dsh-llm";
import SettingsForms, { SettingsConflictError } from "@deepseek-ai/dsh-settings";
import WebRuntime from "@deepseek-ai/dsh-web";

import * as siwc from "./index.ts";

import type { Context } from "@deepseek-ai/cordis";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));

// The actual plugins are loaded as public Loader builtins, not fabricated entry/fiber objects.
async function start(profile: ProfileContext, rootPath: string): Promise<Context> {
  return boot(
    "siwc-settings-fixture",
    rootPath,
    readProfilePatches("fixture", profile),
    async (ctx) => {
      ctx.provide("profileContext", profile);
      ctx.loader.builtins["fixture-siwc"] = siwc;
      ctx.loader.builtins["fixture-web"] = WebRuntime;
      await ctx.plugin(Credentials, { dshHome: profile.home, watch: false });
      await ctx.plugin(Authorization);
      await ctx.plugin(Llm);
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
  "SIWC Settings persist through real ConfigEditor and Loader without switching web providers",
  { timeout: 30_000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), "dsh-siwc-persistence-"));
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
    const originalFetch = globalThis.fetch;
    const network: string[] = [];
    globalThis.fetch = async (input) => {
      network.push(input instanceof Request ? input.url : String(input));
      throw new Error("The persistence fixture forbids network requests");
    };
    let ctx: Context | undefined;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "siwc-settings-fixture",
          type: "module",
          dsh: { profile: { bundles: [] } },
        }),
      );
      await writeFile(rootPath, "[]\n");
      await writeFile(
        profile.patchPath,
        JSON.stringify([
          {
            insert: [
              { id: "siwc", name: "cordis:fixture-siwc" },
              {
                id: "web",
                name: "cordis:fixture-web",
                config: { searchProvider: "deepseek-official", fetchProvider: "http" },
              },
            ],
          },
        ]),
      );
      ctx = await start(profile, rootPath);

      const before = descriptor(ctx, "siwc");
      assert.equal(before.autoGenerate, false, "the custom page suppresses automatic schema UI");
      assert.deepEqual(before.value, { searchModel: "" });
      assert.equal(before.applies, "live");
      assert.ok(JSON.stringify(before.schema).includes("searchModel"));
      const siwcEntry = entry(ctx, "siwc");
      const siwcFiber = siwcEntry.fiber;
      const webFiber = entry(ctx, "web").fiber;
      assert.equal(siwcFiber!.config.searchModel.get(), "");
      const originalWeb = descriptor(ctx, "web");
      assert.deepEqual(originalWeb.value, {
        searchProvider: "deepseek-official",
        fetchProvider: "http",
      });

      await ctx.settings.mutate(
        "siwc",
        [{ op: "set", path: ["searchModel"], value: "account-search-model" }],
        before.revision,
      );
      const saved = descriptor(ctx, "siwc");
      assert.ok(saved.revision > before.revision);
      assert.equal(saved.autoGenerate, false);
      assert.deepEqual(saved.value, { searchModel: "account-search-model" });
      assert.equal(entry(ctx, "siwc").fiber, siwcFiber, "volatile edits must not remount SIWC");
      assert.equal(siwcFiber!.config.searchModel.get(), "account-search-model");
      assert.equal(entry(ctx, "web").fiber, webFiber);
      assert.deepEqual(
        descriptor(ctx, "web").value,
        originalWeb.value,
        "model changes must not change the provider setting or fetch provider",
      );

      const durable = loadProfileDirectory("fixture", dir, profile.installAnchor);
      assert.deepEqual(durable.patches.find((row) => row.id === "siwc")?.config, {
        searchModel: "account-search-model",
      });
      const beforeConflict = await readFile(profile.patchPath, "utf8");
      await assert.rejects(
        ctx.settings.mutate(
          "siwc",
          [{ op: "set", path: ["searchModel"], value: "stale-model" }],
          before.revision,
        ),
        SettingsConflictError,
      );
      assert.equal(
        await readFile(profile.patchPath, "utf8"),
        beforeConflict,
        "conflicts cannot alter the durable document",
      );
      assert.equal(siwcFiber!.config.searchModel.get(), "account-search-model");
      await assert.rejects(
        ctx.settings.mutate(
          "siwc",
          [{ op: "set", path: ["notAConfigField"], value: "rejected" }],
          saved.revision,
        ),
        /not volatile/,
      );
      assert.equal(
        await readFile(profile.patchPath, "utf8"),
        beforeConflict,
        "non-schema edits cannot reach the profile",
      );

      await ctx.settings.mutate(
        "web",
        [{ op: "set", path: ["searchProvider"], value: "siwc" }],
        descriptor(ctx, "web").revision,
      );
      assert.deepEqual(descriptor(ctx, "web").value, {
        searchProvider: "siwc",
        fetchProvider: "http",
      });
      assert.equal(entry(ctx, "web").fiber, webFiber, "provider selection is live too");
      await assert.rejects(ctx.web.search({ query: "no network" }), { code: "MISSING_CREDENTIAL" });
      assert.deepEqual(
        network,
        [],
        "signed-out searches must never fall back to another credential",
      );

      await ctx.fiber.dispose();
      ctx = await start(profile, rootPath);
      assert.notEqual(
        entry(ctx, "siwc").fiber,
        siwcFiber,
        "the second boot must use fresh runtime instances",
      );
      assert.equal(entry(ctx, "siwc").fiber!.config.searchModel.get(), "account-search-model");
      assert.deepEqual(descriptor(ctx, "siwc").value, { searchModel: "account-search-model" });
      assert.equal(descriptor(ctx, "siwc").autoGenerate, false);
      assert.deepEqual(descriptor(ctx, "web").value, {
        searchProvider: "siwc",
        fetchProvider: "http",
      });

      await ctx.settings.mutate(
        "web",
        [{ op: "unset", path: ["searchProvider"] }],
        descriptor(ctx, "web").revision,
      );
      assert.deepEqual(
        descriptor(ctx, "web").value,
        { searchProvider: "deepseek-official", fetchProvider: "http" },
        "restore inherits the deployment default without touching fetch",
      );
      await ctx.settings.mutate(
        "web",
        [{ op: "set", path: ["searchProvider"], value: "siwc" }],
        descriptor(ctx, "web").revision,
      );
      const active = entry(ctx, "siwc");
      await ctx.loader.update(active.id, { disabled: true });
      await ctx.loader.await();
      assert.equal(
        ctx.settings.describe().some((row) => row.ns === "siwc"),
        false,
        "disposed entries cannot keep stale Settings forms",
      );
      await assert.rejects(ctx.web.search({ query: "disposed provider" }), {
        code: "WEB_PROVIDER_CONFIGURED_MISSING",
      });
      assert.deepEqual(network, []);
    } finally {
      await ctx?.fiber.dispose();
      globalThis.fetch = originalFetch;
      await rm(home, { recursive: true, force: true });
    }
  },
);
