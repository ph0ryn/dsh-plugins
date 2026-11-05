import {
  WebError,
  type WebSearchProvider,
  type WebSearchResult,
  type WebSearchSource,
} from "@deepseek-ai/dsh-web";
import OpenAI from "openai";

import type { Accounts } from "./accounts.ts";
import type {
  Response as OpenAIResponse,
  ResponseOutputText,
} from "openai/resources/responses/responses";

function sourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password)
      return url.href;
  } catch {
    // A malformed upstream source is not a usable citation.
  }
  return undefined;
}

function markdownLabel(value: string): string {
  return value.replace(/[\\[\]]/g, "\\$&");
}

function markdownUrl(value: string): string {
  return value.replace(/</g, "%3C").replace(/>/g, "%3E");
}

function result(response: OpenAIResponse): WebSearchResult {
  const searches = response.output.filter((item) => item.type === "web_search_call");
  if (!searches.some((item) => item.status === "completed" && item.action.type === "search"))
    throw new WebError("ChatGPT did not complete a web search.", "SIWC_SEARCH_NOT_EXECUTED");

  const sources = new Map<string, WebSearchSource>();
  const addSource = (value: string, title?: string) => {
    const url = sourceUrl(value);
    if (!url) return undefined;
    const current = sources.get(url);
    sources.set(url, {
      url,
      ...(current?.title || title ? { title: current?.title || title } : {}),
    });
    return url;
  };
  for (const item of searches) {
    if (item.status === "completed" && item.action.type === "search")
      for (const source of item.action.sources ?? []) addSource(source.url);
  }

  const text: string[] = [];
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type !== "output_text") continue;
      const citations = part.annotations.filter(
        (annotation): annotation is ResponseOutputText.URLCitation =>
          annotation.type === "url_citation",
      );
      // Insert links left-to-right against the original offsets, never modified text.
      let content = "";
      let cursor = 0;
      for (const citation of citations.toSorted((a, b) => a.start_index - b.start_index)) {
        const url = addSource(citation.url, citation.title);
        const { start_index: start, end_index: end } = citation;
        if (
          !url ||
          !Number.isInteger(start) ||
          !Number.isInteger(end) ||
          start < cursor ||
          end <= start ||
          end > part.text.length
        )
          continue;
        content += part.text.slice(cursor, start);
        const original = part.text.slice(start, end);
        const label =
          citation.title && /^(\[\d+\]|.*)$/u.test(original) ? citation.title : original;
        content += `[${markdownLabel(label)}](<${markdownUrl(url)}>)`;
        cursor = end;
      }
      text.push(content + part.text.slice(cursor));
    }
  }
  return {
    ...(text.length ? { content: text.join("\n\n") } : {}),
    sources: [...sources.values()],
    truncated: false,
  };
}

/** Run hosted web search against the user's explicitly selected ChatGPT model. */
export function createSiwcSearchProvider(
  accounts: Accounts,
  model: () => string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): WebSearchProvider {
  return {
    id: "siwc",
    available: () => model().trim().length > 0,
    async search(request, signal) {
      const deadline = AbortSignal.timeout(options.timeoutMs ?? 60_000);
      const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
      let requestId: string | undefined;
      let responseStatus: number | undefined;
      let access: string | undefined;
      const safeField = (value: unknown, pattern: RegExp) =>
        typeof value === "string" && pattern.test(value) && (!access || !value.includes(access))
          ? value
          : undefined;
      const failure = (
        code: unknown,
        status = responseStatus,
        message = "ChatGPT web search failed.",
      ): WebError => {
        const safeCode = safeField(code, /^[A-Za-z][A-Za-z0-9_]{0,99}$/) ?? "WEB_PROVIDER_ERROR";
        return new WebError(message, safeCode, {
          cause: {
            ...(status !== undefined ? { status } : {}),
            code: safeCode,
            ...(requestId ? { requestId } : {}),
          },
        });
      };
      try {
        combined.throwIfAborted();
        // Capture both settings and account before token refresh can yield or selection can change.
        const selectedModel = model();
        if (!selectedModel.trim())
          throw new WebError("Select a ChatGPT search model.", "SIWC_SEARCH_MODEL_UNAVAILABLE");
        const state = await accounts.read();
        combined.throwIfAborted();
        const account = state.accounts.find((entry) => entry.id === state.activeId);
        if (!account?.tokens)
          throw new WebError("Continue with ChatGPT using /chatgpt login.", "MISSING_CREDENTIAL");
        if (!account.models?.some((entry) => entry.id === selectedModel))
          throw new WebError(
            "The selected search model is not available for this ChatGPT account.",
            "SIWC_SEARCH_MODEL_UNAVAILABLE",
          );
        access = await accounts.accessToken(account.id);
        combined.throwIfAborted();
        const client = new OpenAI({
          apiKey: access,
          baseURL: "https://api.openai.com/v1",
          organization: null,
          project: null,
          maxRetries: 0,
          fetch: options.fetch,
        });
        const {
          data: stream,
          request_id,
          response: httpResponse,
        } = await client.responses
          .create(
            {
              model: selectedModel,
              store: false,
              stream: true,
              input: [{ role: "user", content: request.query }],
              tools: [{ type: "web_search" }],
              tool_choice: "required",
              include: ["web_search_call.action.sources"],
            },
            { signal: combined },
          )
          .withResponse();
        requestId = safeField(request_id, /^[A-Za-z0-9_-]{1,200}$/);
        responseStatus = httpResponse.status;
        let completed: OpenAIResponse | undefined;
        for await (const event of stream) {
          combined.throwIfAborted();
          if (event.type === "error") throw failure(event.code);
          if (event.type === "response.failed") throw failure(event.response.error?.code);
          if (event.type === "response.incomplete") throw failure("SIWC_SEARCH_INCOMPLETE");
          if (event.type === "response.completed") {
            if (event.response.status !== "completed") throw failure("SIWC_SEARCH_INCOMPLETE");
            completed = event.response;
          }
        }
        // SDK stream cancellation may appear as a normal EOF, so verify the signal too.
        combined.throwIfAborted();
        if (!completed) throw failure("SIWC_SEARCH_INCOMPLETE");
        return result(completed);
      } catch (error) {
        if (combined.aborted)
          throw failure(
            signal?.aborted ? "WEB_ABORTED" : "WEB_TIMEOUT",
            responseStatus,
            signal?.aborted ? "ChatGPT web search was cancelled." : "ChatGPT web search timed out.",
          );
        if (error instanceof WebError) throw error;
        if (error instanceof OpenAI.APIError) {
          requestId = safeField(error.requestID, /^[A-Za-z0-9_-]{1,200}$/) ?? requestId;
          throw failure(error.code, error.status);
        }
        // Do not chain transport/credential errors: they can contain tokens or response bodies.
        throw failure(error instanceof Error && "code" in error ? error.code : undefined);
      }
    },
  };
}
