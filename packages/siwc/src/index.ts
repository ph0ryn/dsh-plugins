import { getDshRuntimeVersion } from "@deepseek-ai/dsh-app-boot";
import z from "@deepseek-ai/schemastery";

import { Accounts, KEY } from "./accounts.ts";
import { SiwcAccountSettings } from "./accountSettings.ts";
import { ChatGPTAdapter } from "./adapter.ts";
import { IdentityUnavailable, OpenAIConnectionError, OpenAIError, listModels } from "./oauth.ts";
import { createSiwcSearchProvider } from "./search.ts";
import { registerSiwcSettings } from "./settings.ts";

import type { Context, Volatile } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-settings";

export const name = "siwc";
export const inject = ["credentials", "authorization", "llm"];

export interface Config {
  searchModel: Volatile<string>;
}
export const Config = z.object({
  searchModel: z.string().default("").volatile(),
});

const EXPECTED_DSH_VERSIONS = ["0.2.1-rc.2", "0.2.2-alpha.2", "0.2.2-alpha.3", "0.2.2-rc.5"];

async function refreshModels(ctx: Context, accounts: Accounts): Promise<void> {
  const state = await accounts.read();
  const active = state.accounts.find((account) => account.id === state.activeId);
  if (!active?.tokens) return;

  let access: string;
  let models: Awaited<ReturnType<typeof listModels>>;
  try {
    access = await accounts.accessToken(active.id);
    models = await listModels(access);
  } catch (error) {
    if (
      !(error instanceof OpenAIConnectionError) &&
      !(error instanceof OpenAIError) &&
      !(error instanceof IdentityUnavailable)
    )
      throw error;
    ctx.logger.warn(
      "Could not refresh ChatGPT models at startup; keeping the saved catalog: %s",
      error.message,
    );
    return;
  }
  await accounts.change((current) => {
    const saved = current.accounts.find((account) => account.id === active.id);
    // Do not apply a response to an account signed out or reconnected during the request.
    if (saved?.tokens?.access === access) saved.models = models;
  });
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const version = getDshRuntimeVersion();
  if (!EXPECTED_DSH_VERSIONS.includes(version)) {
    ctx.logger.warn(
      "dsh-siwc expects DSH %s; running %s. Compatibility is unverified; continuing.",
      EXPECTED_DSH_VERSIONS.join(", "),
      version,
    );
  }
  const accounts = new Accounts(ctx.credentials);
  await refreshModels(ctx, accounts);
  const adapter = new ChatGPTAdapter(ctx, accounts);
  ctx.llm.registerAdapter(["openai"], adapter);
  ctx.inject(["web"], (scope) => {
    scope.web.registerSearchProvider(
      createSiwcSearchProvider(accounts, () => config.searchModel.get()),
    );
  });

  const accountSettings = new SiwcAccountSettings(ctx, accounts, () => adapter.sync());
  ctx.effect(() => () => accountSettings.dispose());
  ctx.inject(["connection"], (scope) => registerSiwcSettings(scope, accountSettings));
  ctx.inject(["settings"], (scope) => {
    scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber));
  });
  ctx.effect(() =>
    ctx.authorization.registerFlow({
      key: KEY,
      label: "ChatGPT plan",
      methods: [
        { id: "oauth", label: "Continue with ChatGPT" },
        { id: "select", label: "Switch saved account" },
      ],
      run: (session) => accountSettings.authorizeSession(session),
    }),
  );
}
