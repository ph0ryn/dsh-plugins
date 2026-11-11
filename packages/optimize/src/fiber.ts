import type { FeatureDiff } from "./diff.ts";
import type { Context, Fiber, Plugin } from "@deepseek-ai/cordis";

/** One feature implementation per feature id, validated against the registry by tests. */
export type FeatureImplementations = Readonly<Partial<Record<string, Plugin.Object>>>;

/** Resolve one feature implementation or fail loudly on a registry/map mismatch. */
export function implementationFor(
  implementations: FeatureImplementations,
  id: string,
): Plugin.Object {
  const implementation = implementations[id];
  if (!implementation)
    throw new Error(`optimize: no implementation registered for feature "${id}"`);
  return implementation;
}

/**
 * Apply one computed transition: dispose first, then mount, both through
 * cordis fibers so each feature owns its effects and failures in isolation.
 */
export function applyFeatureDiff(
  ctx: Context,
  implementations: FeatureImplementations,
  fibers: Map<string, Fiber>,
  diff: FeatureDiff,
): void {
  for (const id of diff.dispose) {
    const fiber = fibers.get(id);
    fibers.delete(id);
    if (fiber) void fiber.dispose();
  }
  for (const id of diff.mount) {
    fibers.set(id, ctx.plugin(implementationFor(implementations, id)));
  }
}

/** Dispose every feature fiber and forget them. */
export function disposeFibers(fibers: Map<string, Fiber>): void {
  for (const fiber of fibers.values()) void fiber.dispose();
  fibers.clear();
}
