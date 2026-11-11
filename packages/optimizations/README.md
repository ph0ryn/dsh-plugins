# @ph0ryn/dsh-optimizations

Small improvements for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
across the Web GUI and host behaviour, each switched on or off individually in Settings.

## Status

Early implementation: the Host half, the client half, the `Optimizations` settings page,
and the feature registry/runtime are in place. The first feature, `Compact sidebar`,
folds the sidebar navigation into its menu so workspaces get more room. Every feature stays
OFF until enabled per profile; [docs/spec.md](docs/spec.md) owns the contract.

Verified against DSH 0.2.1-rc.2 and 0.2.2-alpha.3. Other versions only produce a startup warning.

## Install

Install from npm into your Web profile:

```sh
dsh plugin --profile web add @ph0ryn/dsh-optimizations --ignore-scripts
```

Open **Settings → Optimizations** and enable the features you want. Every feature starts OFF.
Features marked as requiring a restart take effect on the next DSH start.

### From source

```sh
git clone https://github.com/ph0ryn/dsh-plugins.git
cd dsh-plugins
pnpm install --frozen-lockfile
pnpm --filter @ph0ryn/dsh-optimizations build
dsh plugin --profile web add file:"$PWD/packages/optimizations" --ignore-scripts
```

## Development

Run the checks from the repository root:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Design documents

| Document                                | Question it answers                                        |
| --------------------------------------- | ---------------------------------------------------------- |
| [spec.md](docs/spec.md)                 | What should it do?                                         |
| [architecture.md](docs/architecture.md) | How is it designed?                                        |
| [verification.md](docs/verification.md) | How do we know it works?                                   |
| [development.md](docs/development.md)   | How do we build, install locally, and follow DSH upgrades? |
| [decisions.md](docs/decisions.md)       | Why were these designs and trade-offs chosen?              |
