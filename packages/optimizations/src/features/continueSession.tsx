import { useCallback, useSyncExternalStore } from "react";

import { installStyleElement } from "./styleElement.ts";

import type { Context, Plugin } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type { ISessions, SessionSnapshot } from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { InputActions, InputState } from "@deepseek-ai/dsh-client-ui-conversation/client";

/**
 * Offer a one-click Continue in place of the disabled Send button when the
 * latest turn ended abnormally. The button submits the plain text DSH itself
 * recommends in its max-tokens notice ("Send 'continue' to let the model
 * resume"), so no custom RPC or Host half is involved.
 */

export const CONTINUE_PROMPT = "continue";

const ABNORMAL_END_REASONS = new Set(["aborted", "blocked", "error", "max-tokens", "interrupted"]);

export const CONTINUE_SESSION_STYLES = `
[data-composer-card] :has(> [data-optimizations-continue]):not([hidden]) ~ button:disabled {
  display: none !important;
}
[data-composer-card] { position: relative; }
[data-optimizations-continue] {
  position: absolute;
  right: 8px;
  bottom: 6px;
  corner-shape: round;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-button-info-fill);
  color: #fff;
  cursor: pointer;
  transform: translateY(-2px);
}
@media (hover: hover) {
  [data-optimizations-continue]:hover { background: var(--dsw-alias-button-info-hover); }
}
`;

/** One committed or transient entry in the session's client event window. */
export interface ContinueEventEntry {
  readonly type: string;
  readonly event: {
    readonly type: string;
    readonly data?: unknown;
  };
}

/** Kind of the newest `turn/end` in the window, or undefined when none is present. */
export function lastTurnEndKind(entries: readonly ContinueEventEntry[]): string | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "event" || entry.event.type !== "turn/end") continue;
    const reason = (
      entry.event.data as { readonly reason?: { readonly kind?: unknown } } | undefined
    )?.reason;
    return typeof reason?.kind === "string" ? reason.kind : undefined;
  }
  return undefined;
}

/** An idle session with an empty draft and an abnormal last turn offers Continue. */
export function shouldShowContinue(
  kind: string | undefined,
  running: boolean,
  emptyDraft: boolean,
): boolean {
  return emptyDraft && !running && kind !== undefined && ABNORMAL_END_REASONS.has(kind);
}

export interface ContinueSessionServices {
  readonly sessions: Pick<ISessions, "binding">;
}

type SessionId = Parameters<ISessions["binding"]>[0];

/** Only boolean projections are read, so the face stays smaller than the shell's generic hook. */
type BooleanSelector<T> = (selector: (value: T) => boolean) => boolean;

export interface ContinueButtonProps extends ContinueSessionServices {
  readonly sessionId: SessionId;
  readonly useSession: BooleanSelector<SessionSnapshot>;
  readonly useInput: BooleanSelector<InputState>;
  readonly inputActions: InputActions;
}

/** The composer row; returns null unless every condition is met. */
export function ContinueButton({
  sessionId,
  sessions,
  useSession,
  useInput,
  inputActions,
}: ContinueButtonProps) {
  const eventSource = sessions.binding(sessionId)?.eventSource;
  const subscribe = useCallback(
    (onChange: () => void) => eventSource?.subscribe(onChange) ?? (() => {}),
    [eventSource],
  );
  const getSnapshot = useCallback(
    () => lastTurnEndKind(eventSource?.getSnapshot().entries ?? []),
    [eventSource],
  );
  const kind = useSyncExternalStore(subscribe, getSnapshot);
  const running = useSession((snapshot) => snapshot.running);
  const emptyDraft = useInput(
    (input) => input.draft.trim() === "" && input.attachmentIds.length === 0,
  );
  if (!shouldShowContinue(kind, running, emptyDraft)) return null;
  return (
    <button
      type="button"
      data-optimizations-continue=""
      aria-label="Continue"
      title="Continue"
      onClick={() => {
        inputActions.setDraft(CONTINUE_PROMPT);
        inputActions.submit();
      }}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          d="M5.5 3.5 12.5 8l-7 4.5z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** One client feature: an additive composer row plus the CSS that hides the disabled Send. */
export const continueSession: Plugin.Object = {
  name: "optimizations/continue-session",
  inject: ["slots", "sessions"],
  apply(ctx: Context) {
    ctx.effect(() => installStyleElement("continueSession", CONTINUE_SESSION_STYLES));
    ctx.effect(() =>
      ctx.slots.inject("conversation.input.right", () =>
        ctx.slots.register(
          {
            name: "conversation.input.right",
            id: "optimizations-continue-session",
            inject: () => ({ sessions: ctx.sessions }),
          },
          ContinueButton,
        ),
      ),
    );
  },
};
