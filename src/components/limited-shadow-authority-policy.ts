import type { ModelPricingTable } from "../config/model-config.js";
import type {
  LimitedShadowAuthorityAuditRecord,
  LimitedShadowAuthorityDecision,
  LimitedShadowAuthorityPolicyConfig,
  LimitedShadowAuthorityResult,
  ProviderName,
  ProviderScorecardSummary,
  RoutingDecision,
  ShadowAdvisorMetricsUsed,
  ShadowAdvisorRecommendation,
  ShadowAdvisorSelection,
  ShadowRoutingAdvice,
  ShadowRoutingAnalysisReport
} from "../types.js";

export interface LimitedShadowAuthorityInput {
  executionId: string;
  actualSelection: RoutingDecision;
  advice: ShadowRoutingAdvice;
  analysisReport: ShadowRoutingAnalysisReport;
  scorecards: ProviderScorecardSummary;
  pricingTable: ModelPricingTable;
  estimatedInputTokens: number;
  expectedOutputTokens: number;
  policy: LimitedShadowAuthorityPolicyConfig;
  blockedProviders?: ProviderName[];
  blockedModels?: string[];
  timestamp?: Date;
}

interface CheckedCondition {
  condition: string;
  passed: boolean;
  reason: string;
}

interface Thresholds {
  minimumShadowEvaluationPassRate: number;
  minimumShadowSuccessRate: number;
  minimumEvaluationPassRateAdvantage: number;
  minimumSuccessRateAdvantage: number;
  maxAdditionalCostRatio: number;
}

export class LimitedShadowAuthorityPolicyV011 {
  evaluate(input: LimitedShadowAuthorityInput): LimitedShadowAuthorityResult {
    return evaluateLimitedShadowAuthority(input);
  }
}

export { LimitedShadowAuthorityPolicyV011 as SkeletonLimitedShadowAuthorityPolicy };

export function evaluateLimitedShadowAuthority(
  input: LimitedShadowAuthorityInput
): LimitedShadowAuthorityResult {
  const timestamp = input.timestamp ?? new Date();
  const actualSelection = toShadowSelection(input.actualSelection);
  const shadowRecommendation = input.advice.shadowRecommendation;
  const thresholds = resolveThresholds(input.policy);
  const costFirstMetrics = lookupMetrics(input.scorecards, actualSelection);
  const shadowMetrics = shadowRecommendation?.metricsUsed ?? null;
  const costFirstEstimatedCostUsd = estimateCurrentCallCost(
    input.pricingTable,
    actualSelection.provider,
    actualSelection.model,
    input.estimatedInputTokens,
    input.expectedOutputTokens
  );
  const shadowEstimatedCostUsd = shadowRecommendation
    ? estimateCurrentCallCost(
        input.pricingTable,
        shadowRecommendation.provider,
        shadowRecommendation.model,
        input.estimatedInputTokens,
        input.expectedOutputTokens
      )
    : null;
  const costDeltaUsd =
    costFirstEstimatedCostUsd === null || shadowEstimatedCostUsd === null
      ? null
      : roundUsd(shadowEstimatedCostUsd - costFirstEstimatedCostUsd);
  const costDeltaRatio =
    costFirstEstimatedCostUsd === null ||
    shadowEstimatedCostUsd === null ||
    costFirstEstimatedCostUsd <= 0
      ? null
      : roundRatio(shadowEstimatedCostUsd / costFirstEstimatedCostUsd - 1);

  const conditions = buildConditions({
    input,
    actualSelection,
    shadowRecommendation,
    costFirstMetrics,
    shadowMetrics,
    costFirstEstimatedCostUsd,
    shadowEstimatedCostUsd,
    costDeltaUsd,
    costDeltaRatio,
    thresholds
  });
  const failedCondition = conditions.find((condition) => !condition.passed);
  const isAllowed = failedCondition === undefined;
  const appliedSelection = isAllowed && shadowRecommendation
    ? {
        provider: shadowRecommendation.provider,
        model: shadowRecommendation.model,
        estimatedCostUsd: shadowEstimatedCostUsd,
        reason: shadowRecommendation.reason
      }
    : actualSelection;
  const advisorAuthority = isAllowed ? "limited" : "none";
  const authorityDecision: LimitedShadowAuthorityDecision = isAllowed
    ? "allow_shadow_influence"
    : isExplicitBlock(failedCondition?.condition)
      ? "blocked"
      : "fallback_cost_first";
  const reason = isAllowed
    ? "Shadow recommendation satisfies V0.11 limited authority thresholds and budget constraints."
    : `Limited shadow authority failed closed: ${failedCondition?.reason ?? "condition could not be verified"}.`;

  const auditRecord: LimitedShadowAuthorityAuditRecord = {
    executionId: input.executionId,
    advisorAuthority,
    authorityDecision,
    actualSelection,
    shadowRecommendation,
    appliedSelection,
    evidenceStatus: input.analysisReport.evidenceStatus,
    dataQuality: input.advice.dataQuality,
    conditionsChecked: conditions,
    budgetChecked: {
      costFirstEstimatedCostUsd,
      shadowEstimatedCostUsd,
      maxAdditionalCostRatio: thresholds.maxAdditionalCostRatio,
      maxAdditionalCostUsdPerIntervention:
        input.policy.maxAdditionalCostUsdPerIntervention ?? null,
      maxEstimatedCostUsdPerIntervention:
        input.policy.maxEstimatedCostUsdPerIntervention ?? null
    },
    thresholdsApplied: thresholds,
    costFirstMetrics,
    shadowMetrics,
    costDeltaUsd,
    costDeltaRatio,
    reason,
    timestamp
  };

  return {
    advisorAuthority,
    authorityDecision,
    actualSelection,
    shadowRecommendation,
    appliedSelection,
    reason,
    rollbackAvailable: true,
    auditRecordRequired: true,
    auditRecord
  };
}

function buildConditions(input: {
  input: LimitedShadowAuthorityInput;
  actualSelection: ShadowAdvisorSelection;
  shadowRecommendation: ShadowAdvisorRecommendation | null;
  costFirstMetrics: ShadowAdvisorMetricsUsed | null;
  shadowMetrics: ShadowAdvisorMetricsUsed | null;
  costFirstEstimatedCostUsd: number | null;
  shadowEstimatedCostUsd: number | null;
  costDeltaUsd: number | null;
  costDeltaRatio: number | null;
  thresholds: Thresholds;
}): CheckedCondition[] {
  const {
    input: authorityInput,
    actualSelection,
    shadowRecommendation,
    costFirstMetrics,
    shadowMetrics,
    costFirstEstimatedCostUsd,
    shadowEstimatedCostUsd,
    costDeltaUsd,
    costDeltaRatio,
    thresholds
  } = input;

  return [
    check(
      "advisor_authority_limited",
      authorityInput.policy.advisorAuthority === "limited",
      "advisorAuthority must be explicitly limited."
    ),
    check(
      "evidence_status_sufficient",
      authorityInput.analysisReport.evidenceStatus === "sufficient",
      "evidenceStatus must be sufficient."
    ),
    check(
      "data_quality_complete",
      authorityInput.advice.dataQuality === "complete",
      "Shadow advice dataQuality must be complete."
    ),
    check(
      "shadow_recommendation_present",
      shadowRecommendation !== null,
      "Shadow recommendation must be present."
    ),
    check(
      "shadow_metrics_present",
      shadowMetrics !== null,
      "Shadow metrics must be present."
    ),
    check(
      "cost_first_metrics_present",
      costFirstMetrics !== null,
      "COST-FIRST historical metrics must be present."
    ),
    check(
      "shadow_model_allowlisted",
      shadowRecommendation !== null &&
        isAllowedModel(authorityInput.policy, shadowRecommendation.provider, shadowRecommendation.model),
      "Shadow provider/model must be in the explicit allowlist."
    ),
    check(
      "shadow_provider_not_blocked",
      shadowRecommendation !== null &&
        !authorityInput.blockedProviders?.includes(shadowRecommendation.provider),
      "Shadow provider must not be blocked."
    ),
    check(
      "shadow_model_not_blocked",
      shadowRecommendation !== null &&
        !authorityInput.blockedModels?.includes(shadowRecommendation.model),
      "Shadow model must not be blocked."
    ),
    check(
      "pricing_comparable",
      costFirstEstimatedCostUsd !== null && shadowEstimatedCostUsd !== null,
      "Pricing for COST-FIRST and shadow must be verifiable and comparable for the current call."
    ),
    check(
      "minimum_shadow_evaluation_pass_rate",
      shadowMetrics !== null &&
        shadowMetrics.evaluationPassRate >= thresholds.minimumShadowEvaluationPassRate,
      `Shadow evaluationPassRate must be at least ${thresholds.minimumShadowEvaluationPassRate}.`
    ),
    check(
      "minimum_shadow_success_rate",
      shadowMetrics !== null && shadowMetrics.successRate >= thresholds.minimumShadowSuccessRate,
      `Shadow successRate must be at least ${thresholds.minimumShadowSuccessRate}.`
    ),
    check(
      "minimum_quality_or_success_advantage",
      costFirstMetrics !== null &&
        shadowMetrics !== null &&
        (shadowMetrics.evaluationPassRate - costFirstMetrics.evaluationPassRate >=
          thresholds.minimumEvaluationPassRateAdvantage ||
          shadowMetrics.successRate - costFirstMetrics.successRate >=
            thresholds.minimumSuccessRateAdvantage),
      "Shadow must beat COST-FIRST by the configured evaluation pass rate or success rate advantage."
    ),
    check(
      "max_additional_cost_ratio",
      costDeltaRatio !== null && costDeltaRatio <= thresholds.maxAdditionalCostRatio,
      `Shadow estimated cost must not exceed COST-FIRST by more than ${thresholds.maxAdditionalCostRatio}.`
    ),
    check(
      "max_additional_cost_usd_present",
      authorityInput.policy.maxAdditionalCostUsdPerIntervention !== undefined,
      "maxAdditionalCostUsdPerIntervention must be configured."
    ),
    check(
      "max_additional_cost_usd",
      costDeltaUsd !== null &&
        authorityInput.policy.maxAdditionalCostUsdPerIntervention !== undefined &&
        costDeltaUsd <= authorityInput.policy.maxAdditionalCostUsdPerIntervention,
      "Shadow additional estimated cost must not exceed maxAdditionalCostUsdPerIntervention."
    ),
    check(
      "max_estimated_cost_present",
      authorityInput.policy.maxEstimatedCostUsdPerIntervention !== undefined,
      "maxEstimatedCostUsdPerIntervention must be configured."
    ),
    check(
      "max_estimated_cost",
      shadowEstimatedCostUsd !== null &&
        authorityInput.policy.maxEstimatedCostUsdPerIntervention !== undefined &&
        shadowEstimatedCostUsd <= authorityInput.policy.maxEstimatedCostUsdPerIntervention,
      "Shadow estimated cost must not exceed maxEstimatedCostUsdPerIntervention."
    ),
    check(
      "audit_complete",
      actualSelection.provider !== undefined &&
        shadowRecommendation !== null &&
        shadowMetrics !== null &&
        costFirstMetrics !== null,
      "Audit record must include selections and comparable metrics."
    )
  ];
}

function check(condition: string, passed: boolean, reason: string): CheckedCondition {
  return {
    condition,
    passed,
    reason: passed ? "ok" : reason
  };
}

function resolveThresholds(policy: LimitedShadowAuthorityPolicyConfig): Thresholds {
  return {
    minimumShadowEvaluationPassRate: policy.minimumShadowEvaluationPassRate ?? 0.8,
    minimumShadowSuccessRate: policy.minimumShadowSuccessRate ?? 0.8,
    minimumEvaluationPassRateAdvantage: policy.minimumEvaluationPassRateAdvantage ?? 0.2,
    minimumSuccessRateAdvantage: policy.minimumSuccessRateAdvantage ?? 0.1,
    maxAdditionalCostRatio: policy.maxAdditionalCostRatio ?? 0.25
  };
}

function lookupMetrics(
  scorecards: ProviderScorecardSummary,
  selection: { provider: ProviderName; model: string }
): ShadowAdvisorMetricsUsed | null {
  const scorecard = scorecards.byModel[providerModelKey(selection.provider, selection.model)];

  if (!scorecard) {
    return null;
  }

  const evaluationTotal =
    scorecard.evaluationPassCount +
    scorecard.evaluationFailCount +
    scorecard.evaluationNeedsReviewCount;

  return {
    executionCount: scorecard.executionCount,
    evaluationPassCount: scorecard.evaluationPassCount,
    evaluationPassRate: evaluationTotal === 0 ? 0 : roundRatio(scorecard.evaluationPassCount / evaluationTotal),
    successCount: scorecard.successCount,
    successRate:
      scorecard.executionCount === 0 ? 0 : roundRatio(scorecard.successCount / scorecard.executionCount),
    averageActualCostUsd: scorecard.averageActualCostUsd,
    averageLatencyMs: scorecard.averageLatencyMs,
    scorecardDataQuality: scorecard.dataQuality
  };
}

function estimateCurrentCallCost(
  pricingTable: ModelPricingTable,
  provider: ProviderName,
  model: string,
  estimatedInputTokens: number,
  expectedOutputTokens: number
): number | null {
  const pricing = pricingTable[provider][model];

  if (!pricing) {
    return null;
  }

  return roundUsd(
    (estimatedInputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens +
      (expectedOutputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens
  );
}

function isAllowedModel(
  policy: LimitedShadowAuthorityPolicyConfig,
  provider: ProviderName,
  model: string
): boolean {
  return policy.allowedModels.some(
    (allowedModel) => allowedModel.provider === provider && allowedModel.model === model
  );
}

function isExplicitBlock(condition?: string): boolean {
  return condition === "shadow_provider_not_blocked" || condition === "shadow_model_not_blocked";
}

function toShadowSelection(decision: RoutingDecision): ShadowAdvisorSelection {
  return {
    provider: decision.provider,
    model: decision.model,
    estimatedCostUsd: decision.estimatedCostUsd ?? null,
    reason: decision.reason
  };
}

function providerModelKey(provider: ProviderName, model: string): string {
  return `${provider}:${model}`;
}

function roundRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
