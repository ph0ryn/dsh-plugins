import { installStyleElement } from "./styleElement.ts";

import type { Context, Plugin } from "@deepseek-ai/cordis";

/**
 * The model picker grid feature.
 *
 * The composer's model picker already groups models and ships a search box;
 * it only renders them as a single-column list. This feature restyles the
 * picker popup into equal-width columns that follow the viewport, using the
 * popup's own ARIA and `data-*` attributes as anchors: the popup renders
 * outside the slot tree, so it exposes no `data-slot` of its own.
 */

export const MODEL_PICKER_GRID_STYLES = `
[role="group"][aria-label="Model and reasoning effort"] {
  width: min(660px, calc(100vw - 32px)) !important;
  max-width: none !important;
}
[role="menu"][aria-label="Model"] { display: grid; gap: 4px 12px; }
[data-menu-group] {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(164px, 100%), 1fr));
  column-gap: 8px;
}
[data-menu-group-start],
[data-menu-group-heading] { grid-column: 1 / -1; }
[data-menu-group] [role="menuitemradio"],
[data-menu-group] [role="menuitemradio"] > span { min-width: 0; }
`;

/** One client feature: lay the model picker list out in responsive equal columns. */
export const modelPickerGrid: Plugin.Object = {
  name: "optimizations/model-picker-grid",
  apply(ctx: Context) {
    ctx.effect(() => installStyleElement("modelPickerGrid", MODEL_PICKER_GRID_STYLES));
  },
};
