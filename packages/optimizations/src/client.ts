import { createElement } from "react";

import { startClientRuntime } from "./client/runtime.ts";
import { SettingsPage } from "./page/SettingsPage.tsx";
import { SECTION } from "./section.ts";

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";

export const inject = ["slots", "configForms"];

/** Client half: register the settings tab while the Host serves the namespace, then apply toggles. */
export function apply(ctx: Context): void {
  const form = ctx.configForms.get<Record<string, unknown>>(SECTION.id);
  ctx.effect(() =>
    ctx.configForms.whileServed([SECTION.id], () =>
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(SECTION, () => createElement(SettingsPage, { form })),
      ),
    ),
  );
  startClientRuntime(ctx, form);
}
