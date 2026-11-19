import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { act } from "react-test-renderer";

import { createFakeEffects, installFakeDocument, renderReact } from "../testing.ts";
import {
  CONTINUE_PROMPT,
  CONTINUE_SESSION_STYLES,
  ContinueButton,
  continueSession,
  lastTurnEndKind,
  shouldShowContinue,
} from "./continueSession.tsx";

import type { ContinueButtonProps } from "./continueSession.tsx";

function turnEnd(kind: string) {
  return {
    type: "event",
    event: { type: "turn/end", seq: 1, time: 0, data: { turn: 1, reason: { kind } } },
  };
}

test("lastTurnEndKind finds the newest turn end and ignores other entries", () => {
  const entries = [
    turnEnd("completed"),
    { type: "transient", event: { type: "assistant/chunk" } },
    { type: "event", event: { type: "turn/start", seq: 2, time: 1, data: { turn: 2 } } },
    turnEnd("max-tokens"),
  ];
  assert.equal(lastTurnEndKind(entries as never), "max-tokens");
  assert.equal(lastTurnEndKind([]), undefined);
  assert.equal(
    lastTurnEndKind([
      { type: "event", event: { type: "user/message", seq: 1, time: 0, data: {} } },
    ] as never),
    undefined,
  );
});

test("shouldShowContinue only targets abnormal idle sessions with an empty draft", () => {
  for (const kind of ["aborted", "blocked", "error", "max-tokens", "interrupted"]) {
    assert.equal(shouldShowContinue(kind, false, true), true, `${kind} should offer Continue`);
  }
  for (const kind of ["completed", "forked", undefined]) {
    assert.equal(shouldShowContinue(kind, false, true), false, `${kind} must not offer Continue`);
  }
  assert.equal(
    shouldShowContinue("aborted", true, true),
    false,
    "running sessions must not show it",
  );
  assert.equal(
    shouldShowContinue("aborted", false, false),
    false,
    "a draft must not be overwritten",
  );
});

test("clicking Continue submits the fixed prompt through the composer actions", async () => {
  const calls: string[] = [];
  const events = new Set<() => void>();
  const entries = [turnEnd("aborted")];
  const props = {
    sessionId: "session-1",
    sessions: {
      binding: () => ({
        eventSource: {
          getSnapshot: () => ({ entries }),
          subscribe(listener: () => void) {
            events.add(listener);
            return () => events.delete(listener);
          },
        },
      }),
    },
    useSession: (selector: (value: { running: boolean }) => unknown) =>
      selector({ running: false }),
    useInput: (selector: (value: { draft: string; attachmentIds: readonly string[] }) => unknown) =>
      selector({ draft: "", attachmentIds: [] }),
    inputActions: {
      setDraft(text: string) {
        calls.push(`set:${text}`);
      },
      submit() {
        calls.push("submit");
      },
    },
  };
  const renderer = await renderReact(
    createElement(ContinueButton, props as unknown as ContinueButtonProps),
  );
  try {
    const buttons = renderer.root.findAll((node) => node.type === "button");
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].props["aria-label"], "Continue");
    assert.equal(buttons[0].props.title, "Continue");
    assert.equal(buttons[0].props["data-optimizations-continue"], "");
    await act(async () => {
      buttons[0].props.onClick();
    });
    assert.deepEqual(calls, [`set:${CONTINUE_PROMPT}`, "submit"]);
    entries.splice(0, 1, turnEnd("completed"));
    await act(async () => {
      for (const listener of events) listener();
    });
    assert.equal(renderer.root.findAll((node) => node.type === "button").length, 0);
  } finally {
    renderer.unmount();
  }
});

test("the plugin registers one additive composer row and owns its cleanup", () => {
  const doc = installFakeDocument();
  const effects = createFakeEffects();
  const registered: { options: Record<string, unknown>; component: unknown }[] = [];
  let unregistered = 0;
  const sessions = { binding: () => undefined };
  const ctx = {
    effect: effects.effect,
    sessions,
    slots: {
      inject(_key: string, callback: () => () => void) {
        return callback();
      },
      register(options: Record<string, unknown>, component: unknown) {
        registered.push({ options, component });
        return () => {
          unregistered += 1;
        };
      },
    },
  };
  continueSession.apply(ctx as never, undefined);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].options.name, "conversation.input.right");
  assert.equal(registered[0].options.id, "optimizations-continue-session");
  assert.equal(registered[0].component, ContinueButton);
  assert.deepEqual((registered[0].options.inject as () => unknown)(), { sessions });
  assert.match(CONTINUE_SESSION_STYLES, /data-optimizations-continue/);
  assert.match(CONTINUE_SESSION_STYLES, /--dsw-alias-button-info-fill/);
  assert.match(CONTINUE_SESSION_STYLES, /right: 8px/);
  assert.match(CONTINUE_SESSION_STYLES, /width: 34px/);
  for (const cleanup of effects.cleanups) cleanup();
  assert.equal(unregistered, 1);
  assert.deepEqual(doc.removed, doc.created, "cleanup removes the style element");
  doc.restore();
});
