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
    h("h2", { id: `${id}-title` }, "SIWC"),
    saving && h("p", { role: "status" }, "Saving…"),
    error && h("p", { role: "alert" }, error),
    h(
      "div",
      { className: "siwc-group" },
      h("h3", null, "ChatGPT account"),
      !loading &&
        status &&
        !status.account &&
        h(
          "p",
          { className: "siwc-hint" },
          "Sign in with /chatgpt login, or switch with /chatgpt accounts. Then refresh.",
        ),
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
        "div",
        { className: "siwc-actions" },
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
