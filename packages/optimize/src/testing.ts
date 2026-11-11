import type { Context, Plugin } from "@deepseek-ai/cordis";
import type { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";

/** One fake cordis fiber created by the fake run context. */
export interface FakeFiber {
  readonly name: string | undefined;
  disposed: boolean;
  dispose(): Promise<void>;
}

export interface FakeRunContext {
  readonly ctx: Context;
  readonly fibers: FakeFiber[];
  /** Fire `loader/volatile-update` on the fake event bus. */
  emitVolatileUpdate(): void;
  listenerCount(): number;
  /** Run every registered effect cleanup, as a fiber unload would. */
  dispose(): void;
}

/** Minimal cordis Context: effect, plugin, and the loader event bus. */
export function createFakeRunContext(): FakeRunContext {
  const fibers: FakeFiber[] = [];
  const listeners = new Set<(...args: unknown[]) => void>();
  const cleanups: (() => void)[] = [];
  const ctx = {
    effect(effect: () => (() => void) | void) {
      const cleanup = effect();
      const disposer = () => {
        cleanup?.();
      };
      cleanups.push(disposer);
      return disposer;
    },
    plugin(implementation: Plugin.Object) {
      const fiber: FakeFiber = {
        name: implementation.name,
        disposed: false,
        async dispose() {
          fiber.disposed = true;
        },
      };
      fibers.push(fiber);
      return fiber;
    },
    on(_event: string, listener: (...args: unknown[]) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    ctx: ctx as unknown as Context,
    fibers,
    emitVolatileUpdate() {
      for (const listener of listeners) listener([]);
    },
    listenerCount: () => listeners.size,
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}

export interface FakeFormOptions {
  readonly writable?: boolean;
  readonly accept?: boolean;
  readonly status?: "loading" | "ready" | "unavailable";
}

export interface FakeWrite {
  readonly kind: "set" | "unset" | "mutate";
  readonly payload: unknown;
}

export interface FakeForm {
  readonly form: ConfigForm<Record<string, unknown>>;
  readonly writes: FakeWrite[];
  /** Replace the snapshot as a Host push would, notifying subscribers. */
  setSnapshot(value: Record<string, unknown> | undefined): void;
  /** Flip writability without touching the value. */
  setWritable(writable: boolean): void;
}

/** A shared config form fake with a snapshot, subscribers, and recorded writes. */
export function createFakeForm(
  initial: Record<string, unknown> | undefined,
  options: FakeFormOptions = {},
): FakeForm {
  const writes: FakeWrite[] = [];
  const listeners = new Set<() => void>();
  let writable = options.writable ?? true;
  const accept = options.accept ?? true;
  let snapshot = {
    status: (options.status ?? (initial ? "ready" : "loading")) as
      | "loading"
      | "ready"
      | "unavailable",
    value: initial,
    base: {},
    user: {},
    revision: 1,
    writable,
  };
  const publish = (next: typeof snapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const apply = (ops: readonly { op: string; path: readonly string[]; value?: unknown }[]) => {
    const value = { ...snapshot.value };
    for (const op of ops) {
      const key = op.path[0];
      if (key === undefined) continue;
      if (op.op === "set") value[key] = op.value;
      else delete value[key];
    }
    return value;
  };
  const form: ConfigForm<Record<string, unknown>> = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async set(field, value) {
      writes.push({ kind: "set", payload: [field, value] });
      if (accept) publish({ ...snapshot, value: { ...snapshot.value, [field]: value } });
      return accept;
    },
    async unset(field) {
      writes.push({ kind: "unset", payload: field });
      if (accept) {
        const value = { ...snapshot.value };
        delete value[field];
        publish({ ...snapshot, value });
      }
      return accept;
    },
    async mutate(ops) {
      writes.push({ kind: "mutate", payload: ops });
      if (accept) publish({ ...snapshot, value: apply(ops) });
      return accept;
    },
  };
  return {
    form,
    writes,
    setSnapshot(value) {
      publish({ ...snapshot, value, status: value ? "ready" : snapshot.status });
    },
    setWritable(next) {
      writable = next;
      publish({ ...snapshot, writable });
    },
  };
}
