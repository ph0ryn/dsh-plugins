import { createElement as h, useEffect, useId, useState, useSyncExternalStore } from "react";

import type { SiwcActionResult, SiwcStatus } from "./settingsContract.ts";
import type { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";

export interface SiwcSettingsPageProps {
  form: ConfigForm<{ searchModel?: string }>;
  web: ConfigForm<{ searchProvider?: string }>;
  loadStatus(signal?: AbortSignal): Promise<SiwcStatus>;
  authorize(
    method: "oauth" | "select",
    accountId?: string,
    signal?: AbortSignal,
  ): Promise<SiwcActionResult>;
  answer(choice: string, signal?: AbortSignal): Promise<SiwcActionResult>;
  cancel(signal?: AbortSignal): Promise<SiwcActionResult>;
  logout(signal?: AbortSignal): Promise<SiwcActionResult>;
  subscribeReset?(listener: () => void): () => void;
}

function RefreshIcon() {
  return h(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: 16,
      height: 16,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.5,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
      focusable: false,
    },
    h("path", { d: "M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" }),
  );
}

/** The host's shared ConfigForms own persistence and revision/conflict recovery. */
export function SiwcSettingsPage({
  form,
  web,
  loadStatus,
  authorize,
  answer,
  cancel,
  logout,
  subscribeReset,
}: SiwcSettingsPageProps) {
  const config = useSyncExternalStore(form.subscribe.bind(form), form.getSnapshot.bind(form));
  const selection = useSyncExternalStore(web.subscribe.bind(web), web.getSnapshot.bind(web));
  const [status, setStatus] = useState<SiwcStatus>();
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const id = useId();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadStatus(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setStatus(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not load your ChatGPT account. Refresh to try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadStatus, refresh]);
  useEffect(() => subscribeReset?.(() => setRefresh((value) => value + 1)), [subscribeReset]);
  useEffect(() => setConfirmSignOut(false), [status?.account?.id]);

  const attempt = status?.attempt;
  useEffect(() => {
    if (attempt?.phase !== "running") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await loadStatus(controller.signal);
        if (controller.signal.aborted) return;
        setStatus(next);
        setError((current) =>
          current === "Could not refresh sign-in status. Retrying…" ? "" : current,
        );
        timer = setTimeout(poll, 800);
      } catch {
        if (controller.signal.aborted) return;
        setError("Could not refresh sign-in status. Retrying…");
        timer = setTimeout(poll, 1600);
      }
    };
    timer = setTimeout(poll, 800);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt?.id, attempt?.phase, loadStatus, refresh]);

  const model = config.value?.searchModel ?? "";
  const valid = status?.models.some((choice) => choice.id === model) ?? false;
  const selected = selection.value?.searchProvider === "siwc";
  const attemptRunning = attempt?.phase === "running";
  const editable =
    config.status === "ready" && config.writable && !saving && !loading && !attemptRunning;
  const canSelect =
    selection.status === "ready" && selection.writable && editable && valid && !!status?.account;
  const accountBusy = loading || saving || attemptRunning;

  async function perform(operation: () => Promise<SiwcActionResult>) {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const result = await operation();
      setStatus(result.status);
      if (result.message) setNotice(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete the account action.");
    } finally {
      setSaving(false);
    }
  }

  async function write(operation: () => Promise<boolean>) {
    setError("");
    setSaving(true);
    try {
      if (!(await operation()))
        setError(
          "Settings changed or could not be saved. Review the current values and try again.",
        );
    } catch {
      setError(
        "Could not confirm the save. Refresh to check the current settings before trying again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return h(
    "section",
    {
      className: "siwc-settings",
      "aria-labelledby": `${id}-title`,
      "aria-busy": loading || saving,
    },
    h("h2", { id: `${id}-title` }, "SIWC"),
    saving && h("p", { role: "status" }, "Saving…"),
    error && h("p", { role: "alert" }, error),
    notice && h("p", { className: "siwc-state", role: "status" }, notice),
    h(
      "div",
      { className: "siwc-group" },
      h("h3", null, "ChatGPT account"),
      !loading &&
        status &&
        !status.account &&
        h("p", { className: "siwc-hint" }, "Sign in with ChatGPT, or reconnect a saved account."),
      h(
        "div",
        { className: "siwc-account-line" },
        h(
          "p",
          { className: "siwc-state", role: "status" },
          loading
            ? "Loading account…"
            : status
              ? (status.account?.label ?? "Not signed in")
              : "Account status unavailable",
        ),
        h(
          "button",
          {
            type: "button",
            className: "siwc-icon-button",
            "aria-label": "Refresh account",
            title: "Refresh account",
            "data-action": "refresh-account",
            disabled: loading || saving,
            onClick: () => setRefresh((value) => value + 1),
          },
          h(RefreshIcon),
        ),
      ),
      h(
        "div",
        { className: "siwc-actions" },
        !status?.account &&
          h(
            "button",
            {
              type: "button",
              disabled: accountBusy,
              onClick: () => perform(() => authorize("oauth", "new")),
            },
            "Sign in with ChatGPT",
          ),
        status?.account &&
          h(
            "button",
            {
              type: "button",
              disabled: accountBusy,
              onClick: () => perform(() => authorize("oauth", "new")),
            },
            "Add account",
          ),
        !!status?.account &&
          status.accounts.filter((account) => account.signedIn).length > 1 &&
          h(
            "button",
            {
              type: "button",
              disabled: accountBusy,
              onClick: () => perform(() => authorize("select")),
            },
            "Switch account",
          ),
        status?.account &&
          h(
            "button",
            {
              type: "button",
              disabled: accountBusy,
              onClick: () => setConfirmSignOut(true),
            },
            "Sign out",
          ),
        h(
          "a",
          {
            href: status?.usageUrl ?? "https://chatgpt.com/settings/usage",
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "Manage ChatGPT usage",
        ),
      ),
      confirmSignOut &&
        h(
          "div",
          { className: "siwc-confirm", role: "group", "aria-label": "Confirm sign out" },
          h("p", null, "Sign out of this ChatGPT account? Saved registrations will be kept."),
          h(
            "div",
            { className: "siwc-actions" },
            h(
              "button",
              {
                type: "button",
                disabled: saving,
                onClick: () => {
                  setConfirmSignOut(false);
                  return perform(() => logout());
                },
              },
              "Sign out",
            ),
            h(
              "button",
              { type: "button", disabled: saving, onClick: () => setConfirmSignOut(false) },
              "Cancel",
            ),
          ),
        ),
      attempt &&
        renderAttempt(
          attempt,
          saving,
          () => perform(() => cancel()),
          (choice) => perform(() => answer(choice)),
        ),
      (status?.accounts.length ?? 0) > 0 &&
        (!status?.account || status.accounts.some((account) => !account.active)) &&
        h(
          "div",
          { className: "siwc-saved" },
          h("h4", null, "Saved accounts"),
          h(
            "ul",
            { className: "siwc-account-list" },
            ...(status?.accounts ?? []).map((account) =>
              h(
                "li",
                { key: account.id, className: "siwc-account-row" },
                h("span", null, account.label),
                h(
                  "span",
                  { className: "siwc-hint" },
                  account.active ? "Active" : account.signedIn ? "Signed in" : "Signed out",
                ),
                !account.active &&
                  h(
                    "button",
                    {
                      type: "button",
                      disabled: accountBusy,
                      "data-action": account.signedIn ? "switch-account" : "reconnect-account",
                      onClick: () =>
                        perform(() => authorize(account.signedIn ? "select" : "oauth", account.id)),
                    },
                    account.signedIn ? "Switch" : "Reconnect",
                  ),
              ),
            ),
          ),
        ),
    ),
    h(
      "div",
      { className: "siwc-group" },
      h("label", { htmlFor: `${id}-model` }, "Search model"),
      h(
        "p",
        { id: `${id}-model-hint`, className: "siwc-hint" },
        "Separate from the conversation model.",
      ),
      !status?.account && h("p", { className: "siwc-hint" }, "Sign in to choose a search model."),
      model &&
        !valid &&
        status?.account &&
        h(
          "p",
          { id: `${id}-model-status`, className: "siwc-state", role: "status" },
          "The saved model is unavailable for this account. Select a search model to continue.",
        ),
      !config.writable &&
        config.status === "ready" &&
        h("p", { className: "siwc-state", role: "status" }, "Settings are read-only."),
      h(
        "select",
        {
          id: `${id}-model`,
          value: valid ? model : "",
          disabled: !editable || !status?.models.length,
          "aria-describedby":
            model && !valid && status?.account
              ? `${id}-model-hint ${id}-model-status`
              : `${id}-model-hint`,
          onChange: (event: { currentTarget: { value: string } }) => {
            const value = event.currentTarget.value;
            return write(() =>
              value ? form.set("searchModel", value) : form.unset("searchModel"),
            );
          },
        },
        h("option", { value: "" }, "Select a search model"),
        ...(status?.models ?? []).map((choice) =>
          h("option", { key: choice.id, value: choice.id }, choice.name),
        ),
      ),
    ),
    h(
      "div",
      { className: "siwc-group" },
      h("h3", null, "Web search provider"),
      selection.status === "ready" &&
        selection.value?.searchProvider === undefined &&
        h(
          "p",
          { className: "siwc-hint" },
          "The default may select SIWC automatically. Choose a provider to pin it.",
        ),
      selection.status !== "ready" &&
        h("p", { className: "siwc-state", role: "status" }, "Web search settings are unavailable."),
      selection.status === "ready" &&
        selected &&
        !status?.account &&
        h(
          "p",
          { className: "siwc-hint" },
          "ChatGPT plan is selected. Sign in to use it for web search.",
        ),
      selection.status === "ready" &&
        h(
          "p",
          { className: "siwc-state", role: "status" },
          selected ? "ChatGPT plan" : (selection.value?.searchProvider ?? "Deployment default"),
        ),
      h(
        "div",
        { className: "siwc-actions" },
        !selected &&
          h(
            "button",
            {
              type: "button",
              "data-action": "use-siwc",
              disabled: !canSelect,
              onClick: () => write(() => web.set("searchProvider", "siwc")),
            },
            "Use SIWC for web search",
          ),
        selected &&
          h(
            "button",
            {
              type: "button",
              disabled: saving || !selection.writable,
              onClick: () => write(() => web.unset("searchProvider")),
            },
            "Restore deployment default",
          ),
      ),
    ),
  );
}

function renderAttempt(
  attempt: NonNullable<SiwcStatus["attempt"]>,
  saving: boolean,
  cancel: () => Promise<void>,
  answer: (choice: string) => Promise<void>,
) {
  if (attempt.phase === "running") {
    const waitingForBrowser =
      attempt.prompt?.message.startsWith("Open the sign-in") &&
      attempt.prompt.options.length === 1 &&
      attempt.prompt.options[0]?.id === "cancel";
    return h(
      "div",
      { className: "siwc-attempt" },
      h("h4", null, "Connecting account…"),
      attempt.notice &&
        h(
          "p",
          null,
          attempt.notice.url
            ? h(
                "a",
                {
                  href: attempt.notice.url,
                  target: "_blank",
                  rel: "noopener noreferrer",
                },
                attempt.notice.message,
              )
            : attempt.notice.message,
        ),
      !attempt.notice && h("p", { className: "siwc-hint" }, "Preparing secure sign-in…"),
      attempt.prompt &&
        !waitingForBrowser &&
        h(
          "div",
          null,
          h("p", null, attempt.prompt.message),
          h(
            "div",
            { className: "siwc-actions" },
            ...attempt.prompt.options.map((option) =>
              h(
                "button",
                {
                  key: option.id,
                  type: "button",
                  disabled: saving,
                  onClick: () => answer(option.id),
                },
                option.label,
              ),
            ),
          ),
        ),
      waitingForBrowser &&
        h(
          "p",
          { className: "siwc-hint" },
          "Finish signing in in your browser. This page updates automatically.",
        ),
      h(
        "div",
        { className: "siwc-actions" },
        h("button", { type: "button", disabled: saving, onClick: cancel }, "Cancel sign-in"),
      ),
    );
  }
  return h(
    "p",
    {
      className: "siwc-state",
      role: attempt.phase === "failed" ? "alert" : "status",
    },
    attempt.phase === "failed"
      ? attempt.error
      : attempt.phase === "authorized"
        ? "ChatGPT account connected."
        : "Sign-in cancelled. Your saved accounts were not changed.",
  );
}
