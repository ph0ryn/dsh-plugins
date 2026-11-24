import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { AuthorizationDeclinedError } from "@deepseek-ai/dsh-authorization";

import { accountLabel, Accounts, KEY, hostId } from "./accounts.ts";
import { USAGE_URL, listModels, revoke, signIn, type Account } from "./oauth.ts";

import type { SiwcAccount, SiwcActionResult, SiwcAttempt, SiwcStatus } from "./settingsContract.ts";
import type { Context } from "@deepseek-ai/cordis";
import type {
  AuthorizationNotice,
  AuthorizationPrompt,
  AuthorizationSession,
} from "@deepseek-ai/dsh-authorization";

interface PendingPrompt {
  prompt: Extract<AuthorizationPrompt, { kind: "select" }>;
  resolve: (choice: string) => void;
}

interface RunningAttempt {
  id: string;
  method: "oauth" | "select";
  controller: AbortController;
  phase: SiwcAttempt["phase"];
  notice?: SiwcAttempt["notice"];
  pending?: PendingPrompt;
  error?: string;
  done: Promise<void>;
}

/** Owns Settings-only account operations while DSH's authorization seam owns OAuth attempts. */
export class SiwcAccountSettings {
  private current?: RunningAttempt;
  private preferredAccountId?: string;
  private readonly ctx: Context;
  private readonly accounts: Accounts;
  private readonly syncAdapter: () => Promise<void>;

  constructor(ctx: Context, accounts: Accounts, syncAdapter: () => Promise<void>) {
    this.ctx = ctx;
    this.accounts = accounts;
    this.syncAdapter = syncAdapter;
  }

  async status(): Promise<SiwcStatus> {
    const state = await this.accounts.read();
    const active = state.accounts.find(
      (account) => account.id === state.activeId && account.tokens,
    );
    const saved: SiwcAccount[] = state.accounts
      .map((account) => ({
        id: account.id,
        label: accountLabel(account),
        active: account.id === state.activeId,
        signedIn: account.tokens !== undefined,
      }))
      .sort((left, right) => Number(right.active) - Number(left.active));
    return {
      ...(active ? { account: { id: active.id, label: accountLabel(active) } } : {}),
      accounts: saved,
      models: active?.models?.map(({ id, name }) => ({ id, name })) ?? [],
      usageUrl: USAGE_URL,
      ...(this.current ? { attempt: this.projectAttempt(this.current) } : {}),
    };
  }

  async authorize(method: "oauth" | "select", accountId?: string): Promise<SiwcActionResult> {
    if (this.current?.phase === "running") return { status: await this.status() };
    if (accountId !== undefined) {
      if (!accountId) throw new Error("Choose a saved ChatGPT account.");
      if (accountId !== "new") {
        const state = await this.accounts.read();
        if (!state.accounts.some((account) => account.id === accountId))
          throw new Error("Saved ChatGPT account not found.");
      }
    }
    const attempt: RunningAttempt = {
      id: randomUUID(),
      method,
      controller: new AbortController(),
      phase: "running",
      done: Promise.resolve(),
    };
    this.current = attempt;
    this.preferredAccountId = accountId;
    attempt.done = this.ctx.authorization
      .begin({
        key: KEY,
        method,
        signal: attempt.controller.signal,
        interaction: {
          notify: (notice) => this.notify(attempt, notice),
          prompt: (prompt) => this.prompt(attempt, prompt),
        },
      })
      .then((outcome) => {
        attempt.phase = outcome.status === "authorized" ? "authorized" : "cancelled";
        attempt.notice = {
          message:
            attempt.phase === "authorized"
              ? "ChatGPT account connected."
              : "Sign-in cancelled. Your saved accounts were not changed.",
        };
        attempt.pending = undefined;
      })
      .catch((error: unknown) => {
        attempt.phase = "failed";
        attempt.error = this.errorMessage(error);
        attempt.pending = undefined;
        this.ctx.logger.warn("SIWC Settings authorization failed: %s", this.errorMessage(error));
      })
      .finally(() => {
        if (this.current === attempt) this.preferredAccountId = undefined;
      });
    return { status: await this.status() };
  }

  async answer(choice: string): Promise<SiwcActionResult> {
    const attempt = this.current;
    if (attempt?.phase !== "running" || !attempt.pending)
      throw new Error("There is no sign-in question to answer.");
    const pending = attempt.pending;
    if (!pending.prompt.options.some((option) => option.id === choice))
      throw new Error("Choose one of the available sign-in options.");
    pending.resolve(choice);
    return { status: await this.status() };
  }

  async cancel(): Promise<SiwcActionResult> {
    const attempt = this.current;
    if (attempt?.phase !== "running") return { status: await this.status() };
    attempt.controller.abort();
    this.ctx.authorization.cancel(KEY);
    await attempt.done;
    return { status: await this.status() };
  }

  async logout(): Promise<SiwcActionResult> {
    if (this.current?.phase === "running") await this.cancel();
    let revocationConfirmed = true;
    await this.accounts.change(async (state) => {
      const active = state.accounts.find((account) => account.id === state.activeId);
      if (active?.tokens || active?.pending) {
        try {
          await revoke(active);
        } catch {
          revocationConfirmed = false;
        }
      }
      if (active) {
        delete active.tokens;
        delete active.idToken;
        delete active.pending;
      }
      delete state.activeId;
    });
    await this.syncAdapter();
    this.current = undefined;
    return {
      status: await this.status(),
      message: revocationConfirmed
        ? "Signed out. Saved registrations were kept."
        : "Signed out locally. Remote revocation was not confirmed; disconnect this app in ChatGPT settings.",
    };
  }

  /** The registered DSH authorization flow calls this same operation for Settings attempts. */
  async authorizeSession(session: AuthorizationSession): Promise<void> {
    const state = await this.accounts.read();
    const selectable = state.accounts.filter(
      (account) => session.method === "oauth" || account.tokens !== undefined,
    );
    const options = selectable.map((account) => ({
      id: account.id,
      label: accountLabel(account),
    }));
    if (session.method === "oauth")
      options.push({ id: "new", label: "Add ChatGPT account or workspace" });
    assert.ok(options.length, "Sign in with ChatGPT in Settings first.");
    const preferred = this.preferredAccountId;
    let id: string;
    if (preferred === "new") {
      assert.ok(session.method === "oauth", "Only sign-in can add a ChatGPT account.");
      id = "new";
    } else if (preferred !== undefined) {
      assert.ok(
        selectable.some((account) => account.id === preferred),
        "This saved ChatGPT account cannot be selected.",
      );
      id = preferred;
    } else if (options.length === 1) {
      id = options[0].id;
    } else {
      id = await session.prompt({
        kind: "select",
        message: "Choose your ChatGPT account",
        options,
        signal: session.signal,
      });
    }
    const selected = state.accounts.find((account) => account.id === id);
    assert.ok(id === "new" || selected, "Unknown ChatGPT account");
    const account: Account = selected ?? { id: randomUUID(), clientId: "dynamic_agent_client" };
    if (session.method === "oauth") {
      const identity = await signIn(session, await hostId(), account, async (clientId) => {
        session.signal.throwIfAborted();
        account.clientId = clientId;
        await this.accounts.change((current) => {
          const saved = current.accounts.find((entry) => entry.id === account.id);
          if (saved) saved.clientId = clientId;
          else current.accounts.push({ ...account, clientId });
        });
      });
      Object.assign(account, identity);
    }
    assert.ok(account.tokens, "This account is signed out. Reconnect it in Settings.");
    const access =
      session.method === "oauth"
        ? account.tokens.access
        : await this.accounts.accessToken(account.id);
    const models = await listModels(access, session.signal);
    if (!state.welcomed) {
      session.notify({ message: "Manage usage", url: USAGE_URL });
      await session.prompt({
        kind: "select",
        message:
          "You're using your ChatGPT plan. Eligible requests use your plan allowance. Manage usage in ChatGPT settings.",
        options: [{ id: "ok", label: "Got it" }],
        signal: session.signal,
      });
    }
    session.signal.throwIfAborted();
    await this.accounts.change((current) => {
      session.signal.throwIfAborted();
      const saved = current.accounts.find((entry) => entry.id === account.id);
      assert.ok(saved, "ChatGPT registration was removed during sign-in. Please retry.");
      if (session.method === "oauth") {
        Object.assign(saved, account);
        delete saved.pending;
      }
      saved.models = models;
      current.activeId = account.id;
      current.welcomed = true;
    });
    await this.syncAdapter();
    session.notify({ message: "Using ChatGPT plan. Manage usage", url: USAGE_URL });
  }

  dispose(): void {
    this.current?.controller.abort();
    if (this.current?.phase === "running") this.ctx.authorization.cancel(KEY);
  }

  private notify(attempt: RunningAttempt, notice: AuthorizationNotice): void {
    if (attempt.phase !== "running") return;
    attempt.notice = {
      message: notice.message,
      ...(notice.url ? { url: notice.url } : {}),
    };
  }

  private prompt(attempt: RunningAttempt, prompt: AuthorizationPrompt): Promise<string> {
    if (prompt.kind !== "select")
      return Promise.reject(new Error("This sign-in step does not accept typed input."));
    if (attempt.pending) return Promise.reject(new Error("A sign-in question is already open."));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        attempt.pending = undefined;
        prompt.signal?.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        reject(new AuthorizationDeclinedError());
      };
      attempt.pending = {
        prompt,
        resolve: (choice) => {
          cleanup();
          resolve(choice);
        },
      };
      prompt.signal?.addEventListener("abort", abort, { once: true });
      if (prompt.signal?.aborted) abort();
    });
  }

  private projectAttempt(attempt: RunningAttempt): SiwcAttempt {
    return {
      id: attempt.id,
      method: attempt.method,
      phase: attempt.phase,
      ...(attempt.notice ? { notice: attempt.notice } : {}),
      ...(attempt.pending
        ? {
            prompt: {
              kind: "select",
              message: attempt.pending.prompt.message,
              options: attempt.pending.prompt.options.map(({ id, label }) => ({ id, label })),
            },
          }
        : {}),
      ...(attempt.error ? { error: attempt.error } : {}),
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof AuthorizationDeclinedError) return "Sign-in cancelled.";
    return error instanceof Error
      ? error.message
      : "Could not finish the account action. Try again.";
  }
}
