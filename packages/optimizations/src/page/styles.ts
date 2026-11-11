/**
 * Settings page styles. Injected as `style[data-plugin="@ph0ryn/dsh-optimizations"]` by the
 * mounted page, so the plugin leaves no style behind when Settings is closed
 * or the plugin is unloaded. Layout lives on the children; the `data-slot`
 * outlet wrapper is never styled.
 */
export const styles = `
.optimizations-settings{display:grid;gap:20px;min-width:0;max-width:720px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.optimizations-header{display:grid;gap:4px}
.optimizations-header h2{font-size:18px;margin:0}
.optimizations-header p{margin:0;color:var(--dsw-alias-label-tertiary)}
.optimizations-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.optimizations-search{flex:1 1 220px;min-width:0}
.optimizations-actions{display:flex;gap:8px;flex-wrap:wrap}
.optimizations-features{display:grid;margin:0;padding:0;list-style:none;border-block-start:1px solid var(--dsw-alias-border-l4)}
.optimizations-feature{display:flex;align-items:center;gap:16px;padding-block:14px;border-block-end:1px solid var(--dsw-alias-border-l4)}
.optimizations-feature-text{display:grid;gap:4px;min-width:0;flex:1}
.optimizations-feature-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.optimizations-feature-name{font-weight:600}
.optimizations-feature-side,.optimizations-feature-restart,.optimizations-note,.optimizations-empty{color:var(--dsw-alias-label-tertiary);font-size:12px}
.optimizations-feature-restart{border:1px solid var(--dsw-alias-border-l4);border-radius:6px;padding:1px 6px;font-size:11px}
.optimizations-feature-description{margin:0;color:var(--dsw-alias-label-tertiary)}
.optimizations-note,.optimizations-empty,.optimizations-error{margin:0}
.optimizations-error{color:var(--dsw-alias-label-primary)}
`;
