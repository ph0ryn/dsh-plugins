# dsh-siwc

Use your ChatGPT plan in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

| Supported DSH versions | Verification       |
| ---------------------- | ------------------ |
| 0.2.2-alpha.3          | Verified           |
| 0.2.2-alpha.2          | Verified           |
| 0.2.1-rc.2             | Verified           |
| 0.2.1-rc.1             | Source review only |
| 0.2.1-alpha.2–alpha.5  | Source review only |

Use a browser on the same machine as DSH. Unlisted versions are unverified.

## Install

Install from npm into your Web profile:

```sh
dsh plugin --profile web add dsh-siwc --ignore-scripts
```

Enable **dsh-siwc** in DSH's Plugins settings, then restart DSH.
If another plugin uses the `openai` route, disable that route first to avoid a conflict.

### From source

Clone the repository and install dependencies:

```sh
git clone https://github.com/ph0ryn/dsh-siwc.git
cd dsh-siwc
pnpm install --frozen-lockfile
```

Build a package and install it into your Web profile:

```sh
pnpm pack
dsh plugin --profile web add ./dsh-siwc-0.1.3.tgz --ignore-scripts
```

## Use

Run `/chatgpt login` in a chat, open **Continue with ChatGPT**, and finish signing in.
Then select a model under **ChatGPT Subscription Plan**.

On startup, the plugin refreshes the signed-in account's model list automatically.

| Command             | Action                                                            |
| ------------------- | ----------------------------------------------------------------- |
| `/chatgpt login`    | Sign in again or add an account or workspace.                     |
| `/chatgpt accounts` | Switch accounts and refresh available models.                     |
| `/chatgpt status`   | Show your connection and usage link.                              |
| `/chatgpt logout`   | Sign out and delete local tokens, keeping the saved registration. |

Tokens use DSH's credential store; the default local store is not encrypted by an OS keychain.
Manage usage and app access in [ChatGPT settings](https://chatgpt.com/settings/usage).

## Web search

1. Sign in with `/chatgpt login`.
2. Open **Settings → SIWC**, refresh the account status, and choose a **Search model**.
3. Select **Use SIWC for web search**.

Search uses your ChatGPT plan through the public Responses API, including for conversations with other models. `web_fetch` is unchanged.

The search model is separate from the conversation model and must support web search under your account's policy. After switching accounts, reselect it if unavailable. Errors do not trigger automatic retries or a switch to API-key billing.

**Restore deployment default** clears the search-provider override; DSH may then select a provider automatically.

## Development

Run the development checks:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

Formatting, linting, and library builds use Vite+. Behavioral tests live beside the source files.
