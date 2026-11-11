import type { FeatureImplementations } from "../fiber.ts";

/**
 * Host-half feature implementations, one cordis plugin per feature.
 * Separated from the client map so the Host bundle never pulls in React.
 * Keys must match the `host: true` entries of `FEATURES` exactly; the
 * registry test enforces that.
 */
export const HOST_IMPLEMENTATIONS: FeatureImplementations = {};
