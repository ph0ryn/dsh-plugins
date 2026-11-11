# dsh-optimize

Small improvements for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
across the Web GUI and host behaviour, each switched on or off individually in Settings.

## Status

Early implementation: the Host half, the client half, the `Optimization` settings page,
and the feature registry/runtime scaffold are in place. The registry is empty, so the
package currently adds the settings tab and no behaviour. Features are added one registry
entry at a time; [docs/spec.md](docs/spec.md) owns the contract.

## Design documents

| Document                                | Question it answers                                        |
| --------------------------------------- | ---------------------------------------------------------- |
| [spec.md](docs/spec.md)                 | What should it do?                                         |
| [architecture.md](docs/architecture.md) | How is it designed?                                        |
| [verification.md](docs/verification.md) | How do we know it works?                                   |
| [development.md](docs/development.md)   | How do we build, install locally, and follow DSH upgrades? |
| [decisions.md](docs/decisions.md)       | Why were these designs and trade-offs chosen?              |
