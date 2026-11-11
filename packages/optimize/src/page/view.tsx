import { useState, useSyncExternalStore } from "react";

import { PAGE } from "./copy.ts";
import { FeatureRow } from "./FeatureRow.tsx";
import { styles } from "./styles.ts";

import type { FeatureMeta } from "../features.ts";
import type { FeatureCopy } from "./copy.ts";
import type { Button, Input, Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { SettingsPathOpView } from "@deepseek-ai/dsh-settings/types";
import type { ComponentProps, ComponentType } from "react";

/**
 * Shell controls the page uses. Passed in rather than imported so node tests
 * can render the page without the browser-only primitives bundle.
 */
export interface PageControls {
  readonly Switch: ComponentType<ComponentProps<typeof Switch>>;
  readonly Input: ComponentType<ComponentProps<typeof Input>>;
  readonly Button: ComponentType<ComponentProps<typeof Button>>;
}

export interface SettingsPageViewProps {
  /** Shared form for the `optimize` Host entry; the Host owns persistence and conflicts. */
  readonly form: ConfigForm<Record<string, unknown>>;
  readonly features: readonly FeatureMeta[];
  readonly copy: Readonly<Record<string, FeatureCopy>>;
  readonly controls: PageControls;
}

/**
 * The Optimization settings page: search, bulk operations, and one row per
 * feature. All state comes from the shared config form snapshot, so a failed
 * write re-renders the current Host value and the user can retry.
 */
export function SettingsPageView({ form, features, copy, controls }: SettingsPageViewProps) {
  const { Button, Input, Switch } = controls;
  const snapshot = useSyncExternalStore(form.subscribe.bind(form), form.getSnapshot.bind(form));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const writable = snapshot.writable;
  const disabled = !writable || busy;
  const values = snapshot.value ?? {};
  const needle = query.trim().toLowerCase();
  const visible = features.filter((feature) => {
    const entry = copy[feature.id];
    if (!needle || !entry) return true;
    return (
      entry.name.toLowerCase().includes(needle) || entry.description.toLowerCase().includes(needle)
    );
  });

  const write = (operation: () => Promise<boolean>) => {
    if (disabled) return;
    setBusy(true);
    setError("");
    void operation()
      .then((accepted) => {
        if (!accepted) setError(PAGE.writeFailed);
      })
      .catch(() => setError(PAGE.writeFailed))
      .finally(() => setBusy(false));
  };

  const setAll = (enabled: boolean) => {
    const ops: SettingsPathOpView[] = features.map((feature) => ({
      op: "set",
      path: [feature.id],
      value: enabled,
    }));
    write(() => form.mutate(ops));
  };

  const restoreDefaults = () => {
    // Unset returns each key to its schema default (OFF), which also removes
    // the user override from the profile document.
    const ops: SettingsPathOpView[] = features.map((feature) => ({
      op: "unset",
      path: [feature.id],
    }));
    write(() => form.mutate(ops));
  };

  return (
    <section className="optimize-settings">
      <style data-plugin="dsh-optimize">{styles}</style>
      <header className="optimize-header">
        <h2>{PAGE.title}</h2>
        <p>{PAGE.description}</p>
      </header>
      <div className="optimize-toolbar">
        <Input
          className="optimize-search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={PAGE.searchPlaceholder}
          aria-label={PAGE.searchPlaceholder}
        />
        <div className="optimize-actions">
          <Button
            size="sm"
            disabled={disabled || features.length === 0}
            onClick={() => setAll(true)}
          >
            {PAGE.enableAll}
          </Button>
          <Button
            size="sm"
            disabled={disabled || features.length === 0}
            onClick={() => setAll(false)}
          >
            {PAGE.disableAll}
          </Button>
          <Button size="sm" disabled={disabled || features.length === 0} onClick={restoreDefaults}>
            {PAGE.restoreDefaults}
          </Button>
        </div>
      </div>
      {writable ? null : (
        <p className="optimize-note" role="status">
          {PAGE.readOnly}
        </p>
      )}
      {snapshot.status === "loading" ? (
        <p className="optimize-note" role="status">
          {PAGE.loading}
        </p>
      ) : null}
      {error ? (
        <p className="optimize-error" role="alert">
          {error}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <p className="optimize-empty">{PAGE.empty}</p>
      ) : (
        <ul className="optimize-features">
          {visible.map((feature) => (
            <FeatureRow
              key={feature.id}
              feature={feature}
              copy={copy[feature.id]}
              checked={values[feature.id] === true}
              disabled={disabled}
              Switch={Switch}
              onChange={(next) => write(() => form.set(feature.id, next))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
