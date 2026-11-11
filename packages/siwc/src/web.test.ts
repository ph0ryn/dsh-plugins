import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Context } from "@deepseek-ai/cordis";
import Authorization from "@deepseek-ai/dsh-authorization";
import Credentials from "@deepseek-ai/dsh-credentials-local";
import Llm from "@deepseek-ai/dsh-llm";
import Web from "@deepseek-ai/dsh-web";

import * as plugin from "./index.ts";

test("plugin registers SIWC search without selecting it or requiring Web for chat", async () => {
  const home = await mkdtemp(join(tmpdir(), "dsh-siwc-web-"));
  const ctx = new Context();
  try {
    await ctx.plugin(Credentials, { dshHome: home, watch: false });
    await ctx.plugin(Authorization);
    await ctx.plugin(Llm);
    const webFiber = await ctx.plugin(Web, { searchProvider: "existing" });
    ctx.web.registerSearchProvider({
      id: "existing",
      available: () => true,
      search: async () => ({ content: "existing provider", sources: [], truncated: false }),
    });
    const fiber = await ctx.plugin(plugin, { searchModel: "search-model" });
    assert.equal((await ctx.web.search({ query: "test" })).content, "existing provider");
    webFiber.update({ searchProvider: "siwc" });
    await webFiber.await();
    await assert.rejects(ctx.web.search({ query: "test" }), { code: "MISSING_CREDENTIAL" });
    await fiber.dispose();
    await assert.rejects(ctx.web.search({ query: "test" }), {
      code: "WEB_PROVIDER_CONFIGURED_MISSING",
    });
  } finally {
    await ctx.fiber.dispose();
    await rm(home, { recursive: true, force: true });
  }
});
