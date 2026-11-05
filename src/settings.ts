import { clientRequestSchema } from "@deepseek-ai/dsh-client-connection";

import { USAGE_URL } from "./oauth.ts";

import type { Accounts } from "./accounts.ts";
import type { SiwcStatus } from "./settingsContract.ts";
import type { Context } from "@deepseek-ai/cordis";

/** Exact Connection routes inherit browser authentication, origin checks and owner authorization. */
export function registerSiwcSettings(ctx: Context, accounts: Accounts): void {
  ctx.connection.fetch.register({
    path: "/api/siwc/status",
    methods: ["POST"],
    requestBody: "buffered",
    async fetch(request) {
      if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json")
        return new Response("Expected application/json", { status: 415 });
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }
      const parsed = clientRequestSchema.safeParse(body);
      if (!parsed.success || parsed.data.method !== "siwc/status")
        return new Response("Invalid SIWC request", { status: 400 });
      const { rpcId, payload } = parsed.data;
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        Object.keys(payload).length !== 0
      ) {
        return Response.json({
          type: "server-response",
          rpcId,
          result: {
            ok: false,
            error: {
              code: "invalid-input",
              message: "SIWC status takes no parameters.",
              details: {},
            },
          },
        });
      }
      request.signal.throwIfAborted();
      const state = await accounts.read();
      request.signal.throwIfAborted();
      const account = state.accounts.find((entry) => entry.id === state.activeId && entry.tokens);
      const value: SiwcStatus = {
        ...(account
          ? {
              account: {
                id: account.id,
                label: `${account.email ?? "ChatGPT account"} (${account.id.slice(0, 8)})`,
              },
            }
          : {}),
        models: account?.models?.map(({ id, name }) => ({ id, name })) ?? [],
        usageUrl: USAGE_URL,
      };
      return Response.json(
        { type: "server-response", rpcId, result: { ok: true, value } },
        { headers: { "cache-control": "no-store" } },
      );
    },
  });
}
