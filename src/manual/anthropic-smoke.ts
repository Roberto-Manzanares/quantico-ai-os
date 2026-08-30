import { AnthropicAdapter, createQuanticoSystem, type ModelConfig, type ModelPricingTable } from "../index.js";

const ANTHROPIC_SMOKE_MODEL = "claude-haiku-4-5-20251001";
const MAX_INPUT_TOKENS = 220;
const MAX_OUTPUT_TOKENS = 32;
const MAX_TOTAL_TOKENS = 252;
const MAX_COST_USD = 0.001;

const anthropicOnlyModels: ModelConfig[] = [
  {
    provider: "anthropic",
    model: ANTHROPIC_SMOKE_MODEL,
    taskTypes: ["general"],
    capabilities: ["text_generation"],
    latencyClass: "low",
    priority: 1
  }
];

const smokePricing: ModelPricingTable = {
  openai: {},
  anthropic: {
    [ANTHROPIC_SMOKE_MODEL]: {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 5
    }
  }
};

const anthropicAdapter = new AnthropicAdapter();

const system = createQuanticoSystem({
  modelConfigs: anthropicOnlyModels,
  pricingTable: smokePricing,
  providers: {
    anthropic: anthropicAdapter
  }
});

const result = await system.orchestrator.run({
  goal: "Responde incluyendo exactamente la frase QUANTICO_ANTHROPIC_OK.",
  constraints: {
    preferredProvider: "anthropic",
    preferredModel: ANTHROPIC_SMOKE_MODEL,
    expectedOutputTokens: MAX_OUTPUT_TOKENS,
    maxInputTokens: MAX_INPUT_TOKENS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxTotalTokens: MAX_TOTAL_TOKENS,
    maxCostUsd: MAX_COST_USD,
    evaluationCriteria: [
      { type: "contains_text", value: "QUANTICO_ANTHROPIC_OK" },
      { type: "max_length", value: 160 }
    ],
    modelCallRiskLevel: "LOW"
  },
  contextRefs: [
    "text:smoke-instruction:Return one short sentence containing exactly the phrase QUANTICO_ANTHROPIC_OK."
  ]
});

const routed = await findRoutedModel(result.execution.id);

console.log(
  JSON.stringify(
    {
      executionId: result.execution.id,
      provider: routed.provider,
      model: routed.model,
      status: result.execution.status,
      evaluationStatus: result.evaluation.status,
      inputTokens: result.execution.metrics.inputTokens,
      outputTokens: result.execution.metrics.outputTokens,
      estimatedCost: result.execution.metrics.estimatedCostUsd,
      latency: result.execution.metrics.latencyMs,
      resultado: result.execution.finalResult ?? result.execution.error?.code ?? "",
      diagnostics: anthropicAdapter.getLastDiagnostics()
    },
    null,
    2
  )
);

if (result.execution.status === "failed") {
  process.exitCode = 1;
}

async function findRoutedModel(executionId: string): Promise<{ provider: string; model: string }> {
  const events = await system.stateMemory.listEvents(executionId);
  const event = events.find((item) => item.type === "model_routed");
  const payload = event?.payload as
    | {
        routingDecision?: {
          provider?: string;
          model?: string;
        };
      }
    | undefined;

  return {
    provider: payload?.routingDecision?.provider ?? "unknown",
    model: payload?.routingDecision?.model ?? "unknown"
  };
}
