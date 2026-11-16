/**
 * Install a feature-owned `<style>` element and return its removal.
 *
 * Every Client feature owns exactly one element and removes it from its fiber's
 * effect cleanup, so disabling the feature leaves no plugin styles behind.
 */
export function installStyleElement(feature: string, css: string): () => void {
  const style = document.createElement("style");
  style.dataset.plugin = "@ph0ryn/dsh-optimizations";
  style.dataset.optimizationsFeature = feature;
  style.textContent = css;
  document.head.append(style);
  return () => style.remove();
}
