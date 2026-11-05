# dsh-siwc

Use your ChatGPT plan in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

| Supported DSH versions | Verification       |
| ---------------------- | ------------------ |
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
dsh plugin --profile web add ./dsh-siwc-0.1.2.tgz --ignore-scripts
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
Live account sign-in and inference have not yet been verified; automated tests use local fixtures.

## Web search

1. Sign in with `/chatgpt login`.
2. Open **Settings → SIWC** and refresh the account status if you just signed in or switched accounts.
3. Choose a **Search model** from the account's model list. The search model is separate from the conversation model; model visibility does not guarantee web-search eligibility.
4. Select **Use SIWC for web search** to change DSH's search-provider setting explicitly.

Search uses the public Responses API with your ChatGPT plan, not an OpenAI API key or ChatGPT's internal backend endpoints. It can serve `web_search` calls from other conversation models too. Webpage reading (`web_fetch`) is unchanged. **Manage ChatGPT usage** opens the plan/app usage settings.

Loading the plugin does not write the search-provider setting. If your deployment leaves that setting unset, DSH automatically selects its sole available provider; configuring a SIWC search model can therefore make SIWC eligible for automatic selection, or create ambiguity with another available provider. Set the provider explicitly when you want deterministic routing. **Restore deployment default** clears only the search-provider override; the inherited default may itself be automatic. Other search settings pages can also change this same host setting.

The account/status endpoint returns only the active account label and model choices to the authenticated host owner. Tokens stay in DSH's credential store. Switching accounts never silently chooses a different search model: if the saved choice is not in the new account's catalog, select it again in SIWC settings.

Search requires a supporting model and account/workspace policy. Unsupported requests, usage limits, interrupted streams, and missing sign-in remain errors; the plugin does not retry searches or switch billing routes automatically. SIWC requires streaming and does not support `max_output_tokens`; the provider has a 60-second deadline, and DSH's web-tool timeout may stop it earlier.

Web search and the Settings transport are tested against DSH `0.2.1-rc.2` with local HTTP/SSE fixtures. Live account searches and deployment into a running Web profile have not been verified.

References: [SIWC requirements](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations), [web search](https://developers.openai.com/api/docs/guides/tools-web-search), and [errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).

## Development

Run the development checks:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

Formatting, linting, and library builds use Vite+. Behavioral tests live beside the source files.
