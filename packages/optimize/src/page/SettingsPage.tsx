import { Button, Input, Switch } from "@deepseek-ai/dsh-client-ui-primitives";

import { FEATURES } from "../features.ts";
import { COPY } from "./copy.ts";
import { SettingsPageView } from "./view.tsx";

import type { FeatureMeta } from "../features.ts";
import type { FeatureCopy } from "./copy.ts";
import type { SettingsPageViewProps } from "./view.tsx";
import type { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";

/** Shell controls, bound once so re-renders do not swap component identities. */
const CONTROLS = { Switch, Input, Button };

export interface SettingsPageProps {
  readonly form: ConfigForm<Record<string, unknown>>;
  /** Registry slice; defaults to `FEATURES`. */
  readonly features?: readonly FeatureMeta[];
  /** Copy for the rendered features; defaults to the registry copy. */
  readonly copy?: Readonly<Record<string, FeatureCopy>>;
}

/** Production wiring of the settings page with the shell's UI primitives. */
export function SettingsPage({ form, features = FEATURES, copy = COPY }: SettingsPageProps) {
  const view: SettingsPageViewProps = { form, features, copy, controls: CONTROLS };
  return <SettingsPageView {...view} />;
}
