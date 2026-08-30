import type {
  CompiledContext,
  ExecutionConstraints,
  ModelCapability,
  RoutingDecision,
  TaskType
} from "../types.js";
import {
  DEFAULT_MODEL_CONFIGS,
  DEFAULT_MODEL_PRICING_TABLE,
  type ModelConfig,
  type ModelPricingTable
} from "../config/model-config.js";

export interface ModelRouterInput {
  taskType: TaskType;
  context: CompiledContext;
  constraints: ExecutionConstraints;
  requiredCapabilities?: ModelCapability[];
  estimatedInputTokens?: number;
}

export interface ModelRouter {
  route(input: ModelRouterInput): Promise<RoutingDecision>;
}

export class DeterministicModelRouter implements ModelRouter {
  constructor(
    private readonly modelConfigs: ModelConfig[] = DEFAULT_MODEL_CONFIGS,
    private readonly pricingTable: ModelPricingTable = DEFAULT_MODEL_PRICING_TABLE
  ) {}

  async route(input: ModelRouterInput): Promise<RoutingDecision> {
    const compatibleCandidates = this.modelConfigs
      .filter((model) => model.taskTypes.includes(input.taskType))
      .filter((model) => !input.constraints.blockedProviders?.includes(model.provider))
      .filter((model) => !input.constraints.blockedModels?.includes(model.model))
      .filter((model) => supportsCapabilities(model, input.requiredCapabilities ?? []));

    if (compatibleCandidates.length === 0) {
      throw new Error("No configured model satisfies the routing constraints.");
    }

    const pricedCandidates = compatibleCandidates
      .map((model) => {
        const expectedOutputTokens = resolveExpectedOutputTokens(input, model);

        return {
          model,
          expectedOutputTokens,
          estimatedCostUsd:
            expectedOutputTokens === null
              ? null
              : estimateCostUsd(this.pricingTable, model, {
                  inputTokens: input.estimatedInputTokens ?? input.context.estimatedTokens,
                  outputTokens: expectedOutputTokens
                })
        };
      })
      .filter(
        (candidate): candidate is {
          model: ModelConfig;
          expectedOutputTokens: number;
          estimatedCostUsd: number;
        } =>
          candidate.estimatedCostUsd !== null
      );

    if (pricedCandidates.length === 0) {
      throw new Error("No compatible model has verifiable pricing for COST-FIRST routing.");
    }

    const hasPreference = Boolean(input.constraints.preferredProvider || input.constraints.preferredModel);
    const preferredCandidate = hasPreference
      ? pricedCandidates.find(({ model }) => {
      const providerMatches =
        !input.constraints.preferredProvider || model.provider === input.constraints.preferredProvider;
      const modelMatches =
        !input.constraints.preferredModel || model.model === input.constraints.preferredModel;

      return providerMatches && modelMatches;
      })
      : undefined;
    const selected = preferredCandidate ?? [...pricedCandidates].sort(comparePricedModels)[0];

    return {
      provider: selected.model.provider,
      model: selected.model.model,
      taskType: input.taskType,
      reason: buildReason(input, selected, preferredCandidate !== undefined),
      estimatedCostUsd: selected.estimatedCostUsd,
      estimatedLatencyClass: selected.model.latencyClass
    };
  }
}

export { DeterministicModelRouter as SkeletonModelRouter };

function supportsCapabilities(model: ModelConfig, requiredCapabilities: ModelCapability[]): boolean {
  return requiredCapabilities.every((capability) => model.capabilities.includes(capability));
}

function comparePricedModels(
  left: { model: ModelConfig; estimatedCostUsd: number },
  right: { model: ModelConfig; estimatedCostUsd: number }
): number {
  if (left.estimatedCostUsd !== right.estimatedCostUsd) {
    return left.estimatedCostUsd - right.estimatedCostUsd;
  }

  if (left.model.priority !== right.model.priority) {
    return left.model.priority - right.model.priority;
  }

  return modelKey(left.model).localeCompare(modelKey(right.model));
}

function buildReason(
  input: ModelRouterInput,
  selected: { model: ModelConfig; expectedOutputTokens: number; estimatedCostUsd: number },
  usedPreferredProvider: boolean
): string {
  const preferenceReason = usedPreferredProvider
    ? "preferred provider/model matched constraints"
    : "lowest estimated cost compatible model matched constraints";

  return [
    preferenceReason,
    `task_type=${input.taskType}`,
    `estimated_input_tokens=${input.estimatedInputTokens ?? input.context.estimatedTokens}`,
    `expected_output_tokens=${selected.expectedOutputTokens}`,
    `estimated_cost_usd=${selected.estimatedCostUsd}`,
    `provider=${selected.model.provider}`,
    `model=${selected.model.model}`,
    "precedence=task_type>capabilities>blocked>preferred>pricing>cost>priority>provider:model"
  ].join("; ");
}

function resolveExpectedOutputTokens(input: ModelRouterInput, model: ModelConfig): number | null {
  return input.constraints.expectedOutputTokens ?? input.constraints.maxOutputTokens ?? model.defaultExpectedOutputTokens ?? null;
}

function estimateCostUsd(
  pricingTable: ModelPricingTable,
  model: ModelConfig,
  usage: { inputTokens: number; outputTokens: number }
): number | null {
  const pricing = pricingTable[model.provider]?.[model.model];

  if (!pricing) {
    return null;
  }

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens;

  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

function modelKey(model: ModelConfig): string {
  return `${model.provider}:${model.model}`;
}
