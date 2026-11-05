import { createElement as h, useEffect, useId, useState, useSyncExternalStore } from "react";

import type { SiwcStatus } from "./settingsContract.ts";
import type { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";

export interface SiwcSettingsPageProps {
  form: ConfigForm<{ searchModel?: string }>;
  web: ConfigForm<{ searchProvider?: string }>;
  loadStatus(signal?: AbortSignal): Promise<SiwcStatus>;
  subscribeReset?(listener: () => void): () => void;
}

/** The host's shared ConfigForms own persistence and revision/conflict recovery. */
export function SiwcSettingsPage({ form, web, loadStatus, subscribeReset }: SiwcSettingsPageProps) {
  const config = useSyncExternalStore(form.subscribe.bind(form), form.getSnapshot.bind(form));
  const selection = useSyncExternalStore(web.subscribe.bind(web), web.getSnapshot.bind(web));
  const [status, setStatus] = useState<SiwcStatus>();
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const id = useId();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setStatus(undefined);
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

  const model = config.value?.searchModel ?? "";
  const valid = status?.models.some((choice) => choice.id === model) ?? false;
  const selected = selection.value?.searchProvider === "siwc";
  const editable = config.status === "ready" && config.writable && !saving && !loading;
  const canSelect =
    selection.status === "ready" && selection.writable && editable && valid && !!status?.account;
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
    h(
      "div",
      null,
      h("h2", { id: `${id}-title` }, "SIWC"),
      h(
        "p",
        { className: "siwc-hint" },
        "Use your ChatGPT plan for web search. The search model is separate from your conversation model.",
      ),
    ),
    h(
      "div",
      { className: "siwc-group" },
      h("h3", null, "ChatGPT account"),
      loading
        ? h("p", { role: "status" }, "Loading account…")
        : h(
            "p",
            null,
            status ? (status.account?.label ?? "Not signed in") : "Account status unavailable",
          ),
      !loading &&
        status &&
        !status.account &&
        h(
          "p",
          { className: "siwc-hint" },
          "Run /chatgpt login in a chat, then refresh this page. Switch accounts with /chatgpt accounts.",
        ),
      h(
        "button",
        {
          type: "button",
          disabled: loading || saving,
          onClick: () => setRefresh((value) => value + 1),
        },
        "Refresh account",
      ),
      status &&
        h(
          "a",
          { href: status.usageUrl, target: "_blank", rel: "noopener noreferrer" },
          "Manage ChatGPT usage",
        ),
    ),
    h(
      "div",
      { className: "siwc-group" },
      h("label", { htmlFor: `${id}-model` }, "Search model"),
      h(
        "select",
        {
          id: `${id}-model`,
          value: valid ? model : "",
          disabled: !editable || !status?.models.length,
          "aria-describedby": `${id}-model-hint`,
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
      h(
        "p",
        { id: `${id}-model-hint`, className: "siwc-hint" },
        model && !valid && status?.account
          ? "The saved model is unavailable for this account. Select a search model to continue."
          : "Choose an account-provided model that supports web search. Availability depends on your account and workspace policy.",
      ),
    ),
    h(
      "div",
      { className: "siwc-group" },
      h("h3", null, "Web search provider"),
      h(
        "p",
        null,
        selected
          ? "Using ChatGPT plan for web search"
          : `Current setting: ${selection.value?.searchProvider ?? "Deployment default"}`,
      ),
      h(
        "p",
        { className: "siwc-hint" },
        "Saving a model does not change the provider setting. This setting applies to web search across conversation models; webpage reading is unchanged.",
      ),
      selection.status === "ready" &&
        selection.value?.searchProvider === undefined &&
        h(
          "p",
          { className: "siwc-hint" },
          "No provider is pinned. DSH automatically selects a sole available provider, which may be SIWC. Select a provider explicitly to avoid ambiguity.",
        ),
      selection.status !== "ready" &&
        h(
          "p",
          { className: "siwc-hint" },
          "Web search settings are not available in this deployment.",
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
    !config.writable &&
      config.status === "ready" &&
      h("p", { className: "siwc-hint" }, "This deployment stores settings read-only."),
    saving && h("p", { role: "status" }, "Saving…"),
    error && h("p", { role: "alert" }, error),
  );
}
