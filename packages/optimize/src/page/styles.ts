/**
 * Settings page styles. Injected as `style[data-plugin="dsh-optimize"]` by the
 * mounted page, so the plugin leaves no style behind when Settings is closed
 * or the plugin is unloaded. Layout lives on the children; the `data-slot`
 * outlet wrapper is never styled.
 */
export const styles = `
.optimize-settings{display:grid;gap:20px;min-width:0;max-width:720px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.optimize-header{display:grid;gap:4px}
.optimize-header h2{font-size:18px;margin:0}
.optimize-header p{margin:0;color:var(--dsw-alias-label-tertiary)}
.optimize-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.optimize-search{flex:1 1 220px;min-width:0}
.optimize-actions{display:flex;gap:8px;flex-wrap:wrap}
.optimize-features{display:grid;margin:0;padding:0;list-style:none;border-block-start:1px solid var(--dsw-alias-border-l4)}
.optimize-feature{display:flex;align-items:center;gap:16px;padding-block:14px;border-block-end:1px solid var(--dsw-alias-border-l4)}
.optimize-feature-text{display:grid;gap:4px;min-width:0;flex:1}
.optimize-feature-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.optimize-feature-name{font-weight:600}
.optimize-feature-side,.optimize-feature-restart,.optimize-note,.optimize-empty{color:var(--dsw-alias-label-tertiary);font-size:12px}
.optimize-feature-restart{border:1px solid var(--dsw-alias-border-l4);border-radius:6px;padding:1px 6px;font-size:11px}
.optimize-feature-description{margin:0;color:var(--dsw-alias-label-tertiary)}
.optimize-note,.optimize-empty,.optimize-error{margin:0}
.optimize-error{color:var(--dsw-alias-label-primary)}
`;
