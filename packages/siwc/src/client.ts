import { createElement as h } from "react";

import { SiwcSettingsPage } from "./clientView.ts";

import type { SiwcStatus } from "./settingsContract.ts";
import type { Context } from "@deepseek-ai/cordis";
import type { ClientConnectionRpc } from "@deepseek-ai/dsh-client-connection/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";

export const inject = ["slots", "configForms", "connection"];

const styles = `
.siwc-settings{display:grid;min-width:0;max-width:640px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.siwc-settings h2{font-size:18px;margin:0 0 4px}.siwc-settings h3,.siwc-settings p{margin:0}.siwc-settings h3,.siwc-settings label{font-size:13px;font-weight:600}
.siwc-settings .siwc-group{display:grid;gap:10px;min-width:0;padding-block:20px}.siwc-settings .siwc-group+.siwc-group{border-block-start:1px solid var(--dsw-alias-border-l4)}
.siwc-settings .siwc-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}.siwc-settings .siwc-state{overflow-wrap:anywhere}.siwc-settings>.siwc-group:last-child{padding-block-end:0}
.siwc-settings select,.siwc-settings button{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l4);border-radius:8px;padding:8px 12px;min-height:36px}
.siwc-settings select{width:100%;min-width:0}.siwc-settings button{width:fit-content;max-width:100%;cursor:pointer}.siwc-settings button:disabled,.siwc-settings select:disabled{opacity:.5;cursor:default}
.siwc-settings :is(button,select,a):focus-visible{outline:2px solid var(--dsw-alias-link);outline-offset:3px}.siwc-settings a{color:var(--dsw-alias-link);overflow-wrap:anywhere}.siwc-settings .siwc-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.siwc-settings [role=alert]{color:var(--dsw-alias-label-primary)}
`;

function parseStatus(value: unknown): SiwcStatus {
  if (!value || typeof value !== "object") throw new Error("Invalid SIWC status");
  const status = value as Partial<SiwcStatus>;
  if (
    status.usageUrl !== "https://chatgpt.com/settings/usage" ||
    !Array.isArray(status.models) ||
    status.models.some(
      (model) => !model || typeof model.id !== "string" || typeof model.name !== "string",
    ) ||
    (status.account !== undefined &&
      (!status.account ||
        typeof status.account.id !== "string" ||
        typeof status.account.label !== "string"))
  ) {
    throw new Error("Invalid SIWC status");
  }
  return status as SiwcStatus;
}

export function apply(ctx: Context): void {
  // Host and client Connection types coexist in this package's typecheck, but run separately.
  const rpc = (ctx.get("connection") as unknown as { rpc: ClientConnectionRpc }).rpc;
  const form = ctx.configForms.get<{ searchModel?: string }>("siwc");
  const web = ctx.configForms.get<{ searchProvider?: string }>("web");
  const loadStatus = async (signal?: AbortSignal): Promise<SiwcStatus> => {
    const result = await rpc.call("/api", "siwc/status", {}, signal);
    if (!result.ok) throw new Error("Could not load SIWC status");
    return parseStatus(result.value);
  };
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
          () => h(SiwcSettingsPage, { form, web, loadStatus, subscribeReset }),
        ),
      ),
    ),
  );
}
