import { diffFeatures, liveFeatures } from "../diff.ts";
import { FEATURES } from "../features.ts";
import { CLIENT_IMPLEMENTATIONS } from "../features/client.ts";
import { applyFeatureDiff, disposeFibers } from "../fiber.ts";

import type { FeatureMeta } from "../features.ts";
import type { FeatureImplementations } from "../fiber.ts";
import type { Context, Fiber } from "@deepseek-ai/cordis";

/** The slice of a shared config form the runtime reads. */
export interface ClientRuntimeForm {
  getSnapshot(): { readonly value: Readonly<Record<string, unknown>> | undefined };
  subscribe(listener: () => void): () => void;
}

/** Registry and implementation map a Client runtime applies; tests inject synthetic ones. */
export interface ClientRuntimeSource {
  readonly features: readonly FeatureMeta[];
  readonly implementations: FeatureImplementations;
}

const SOURCE: ClientRuntimeSource = { features: FEATURES, implementations: CLIENT_IMPLEMENTATIONS };

/**
 * Apply Client-side toggles from the shared config form snapshot.
 *
 * The snapshot value is undefined while the namespace is loading or not
 * served, so nothing is applied before the Host's value is known. Restart-only
 * features are skipped here: the settings page only marks them as requiring a
 * restart.
 */
export function startClientRuntime(
  ctx: Context,
  form: ClientRuntimeForm,
  source: ClientRuntimeSource = SOURCE,
): void {
  const immediate = liveFeatures(source.features, "client");
  const fibers = new Map<string, Fiber>();

  ctx.effect(() => {
    let previous: Readonly<Record<string, unknown>> = {};
    const sync = () => {
      const value = form.getSnapshot().value;
      if (!value) return;
      const diff = diffFeatures(immediate, previous, value);
      previous = value;
      applyFeatureDiff(ctx, source.implementations, fibers, diff);
    };
    sync();
    const off = form.subscribe(sync);
    return () => {
      off();
      disposeFibers(fibers);
    };
  });
}
