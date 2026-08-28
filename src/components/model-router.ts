import type {
  CompiledContext,
  ExecutionConstraints,
  ModelCapability,
  RoutingDecision,
  TaskType
} from "../types.js";
import { DEFAULT_MODEL_CONFIGS, type ModelConfig } from "../config/model-config.js";

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
  constructor(private readonly modelConfigs: ModelConfig[] = DEFAULT_MODEL_CONFIGS) {}

  async route(input: ModelRouterInput): Promise<RoutingDecision> {
    const candidates = this.modelConfigs
      .filter((model) => model.taskTypes.includes(input.taskType))
      .filter((model) => !input.constraints.blockedProviders?.includes(model.provider))
      .filter((model) => !input.constraints.blockedModels?.includes(model.model))
      .filter((model) => supportsCapabilities(model, input.requiredCapabilities ?? []));

    if (candidates.length === 0) {
      throw new Error("No configured model satisfies the routing constraints.");
    }

    const preferredCandidate = candidates.find((model) => {
      const providerMatches =
        !input.constraints.preferredProvider || model.provider === input.constraints.preferredProvider;
      const modelMatches =
        !input.constraints.preferredModel || model.model === input.constraints.preferredModel;

      return providerMatches && modelMatches;
    });
    const selected = preferredCandidate ?? [...candidates].sort(compareModels)[0];

    return {
      provider: selected.provider,
      model: selected.model,
      taskType: input.taskType,
      reason: buildReason(input, selected, preferredCandidate !== undefined),
      estimatedCostUsd: null,
      estimatedLatencyClass: selected.latencyClass
    };
  }
}

export { DeterministicModelRouter as SkeletonModelRouter };

function supportsCapabilities(model: ModelConfig, requiredCapabilities: ModelCapability[]): boolean {
  return requiredCapabilities.every((capability) => model.capabilities.includes(capability));
}

function compareModels(left: ModelConfig, right: ModelConfig): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  return `${left.provider}:${left.model}`.localeCompare(`${right.provider}:${right.model}`);
}

function buildReason(
  input: ModelRouterInput,
  selected: ModelConfig,
  usedPreferredProvider: boolean
): string {
  const preferenceReason = usedPreferredProvider
    ? "preferred provider/model matched constraints"
    : "highest-priority configured model matched constraints";

  return [
    preferenceReason,
    `task_type=${input.taskType}`,
    `estimated_input_tokens=${input.estimatedInputTokens ?? input.context.estimatedTokens}`,
    `provider=${selected.provider}`,
    `model=${selected.model}`
  ].join("; ");
}
