import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inspect } from "node:util";

import { Context } from "@deepseek-ai/cordis";
import Credentials from "@deepseek-ai/dsh-credentials-local";
import WebRuntime, { WebError } from "@deepseek-ai/dsh-web";

import { Accounts, type State } from "./accounts.ts";
import { createSiwcSearchProvider } from "./search.ts";

const MODEL = "gpt-4.1";
const SECRET = "siwc-access-secret";
const state = (): State => ({
  version: 1,
  activeId: "one",
  accounts: ["one", "two"].map((id) => ({
    id,
    clientId: `client-${id}`,
    tokens: {
      access: id === "one" ? SECRET : "second-account-secret",
      refresh: `refresh-${id}`,
      expires: Date.now() + 3_600_000,
      scopes: ["resource.invoke", "chatgpt.tokens.use.direct"],
    },
    models: [{ id: MODEL, name: "Fixture model" }],
  })),
});

const searchCall = {
  id: "ws_one",
  type: "web_search_call",
  status: "completed",
  action: {
    type: "search",
    query: "fixture query",
    sources: [
      { type: "url", url: "https://EXAMPLE.test:443/article#top" },
      { type: "url", url: "https://example.test/article#top" },
      { type: "url", url: "https://other.test/story" },
      { type: "url", url: "javascript:alert(1)" },
      { type: "url", url: "data:text/plain,unsafe" },
      { type: "url", url: "ftp://example.test/story" },
      { type: "url", url: "https://user:password@example.test/private" },
      { type: "url", url: "not a URL" },
    ],
  },
};
const message = {
  id: "msg_one",
  type: "message",
  role: "assistant",
  status: "completed",
  content: [
    {
      type: "output_text",
      text: "Read this report and more.",
      annotations: [
        {
          type: "url_citation",
          start_index: 10,
          end_index: 16,
          url: "https://example.test/article#top",
          title: "Original report",
        },
      ],
    },
  ],
};
const completed = (output: unknown[] = [searchCall, message]) => ({
  type: "response.completed",
  response: { id: "resp_one", status: "completed", output },
});
function sse(events: unknown[]) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream", "x-request-id": "req_fixture" },
  });
}

type WireRequest = { url: string; headers: Headers; body: Record<string, unknown> };
async function fixture(
  respond: (request: WireRequest, signal: AbortSignal) => Response | Promise<Response> = () =>
    sse([completed()]),
  options: { timeoutMs?: number; model?: string } = {},
) {
  const home = await mkdtemp(join(tmpdir(), "dsh-siwc-search-"));
  const ctx = new Context();
  await ctx.plugin(Credentials, { dshHome: home, watch: false });
  await ctx.plugin(WebRuntime, { searchProvider: "siwc" });
  const accounts = new Accounts(ctx.credentials);
  await accounts.change((current) => {
    Object.assign(current, state());
  });
  let model = options.model ?? MODEL;
  const requests: WireRequest[] = [];
  const provider = createSiwcSearchProvider(accounts, () => model, {
    timeoutMs: options.timeoutMs,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const wire = {
        url: request.url,
        headers: request.headers,
        body: JSON.parse(await request.text()) as Record<string, unknown>,
      };
      requests.push(wire);
      return respond(wire, request.signal);
    },
  });
  ctx.web.registerSearchProvider(provider);
  return {
    ctx,
    accounts,
    provider,
    requests,
    setModel: (value: string) => (model = value),
    close: async () => {
      await ctx.fiber.dispose();
      await rm(home, { recursive: true, force: true });
    },
  };
}

test("SIWC search uses the public Responses wire contract and portable citations through WebRuntime", async () => {
  const f = await fixture();
  try {
    assert.equal(f.provider.id, "siwc");
    assert.equal(f.provider.available(), true);
    assert.equal(f.requests.length, 0, "availability must not call the network");
    const result = await f.ctx.web.search({ query: "fixture query", maxResults: 1 });
    assert.deepEqual(result.sources, [
      { url: "https://example.test/article#top", title: "Original report" },
    ]);
    assert.equal(result.truncated, true);
    assert.equal(
      result.content,
      "Read this [report](<https://example.test/article#top>) and more.",
    );
    const [request] = f.requests;
    assert.equal(request.url, "https://api.openai.com/v1/responses");
    assert.equal(request.headers.get("authorization"), `Bearer ${SECRET}`);
    assert.deepEqual(request.body, {
      model: MODEL,
      store: false,
      stream: true,
      input: [{ role: "user", content: "fixture query" }],
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
    });
  } finally {
    await f.close();
  }
});

test("SIWC does not inherit API-key endpoint, organization or project settings", async () => {
  const values = {
    OPENAI_API_KEY: "unrelated-api-key",
    OPENAI_BASE_URL: "https://unrelated.example/v1",
    OPENAI_ORG_ID: "unrelated-organization",
    OPENAI_PROJECT_ID: "unrelated-project",
  };
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  const f = await fixture();
  try {
    await f.ctx.web.search({ query: "fixture" });
    assert.equal(f.requests[0].url, "https://api.openai.com/v1/responses");
    assert.equal(f.requests[0].headers.get("authorization"), `Bearer ${SECRET}`);
    assert.equal(f.requests[0].headers.get("openai-organization"), null);
    assert.equal(f.requests[0].headers.get("openai-project"), null);
    await f.accounts.change((current) => {
      delete current.activeId;
    });
    await assert.rejects(f.ctx.web.search({ query: "fixture" }), { code: "MISSING_CREDENTIAL" });
    assert.equal(f.requests.length, 1);
  } finally {
    await f.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("SIWC sources are URL-only when upstream supplies no title and are deduplicated", async () => {
  const f = await fixture(() => sse([completed([searchCall])]));
  try {
    assert.deepEqual(await f.ctx.web.search({ query: "fixture" }), {
      sources: [{ url: "https://example.test/article#top" }, { url: "https://other.test/story" }],
      truncated: false,
    });
  } finally {
    await f.close();
  }
});

test("SIWC checks configuration and account catalog locally without API-key fallback", async () => {
  const f = await fixture();
  try {
    f.setModel("");
    assert.equal(f.provider.available(), false);
    await assert.rejects(f.ctx.web.search({ query: "fixture" }), {
      code: "WEB_PROVIDER_CONFIGURED_UNAVAILABLE",
    });
    f.setModel("not-in-catalog");
    await assert.rejects(f.ctx.web.search({ query: "fixture" }), {
      code: "SIWC_SEARCH_MODEL_UNAVAILABLE",
    });
    f.setModel(MODEL);
    await f.accounts.change((current) => {
      delete current.activeId;
    });
    await assert.rejects(f.ctx.web.search({ query: "fixture" }), { code: "MISSING_CREDENTIAL" });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.close();
  }
});

test("SIWC snapshots active account and configured model before asynchronous token acquisition", async () => {
  const f = await fixture();
  try {
    const original = f.accounts.accessToken.bind(f.accounts);
    const ids: (string | undefined)[] = [];
    f.accounts.accessToken = async (id, rejected) => {
      ids.push(id);
      assert.equal(rejected, undefined);
      f.setModel("changed-model");
      await f.accounts.change((current) => {
        current.activeId = "two";
      });
      return original(id, rejected);
    };
    await f.ctx.web.search({ query: "fixture" });
    assert.deepEqual(ids, ["one"]);
    assert.equal(f.requests[0].headers.get("authorization"), `Bearer ${SECRET}`);
    assert.equal(f.requests[0].body.model, MODEL);
  } finally {
    await f.close();
  }
});

for (const [status, code] of [
  [401, "subscription_sharing_invalid_user"],
  [403, "subscription_sharing_policy_denied"],
  [429, "rate_limit_exceeded"],
  [503, "subscription_sharing_user_unavailable"],
] as const) {
  test(`SIWC preserves safe ${status} diagnostics without retry or secret leakage`, async () => {
    const f = await fixture(
      () =>
        new Response(
          JSON.stringify({
            error: { code, message: `Do not expose ${SECRET} or refresh-one` },
          }),
          { status, headers: { "content-type": "application/json", "x-request-id": "req_error" } },
        ),
    );
    try {
      await assert.rejects(f.ctx.web.search({ query: "fixture" }), (error: unknown) => {
        assert.ok(error instanceof WebError);
        assert.equal(error.code, code);
        assert.deepEqual(error.cause, { status, code, requestId: "req_error" });
        assert.doesNotMatch(inspect(error), /siwc-access-secret|refresh-one/);
        return true;
      });
      assert.equal(f.requests.length, 1, "SDK retries must be disabled");
    } finally {
      await f.close();
    }
  });
}

for (const [name, events, code] of [
  ["missing search", [completed([message])], "SIWC_SEARCH_NOT_EXECUTED"],
  [
    "unsuccessful search",
    [completed([{ ...searchCall, status: "failed" }, message])],
    "SIWC_SEARCH_NOT_EXECUTED",
  ],
  [
    "incomplete response",
    [
      {
        type: "response.incomplete",
        response: {
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [searchCall, message],
        },
      },
    ],
    "SIWC_SEARCH_INCOMPLETE",
  ],
  [
    "failed response",
    [
      {
        type: "response.failed",
        response: {
          status: "failed",
          error: { code: "server_error", message: SECRET },
          output: [searchCall, message],
        },
      },
    ],
    "server_error",
  ],
  [
    "midstream error",
    [{ type: "error", code: "subscription_sharing_user_unavailable", message: SECRET }],
    "subscription_sharing_user_unavailable",
  ],
  [
    "EOF after output",
    [
      { type: "response.output_item.done", item: searchCall },
      { type: "response.output_item.done", item: message },
    ],
    "SIWC_SEARCH_INCOMPLETE",
  ],
  [
    "mismatched terminal status",
    [{ ...completed(), response: { ...completed().response, status: "in_progress" } }],
    "SIWC_SEARCH_INCOMPLETE",
  ],
] as const) {
  test(`SIWC rejects ${name} instead of returning a plausible answer`, async () => {
    const f = await fixture(() => sse([...events]));
    try {
      await assert.rejects(f.ctx.web.search({ query: "fixture" }), (error: unknown) => {
        assert.ok(error instanceof WebError);
        assert.equal(error.code, code);
        assert.doesNotMatch(inspect(error), /siwc-access-secret/);
        return true;
      });
      assert.equal(f.requests.length, 1);
    } finally {
      await f.close();
    }
  });
}

test("SIWC cancellation and timeout interrupt a live SSE body", async () => {
  for (const timeout of [false, true]) {
    let interrupted = false;
    const f = await fixture(
      (_request, signal) =>
        new Response(
          new ReadableStream({
            start(controller) {
              signal.addEventListener(
                "abort",
                () => {
                  interrupted = true;
                  controller.error(signal.reason);
                },
                { once: true },
              );
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
      { timeoutMs: timeout ? 20 : 5_000 },
    );
    try {
      const controller = new AbortController();
      const pending = f.ctx.web.search({ query: "fixture" }, controller.signal);
      const timer = timeout ? undefined : setTimeout(() => controller.abort(), 20);
      // Keep node:test alive while AbortSignal.timeout's unref'ed timer is pending.
      const keepAlive = setTimeout(() => {}, 1_000);
      try {
        await assert.rejects(pending, { code: timeout ? "WEB_TIMEOUT" : "WEB_ABORTED" });
        assert.equal(interrupted, true);
      } finally {
        clearTimeout(timer);
        clearTimeout(keepAlive);
      }
    } finally {
      await f.close();
    }
  }
});

test("SIWC retains safe diagnostics for named SSE errors even after a completed event", async () => {
  const f = await fixture(
    () =>
      new Response(
        `data: ${JSON.stringify(completed())}\n\nevent: error\ndata: ${JSON.stringify({ code: "server_error", message: SECRET })}\n\n`,
        { headers: { "content-type": "text/event-stream", "x-request-id": "req_late" } },
      ),
  );
  try {
    await assert.rejects(f.ctx.web.search({ query: "fixture" }), (error: unknown) => {
      assert.ok(error instanceof WebError);
      assert.equal(error.code, "server_error");
      assert.deepEqual(error.cause, { status: 200, code: "server_error", requestId: "req_late" });
      assert.doesNotMatch(inspect(error), /siwc-access-secret/);
      return true;
    });
  } finally {
    await f.close();
  }
});

test("SIWC turns citation markers into readable links and includes citation-only sources", async () => {
  const cited = {
    ...message,
    content: [
      {
        type: "output_text",
        text: "News [1] and [2].",
        annotations: [
          {
            type: "url_citation",
            start_index: 5,
            end_index: 8,
            url: "https://new.test/story",
            title: "News [today]",
          },
          {
            type: "url_citation",
            start_index: 13,
            end_index: 16,
            url: "javascript:alert(1)",
            title: "Unsafe",
          },
        ],
      },
    ],
  };
  const f = await fixture(() => sse([completed([searchCall, cited])]));
  try {
    const result = await f.ctx.web.search({ query: "fixture" });
    assert.equal(result.content, "News [News \\[today\\]](<https://new.test/story>) and [2].");
    assert.deepEqual(result.sources.at(-1), {
      url: "https://new.test/story",
      title: "News [today]",
    });
  } finally {
    await f.close();
  }
});

test("SIWC cancellation during token acquisition prevents an HTTP request", async () => {
  const f = await fixture();
  const controller = new AbortController();
  try {
    const original = f.accounts.accessToken.bind(f.accounts);
    f.accounts.accessToken = async (id) => {
      const token = await original(id);
      controller.abort();
      return token;
    };
    await assert.rejects(f.ctx.web.search({ query: "fixture" }, controller.signal), {
      code: "WEB_ABORTED",
    });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.close();
  }
});

test("SIWC reports account removal between selection and token acquisition without exposing auth errors", async () => {
  const f = await fixture();
  try {
    const original = f.accounts.accessToken.bind(f.accounts);
    f.accounts.accessToken = async (id) => {
      await f.accounts.change((current) => {
        current.accounts = [];
        delete current.activeId;
      });
      return original(id);
    };
    await assert.rejects(f.ctx.web.search({ query: "fixture" }), { code: "MISSING_CREDENTIAL" });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.close();
  }
});

test("SIWC isolates concurrent searches across account changes", async () => {
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent = new Promise<void>((resolve) => {
    started = resolve;
  });
  const f = await fixture(async (request) => {
    const query = (request.body.input as { content: string }[])[0].content;
    if (query === "first") {
      started();
      await waiting;
      return sse([completed()]);
    }
    return new Response(
      JSON.stringify({ error: { code: "rate_limit_exceeded", message: SECRET } }),
      {
        status: 429,
        headers: { "content-type": "application/json", "x-request-id": "req_second" },
      },
    );
  });
  try {
    const first = f.ctx.web.search({ query: "first" });
    await sent;
    await f.accounts.change((current) => {
      current.activeId = "two";
    });
    await assert.rejects(f.ctx.web.search({ query: "second" }), (error: unknown) => {
      assert.ok(error instanceof WebError);
      assert.deepEqual(error.cause, {
        status: 429,
        code: "rate_limit_exceeded",
        requestId: "req_second",
      });
      return true;
    });
    release();
    assert.equal((await first).sources[0].title, "Original report");
    assert.equal(f.requests[0].headers.get("authorization"), `Bearer ${SECRET}`);
    assert.equal(f.requests[1].headers.get("authorization"), "Bearer second-account-secret");
  } finally {
    release();
    await f.close();
  }
});

test("SIWC honors an already-aborted request without sending HTTP", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.ctx.web.search({ query: "fixture" }, AbortSignal.abort()), {
      code: "WEB_ABORTED",
    });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.close();
  }
});
