import { useSyncExternalStore } from "react";

import type { Context, Plugin } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type { StoredEntry } from "@deepseek-ai/dsh-client-ui-slots";
import type { ComponentType } from "react";

/**
 * The compact sidebar feature.
 *
 * It reuses the shell's own controls instead of rebuilding them: the brand
 * mark, New Session, the panel list's More button, and the collapse control
 * are only repositioned into one row, and the three panel rows are folded into
 * the existing More menu. The shell keeps ownership of every control, so
 * focus, keyboard handling, tooltips, and labels stay as shipped.
 */

export const COMPACT_SIDEBAR_STYLES = `
div:has(> [data-slot="sidebar"]) { container-type: inline-size; }
@container (min-width: 200px) {
  [data-slot="sidebar"] > div { position: relative; }
  [data-slot="sidebar"] > div > div:first-child {
    height: 44px;
    padding: 8px 0 0 8px;
    gap: 6px;
    justify-content: space-between;
  }
  [data-slot="sidebar.brand.name"] { display: none !important; }
  [data-slot="sidebar"] > div > div:first-child > button:first-child {
    width: 28px;
    min-width: 28px;
    flex: 0 0 auto;
    padding: 0;
    justify-content: center;
  }
  [data-slot="sidebar"] > div > button {
    position: absolute;
    top: 18px;
    left: 44px;
    width: 152px;
    height: 28px;
    min-height: 28px;
    padding: 0 10px;
  }
  [data-slot="sidebar"] > div > button > span:last-child { display: none !important; }
  [data-slot="sidebar"] > div > nav { display: contents; }
  [data-slot="sidebar"] > div > nav > button { display: none; }
  [data-slot="sidebar"] > div > nav > span { position: absolute; top: 18px; right: 44px; }
  [data-slot="sidebar"] > div > nav > span > button {
    width: 28px;
    height: 28px;
    min-height: 28px;
    padding: 0;
    justify-content: center;
  }
  [data-slot="sidebar"] > div > nav > span > button > span:last-child { display: none !important; }
}
.optimize-sidebar-nav {
  display: grid;
  gap: 2px;
  margin-block-end: 4px;
  padding-block-end: 6px;
  border-block-end: 1px solid var(--dsw-alias-border-l1);
}
.optimize-sidebar-nav-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 32px;
  padding: 4px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  text-align: start;
  cursor: pointer;
}
.optimize-sidebar-nav-row:hover,
.optimize-sidebar-nav-row:focus-visible { background: var(--dsw-alias-border-l1); }
.optimize-sidebar-nav-row:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.optimize-sidebar-nav-row[aria-current="true"] { background: var(--dsw-alias-border-l1); font-weight: 600; }
.optimize-sidebar-nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--dsw-alias-label-secondary);
}
.optimize-sidebar-nav-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

/** Services the menu rows read; the registration's inject face carries them. */
export interface CompactSidebarServices {
  readonly slots: { entries(key: string): readonly StoredEntry[] };
  readonly layout: {
    readonly panelInfo: {
      getSnapshot(): { readonly activePanelId: string | null };
      subscribe(listener: () => void): () => void;
    };
    selectPanel(panelId: string | null): void;
  };
}

export interface SidebarNavRowsProps extends CompactSidebarServices {
  readonly onDismiss: () => void;
}

interface PanelRow {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly Icon?: ComponentType<{ size: number; active: boolean }>;
}

function resolveLabel(entry: StoredEntry, fallback: string): string {
  const label = entry.options.label;
  if (typeof label === "string") return label;
  if (typeof label === "function") return label();
  return fallback;
}

/** Registered panel launchers in the order the sidebar shows them. */
export function panelRows(slots: CompactSidebarServices["slots"]): readonly PanelRow[] {
  return slots
    .entries("sidebar.panellist")
    .flatMap((entry) => {
      const id = entry.options.id;
      if (!id) return [];
      return [
        {
          id,
          label: resolveLabel(entry, id),
          order: entry.options.order ?? 0,
          Icon: entry.component as PanelRow["Icon"],
        },
      ];
    })
    .sort((a, b) => a.order - b.order);
}

/**
 * The rows prepended to the panel list's More menu: the navigation rows that
 * the compact header folded away. Clicking a row selects its panel and closes
 * the menu through the shell-provided `onDismiss`.
 */
export function SidebarNavRows({ slots, layout, onDismiss }: SidebarNavRowsProps) {
  const activePanelId = useSyncExternalStore(
    (onChange) => layout.panelInfo.subscribe(onChange),
    () => layout.panelInfo.getSnapshot().activePanelId,
  );
  return (
    <div className="optimize-sidebar-nav" role="group" aria-label="Sidebar navigation">
      {panelRows(slots).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="menuitem"
          className="optimize-sidebar-nav-row"
          aria-current={activePanelId === id ? "true" : undefined}
          onClick={() => {
            onDismiss();
            layout.selectPanel(id);
          }}
        >
          <span className="optimize-sidebar-nav-icon" aria-hidden="true">
            {Icon ? <Icon size={16} active={activePanelId === id} /> : null}
          </span>
          <span className="optimize-sidebar-nav-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

function installStyles(): () => void {
  const style = document.createElement("style");
  style.dataset.plugin = "dsh-optimize";
  style.dataset.optimizeFeature = "compactSidebar";
  style.textContent = COMPACT_SIDEBAR_STYLES;
  document.head.append(style);
  return () => style.remove();
}

/** One client feature: compact the sidebar header and fold its panel rows into the More menu. */
export const compactSidebar: Plugin.Object = {
  name: "optimize/compact-sidebar",
  inject: ["slots", "layout"],
  apply(ctx: Context) {
    ctx.effect(installStyles);
    ctx.effect(() =>
      ctx.slots.inject("sidebar.panellist.actions", () =>
        ctx.slots.register(
          {
            name: "sidebar.panellist.actions",
            id: "optimize-sidebar-nav",
            order: -100,
            inject: () => ({ slots: ctx.slots, layout: ctx.layout }),
          },
          SidebarNavRows,
        ),
      ),
    );
  },
};
