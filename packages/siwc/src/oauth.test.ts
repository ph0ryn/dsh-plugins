import assert from "node:assert/strict";
import { test } from "node:test";

import { listModels } from "./oauth.ts";

const capabilities = {
  slug: "gpt-6.2-sol",
  display_name: "GPT-6.2 Sol",
  visibility: "list",
  supported_in_api: true,
  context_window: 500_000,
  input_modalities: ["text", "image"],
  supported_reasoning_levels: [
    { effort: "low", description: "Fast" },
    { effort: "medium", description: "Balanced" },
    { effort: "high", description: "Deep" },
    { effort: "xhigh", description: "Extra deep" },
    { effort: "max", description: "Maximum" },
    { effort: "ultra", description: "Delegated" },
  ],
};

test("listModels maps SIWC capabilities and excludes hidden or unavailable models", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      models: [
        capabilities,
        { slug: "gpt-4.1", display_name: "GPT-4.1", visibility: "list" },
        { slug: "hidden", display_name: "Hidden", visibility: "hide" },
        {
          slug: "gpt-reserve",
          display_name: "Reserve",
          visibility: "list",
          supported_in_api: false,
        },
      ],
    }),
  );

  assert.deepEqual(await listModels("access-token"), [
    {
      id: "gpt-6.2-sol",
      name: "GPT-6.2 Sol",
      supportedInApi: true,
      contextWindow: 500_000,
      input: ["text", "image"],
      reasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
    },
    { id: "gpt-4.1", name: "GPT-4.1" },
  ]);
});

test("listModels rejects malformed capability fields", async (t) => {
  let model: unknown = capabilities;
  t.mock.method(globalThis, "fetch", async () => Response.json({ models: [model] }));
  for (const invalid of [
    { ...capabilities, supported_in_api: "true" },
    { ...capabilities, context_window: 0 },
    { ...capabilities, input_modalities: ["text", 1] },
    { ...capabilities, supported_reasoning_levels: [{ effort: "" }] },
  ]) {
    model = invalid;
    await assert.rejects(listModels("access-token"));
  }
});

test("listModels hides malformed JSON bodies that may contain secrets", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("private-access-token", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  await assert.rejects(listModels("access-token"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "OpenAI returned an invalid JSON response.");
    assert.doesNotMatch(error.message, /private-access-token/);
    return true;
  });
});
