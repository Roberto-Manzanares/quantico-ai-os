import type {
  CompiledContext,
  ExecutionConstraints,
  ProviderName,
  RoutingDecision,
  TaskType
} from "../types.js";

export interface ModelRouter {
  route(input: {
    taskType: TaskType;
    context: CompiledContext;
    constraints: ExecutionConstraints;
  }): Promise<RoutingDecision>;
}

export class SkeletonModelRouter implements ModelRouter {
  async route(input: {
    taskType: TaskType;
    context: CompiledContext;
    constraints: ExecutionConstraints;
  }): Promise<RoutingDecision> {
    const provider = selectAllowedProvider(input.constraints);

    return {
      provider,
      model: `${provider}-placeholder-model`,
      taskType: input.taskType,
      reason: "Skeleton routing decision; real routing is not implemented in V0.1 skeleton.",
      estimatedCostUsd: 0,
      estimatedLatencyClass: "unknown"
    };
  }
}

function selectAllowedProvider(constraints: ExecutionConstraints): ProviderName {
  const blocked = new Set(constraints.blockedProviders ?? []);

  if (constraints.preferredProvider && !blocked.has(constraints.preferredProvider)) {
    return constraints.preferredProvider;
  }

  return blocked.has("openai") ? "anthropic" : "openai";
}

