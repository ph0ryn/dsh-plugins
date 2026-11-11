import type { FeatureMeta } from "./features.ts";

/** Features to mount and to dispose, computed from two setting snapshots. */
export interface FeatureDiff {
  readonly mount: readonly string[];
  readonly dispose: readonly string[];
}

/** Features a runtime owns on one side and can apply without a restart. */
export function liveFeatures(
  features: readonly FeatureMeta[],
  side: "host" | "client",
): readonly FeatureMeta[] {
  return features.filter((feature) => feature[side] === true && feature.reload !== "restart");
}

/**
 * Compute the mount/dispose sets between two setting values.
 *
 * Pure so both runtimes share the same transition rules: only features in
 * `features` are considered, only a real false-to-true or true-to-false edge
 * produces work, and unknown or missing keys are ignored.
 */
export function diffFeatures(
  features: readonly FeatureMeta[],
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): FeatureDiff {
  const mount: string[] = [];
  const dispose: string[] = [];
  for (const feature of features) {
    const before = previous[feature.id] === true;
    const after = next[feature.id] === true;
    if (before === after) continue;
    (after ? mount : dispose).push(feature.id);
  }
  return { mount, dispose };
}
