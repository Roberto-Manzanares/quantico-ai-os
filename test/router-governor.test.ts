import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DeterministicModelRouter,
  DeterministicTokenGovernor,
  OpenAIAdapter,
  AnthropicAdapter,
  DEFAULT_MODEL_CONFIGS,
  DEFAULT_MODEL_PRICING_TABLE,
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
  const router = new DeterministicModelRouter(modelConfigs, pricingTable);
  const decision = await router.route({
    taskType: "general",
    context,
    constraints: { preferredProvider: "openai", expectedOutputTokens: 500 },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.provider, "openai");
  assert.equal(decision.model, "openai-general");
});

test("Model Router never selects a blocked provider", async () => {
  const router = new DeterministicModelRouter(modelConfigs, pricingTable);
  const decision = await router.route({
    taskType: "general",
    context,
    constraints: { blockedProviders: ["anthropic"], expectedOutputTokens: 500 },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.provider, "openai");
});

test("Model Router uses task_type as a real selection signal", async () => {
  const router = new DeterministicModelRouter(modelConfigs, pricingTable);
  const decision = await router.route({
    taskType: "coding",
    context,
    constraints: { expectedOutputTokens: 500 },
    requiredCapabilities: ["tool_use"],
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.provider, "openai");
  assert.equal(decision.model, "openai-coding");
});

test("Model Router behavior is deterministic", async () => {
  const router = new DeterministicModelRouter(modelConfigs, pricingTable);
  const input = {
    taskType: "analysis" as const,
    context,
    constraints: { expectedOutputTokens: 500 },
    estimatedInputTokens: context.estimatedTokens
  };

  const first = await router.route(input);
  const second = await router.route(input);

  assert.deepEqual(first, second);
});

test("Model Router selects the lowest estimated cost compatible model", async () => {
  const router = new DeterministicModelRouter(modelConfigs, {
    openai: {
      ...pricingTable.openai,
      "openai-general": {
        inputUsdPerMillionTokens: 20,
        outputUsdPerMillionTokens: 20
      }
    },
    anthropic: {
      ...pricingTable.anthropic,
      "anthropic-analysis": {
        inputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 1
      }
    }
  });
  const decision = await router.route({
    taskType: "general",
    context,
    constraints: { expectedOutputTokens: 500 },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.provider, "anthropic");
  assert.equal(decision.model, "anthropic-analysis");
  assert.equal(decision.estimatedCostUsd, 0.0015);
  assert.match(decision.reason, /lowest estimated cost/);
});

test("Model Router rejects cheaper models incompatible with task_type", async () => {
  const router = new DeterministicModelRouter(
    [
      ...modelConfigs,
      {
        provider: "openai",
        model: "openai-cheap-generation",
        taskTypes: ["generation"],
        capabilities: ["text_generation"],
        latencyClass: "low",
        priority: 0
      }
    ],
    {
      openai: {
        ...pricingTable.openai,
        "openai-cheap-generation": {
          inputUsdPerMillionTokens: 0.1,
          outputUsdPerMillionTokens: 0.1
        }
      },
      anthropic: pricingTable.anthropic
    }
  );
  const decision = await router.route({
    taskType: "analysis",
    context,
    constraints: { expectedOutputTokens: 500 },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.model, "anthropic-analysis");
});

test("Model Router rejects cheaper models missing required capabilities", async () => {
  const router = new DeterministicModelRouter(
    [
      ...modelConfigs,
      {
        provider: "anthropic",
        model: "anthropic-cheap-coding",
        taskTypes: ["coding"],
        capabilities: ["text_generation"],
        latencyClass: "low",
        priority: 0
      }
    ],
    {
      openai: pricingTable.openai,
      anthropic: {
        ...pricingTable.anthropic,
        "anthropic-cheap-coding": {
          inputUsdPerMillionTokens: 0.1,
          outputUsdPerMillionTokens: 0.1
        }
      }
    }
  );
  const decision = await router.route({
    taskType: "coding",
    context,
    constraints: { expectedOutputTokens: 500 },
    requiredCapabilities: ["tool_use"],
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.model, "openai-coding");
});

test("Model Router lets blocked providers win over preferred providers", async () => {
  const router = new DeterministicModelRouter(modelConfigs, pricingTable);
  const decision = await router.route({
    taskType: "general",
    context,
    constraints: {
      preferredProvider: "anthropic",
      blockedProviders: ["anthropic"],
      expectedOutputTokens: 500
    },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.provider, "openai");
  assert.equal(decision.model, "openai-general");
});

test("Model Router lets blocked models win over preferred models", async () => {
  const router = new DeterministicModelRouter(modelConfigs, pricingTable);
  const decision = await router.route({
    taskType: "general",
    context,
    constraints: {
      preferredModel: "anthropic-analysis",
      blockedModels: ["anthropic-analysis"],
      expectedOutputTokens: 500
    },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.model, "openai-general");
});

test("Model Router respects a valid preferred model as explicit override", async () => {
  const router = new DeterministicModelRouter(modelConfigs, pricingTable);
  const decision = await router.route({
    taskType: "general",
    context,
    constraints: { preferredModel: "anthropic-analysis", expectedOutputTokens: 500 },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.provider, "anthropic");
  assert.equal(decision.model, "anthropic-analysis");
  assert.match(decision.reason, /preferred provider\/model/);
});

test("Model Router excludes candidates without pricing instead of treating them as zero cost", async () => {
  const router = new DeterministicModelRouter(
    [
      {
        provider: "anthropic",
        model: "anthropic-unpriced",
        taskTypes: ["general"],
        capabilities: ["text_generation"],
        latencyClass: "low",
        priority: 0
      },
      ...modelConfigs
    ],
    pricingTable
  );
  const decision = await router.route({
    taskType: "general",
    context,
    constraints: { expectedOutputTokens: 500 },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.notEqual(decision.model, "anthropic-unpriced");
  assert.equal(decision.model, "openai-general");
});

test("Model Router fails when no compatible candidate has verifiable pricing", async () => {
  const router = new DeterministicModelRouter(modelConfigs, {
    openai: {},
    anthropic: {}
  });

  await assert.rejects(
    () =>
      router.route({
        taskType: "general",
        context,
        constraints: { expectedOutputTokens: 500 },
        estimatedInputTokens: context.estimatedTokens
      }),
    /No compatible model has verifiable pricing/
  );
});

test("Model Router fails without configured or requested expected output tokens", async () => {
  const router = new DeterministicModelRouter(modelConfigs, pricingTable);

  await assert.rejects(
    () =>
      router.route({
        taskType: "general",
        context,
        constraints: {},
        estimatedInputTokens: context.estimatedTokens
      }),
    /No compatible model has verifiable pricing/
  );
});

test("Model Router breaks cost ties by priority", async () => {
  const router = new DeterministicModelRouter(
    [
      {
        provider: "openai",
        model: "openai-tie-low-priority",
        taskTypes: ["general"],
        capabilities: ["text_generation"],
        latencyClass: "low",
        priority: 2
      },
      {
        provider: "anthropic",
        model: "anthropic-tie-high-priority",
        taskTypes: ["general"],
        capabilities: ["text_generation"],
        latencyClass: "low",
        priority: 1
      }
    ],
    {
      openai: {
        "openai-tie-low-priority": {
          inputUsdPerMillionTokens: 1,
          outputUsdPerMillionTokens: 1
        }
      },
      anthropic: {
        "anthropic-tie-high-priority": {
          inputUsdPerMillionTokens: 1,
          outputUsdPerMillionTokens: 1
        }
      }
    }
  );
  const decision = await router.route({
    taskType: "general",
    context,
    constraints: { expectedOutputTokens: 500 },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.model, "anthropic-tie-high-priority");
});

test("Model Router breaks cost and priority ties by provider:model", async () => {
  const router = new DeterministicModelRouter(
    [
      {
        provider: "openai",
        model: "z-model",
        taskTypes: ["general"],
        capabilities: ["text_generation"],
        latencyClass: "low",
        priority: 1
      },
      {
        provider: "anthropic",
        model: "a-model",
        taskTypes: ["general"],
        capabilities: ["text_generation"],
        latencyClass: "low",
        priority: 1
      }
    ],
    {
      openai: {
        "z-model": {
          inputUsdPerMillionTokens: 1,
          outputUsdPerMillionTokens: 1
        }
      },
      anthropic: {
        "a-model": {
          inputUsdPerMillionTokens: 1,
          outputUsdPerMillionTokens: 1
        }
      }
    }
  );
  const decision = await router.route({
    taskType: "general",
    context,
    constraints: { expectedOutputTokens: 500 },
    estimatedInputTokens: context.estimatedTokens
  });

  assert.equal(decision.model, "a-model");
});

test("default economic models are configured for V0.3", () => {
  assert.ok(DEFAULT_MODEL_CONFIGS.some((model) => model.provider === "openai" && model.model === "gpt-5-nano"));
  assert.ok(
    DEFAULT_MODEL_CONFIGS.some(
      (model) => model.provider === "anthropic" && model.model === "claude-haiku-4-5-20251001"
    )
  );
  assert.deepEqual(DEFAULT_MODEL_PRICING_TABLE.openai["gpt-5-nano"], {
    inputUsdPerMillionTokens: 0.05,
    outputUsdPerMillionTokens: 0.4
  });
  assert.deepEqual(DEFAULT_MODEL_PRICING_TABLE.anthropic["claude-haiku-4-5-20251001"], {
    inputUsdPerMillionTokens: 1,
    outputUsdPerMillionTokens: 5
  });
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
