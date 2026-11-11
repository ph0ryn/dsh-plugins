import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: [
    {
      entry: ["src/index.ts"],
      outDir: "dist/server",
      format: "esm",
      platform: "node",
      target: "node22.19",
      fixedExtension: false,
      minify: true,
      deps: { neverBundle: true },
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
        'window.__ModuleLoader__.load({id:"dsh-optimize",factory:(require)=>{var module={exports:{}};var exports=module.exports;',
      footer: "return module.exports;}});",
    },
  ],
});
