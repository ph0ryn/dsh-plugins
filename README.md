# dsh-plugins

Plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

## Plugins

| Plugin                                              | Description                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [dsh-siwc](packages/siwc)                           | Use your ChatGPT plan in DeepSeek Harness.                                                 |
| [@ph0ryn/dsh-optimizations](packages/optimizations) | Small improvements across the Web GUI and host behaviour, switched on or off individually. |

Install one into your Web profile:

```sh
dsh plugin --profile web add @ph0ryn/dsh-optimizations --ignore-scripts
```

## Development

Requirements: Node.js >= 22.19.0 and pnpm 11.22.0.

Run the checks from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Build an installable tarball for one plugin:

```sh
pnpm --filter dsh-siwc pack --pack-destination ./artifacts
```

## Structure

Each plugin lives in `packages/<name>` with its own `package.json`, `vite.config.ts`, `tsconfig.json`, and `cordis.patch.yml`. The repository root holds the pnpm workspace, shared tooling, and CI.

## Release

Push a tag named `<plugin>-v<version>` using the package directory name, such as `siwc-v0.1.4` or `optimizations-v0.1.0`. The release workflow publishes only the matching package to npm and creates a GitHub Release.
