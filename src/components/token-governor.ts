import type { CompiledContext, RoutingDecision, TokenDecision } from "../types.js";
import { EMPTY_PRICING_TABLE, type ModelPricingTable } from "../config/model-config.js";

export interface TokenGovernorInput {
  context: CompiledContext;
  routingDecision: RoutingDecision;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxTotalTokens?: number;
  maxCostUsd?: number;
  expectedOutputTokens?: number;
}

export interface TokenGovernor {
  evaluate(input: TokenGovernorInput): Promise<TokenDecision>;
}

export class DeterministicTokenGovernor implements TokenGovernor {
  constructor(private readonly pricingTable: ModelPricingTable = EMPTY_PRICING_TABLE) {}

  async evaluate(input: TokenGovernorInput): Promise<TokenDecision> {
    const estimatedInputTokens = input.context.estimatedTokens;
    const estimatedOutputTokens = input.expectedOutputTokens ?? input.maxOutputTokens ?? 0;
    const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;
    const estimatedCostUsd = this.estimateCost(input.routingDecision, {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens
    });

    if (estimatedCostUsd === null) {
      return {
        status: "reject",
        estimatedInputTokens,
        estimatedOutputTokens,
        estimatedTotalTokens,
        estimatedCostUsd,
        reason: `Missing pricing for ${input.routingDecision.provider}/${input.routingDecision.model}; cost budget cannot be validated.`
      };
    }

    const rejectionReason = findRejectionReason(input, {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedTotalTokens,
      estimatedCostUsd
    });

    if (rejectionReason) {
      return {
        status: "reject",
        estimatedInputTokens,
        estimatedOutputTokens,
        estimatedTotalTokens,
        estimatedCostUsd,
        reason: rejectionReason,
        errorCode: "token_budget_exceeded"
      };
    }

    return {
      status: "allow",
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedTotalTokens,
      estimatedCostUsd,
      reason: "Estimated token and cost usage are within configured limits."
    };
  }

  private estimateCost(
    routingDecision: RoutingDecision,
    usage: { inputTokens: number; outputTokens: number }
  ): number | null {
    const pricing = this.pricingTable[routingDecision.provider]?.[routingDecision.model];

    if (!pricing) {
      return null;
    }

    const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens;

    return roundUsd(inputCost + outputCost);
  }
}

export { DeterministicTokenGovernor as SkeletonTokenGovernor };

function findRejectionReason(
  input: TokenGovernorInput,
  estimates: {
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedTotalTokens: number;
    estimatedCostUsd: number;
  }
): string | undefined {
  if (
    input.maxInputTokens !== undefined &&
    estimates.estimatedInputTokens > input.maxInputTokens
  ) {
    return `Estimated input tokens ${estimates.estimatedInputTokens} exceed max input tokens ${input.maxInputTokens}.`;
  }

  if (
    input.maxOutputTokens !== undefined &&
    estimates.estimatedOutputTokens > input.maxOutputTokens
  ) {
    return `Estimated output tokens ${estimates.estimatedOutputTokens} exceed max output tokens ${input.maxOutputTokens}.`;
  }

  if (
    input.maxTotalTokens !== undefined &&
    estimates.estimatedTotalTokens > input.maxTotalTokens
  ) {
    return `Estimated total tokens ${estimates.estimatedTotalTokens} exceed max total tokens ${input.maxTotalTokens}.`;
  }

  if (input.maxCostUsd !== undefined && estimates.estimatedCostUsd > input.maxCostUsd) {
    return `Estimated cost USD ${estimates.estimatedCostUsd} exceeds max cost USD ${input.maxCostUsd}.`;
  }

  return undefined;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
