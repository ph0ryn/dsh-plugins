import { Button, Input, Switch } from "@deepseek-ai/dsh-client-ui-primitives";

import { FEATURES } from "../features.ts";
import { COPY } from "./copy.ts";
import { SettingsPageView } from "./view.tsx";

import type { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";

/** Shell controls, bound once so re-renders do not swap component identities. */
const CONTROLS = { Switch, Input, Button };

/** Production wiring of the settings page with the shell's UI primitives. */
export function SettingsPage({ form }: { readonly form: ConfigForm<Record<string, unknown>> }) {
  return <SettingsPageView form={form} features={FEATURES} copy={COPY} controls={CONTROLS} />;
}
