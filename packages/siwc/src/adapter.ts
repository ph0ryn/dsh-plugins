import { resolveImageAttachmentAccess, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import {
  PiAiAdapter,
  type PiAiAdapterOptions,
  type ResolvedPiAiProviderProfile,
} from "@deepseek-ai/dsh-llm-pi-ai";
import {
  InMemoryCredentialStore,
  defaultProviderAuthContext,
  type Model,
  type ModelInputModality,
  type ThinkingLevelMap,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

import { Accounts } from "./accounts.ts";
import { RESOURCE, type Account, type ModelChoice } from "./oauth.ts";

import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-attachment";
import type {} from "@deepseek-ai/dsh-fs";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";

interface Profile extends ResolvedPiAiProviderProfile {
  accountId?: string;
}

type ResponsesModel = Model<"openai-responses">;

const NON_CHAT_MODEL = /(?:^|-)(?:image|tts|transcribe|realtime|audio|embedding)(?:-|$)/i;
const REPRESENTABLE_REASONING_EFFORTS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

function isGptChatModel(id: string): boolean {
  return id.startsWith("gpt-") && !NON_CHAT_MODEL.test(id);
}

function isInputModality(value: string): value is ModelInputModality {
  return value === "text" || value === "image";
}

function templateFor(
  id: string,
  known: ReadonlyMap<string, ResponsesModel>,
): ResponsesModel | undefined {
  const exact = known.get(id);
  if (exact) return exact;
  const candidates = [...known.values()].filter(
    (model) => isGptChatModel(model.id) && model.api === "openai-responses" && model.reasoning,
  );
  const byNewest = (left: ResponsesModel, right: ResponsesModel) =>
    right.id.localeCompare(left.id, undefined, { numeric: true });
  const tier = id.match(/-([a-z]+)$/i)?.[1]?.toLowerCase();
  const sameTier = tier
    ? candidates.filter((model) => model.id.toLowerCase().endsWith(`-${tier}`))
    : [];
  sameTier.sort(byNewest);
  if (sameTier[0]) return sameTier[0];
  const generation = id.match(/^gpt-(\d+)/)?.[1];
  const sameGeneration = generation
    ? candidates.filter((model) => new RegExp(`^gpt-${generation}(?:[.-]|$)`).test(model.id))
    : [];
  sameGeneration.sort(byNewest);
  if (sameGeneration[0]) return sameGeneration[0];
  return candidates.sort(
    (left, right) => right.contextWindow - left.contextWindow || byNewest(left, right),
  )[0];
}

function canSynthesize(choice: ModelChoice): boolean {
  return (
    isGptChatModel(choice.id) &&
    choice.supportedInApi === true &&
    choice.contextWindow !== undefined &&
    choice.input?.includes("text") === true
  );
}

function thinkingLevelMapFor(efforts: readonly string[] | undefined): ThinkingLevelMap | undefined {
  if (
    efforts === undefined ||
    !efforts.some((effort) => REPRESENTABLE_REASONING_EFFORTS.has(effort))
  )
    return undefined;
  const supported = new Set(efforts);
  return {
    off: supported.has("none") ? "none" : null,
    minimal: supported.has("minimal") ? "minimal" : null,
    low: supported.has("low") ? "low" : null,
    medium: supported.has("medium") ? "medium" : null,
    high: supported.has("high") ? "high" : null,
    xhigh: supported.has("xhigh") ? "xhigh" : null,
    max: supported.has("max") ? "max" : null,
  };
}

function profiles(ctx: Context, account?: Account): ReadonlyMap<string, Profile> {
  const base = openaiProvider();
  const known = new Map(base.getModels().map((model) => [model.id, model]));
  const models = (account?.models ?? []).flatMap((choice) => {
    if (choice.supportedInApi === false || NON_CHAT_MODEL.test(choice.id)) return [];
    const exact = known.get(choice.id);
    if (!exact && !canSynthesize(choice)) {
      ctx.logger.warn("Skipping ChatGPT model %s: missing SIWC chat capabilities.", choice.id);
      return [];
    }
    const template = templateFor(choice.id, known);
    if (!template) {
      ctx.logger.warn("Skipping ChatGPT model %s: no pi-ai template.", choice.id);
      return [];
    }
    const input =
      choice.input === undefined ? template.input : choice.input.filter(isInputModality);
    if (!input.includes("text")) {
      ctx.logger.warn("Skipping ChatGPT model %s: no supported text input.", choice.id);
      return [];
    }
    const contextWindow = choice.contextWindow ?? (exact ? template.contextWindow : undefined);
    if (contextWindow === undefined) {
      ctx.logger.warn("Skipping ChatGPT model %s: missing SIWC context window.", choice.id);
      return [];
    }
    if (!exact)
      ctx.logger.info("Synthesizing ChatGPT model %s from template %s", choice.id, template.id);
    const model: ResponsesModel = {
      id: choice.id,
      name: choice.name,
      api: "openai-responses",
      provider: "openai",
      baseUrl: RESOURCE,
      input,
      cost: template.cost,
      reasoning:
        choice.reasoningEfforts === undefined
          ? Boolean(exact && template.reasoning)
          : choice.reasoningEfforts.some((effort) => REPRESENTABLE_REASONING_EFFORTS.has(effort)),
      thinkingLevelMap:
        choice.reasoningEfforts === undefined && exact
          ? template.thinkingLevelMap
          : thinkingLevelMapFor(choice.reasoningEfforts),
      contextWindow,
      maxTokens: template.maxTokens,
      ...(template.compat ? { compat: template.compat } : {}),
    };
    return [model];
  });
  return new Map([
    [
      "openai",
      {
        provider: "openai",
        displayName: "ChatGPT Subscription Plan",
        ...(account ? { accountId: account.id } : {}),
        piProvider: { ...base, getModels: () => models, getAllModels: () => models },
        streamIdleTimeoutMs: 300_000,
        maxRequestImageBytes: 20 * 1024 * 1024,
        requestImagePixelBudget: 2048 * 2048,
        requestImageMaxBytes: 1024 * 1024,
        retryPolicy: resolveRetryPolicy(undefined, "siwc"),
        modelErrors: new Map(),
        configuredMaxTokens: new Map(),
      },
    ],
  ]);
}

export class ChatGPTAdapter extends PiAiAdapter {
  ctx: Context;
  accounts: Accounts;
  currentProfiles: { value: ReadonlyMap<string, Profile>; stamp: string };
  options: PiAiAdapterOptions;

  constructor(ctx: Context, accounts: Accounts) {
    const current = { value: profiles(ctx), stamp: "" };
    const options: PiAiAdapterOptions = {
      profiles: () => current.value,
      // shortcut: key resolution has no request signal; add cancellation when DSH exposes it.
      resolveApiKey: (_provider, profile) => accounts.accessToken((profile as Profile).accountId),
      auth: {
        credentials: new InMemoryCredentialStore(),
        authContext: defaultProviderAuthContext(),
      },
      resolveAttachments: () => ctx.get("attachments"),
      resolveImageAccess: (attachments, ref) =>
        resolveImageAttachmentAccess(
          attachments,
          (path) => ctx.get("fs")?.processPathFromHostPath(path),
          ref,
        ),
    };
    super(options);
    this.ctx = ctx;
    this.options = options;
    this.accounts = accounts;
    this.currentProfiles = current;
  }

  async sync() {
    const state = await this.accounts.read();
    const account = state.accounts.find((entry) => entry.id === state.activeId);
    const stamp = JSON.stringify([account?.id, account?.email, account?.models]);
    if (stamp !== this.currentProfiles.stamp) {
      this.currentProfiles.value = profiles(this.ctx, account);
      this.currentProfiles.stamp = stamp;
    }
  }

  override async listModels(provider: string) {
    await this.sync();
    return super.listModels(provider);
  }
  override async resolveModel(provider: string, model: string, signal?: AbortSignal) {
    await this.sync();
    return super.resolveModel(provider, model, signal);
  }
  override async prepareCall(provider: string, model: string, signal?: AbortSignal) {
    await this.sync();
    const snapshot = this.currentProfiles.value;
    const accountId = snapshot.get(provider)?.accountId;
    let access: string | undefined;
    const delegate = new PiAiAdapter({
      ...this.options,
      profiles: () => snapshot,
      resolveApiKey: async () => {
        access = await this.accounts.accessToken(accountId);
        return access;
      },
    });
    const call = await delegate.prepareCall(provider, model, signal);
    return {
      model: call.model,
      stream: (options: GenerateOptions) =>
        this.recoverAuth(call.stream(options), accountId, () => access),
    };
  }

  private async *recoverAuth(
    stream: AsyncIterable<StreamChunk>,
    accountId: string | undefined,
    access: () => string | undefined,
  ) {
    let recovering = false;
    const recover = async (message: string) => {
      const token = access();
      if (accountId && token && /\b401\b|subscription_sharing_invalid_user/.test(message)) {
        recovering = true;
        // A 401 alone is inconclusive; refresh establishes whether the session was disconnected.
        await this.accounts.accessToken(accountId, token);
      }
    };
    try {
      for await (const chunk of stream) {
        if (chunk.type === "finish" && chunk.reason.kind === "error")
          await recover(chunk.reason.failure.message);
        yield chunk;
      }
    } catch (error) {
      if (!recovering && error instanceof Error) await recover(error.message);
      throw error;
    }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const call = await this.prepareCall(options.provider, options.model, options.signal);
    yield* call.stream(options);
  }
}
