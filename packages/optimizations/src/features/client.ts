import { compactSidebar } from "./compactSidebar.tsx";

import type { FeatureImplementations } from "../fiber.ts";

/**
 * Client-half feature implementations, one cordis plugin per feature.
 * Keys must match the `client: true` entries of `FEATURES` exactly; the
 * registry test enforces that.
 */
export const CLIENT_IMPLEMENTATIONS: FeatureImplementations = {
  compactSidebar,
};
