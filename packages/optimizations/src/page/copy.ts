/** Display text for the settings page. English only, per the spec. */

export interface FeatureCopy {
  /** Feature name shown in the row heading. */
  readonly name: string;
  /** One-sentence explanation of what enabling the feature changes. */
  readonly description: string;
  /** Optional attribution appended to the description as one quiet link. */
  readonly credit?: { readonly name: string; readonly url: string };
}

/**
 * Copy for every feature in `FEATURES`. The registry test fails when an id is
 * missing, so a feature cannot ship without its English name and description.
 */
export const COPY: Readonly<Record<string, FeatureCopy>> = {
  compactSidebar: {
    name: "Compact sidebar",
    description: "Move the sidebar navigation into a menu so workspaces get more room.",
  },
  modelPickerGrid: {
    name: "Model picker grid",
    description: "Lay the model picker list out in equal columns that follow the window width.",
    credit: { name: "nakasyou", url: "https://x.com/nakasyou0/status/2121598360608178628" },
  },
};

/** Fixed page copy. */
export const PAGE = {
  title: "Optimizations",
  description: "Enable or disable small improvements individually. Changes apply immediately.",
  searchPlaceholder: "Search features",
  enableAll: "Enable all",
  disableAll: "Disable all",
  restoreDefaults: "Restore defaults",
  empty: "No features are available yet.",
  loading: "Loading settings…",
  readOnly: "Settings are read-only for this profile.",
  writeFailed: "Could not save the change. Try again.",
  restartRequired: "Requires a DSH restart",
  sides: {
    host: "Host",
    client: "Client",
    both: "Host and Client",
  },
} as const;
