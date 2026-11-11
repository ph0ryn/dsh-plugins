import { PAGE } from "./copy.ts";

import type { FeatureMeta } from "../features.ts";
import type { FeatureCopy } from "./copy.ts";
import type { Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ComponentProps, ComponentType } from "react";

export interface FeatureRowProps {
  readonly feature: FeatureMeta;
  readonly copy: FeatureCopy;
  readonly checked: boolean;
  readonly disabled: boolean;
  /** Hover hint, typically why the toggle is locked. */
  readonly title?: string;
  /** Toggle control supplied by the page so tests can render without the shell bundle. */
  readonly Switch: ComponentType<ComponentProps<typeof Switch>>;
  onChange(next: boolean): void;
}

function sideLabel(feature: FeatureMeta): string {
  if (feature.host && feature.client) return PAGE.sides.both;
  return feature.client ? PAGE.sides.client : PAGE.sides.host;
}

/** One feature entry: name, description, side, reload requirement, and toggle. */
export function FeatureRow({
  feature,
  copy,
  checked,
  disabled,
  title,
  Switch,
  onChange,
}: FeatureRowProps) {
  return (
    <li className="optimizations-feature" data-optimizations-feature={feature.id}>
      <div className="optimizations-feature-text">
        <div className="optimizations-feature-heading">
          <span className="optimizations-feature-name">{copy.name}</span>
          <span className="optimizations-feature-side">{sideLabel(feature)}</span>
          {feature.reload === "restart" ? (
            <span className="optimizations-feature-restart">{PAGE.restartRequired}</span>
          ) : null}
        </div>
        <p className="optimizations-feature-description">{copy.description}</p>
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        label={copy.name}
        disabled={disabled}
        title={title}
      />
    </li>
  );
}
