import { diffFeatures, liveFeatures } from "../diff.ts";
import { FEATURES } from "../features.ts";
import { HOST_IMPLEMENTATIONS } from "../features/host.ts";
import { applyFeatureDiff, disposeFibers, implementationFor } from "../fiber.ts";

import type { Config } from "../config.ts";
import type { FeatureMeta } from "../features.ts";
import type { FeatureImplementations } from "../fiber.ts";
import type { Context, Fiber } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/cordis-plugin-loader";

/** Registry and implementation map a Host runtime applies; tests inject synthetic ones. */
export interface HostRuntimeSource {
  readonly features: readonly FeatureMeta[];
  readonly implementations: FeatureImplementations;
}

const SOURCE: HostRuntimeSource = { features: FEATURES, implementations: HOST_IMPLEMENTATIONS };

/**
 * Apply Host-side toggles.
 *
 * Immediate features follow `loader/volatile-update`, which the Loader sends
 * only to the owning fiber after a volatile value actually changed.
 * Restart-only features are decided once from the startup value and never
 * remount on a toggle.
 */
export function startHostRuntime(
  ctx: Context,
  config: Config,
  source: HostRuntimeSource = SOURCE,
): void {
  const immediate = liveFeatures(source.features, "host");
  const restart = source.features.filter(
    (feature) => feature.host === true && feature.reload === "restart",
  );
  const fibers = new Map<string, Fiber>();
  let previous: Readonly<Record<string, unknown>> = {};

  const snapshot = (): Record<string, unknown> =>
    Object.fromEntries(immediate.map((feature) => [feature.id, config[feature.id].get() === true]));

  const sync = () => {
    const next = snapshot();
    const diff = diffFeatures(immediate, previous, next);
    previous = next;
    applyFeatureDiff(ctx, source.implementations, fibers, diff);
  };

  ctx.effect(() => {
    previous = {};
    for (const feature of restart) {
      if (config[feature.id].get() === true) {
        fibers.set(feature.id, ctx.plugin(implementationFor(source.implementations, feature.id)));
      }
    }
    sync();
    const off = ctx.on("loader/volatile-update", sync);
    return () => {
      off();
      disposeFibers(fibers);
    };
  });
}
