import { clientRequestSchema } from "@deepseek-ai/dsh-client-connection";

import { SiwcAccountSettings } from "./accountSettings.ts";

import type { Context } from "@deepseek-ai/cordis";
import type { ConnectionRpcHandlerResult } from "@deepseek-ai/dsh-client-connection";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function empty(value: unknown): value is Record<string, never> {
  return record(value) && Object.keys(value).length === 0;
}

function failure(message: string): ConnectionRpcHandlerResult {
  return { ok: false, error: { code: "invalid-input", message, details: {} } };
}

async function dispatch(
  ctx: Context,
  settings: SiwcAccountSettings,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<ConnectionRpcHandlerResult> {
  signal.throwIfAborted();
  try {
    if (endpoint === "status") {
      if (!empty(payload)) return failure("SIWC status takes no parameters.");
      return { ok: true, value: await settings.status() };
    }
    if (endpoint === "authorize") {
      if (
        !record(payload) ||
        (payload.method !== "oauth" && payload.method !== "select") ||
        (payload.accountId !== undefined &&
          (typeof payload.accountId !== "string" || !payload.accountId)) ||
        Object.keys(payload).some((key) => key !== "method" && key !== "accountId")
      )
        return failure("Choose a valid SIWC authorization method.");
      return {
        ok: true,
        value: await settings.authorize(payload.method, payload.accountId as string | undefined),
      };
    }
    if (endpoint === "answer") {
      if (
        !record(payload) ||
        Object.keys(payload).length !== 1 ||
        typeof payload.choice !== "string" ||
        !payload.choice
      )
        return failure("Choose one of the available sign-in options.");
      return { ok: true, value: await settings.answer(payload.choice) };
    }
    if (endpoint === "cancel") {
      if (!empty(payload)) return failure("SIWC cancel takes no parameters.");
      return { ok: true, value: await settings.cancel() };
    }
    if (endpoint === "logout") {
      if (!empty(payload)) return failure("SIWC logout takes no parameters.");
      return { ok: true, value: await settings.logout() };
    }
    return failure("Unknown SIWC Settings action.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not complete the SIWC Settings action.";
    ctx.logger.warn("SIWC Settings action %s failed: %s", endpoint, message);
    return {
      ok: false,
      error: { code: "siwc/action-failed", message, details: {} },
    };
  }
}

/** Exact Connection routes inherit browser authentication, origin checks and owner authorization. */
export function registerSiwcSettings(ctx: Context, settings: SiwcAccountSettings): void {
  for (const endpoint of ["status", "authorize", "answer", "cancel", "logout"] as const) {
    ctx.connection.fetch.register({
      path: `/api/siwc/${endpoint}`,
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
        if (!parsed.success || parsed.data.method !== `siwc/${endpoint}`)
          return new Response("Invalid SIWC request", { status: 400 });
        const { rpcId, payload } = parsed.data;
        const result = await dispatch(ctx, settings, endpoint, payload, request.signal);
        return Response.json(
          { type: "server-response", rpcId, result },
          { headers: { "cache-control": "no-store" } },
        );
      },
    });
  }
}
