import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Context } from "@deepseek-ai/cordis";
import * as Connection from "@deepseek-ai/dsh-client-connection";
import { RpcId } from "@deepseek-ai/dsh-client-connection";
import Credentials from "@deepseek-ai/dsh-credentials-local";
import WebServer from "@deepseek-ai/dsh-host-webserver";

import { Accounts } from "./accounts.ts";
import { registerSiwcSettings } from "./settings.ts";

// Real authenticated HTTP transport, with a temporary local server and credential store.
test("SIWC settings expose only account/model status to the authenticated owner", async () => {
  const home = await mkdtemp(join(tmpdir(), "dsh-siwc-settings-"));
  const ctx = new Context();
  try {
    await ctx.plugin(Credentials, { dshHome: home, watch: false });
    await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
    await ctx.plugin(Connection);
    const accounts = new Accounts(ctx.credentials);
    await accounts.change((state) => {
      state.activeId = "account-one";
      state.accounts.push({
        id: "account-one",
        clientId: "private-client",
        email: "one@example.test",
        idToken: "private-id-token",
        models: [{ id: "search-model", name: "Search model" }],
        tokens: {
          access: "private-access",
          refresh: "private-refresh",
          expires: Date.now() + 3600000,
          scopes: ["chatgpt.tokens.use.direct"],
        },
      });
    });
    const fiber = await ctx.plugin({
      inject: ["connection", "webServer"],
      apply(scope: Context) {
        registerSiwcSettings(scope, accounts);
      },
    });
    ctx.webServer.register({
      kind: "exact",
      path: "/",
      handler(req, res) {
        if (ctx.connection.authorizeIndex(req, res)) res.end("fixture");
      },
    });
    const origin = `http://127.0.0.1:${ctx.webServer.port}`;
    const login = await fetch(ctx.connection.authenticatedUrl(origin), { redirect: "manual" });
    assert.equal(login.status, 303);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
    const request = (authenticated = true, payload: unknown = {}, extraHeaders = {}) =>
      fetch(`${origin}/api/siwc/status`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authenticated ? { cookie } : {}),
          ...extraHeaders,
        },
        body: JSON.stringify({
          type: "client-request",
          rpcId: RpcId("fixture"),
          method: "siwc/status",
          payload,
        }),
      });
    assert.equal((await request(false)).status, 401);
    assert.equal((await request(true, {}, { origin: "https://untrusted.example" })).status, 403);
    const body = await (await request()).json();
    assert.equal(body.result.ok, true);
    assert.deepEqual(body.result.value, {
      account: { id: "account-one", label: "one@example.test (account-)" },
      models: [{ id: "search-model", name: "Search model" }],
      usageUrl: "https://chatgpt.com/settings/usage",
    });
    assert.doesNotMatch(JSON.stringify(body), /private-|tokens|clientId/);
    const invalid = await (await request(true, { account: "injected" })).json();
    assert.equal(invalid.result.error.code, "invalid-input");
    const stranger = ctx.connection.createPeer({
      principal: { kind: "session", sessionId: "other" } as never,
    });
    const denied = await ctx.connection
      .createSharedFetchHandler("/api")
      .fetch(new Request(`${origin}/api/siwc/status`, { method: "POST" }), stranger);
    assert.equal(denied.status, 403);
    await accounts.change((state) => {
      delete state.activeId;
    });
    const signedOut = await (await request()).json();
    assert.deepEqual(signedOut.result.value.models, []);
    assert.equal(signedOut.result.value.account, undefined);
    await fiber.dispose();
    assert.equal((await request()).status, 404);
  } finally {
    await ctx.fiber.dispose();
    await rm(home, { recursive: true, force: true });
  }
});
