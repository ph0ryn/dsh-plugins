/**
 * The settings-section registration identity.
 *
 * `id` must equal the Host Loader entry id (`optimizations`), because the section
 * only appears while that namespace is served. `order: 25` follows the shipped
 * sections (account -10, general 0, models 10, plugins 15, agent-presets 20)
 * without displacing them.
 */
export const SECTION = {
  name: "settings.section",
  id: "optimizations",
  order: 25,
  label: "Optimizations",
} as const;
