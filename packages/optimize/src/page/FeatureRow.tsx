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
  Switch,
  onChange,
}: FeatureRowProps) {
  return (
    <li className="optimize-feature" data-optimize-feature={feature.id}>
      <div className="optimize-feature-text">
        <div className="optimize-feature-heading">
          <span className="optimize-feature-name">{copy.name}</span>
          <span className="optimize-feature-side">{sideLabel(feature)}</span>
          {feature.reload === "restart" ? (
            <span className="optimize-feature-restart">{PAGE.restartRequired}</span>
          ) : null}
        </div>
        <p className="optimize-feature-description">{copy.description}</p>
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        label={copy.name}
        disabled={disabled}
        title={disabled ? PAGE.readOnly : undefined}
      />
    </li>
  );
}
