import type { CompiledContext, RoutingDecision, TokenDecision } from "../types.js";

export interface TokenGovernor {
  evaluate(input: {
    context: CompiledContext;
    routingDecision: RoutingDecision;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    maxCostUsd?: number;
  }): Promise<TokenDecision>;
}

export class SkeletonTokenGovernor implements TokenGovernor {
  async evaluate(input: {
    context: CompiledContext;
    routingDecision: RoutingDecision;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    maxCostUsd?: number;
  }): Promise<TokenDecision> {
    if (input.maxInputTokens !== undefined && input.context.estimatedTokens > input.maxInputTokens) {
      return {
        status: "deny",
        estimatedInputTokens: input.context.estimatedTokens,
        estimatedOutputTokens: 0,
        estimatedCostUsd: 0,
        reason: "Estimated input tokens exceed the configured maximum."
      };
    }

    return {
      status: "allow",
      estimatedInputTokens: input.context.estimatedTokens,
      estimatedOutputTokens: 0,
      estimatedCostUsd: input.routingDecision.estimatedCostUsd,
      reason: "Skeleton token decision; real token accounting is not implemented yet."
    };
  }
}

