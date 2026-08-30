import type {
  ProviderName,
  ProviderScorecardAggregate,
  ProviderScorecardSummary,
  RoutingDecision,
  ShadowAdvisorDataQuality,
  ShadowAdvisorMetricsUsed,
  ShadowAdvisorRecommendation,
  ShadowRoutingAdvice
} from "../types.js";

export interface ShadowRoutingAdvisorInput {
  actualSelection: RoutingDecision;
  scorecards: ProviderScorecardSummary;
  candidates?: Array<{ provider: ProviderName; model: string }>;
}

export interface ShadowRoutingAdvisor {
  advise(input: ShadowRoutingAdvisorInput): ShadowRoutingAdvice;
}

export class ShadowRoutingAdvisorV08 implements ShadowRoutingAdvisor {
  advise(input: ShadowRoutingAdvisorInput): ShadowRoutingAdvice {
    const actualSelection = {
      provider: input.actualSelection.provider,
      model: input.actualSelection.model,
      estimatedCostUsd: input.actualSelection.estimatedCostUsd ?? null,
      reason: input.actualSelection.reason
    };
    const candidates = getCandidateScorecards(input.scorecards, input.candidates);
    const sufficientCandidates = candidates.filter(hasSufficientData);

    if (sufficientCandidates.length === 0) {
      return {
        actualSelection,
        shadowRecommendation: null,
        comparison: { matchesActualSelection: false },
        dataQuality: "insufficient_data",
        advisorAuthority: "none",
        reason: "Shadow advisor has no provider/model scorecard with sufficient evaluation data."
      };
    }

    const [recommended] = sufficientCandidates.sort(compareScorecards);
    const shadowRecommendation = createRecommendation(recommended);
    const matchesActualSelection =
      actualSelection.provider === shadowRecommendation.provider &&
      actualSelection.model === shadowRecommendation.model;

    return {
      actualSelection,
      shadowRecommendation,
      comparison: {
        matchesActualSelection,
        differenceReason: matchesActualSelection
          ? undefined
          : `COST-FIRST selected ${actualSelection.provider}/${actualSelection.model}; shadow advisor recommended ${shadowRecommendation.provider}/${shadowRecommendation.model} from scorecard history.`
      },
      dataQuality: deriveAdvisorDataQuality(sufficientCandidates),
      advisorAuthority: "none",
      reason: matchesActualSelection
        ? "Shadow recommendation matches the COST-FIRST selection."
        : "Shadow recommendation differs from the COST-FIRST selection; this is observational only."
    };
  }
}

export { ShadowRoutingAdvisorV08 as SkeletonShadowRoutingAdvisor };

function getCandidateScorecards(
  scorecards: ProviderScorecardSummary,
  candidates?: Array<{ provider: ProviderName; model: string }>
): ProviderScorecardAggregate[] {
  if (!candidates) {
    return Object.values(scorecards.byModel);
  }

  return candidates
    .map((candidate) => scorecards.byModel[scorecardKey(candidate.provider, candidate.model)])
    .filter((scorecard): scorecard is ProviderScorecardAggregate => scorecard !== undefined);
}

function hasSufficientData(scorecard: ProviderScorecardAggregate): boolean {
  const evaluationCount =
    scorecard.evaluationPassCount +
    scorecard.evaluationFailCount +
    scorecard.evaluationNeedsReviewCount;

  return scorecard.executionCount > 0 && evaluationCount > 0;
}

function compareScorecards(
  left: ProviderScorecardAggregate,
  right: ProviderScorecardAggregate
): number {
  return (
    compareDescending(evaluationPassRate(left), evaluationPassRate(right)) ||
    compareDescending(successRate(left), successRate(right)) ||
    compareNullableAscending(left.averageActualCostUsd, right.averageActualCostUsd) ||
    compareNullableAscending(left.averageLatencyMs, right.averageLatencyMs) ||
    scorecardKey(left.provider, left.model).localeCompare(scorecardKey(right.provider, right.model))
  );
}

function createRecommendation(scorecard: ProviderScorecardAggregate): ShadowAdvisorRecommendation {
  const metricsUsed = metricsFromScorecard(scorecard);

  return {
    provider: scorecard.provider,
    model: scorecard.model,
    reason:
      `Recommended by deterministic scorecard history: passRate=${metricsUsed.evaluationPassRate}, ` +
      `successRate=${metricsUsed.successRate}, averageActualCostUsd=${metricsUsed.averageActualCostUsd}, ` +
      `averageLatencyMs=${metricsUsed.averageLatencyMs}.`,
    metricsUsed
  };
}

function metricsFromScorecard(scorecard: ProviderScorecardAggregate): ShadowAdvisorMetricsUsed {
  return {
    executionCount: scorecard.executionCount,
    evaluationPassCount: scorecard.evaluationPassCount,
    evaluationPassRate: evaluationPassRate(scorecard),
    successCount: scorecard.successCount,
    successRate: successRate(scorecard),
    averageActualCostUsd: scorecard.averageActualCostUsd,
    averageLatencyMs: scorecard.averageLatencyMs,
    scorecardDataQuality: scorecard.dataQuality
  };
}

function deriveAdvisorDataQuality(
  scorecards: ProviderScorecardAggregate[]
): ShadowAdvisorDataQuality {
  return scorecards.some((scorecard) => scorecard.dataQuality === "partial") ? "partial" : "complete";
}

function evaluationPassRate(scorecard: ProviderScorecardAggregate): number {
  const total =
    scorecard.evaluationPassCount +
    scorecard.evaluationFailCount +
    scorecard.evaluationNeedsReviewCount;

  if (total === 0) {
    return 0;
  }

  return roundRatio(scorecard.evaluationPassCount / total);
}

function successRate(scorecard: ProviderScorecardAggregate): number {
  if (scorecard.executionCount === 0) {
    return 0;
  }

  return roundRatio(scorecard.successCount / scorecard.executionCount);
}

function compareDescending(left: number, right: number): number {
  return right - left;
}

function compareNullableAscending(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left - right;
}

function scorecardKey(provider: ProviderName, model: string): string {
  return `${provider}:${model}`;
}

function roundRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
