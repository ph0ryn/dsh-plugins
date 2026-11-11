/**
 * Build-artifact checks. Run from the `build` script after `vp pack`, so a
 * broken bundle fails the build instead of shipping.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

const server = await import(pathToFileURL(join(packageDir, "dist/server/index.js")).href);
assert.equal(server.name, "optimizations", "the Host entry id must stay `optimizations`");
assert.equal(typeof server.apply, "function", "the Host half must export apply");
assert.ok(server.Config, "the Host half must export the settings schema");

const clientCode = await readFile(join(packageDir, "dist/client/client.cjs"), "utf8");
let loaded: { id?: string; factory?: unknown } | undefined;
const window = {
  __ModuleLoader__: {
    load(spec: { id?: string; factory?: unknown }) {
      loaded = spec;
    },
  },
};
// Evaluating the bundle also proves JSX was compiled: raw JSX would not parse.
new Function("window", clientCode)(window);
assert.equal(loaded?.id, "@ph0ryn/dsh-optimizations", "the module id must be the package name");
assert.equal(typeof loaded?.factory, "function", "the Module Loader factory must be a function");
assert.match(clientCode, /require\("react\/jsx-runtime"\)/, "JSX must use the shared runtime");

const manifest = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8")) as {
  name?: string;
};
assert.equal(manifest.name, "@ph0ryn/dsh-optimizations");
const patch = await readFile(join(packageDir, "cordis.patch.yml"), "utf8");
assert.match(patch, /id:\s*optimizations\b/, "the Loader entry id must stay `optimizations`");
const { SECTION } = await import(pathToFileURL(join(packageDir, "src/section.ts")).href);
assert.equal(SECTION.id, "optimizations", "the settings section id must match the Loader entry id");
assert.equal(SECTION.name, "settings.section");

console.log(
  "@ph0ryn/dsh-optimizations: build artifacts satisfy the Module Loader and identifier contracts",
);
