import { OpenAIAdapter, createQuanticoSystem, type ModelConfig, type ModelPricingTable } from "../index.js";

const OPENAI_SMOKE_MODEL = "gpt-5-nano";
const MAX_INPUT_TOKENS = 220;
const MAX_OUTPUT_TOKENS = 128;
const MAX_TOTAL_TOKENS = 348;
const MAX_COST_USD = 0.001;

const openAIOnlyModels: ModelConfig[] = [
  {
    provider: "openai",
    model: OPENAI_SMOKE_MODEL,
    taskTypes: ["generation", "general"],
    capabilities: ["text_generation"],
    latencyClass: "low",
    priority: 1
  }
];

const smokePricing: ModelPricingTable = {
  openai: {
    [OPENAI_SMOKE_MODEL]: {
      inputUsdPerMillionTokens: 0.05,
      outputUsdPerMillionTokens: 0.4
    }
  },
  anthropic: {}
};

const openAIAdapter = new OpenAIAdapter({
  apiMode: "responses",
  reasoningEffort: "minimal"
});

const system = createQuanticoSystem({
  modelConfigs: openAIOnlyModels,
  pricingTable: smokePricing,
  providers: {
    openai: openAIAdapter
  }
});

const result = await system.orchestrator.run({
  goal: "Genera una respuesta que incluya exactamente la frase QUANTICO_KERNEL_OK.",
  constraints: {
    preferredProvider: "openai",
    preferredModel: OPENAI_SMOKE_MODEL,
    expectedOutputTokens: MAX_OUTPUT_TOKENS,
    maxInputTokens: MAX_INPUT_TOKENS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxTotalTokens: MAX_TOTAL_TOKENS,
    maxCostUsd: MAX_COST_USD,
    evaluationCriteria: [
      { type: "contains_text", value: "QUANTICO_KERNEL_OK" },
      { type: "max_length", value: 240 }
    ],
    modelCallRiskLevel: "LOW"
  },
  contextRefs: [
    "text:smoke-instruction:Return one short sentence containing exactly the phrase QUANTICO_KERNEL_OK."
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
      diagnostics: openAIAdapter.getLastDiagnostics()
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
