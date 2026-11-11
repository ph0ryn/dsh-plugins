/**
 * Feature registry shared by both halves. Pure data: no React, no cordis.
 *
 * `FEATURES` is the single source of truth. The settings schema is generated
 * from it, each half validates its implementation map against its own side
 * flags, and the settings page renders its entries in this order.
 */

export const GROUPS = ["conversation", "composer", "sidebar", "shell", "host"] as const;

export type FeatureGroup = (typeof GROUPS)[number];

export interface FeatureMeta {
  /** Settings key and feature identifier (camelCase). */
  readonly id: string;
  /** Settings page grouping; presentation only, never part of the settings key. */
  readonly group: FeatureGroup;
  /** The feature has a Host-half implementation. */
  readonly host?: true;
  /** The feature has a Client-half implementation. */
  readonly client?: true;
  /** Omitted means the toggle applies immediately; `restart` needs a DSH restart. */
  readonly reload?: "restart";
}

/** Definitions kept const so `FeatureId` narrows as features are added. */
const DEFINITIONS = [] as const satisfies readonly FeatureMeta[];

/** Every known feature. Empty until feature work starts; order defines page order. */
export const FEATURES: readonly FeatureMeta[] = DEFINITIONS;

export type FeatureId = (typeof DEFINITIONS)[number]["id"];
