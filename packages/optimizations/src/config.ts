import z from "@deepseek-ai/schemastery";

import { FEATURES } from "./features.ts";

import type { Volatile } from "@deepseek-ai/cordis";

/**
 * Schema version of this plugin's settings document. Kept as a volatile field
 * so the namespace always has at least one live field and stays served even
 * if `FEATURES` becomes empty again: `settings.describe()` skips a namespace
 * whose form has no volatile field, which would hide the settings tab.
 * The value is internal; the settings page never renders it.
 */
const SCHEMA_VERSION = 1;

/** Flat boolean field per feature, plus the internal schema version. */
export interface Config {
  readonly schemaVersion: Volatile<number>;
  readonly [featureId: string]: { get(): unknown };
}

export const Config = z.object({
  ...Object.fromEntries(
    FEATURES.map((feature) => [feature.id, z.boolean().default(false).volatile()]),
  ),
  schemaVersion: z.number().default(SCHEMA_VERSION).volatile(),
});

/** The internal field name, for diagnostics and tests. */
export const SCHEMA_VERSION_FIELD = "schemaVersion";
