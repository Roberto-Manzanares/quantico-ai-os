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

test("OpenAI adapter normalizes Responses API response", async () => {
  const httpClient = new MockHttpClient(
    jsonResponse({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "QUANTICO_KERNEL_OK" }]
        }
      ],
      usage: {
        input_tokens: 17,
        output_tokens: 9,
        output_tokens_details: { reasoning_tokens: 2 }
      }
    })
  );
  const adapter = new OpenAIAdapter({
    apiKey: "test-openai-key",
    apiMode: "responses",
    httpClient,
    reasoningEffort: "minimal"
  });

  const result = await adapter.sendMessage({
    executionId: "exec_test",
    model: "gpt-5-nano",
    messages: [{ role: "user", content: "Hello" }],
    maxOutputTokens: 128
  });
  const body = JSON.parse(String(httpClient.requests[0]?.init.body)) as {
    model: string;
    input: Array<{ role: string; content: string }>;
    max_output_tokens: number;
    reasoning: { effort: string };
  };

  assert.equal(httpClient.requests[0]?.url, "https://api.openai.com/v1/responses");
  assert.equal(body.model, "gpt-5-nano");
  assert.deepEqual(body.input, [{ role: "user", content: "Hello" }]);
  assert.equal(body.max_output_tokens, 128);
  assert.equal(body.reasoning.effort, "minimal");
  assert.equal(result.content, "QUANTICO_KERNEL_OK");
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-5-nano");
  assert.equal(result.inputTokens, 17);
  assert.equal(result.outputTokens, 9);
  assert.equal(result.estimatedCostUsd, null);
  assert.equal(adapter.getLastDiagnostics()?.reasoningTokens, 2);
  assert.equal(adapter.getLastDiagnostics()?.outputTextLength, null);
});

test("OpenAI adapter records safe response diagnostics", async () => {
  const httpClient = new MockHttpClient(
    jsonResponse({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "message", content: [{ type: "output_text" }] }],
      output_text: "",
      choices: [{ finish_reason: "length", message: { content: "", refusal: null } }],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
        completion_tokens_details: { reasoning_tokens: 7, text_tokens: 0 }
      }
    })
  );
  const adapter = new OpenAIAdapter({ apiKey: "test-openai-key", httpClient });

  await adapter.sendMessage({
    executionId: "exec_test",
    model: "gpt-test",
    messages: [{ role: "user", content: "Hello" }]
  });

  assert.deepEqual(adapter.getLastDiagnostics(), {
    httpStatus: 200,
    chatCompletion: {
      finishReason: "length",
      messageContentType: "string",
      messageContentLength: 0,
      refusal: null,
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
      reasoningTokens: 7,
      textTokens: 0
    },
    responseStatus: "incomplete",
    incompleteDetails: { reason: "max_output_tokens" },
    usageOutputTokens: 7,
    reasoningTokens: 7,
    responseOutputItemCount: 1,
    responseOutputItemTypes: ["message"],
    messageContentTypes: ["output_text"],
    outputTextLength: 0,
    structuredError: null
  });
});

test("Anthropic adapter normalizes model response", async () => {
  const httpClient = new MockHttpClient(
    jsonResponse({
      stop_reason: "end_turn",
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

test("Anthropic adapter sends workspace header when configured", async () => {
  const httpClient = new MockHttpClient(
    jsonResponse({
      content: [{ type: "text", text: "Anthropic normalized response" }],
      usage: { input_tokens: 13, output_tokens: 5 }
    })
  );
  const adapter = new AnthropicAdapter({
    apiKey: "test-anthropic-key",
    httpClient,
    workspaceId: "test-workspace-id"
  });

  await adapter.sendMessage({
    executionId: "exec_test",
    model: "claude-test",
    messages: [{ role: "user", content: "Hello" }]
  });

  const headers = httpClient.requests[0]?.init.headers as Record<string, string>;

  assert.equal(headers["x-api-key"], "test-anthropic-key");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(headers["anthropic-workspace-id"], "test-workspace-id");
});

test("Anthropic adapter omits workspace header when not configured", async () => {
  const httpClient = new MockHttpClient(
    jsonResponse({
      content: [{ type: "text", text: "Anthropic normalized response" }],
      usage: { input_tokens: 13, output_tokens: 5 }
    })
  );
  const adapter = new AnthropicAdapter({
    apiKey: "test-anthropic-key",
    httpClient
  });

  await adapter.sendMessage({
    executionId: "exec_test",
    model: "claude-test",
    messages: [{ role: "user", content: "Hello" }]
  });

  const headers = httpClient.requests[0]?.init.headers as Record<string, string>;

  assert.equal(headers["x-api-key"], "test-anthropic-key");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(headers["anthropic-workspace-id"], undefined);
});

test("Anthropic adapter records safe response diagnostics", async () => {
  const httpClient = new MockHttpClient(
    jsonResponse({
      stop_reason: "end_turn",
      content: [
        { type: "thinking" },
        { type: "text", text: "QUANTICO_ANTHROPIC_OK" }
      ],
      usage: { input_tokens: 21, output_tokens: 8 }
    })
  );
  const adapter = new AnthropicAdapter({ apiKey: "test-anthropic-key", httpClient });

  await adapter.sendMessage({
    executionId: "exec_test",
    model: "claude-test",
    messages: [{ role: "user", content: "Hello" }]
  });

  assert.deepEqual(adapter.getLastDiagnostics(), {
    httpStatus: 200,
    stopReason: "end_turn",
    inputTokens: 21,
    outputTokens: 8,
    contentBlockTypes: ["thinking", "text"],
    textLength: "QUANTICO_ANTHROPIC_OK".length,
    structuredError: null
  });
});

test("provider adapters normalize errors", async () => {
  const httpClient = new MockHttpClient(
    jsonResponse({ error: { type: "invalid_request_error", message: "bad request" } }, 400)
  );
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
  assert.deepEqual(adapter.getLastDiagnostics()?.structuredError, {
    type: "invalid_request_error",
    message: "bad request"
  });
});

test("Anthropic adapter captures structured provider errors", async () => {
  const httpClient = new MockHttpClient(
    jsonResponse(
      { error: { type: "invalid_request_error", message: "bad request" } },
      400
    )
  );
  const adapter = new AnthropicAdapter({ apiKey: "test-anthropic-key", httpClient });

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
      assert.equal(error.model, "claude-test");
      assert.equal(error.code, "provider_error");
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
  assert.deepEqual(adapter.getLastDiagnostics()?.structuredError, {
    type: "invalid_request_error",
    message: "bad request"
  });
});

test("OpenAI Responses API errors are captured as structured provider errors", async () => {
  const httpClient = new MockHttpClient(
    jsonResponse(
      { error: { type: "invalid_request_error", code: "bad_model", message: "bad request" } },
      400
    )
  );
  const adapter = new OpenAIAdapter({
    apiKey: "test-openai-key",
    apiMode: "responses",
    httpClient
  });

  await assert.rejects(
    () =>
      adapter.sendMessage({
        executionId: "exec_test",
        model: "gpt-5-nano",
        messages: [{ role: "user", content: "Hello" }]
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderAdapterError);
      assert.equal(error.provider, "openai");
      assert.equal(error.model, "gpt-5-nano");
      assert.equal(error.code, "provider_error");
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
  assert.deepEqual(adapter.getLastDiagnostics()?.structuredError, {
    type: "invalid_request_error",
    code: "bad_model",
    message: "bad request"
  });
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
