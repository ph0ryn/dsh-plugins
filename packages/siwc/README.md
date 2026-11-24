# dsh-siwc

Use your ChatGPT plan in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

| Supported DSH versions | Verification |
| ---------------------- | ------------ |
| 0.2.2-rc.5             | Verified     |
| 0.2.2-alpha.3          | Verified     |
| 0.2.2-alpha.2          | Verified     |
| 0.2.1-rc.2             | Verified     |

Use a browser on the same machine as DSH. The install check requires DSH 0.2.1-rc.2 or later;
unlisted versions are unverified.

## Install

Install from npm into your Web profile:

```sh
dsh plugin --profile web add dsh-siwc --ignore-scripts
```

Enable **dsh-siwc** in DSH's Plugins settings, then restart DSH.
If another plugin uses the `openai` route, disable that route first to avoid a conflict.

### From source

Clone the repository and install dependencies from its root:

```sh
git clone https://github.com/ph0ryn/dsh-plugins.git
cd dsh-plugins
pnpm install --frozen-lockfile
```

Build this plugin and install it into your Web profile:

```sh
pnpm --filter dsh-siwc pack --pack-destination ./artifacts
dsh plugin --profile web add ./artifacts/dsh-siwc-0.1.4.tgz --ignore-scripts
```

## Use

Open **Settings → SIWC** and select **Sign in with ChatGPT**. Finish signing in in your browser,
then choose a model under **ChatGPT Subscription Plan**.

The SIWC settings page is the only account management surface. Use it to sign in, add or reconnect
an account, switch saved accounts, and sign out. Signing out removes local tokens but keeps saved
registrations so you can reconnect later.

On startup, the plugin refreshes the signed-in account's model list automatically.

Tokens use DSH's credential store; the default local store is not encrypted by an OS keychain.
Manage usage and app access in [ChatGPT settings](https://chatgpt.com/settings/usage).

## Web search

1. Open **Settings → SIWC** and sign in.
2. Choose a **Search model**.
3. Under **Web search**, select **ChatGPT plan**.

Search uses your ChatGPT plan through the public Responses API, including for conversations with other models. `web_fetch` is unchanged.

The search model is separate from the conversation model and must support web search under your account's policy. After switching accounts, reselect it if unavailable. Errors do not trigger automatic retries or a switch to API-key billing.

**Deployment default** clears the search-provider override; DSH may then select a provider automatically.

## Development

Run the development checks:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

Formatting, linting, and library builds use Vite+. Behavioral tests live beside the source files.
