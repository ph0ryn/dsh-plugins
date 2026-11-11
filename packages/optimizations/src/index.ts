import { getDshRuntimeVersion } from "@deepseek-ai/dsh-app-boot";

import { Config } from "./config.ts";
import { startHostRuntime } from "./host/runtime.ts";

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-settings";

export { Config };

/** Host Loader entry id; also the settings namespace and section id. */
export const name = "optimizations";

/**
 * Versions this plugin was developed against: the workspace type baseline
 * (0.2.1-rc.2) and the DSH release the local Web GUI runs (0.2.2-alpha.3).
 * A mismatch only warns; features are still attempted.
 */
const EXPECTED_DSH_VERSIONS = ["0.2.1-rc.2", "0.2.2-alpha.3"];

/** Host half: declare the settings schema, start Host-side feature runtime, suppress the auto page. */
export function apply(ctx: Context, config: Config): void {
  const version = getDshRuntimeVersion();
  if (!EXPECTED_DSH_VERSIONS.includes(version)) {
    ctx.logger.warn(
      "@ph0ryn/dsh-optimizations expects DSH %s; running %s. Compatibility is unverified; continuing.",
      EXPECTED_DSH_VERSIONS.join(", "),
      version,
    );
  }
  ctx.inject(["settings"], (scope) => {
    scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber));
  });
  startHostRuntime(ctx, config);
}
