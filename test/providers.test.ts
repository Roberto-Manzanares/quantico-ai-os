import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AnthropicAdapter, OpenAIAdapter, ProviderAdapterError } from "../src/index.js";
import type { ProviderHttpClient, ProviderHttpResponse } from "../src/index.js";

class MockHttpClient implements ProviderHttpClient {
  requests: Array<{ url: string; init: RequestInit }> = [];

  constructor(private readonly response: ProviderHttpResponse) {}

  async request(url: string, init: RequestInit): Promise<ProviderHttpResponse> {
    this.requests.push({ url, init });
    return this.response;
  }
}

function jsonResponse(payload: unknown, status = 200): ProviderHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test("OpenAI adapter normalizes model response", async () => {
  const httpClient = new MockHttpClient(
    jsonResponse({
      choices: [{ message: { content: "OpenAI normalized response" } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 }
    })
  );
  const adapter = new OpenAIAdapter({ apiKey: "test-openai-key", httpClient });

  const result = await adapter.sendMessage({
    executionId: "exec_test",
    model: "gpt-test",
    messages: [{ role: "user", content: "Hello" }]
  });

  assert.equal(result.content, "OpenAI normalized response");
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-test");
  assert.equal(result.inputTokens, 11);
  assert.equal(result.outputTokens, 7);
  assert.equal(result.estimatedCostUsd, null);
  assert.equal(typeof result.latencyMs, "number");
  assert.equal(httpClient.requests[0]?.url, "https://api.openai.com/v1/chat/completions");
});

test("Anthropic adapter normalizes model response", async () => {
  const httpClient = new MockHttpClient(
    jsonResponse({
      content: [{ type: "text", text: "Anthropic normalized response" }],
      usage: { input_tokens: 13, output_tokens: 5 }
    })
  );
  const adapter = new AnthropicAdapter({ apiKey: "test-anthropic-key", httpClient });

  const result = await adapter.sendMessage({
    executionId: "exec_test",
    model: "claude-test",
    messages: [
      { role: "system", content: "System prompt" },
      { role: "user", content: "Hello" }
    ]
  });

  const body = JSON.parse(String(httpClient.requests[0]?.init.body)) as {
    system?: string;
    messages: Array<{ role: string; content: string }>;
  };

  assert.equal(result.content, "Anthropic normalized response");
  assert.equal(result.provider, "anthropic");
  assert.equal(result.model, "claude-test");
  assert.equal(result.inputTokens, 13);
  assert.equal(result.outputTokens, 5);
  assert.equal(result.estimatedCostUsd, null);
  assert.equal(body.system, "System prompt");
  assert.equal(body.messages.length, 1);
  assert.equal(httpClient.requests[0]?.url, "https://api.anthropic.com/v1/messages");
});

test("provider adapters normalize errors", async () => {
  const httpClient = new MockHttpClient(jsonResponse({ error: "bad request" }, 400));
  const adapter = new OpenAIAdapter({ apiKey: "test-openai-key", httpClient });

  await assert.rejects(
    () =>
      adapter.sendMessage({
        executionId: "exec_test",
        model: "gpt-test",
        messages: [{ role: "user", content: "Hello" }]
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderAdapterError);
      assert.equal(error.provider, "openai");
      assert.equal(error.model, "gpt-test");
      assert.equal(error.code, "provider_error");
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("missing provider API keys map to provider_unavailable", async () => {
  const adapter = new AnthropicAdapter({ apiKey: "" });

  await assert.rejects(
    () =>
      adapter.sendMessage({
        executionId: "exec_test",
        model: "claude-test",
        messages: [{ role: "user", content: "Hello" }]
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderAdapterError);
      assert.equal(error.provider, "anthropic");
      assert.equal(error.code, "provider_unavailable");
      return true;
    }
  );
});

test("Orchestrator does not import provider SDKs or concrete adapters", async () => {
  const source = await readFile("src/orchestrator.ts", "utf8");

  assert.equal(source.includes("openai"), false);
  assert.equal(source.includes("anthropic"), false);
  assert.equal(source.includes("OpenAIAdapter"), false);
  assert.equal(source.includes("AnthropicAdapter"), false);
});
