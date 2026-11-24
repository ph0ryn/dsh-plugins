import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { Context } from "@deepseek-ai/cordis";
import Authorization from "@deepseek-ai/dsh-authorization";
import * as Connection from "@deepseek-ai/dsh-client-connection";
import { RpcId } from "@deepseek-ai/dsh-client-connection";
import Credentials from "@deepseek-ai/dsh-credentials-local";
import WebServer from "@deepseek-ai/dsh-host-webserver";

import { Accounts, KEY } from "./accounts.ts";
import { SiwcAccountSettings } from "./accountSettings.ts";
import { registerSiwcSettings } from "./settings.ts";

// Real authenticated HTTP transport, with a temporary local server and credential store.
test("SIWC Settings account actions stay authenticated, credential-free and durable", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "dsh-siwc-settings-"));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const ctx = new Context();
  const realFetch = globalThis.fetch;
  let revokeStatus = 200;
  let revokeDelay = 0;
  let revokeCalls = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.href === "https://auth.openai.com/.well-known/openid-configuration")
      return Response.json({
        issuer: "https://auth.openai.com",
        authorization_endpoint: "https://auth.openai.com/authorize",
        token_endpoint: "https://auth.openai.com/token",
        jwks_uri: "https://auth.openai.com/jwks",
        revocation_endpoint: "https://auth.openai.com/revoke",
      });
    if (url.href === "https://auth.openai.com/revoke") {
      revokeCalls++;
      if (revokeDelay) await delay(revokeDelay);
      return new Response(null, { status: revokeStatus });
    }
    if (url.href === "https://api.openai.com/v1/models") return Response.json({ models: [] });
    return realFetch(input, init);
  });
  try {
    await ctx.plugin(Credentials, { dshHome: home, watch: false });
    await ctx.plugin(Authorization);
    await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
    await ctx.plugin(Connection);
    const accounts = new Accounts(ctx.credentials);
    await accounts.change((state) => {
      state.activeId = "account-one";
      state.welcomed = true;
      state.accounts.push(
        {
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
        },
        {
          id: "account-two",
          clientId: "private-client-two",
          email: "two@example.test",
          tokens: {
            access: "private-access-two",
            refresh: "private-refresh-two",
            expires: Date.now() + 3600000,
            scopes: ["chatgpt.tokens.use.direct"],
          },
        },
        {
          id: "account-three",
          clientId: "private-client-three",
          email: "three@example.test",
        },
      );
    });
    let syncs = 0;
    const settings = new SiwcAccountSettings(ctx, accounts, async () => {
      syncs++;
    });
    ctx.authorization.registerFlow({
      key: KEY,
      label: "ChatGPT plan",
      methods: [
        { id: "oauth", label: "Continue with ChatGPT" },
        { id: "select", label: "Switch saved account" },
      ],
      run: (session) => settings.authorizeSession(session),
    });
    const fiber = await ctx.plugin({
      inject: ["connection", "webServer"],
      apply(scope: Context) {
        registerSiwcSettings(scope, settings);
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
    const request = (
      endpoint: string,
      authenticated = true,
      payload: unknown = {},
      extraHeaders = {},
    ) =>
      fetch(`${origin}/api/siwc/${endpoint}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authenticated ? { cookie } : {}),
          ...extraHeaders,
        },
        body: JSON.stringify({
          type: "client-request",
          rpcId: RpcId("fixture"),
          method: `siwc/${endpoint}`,
          payload,
        }),
      });
    const value = async (endpoint: string, payload: unknown = {}) => {
      const response = await request(endpoint, true, payload);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.result.ok, true, JSON.stringify(body));
      return body.result.value;
    };

    assert.equal((await request("status", false)).status, 401);
    assert.equal(
      (await request("status", true, {}, { origin: "https://untrusted.example" })).status,
      403,
    );
    const initial = await value("status");
    assert.deepEqual(initial, {
      account: { id: "account-one", label: "one@example.test (account-)" },
      accounts: [
        { id: "account-one", label: "one@example.test (account-)", active: true, signedIn: true },
        { id: "account-two", label: "two@example.test (account-)", active: false, signedIn: true },
        {
          id: "account-three",
          label: "three@example.test (account-)",
          active: false,
          signedIn: false,
        },
      ],
      models: [{ id: "search-model", name: "Search model" }],
      usageUrl: "https://chatgpt.com/settings/usage",
    });
    assert.doesNotMatch(JSON.stringify(initial), /private-|tokens|clientId/);
    for (const [endpoint, payload] of [
      ["status", { account: "injected" }],
      ["authorize", { method: "delete" }],
      ["authorize", { method: "oauth", accountId: "" }],
      ["answer", { choice: "" }],
      ["cancel", { extra: true }],
      ["logout", { extra: true }],
    ] as const) {
      const body = await (await request(endpoint, true, payload)).json();
      assert.equal(body.result.ok, false);
      assert.equal(body.result.error.code, "invalid-input");
    }
    const missing = await (
      await request("authorize", true, { method: "oauth", accountId: "missing" })
    ).json();
    assert.equal(missing.result.ok, false);
    assert.equal(missing.result.error.code, "siwc/action-failed");
    const stranger = ctx.connection.createPeer({
      principal: { kind: "session", sessionId: "other" } as never,
    });
    const denied = await ctx.connection
      .createSharedFetchHandler("/api")
      .fetch(new Request(`${origin}/api/siwc/status`, { method: "POST" }), stranger);
    assert.equal(denied.status, 403);

    const picker = (await value("authorize", { method: "select" })).status;
    assert.deepEqual(
      picker.attempt.prompt.options.map((option: { id: string }) => option.id),
      ["account-one", "account-two"],
    );
    const staleAnswer = await (
      await request("answer", true, { attemptId: "stale-attempt", choice: "account-one" })
    ).json();
    assert.equal(staleAnswer.result.ok, false);
    assert.equal(staleAnswer.result.error.code, "siwc/action-failed");
    await value("cancel", { attemptId: picker.attempt.id });
    const staleCancel = await (
      await request("cancel", true, { attemptId: "stale-attempt" })
    ).json();
    assert.equal(staleCancel.result.ok, false);
    assert.equal(staleCancel.result.error.code, "siwc/action-failed");

    const switched = (await value("authorize", { method: "select", accountId: "account-two" }))
      .status;
    assert.equal(switched.attempt.phase, "running");
    for (let i = 0; i < 50 && switched.attempt.phase === "running"; i++) {
      Object.assign(switched, await value("status"));
      if (switched.attempt.phase === "running") await delay(10);
    }
    assert.equal(switched.attempt.phase, "authorized", JSON.stringify(switched.attempt));
    assert.equal((await accounts.read()).activeId, "account-two");
    assert.equal(syncs, 1);

    const signingIn = (await value("authorize", { method: "oauth", accountId: "new" })).status;
    assert.equal(signingIn.attempt.phase, "running");
    for (let i = 0; i < 50 && !signingIn.attempt.notice?.url; i++) {
      Object.assign(signingIn, await value("status"));
      if (!signingIn.attempt.notice?.url) await delay(10);
    }
    assert.match(signingIn.attempt.notice.url, /^http:\/\/127\.0\.0\.1:\d+\/auth\/start\?state=/);
    assert.doesNotMatch(JSON.stringify(signingIn), /private-|id_token_hint/);
    const cancelled = (await value("cancel", { attemptId: signingIn.attempt.id })).status;
    assert.equal(cancelled.attempt.phase, "cancelled");
    assert.equal((await accounts.read()).activeId, "account-two");

    const signedOut = await value("logout");
    assert.equal(signedOut.status.account, undefined);
    assert.equal(
      signedOut.status.accounts.find((account: { id: string }) => account.id === "account-two")
        .signedIn,
      false,
    );
    assert.match(signedOut.message, /Saved registrations were kept/);
    const after = await accounts.read();
    assert.equal(after.activeId, undefined);
    assert.equal(after.accounts.length, 3);
    assert.equal(after.accounts[1].tokens, undefined);
    assert.equal(after.accounts[1].clientId, "private-client-two");
    assert.equal(syncs, 2);

    await accounts.change((state) => {
      state.activeId = "account-one";
      state.accounts[0].tokens = {
        access: "private-access",
        refresh: "private-refresh",
        expires: Date.now() + 3600000,
        scopes: ["chatgpt.tokens.use.direct"],
      };
      state.accounts[1].tokens = {
        access: "private-access-two",
        refresh: "private-refresh-two",
        expires: Date.now() + 3600000,
        scopes: ["chatgpt.tokens.use.direct"],
      };
    });
    revokeDelay = 50;
    const beforeConcurrentRevoke = revokeCalls;
    const concurrentLogout = value("logout");
    for (let i = 0; i < 50 && revokeCalls === beforeConcurrentRevoke; i++) await delay(5);
    assert.equal(revokeCalls, beforeConcurrentRevoke + 1);
    let authorizationSettled = false;
    const concurrentAuthorization = value("authorize", {
      method: "select",
      accountId: "account-two",
    }).then((result) => {
      authorizationSettled = true;
      return result;
    });
    await delay(10);
    assert.equal(authorizationSettled, false, "authorization must wait for logout");
    await concurrentLogout;
    const afterLogout = (await concurrentAuthorization).status;
    for (let i = 0; i < 50 && afterLogout.attempt.phase === "running"; i++) {
      Object.assign(afterLogout, await value("status"));
      if (afterLogout.attempt.phase === "running") await delay(10);
    }
    assert.equal(afterLogout.attempt.phase, "authorized");
    assert.equal((await accounts.read()).activeId, "account-two");
    revokeDelay = 0;
    revokeStatus = 400;
    const unconfirmed = await value("logout");
    assert.match(unconfirmed.message, /Remote revocation was not confirmed/);
    assert.equal((await accounts.read()).activeId, undefined);
    assert.equal((await accounts.read()).accounts[0].tokens, undefined);

    await fiber.dispose();
    assert.equal((await request("status")).status, 404);
  } finally {
    await ctx.fiber.dispose();
    t.mock.restoreAll();
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});
