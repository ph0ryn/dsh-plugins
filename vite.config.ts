import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
    "package.json": "sort-package-json",
  },
  fmt: {
    arrowParens: "always",
    bracketSpacing: true,
    endOfLine: "lf",
    ignorePatterns: ["package.json", "pnpm-lock.yaml"],
    insertFinalNewline: true,
    printWidth: 100,
    semi: true,
    singleQuote: false,
    sortImports: {
      groups: [
        ["value-builtin"],
        ["value-external"],
        ["value-internal"],
        ["value-parent", "value-sibling", "value-index"],
        ["type-import"],
        ["unknown"],
      ],
      newlinesBetween: true,
      order: "asc",
    },
    sortPackageJson: true,
    tabWidth: 2,
    trailingComma: "all",
    useTabs: false,
  },
  lint: {
    ignorePatterns: ["dist/**"],
  },
  pack: [
    {
      entry: ["src/index.ts"],
      outDir: "dist/server",
      format: "esm",
      platform: "node",
      target: "node22.19",
      fixedExtension: false,
      minify: true,
      deps: {
        neverBundle: true,
        alwaysBundle: ["jose", /^zod(?:\/|$)/],
      },
    },
    {
      entry: ["src/client.ts"],
      outDir: "dist/client",
      format: "cjs",
      platform: "browser",
      target: "es2022",
      fixedExtension: false,
      minify: true,
      deps: { neverBundle: true },
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      banner:
        'window.__ModuleLoader__.load({id:"dsh-siwc",factory:(require)=>{var module={exports:{}};var exports=module.exports;',
      footer: "return module.exports;}});",
    },
  ],
});
