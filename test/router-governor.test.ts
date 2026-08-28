import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DeterministicModelRouter,
  DeterministicTokenGovernor,
  OpenAIAdapter,
  AnthropicAdapter,
  type CompiledContext,
  type ModelConfig,
  type ModelPricingTable,
  type RoutingDecision
} from "../src/index.js";

const modelConfigs: ModelConfig[] = [
  {
    provider: "openai",
    model: "openai-general",
    taskTypes: ["general"],
    capabilities: ["text_generation"],
    latencyClass: "low",
    priority: 10
  },
  {
    provider: "anthropic",
    model: "anthropic-analysis",
    taskTypes: ["analysis", "general"],
    capabilities: ["text_generation", "long_context"],
    latencyClass: "medium",
    priority: 5
  },
  {
    provider: "openai",
    model: "openai-coding",
    taskTypes: ["coding"],
    capabilities: ["text_generation", "tool_use"],
    latencyClass: "medium",
    priority: 1
  }
];

const pricingTable: ModelPricingTable = {
  openai: {
    "openai-general": {
      inputUsdPerMillionTokens: 2,
      outputUsdPerMillionTokens: 8
    },
    "openai-coding": {
      inputUsdPerMillionTokens: 4,
      outputUsdPerMillionTokens: 10
    }
  },
  anthropic: {
    "anthropic-analysis": {
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 15
    }
  }
};

const context: CompiledContext = {
  compiledContextId: "context_test",
  messages: [{ role: "user", content: "Analyze this" }],
  sourceRefs: [],
  estimatedTokens: 1_000,
  omittedContext: []
};

test("Model Router respects an allowed preferred provider", async () => {
  const router = new DeterministicModelRouter(modelConfigs);
  const decision = await router.route({
    taskType: "general",
    context,
    constraints: { preferredProvider: "openai" },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.provider, "openai");
  assert.equal(decision.model, "openai-general");
});

test("Model Router never selects a blocked provider", async () => {
  const router = new DeterministicModelRouter(modelConfigs);
  const decision = await router.route({
    taskType: "general",
    context,
    constraints: { blockedProviders: ["anthropic"] },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.provider, "openai");
});

test("Model Router uses task_type as a real selection signal", async () => {
  const router = new DeterministicModelRouter(modelConfigs);
  const decision = await router.route({
    taskType: "coding",
    context,
    constraints: {},
    requiredCapabilities: ["tool_use"],
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.provider, "openai");
  assert.equal(decision.model, "openai-coding");
});

test("Model Router behavior is deterministic", async () => {
  const router = new DeterministicModelRouter(modelConfigs);
  const input = {
    taskType: "analysis" as const,
    context,
    constraints: {},
    estimatedInputTokens: context.estimatedTokens
  };

  const first = await router.route(input);
  const second = await router.route(input);

  assert.deepEqual(first, second);
});

test("Token Governor uses configurable pricing and calculates expected cost", async () => {
  const governor = new DeterministicTokenGovernor(pricingTable);
  const decision = await governor.evaluate({
    context,
    routingDecision: route("openai", "openai-general"),
    expectedOutputTokens: 500
  });

  assert.equal(decision.status, "allow");
  assert.equal(decision.estimatedInputTokens, 1_000);
  assert.equal(decision.estimatedOutputTokens, 500);
  assert.equal(decision.estimatedTotalTokens, 1_500);
  assert.equal(decision.estimatedCostUsd, 0.006);
});

test("Token Governor rejects missing pricing without treating it as zero cost", async () => {
  const governor = new DeterministicTokenGovernor(pricingTable);
  const decision = await governor.evaluate({
    context,
    routingDecision: route("openai", "unknown-model"),
    expectedOutputTokens: 500
  });

  assert.equal(decision.status, "reject");
  assert.equal(decision.estimatedCostUsd, null);
  assert.equal(decision.errorCode, undefined);
  assert.match(decision.reason, /Missing pricing for openai\/unknown-model/);
});

test("Token Governor cannot allow maxCostUsd validation when pricing is unknown", async () => {
  const governor = new DeterministicTokenGovernor(pricingTable);
  const decision = await governor.evaluate({
    context,
    routingDecision: route("anthropic", "unknown-model"),
    expectedOutputTokens: 500,
    maxCostUsd: 1
  });

  assert.equal(decision.status, "reject");
  assert.equal(decision.estimatedCostUsd, null);
  assert.equal(decision.errorCode, undefined);
  assert.match(decision.reason, /cost budget cannot be validated/);
});

test("Token Governor rejects when max cost is exceeded", async () => {
  const governor = new DeterministicTokenGovernor(pricingTable);
  const decision = await governor.evaluate({
    context,
    routingDecision: route("anthropic", "anthropic-analysis"),
    expectedOutputTokens: 1_000,
    maxCostUsd: 0.001
  });

  assert.equal(decision.status, "reject");
  assert.equal(decision.errorCode, "token_budget_exceeded");
  assert.match(decision.reason, /exceeds max cost/i);
});

test("Token Governor rejects when token budget is exceeded", async () => {
  const governor = new DeterministicTokenGovernor(pricingTable);
  const decision = await governor.evaluate({
    context,
    routingDecision: route("openai", "openai-general"),
    expectedOutputTokens: 500,
    maxTotalTokens: 1_200
  });

  assert.equal(decision.status, "reject");
  assert.equal(decision.errorCode, "token_budget_exceeded");
  assert.match(decision.reason, /exceed max total tokens/i);
});

test("Token Governor allows calls within token and cost limits", async () => {
  const governor = new DeterministicTokenGovernor(pricingTable);
  const decision = await governor.evaluate({
    context,
    routingDecision: route("openai", "openai-general"),
    expectedOutputTokens: 250,
    maxInputTokens: 1_000,
    maxOutputTokens: 250,
    maxTotalTokens: 1_250,
    maxCostUsd: 1
  });

  assert.equal(decision.status, "allow");
  assert.equal(decision.errorCode, undefined);
});

test("provider adapters still do not calculate cost", async () => {
  const openAIAdapter = new OpenAIAdapter({
    apiKey: "test",
    httpClient: {
      async request() {
        return jsonResponse({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        });
      }
    }
  });
  const anthropicAdapter = new AnthropicAdapter({
    apiKey: "test",
    httpClient: {
      async request() {
        return jsonResponse({
          content: [{ type: "text", text: "ok" }],
          usage: { input_tokens: 1, output_tokens: 1 }
        });
      }
    }
  });

  const openAIResult = await openAIAdapter.sendMessage({
    executionId: "exec",
    model: "openai-general",
    messages: [{ role: "user", content: "hi" }]
  });
  const anthropicResult = await anthropicAdapter.sendMessage({
    executionId: "exec",
    model: "anthropic-analysis",
    messages: [{ role: "user", content: "hi" }]
  });

  assert.equal(openAIResult.estimatedCostUsd, null);
  assert.equal(anthropicResult.estimatedCostUsd, null);
});

test("Orchestrator remains decoupled from provider details", async () => {
  const source = await readFile("src/orchestrator.ts", "utf8");

  assert.equal(source.includes("OpenAIAdapter"), false);
  assert.equal(source.includes("AnthropicAdapter"), false);
  assert.equal(source.includes("model-config"), false);
  assert.equal(source.includes("pricing"), false);
});

function route(provider: "openai" | "anthropic", model: string): RoutingDecision {
  return {
    provider,
    model,
    taskType: "general",
    reason: "test route",
    estimatedCostUsd: null,
    estimatedLatencyClass: "low"
  };
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}
