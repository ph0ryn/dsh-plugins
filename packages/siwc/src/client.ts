import { createElement as h } from "react";

import { SiwcSettingsPage } from "./clientView.ts";

import type { SiwcAccount, SiwcAttempt, SiwcStatus } from "./settingsContract.ts";
import type { Context } from "@deepseek-ai/cordis";
import type { ClientConnectionRpc } from "@deepseek-ai/dsh-client-connection/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";

export const inject = ["slots", "configForms", "connection"];

const styles = `
.siwc-settings{display:grid;min-width:0;max-width:640px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.siwc-settings h2{font-size:18px;margin:0 0 4px}.siwc-settings h3,.siwc-settings h4,.siwc-settings p{margin:0}.siwc-settings h3,.siwc-settings h4,.siwc-settings label{font-size:13px;font-weight:600}
.siwc-settings .siwc-group{display:grid;gap:10px;min-width:0;padding-block:20px}.siwc-settings .siwc-group+.siwc-group{border-block-start:1px solid var(--dsw-alias-border-l4)}
.siwc-settings .siwc-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}.siwc-settings .siwc-state{overflow-wrap:anywhere}.siwc-settings>.siwc-group:last-child{padding-block-end:0}
.siwc-settings select,.siwc-settings button{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l4);border-radius:8px;padding:8px 12px;min-height:36px}
.siwc-settings select{width:100%;min-width:0}.siwc-settings button{width:fit-content;min-width:0;max-width:100%;overflow-wrap:anywhere;cursor:pointer}.siwc-settings button:disabled,.siwc-settings select:disabled{opacity:.5;cursor:default}
.siwc-settings :is(button,select,a):focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:3px}.siwc-settings a{color:var(--dsw-alias-link);overflow-wrap:anywhere}.siwc-settings .siwc-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.siwc-settings [role=alert]{color:var(--dsw-alias-label-primary)}
.siwc-settings .siwc-account-line{display:flex;align-items:center;gap:8px;min-width:0}.siwc-settings .siwc-account-line select{flex:1;width:auto}.siwc-settings .siwc-icon-button{display:inline-flex;flex:none;align-items:center;justify-content:center;width:36px;padding:0}
.siwc-settings .siwc-confirm,.siwc-settings .siwc-attempt{display:grid;gap:8px;padding:12px;border:1px solid var(--dsw-alias-border-l4);border-radius:8px}
`;

function parseAccount(value: unknown): SiwcAccount {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as SiwcAccount).id !== "string" ||
    typeof (value as SiwcAccount).label !== "string" ||
    typeof (value as SiwcAccount).active !== "boolean" ||
    typeof (value as SiwcAccount).signedIn !== "boolean"
  )
    throw new Error("Invalid SIWC account");
  return value as SiwcAccount;
}

function parseAttempt(value: unknown): SiwcAttempt {
  if (!value || typeof value !== "object") throw new Error("Invalid SIWC attempt");
  const attempt = value as Partial<SiwcAttempt>;
  if (
    typeof attempt.id !== "string" ||
    (attempt.method !== "oauth" && attempt.method !== "select") ||
    !["running", "authorized", "cancelled", "failed"].includes(attempt.phase ?? "") ||
    (attempt.notice !== undefined &&
      (typeof attempt.notice.message !== "string" ||
        (attempt.notice.url !== undefined && typeof attempt.notice.url !== "string"))) ||
    (attempt.prompt !== undefined &&
      (attempt.prompt.kind !== "select" ||
        typeof attempt.prompt.message !== "string" ||
        !Array.isArray(attempt.prompt.options) ||
        attempt.prompt.options.some(
          (option) => !option || typeof option.id !== "string" || typeof option.label !== "string",
        ))) ||
    (attempt.error !== undefined && typeof attempt.error !== "string")
  )
    throw new Error("Invalid SIWC attempt");
  return attempt as SiwcAttempt;
}

function parseStatus(value: unknown): SiwcStatus {
  if (!value || typeof value !== "object") throw new Error("Invalid SIWC status");
  const status = value as Partial<SiwcStatus>;
  if (
    status.usageUrl !== "https://chatgpt.com/settings/usage" ||
    !Array.isArray(status.accounts) ||
    !Array.isArray(status.models) ||
    status.models.some(
      (model) => !model || typeof model.id !== "string" || typeof model.name !== "string",
    ) ||
    (status.account !== undefined &&
      (!status.account ||
        typeof status.account.id !== "string" ||
        typeof status.account.label !== "string"))
  )
    throw new Error("Invalid SIWC status");
  return {
    ...status,
    accounts: status.accounts.map(parseAccount),
    ...(status.attempt ? { attempt: parseAttempt(status.attempt) } : {}),
  } as SiwcStatus;
}

export function apply(ctx: Context): void {
  // Host and client Connection types coexist in this package's typecheck, but run separately.
  const rpc = (ctx.get("connection") as unknown as { rpc: ClientConnectionRpc }).rpc;
  const form = ctx.configForms.get<{ searchModel?: string }>("siwc");
  const web = ctx.configForms.get<{ searchProvider?: string }>("web");
  async function call<T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> {
    const result = await rpc.call("/api", endpoint, payload, signal);
    if (!result.ok) throw new Error(result.error.message);
    return result.value as T;
  }
  const loadStatus = async (signal?: AbortSignal): Promise<SiwcStatus> =>
    parseStatus(await call("siwc/status", {}, signal));
  const authorize = async (
    method: "oauth" | "select",
    accountId?: string,
    signal?: AbortSignal,
  ): Promise<{ status: SiwcStatus; message?: string }> =>
    parseStatusResult(
      await call("siwc/authorize", { method, ...(accountId ? { accountId } : {}) }, signal),
    );
  const answer = async (
    choice: string,
    attemptId: string,
    signal?: AbortSignal,
  ): Promise<{ status: SiwcStatus; message?: string }> =>
    parseStatusResult(await call("siwc/answer", { choice, attemptId }, signal));
  const cancel = async (
    attemptId: string,
    signal?: AbortSignal,
  ): Promise<{ status: SiwcStatus; message?: string }> =>
    parseStatusResult(await call("siwc/cancel", { attemptId }, signal));
  const logout = async (signal?: AbortSignal): Promise<{ status: SiwcStatus; message?: string }> =>
    parseStatusResult(await call("siwc/logout", {}, signal));
  const subscribeReset = (listener: () => void) => ctx.on("connection/reset", listener);
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-siwc";
    style.textContent = styles;
    document.head.appendChild(style);
    return () => style.remove();
  });
  ctx.effect(() =>
    ctx.configForms.whileServed(["siwc"], () =>
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          {
            name: "settings.section",
            id: "siwc",
            order: 35,
            label: () => "SIWC",
          },
          () =>
            h(SiwcSettingsPage, {
              form,
              web,
              loadStatus,
              authorize,
              answer,
              cancel,
              logout,
              subscribeReset,
            }),
        ),
      ),
    ),
  );
}

function parseStatusResult(value: unknown): { status: SiwcStatus; message?: string } {
  if (!value || typeof value !== "object") throw new Error("Invalid SIWC action result");
  const result = value as { status?: unknown; message?: unknown };
  if (result.message !== undefined && typeof result.message !== "string")
    throw new Error("Invalid SIWC action result");
  return {
    status: parseStatus(result.status),
    ...(result.message ? { message: result.message } : {}),
  };
}
