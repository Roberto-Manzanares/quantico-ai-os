import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateLimitedShadowAuthority,
  LimitedShadowAuthorityPolicyV011,
  type LimitedShadowAuthorityPolicyConfig,
  type ModelPricingTable,
  type ProviderName,
  type ProviderScorecardAggregate,
  type ProviderScorecardSummary,
  type RoutingDecision,
  type ShadowRoutingAdvice,
  type ShadowRoutingAnalysisReport
} from "../src/index.js";

const pricingTable: ModelPricingTable = {
  openai: {
    "gpt-5-nano": {
      inputUsdPerMillionTokens: 0.05,
      outputUsdPerMillionTokens: 0.4
    },
    "gpt-5-mini": {
      inputUsdPerMillionTokens: 0.06,
      outputUsdPerMillionTokens: 0.45
    }
  },
  anthropic: {
    "claude-haiku-4-5-20251001": {
      inputUsdPerMillionTokens: 0.06,
      outputUsdPerMillionTokens: 0.45
    }
  }
};

test("Limited Shadow Authority allows substitution when all thresholds pass", () => {
  const result = evaluateLimitedShadowAuthority(validInput());

  assert.equal(result.advisorAuthority, "limited");
  assert.equal(result.authorityDecision, "allow_shadow_influence");
  assert.equal(result.appliedSelection.provider, "anthropic");
  assert.equal(result.appliedSelection.model, "claude-haiku-4-5-20251001");
  assert.equal(result.auditRecordRequired, true);
  assert.equal(result.rollbackAvailable, true);
  assert.equal(result.auditRecord.evidenceStatus, "sufficient");
  assert.equal(result.auditRecord.dataQuality, "complete");
  assert.equal(result.auditRecord.budgetChecked.costFirstEstimatedCostUsd, 0.000022);
  assert.equal(result.auditRecord.budgetChecked.shadowEstimatedCostUsd, 0.000026);
  assert.equal(result.auditRecord.costDeltaUsd, 0.000004);
  assert.equal(result.auditRecord.costDeltaRatio, 0.181818);
  assert.ok(result.auditRecord.conditionsChecked.every((condition) => condition.passed));
});

test("Limited Shadow Authority stays none when policy is disabled", () => {
  const result = evaluateLimitedShadowAuthority(
    validInput({
      policy: { ...policy(), advisorAuthority: "none" }
    })
  );

  assert.equal(result.advisorAuthority, "none");
  assert.equal(result.authorityDecision, "fallback_cost_first");
  assert.equal(result.appliedSelection.provider, "openai");
  assert.match(result.reason, /advisorAuthority must be explicitly limited/);
});

test("Limited Shadow Authority requires sufficient evidence", () => {
  const result = evaluateLimitedShadowAuthority(
    validInput({
      analysisReport: report({ evidenceStatus: "insufficient" })
    })
  );

  assert.equal(result.advisorAuthority, "none");
  assert.equal(result.authorityDecision, "fallback_cost_first");
  assert.equal(result.appliedSelection.provider, "openai");
  assert.match(result.reason, /evidenceStatus must be sufficient/);
});

test("Limited Shadow Authority requires complete dataQuality", () => {
  const result = evaluateLimitedShadowAuthority(
    validInput({
      advice: advice({ dataQuality: "partial" })
    })
  );

  assert.equal(result.advisorAuthority, "none");
  assert.equal(result.authorityDecision, "fallback_cost_first");
  assert.match(result.reason, /dataQuality must be complete/);
});

test("Limited Shadow Authority requires exact provider:model allowlist", () => {
  const result = evaluateLimitedShadowAuthority(
    validInput({
      policy: {
        ...policy(),
        allowedModels: [{ provider: "openai", model: "gpt-5-mini" }]
      }
    })
  );

  assert.equal(result.advisorAuthority, "none");
  assert.equal(result.authorityDecision, "fallback_cost_first");
  assert.match(result.reason, /explicit allowlist/);
});

test("Limited Shadow Authority blocks a blocked shadow provider or model", () => {
  const providerBlocked = evaluateLimitedShadowAuthority(
    validInput({ blockedProviders: ["anthropic"] })
  );
  const modelBlocked = evaluateLimitedShadowAuthority(
    validInput({ blockedModels: ["claude-haiku-4-5-20251001"] })
  );

  assert.equal(providerBlocked.advisorAuthority, "none");
  assert.equal(providerBlocked.authorityDecision, "blocked");
  assert.equal(providerBlocked.appliedSelection.provider, "openai");
  assert.match(providerBlocked.reason, /provider must not be blocked/);

  assert.equal(modelBlocked.advisorAuthority, "none");
  assert.equal(modelBlocked.authorityDecision, "blocked");
  assert.equal(modelBlocked.appliedSelection.provider, "openai");
  assert.match(modelBlocked.reason, /model must not be blocked/);
});

test("Limited Shadow Authority fails closed when pricing is missing or incomparable", () => {
  const result = evaluateLimitedShadowAuthority(
    validInput({
      pricingTable: {
        openai: pricingTable.openai,
        anthropic: {}
      }
    })
  );

  assert.equal(result.advisorAuthority, "none");
  assert.equal(result.authorityDecision, "fallback_cost_first");
  assert.equal(result.auditRecord.budgetChecked.shadowEstimatedCostUsd, null);
  assert.match(result.reason, /Pricing for COST-FIRST and shadow/);
});

test("Limited Shadow Authority requires historical pass and success thresholds", () => {
  const lowPassRate = evaluateLimitedShadowAuthority(
    validInput({
      advice: advice({ shadowEvaluationPassRate: 0.79, shadowSuccessRate: 0.9 })
    })
  );
  const lowSuccessRate = evaluateLimitedShadowAuthority(
    validInput({
      advice: advice({ shadowEvaluationPassRate: 0.9, shadowSuccessRate: 0.79 })
    })
  );

  assert.equal(lowPassRate.advisorAuthority, "none");
  assert.match(lowPassRate.reason, /evaluationPassRate must be at least 0.8/);

  assert.equal(lowSuccessRate.advisorAuthority, "none");
  assert.match(lowSuccessRate.reason, /successRate must be at least 0.8/);
});

test("Limited Shadow Authority requires minimum quality or success advantage", () => {
  const result = evaluateLimitedShadowAuthority(
    validInput({
      advice: advice({ shadowEvaluationPassRate: 0.9, shadowSuccessRate: 0.85 }),
      scorecards: scorecards({
        costFirstEvaluationPassRate: 0.75,
        costFirstSuccessRate: 0.8
      })
    })
  );

  assert.equal(result.advisorAuthority, "none");
  assert.match(result.reason, /configured evaluation pass rate or success rate advantage/);
});

test("Limited Shadow Authority enforces relative and absolute cost margins", () => {
  const relativeExceeded = evaluateLimitedShadowAuthority(
    validInput({
      pricingTable: {
        openai: pricingTable.openai,
        anthropic: {
          "claude-haiku-4-5-20251001": {
            inputUsdPerMillionTokens: 0.08,
            outputUsdPerMillionTokens: 0.8
          }
        }
      }
    })
  );
  const absoluteExceeded = evaluateLimitedShadowAuthority(
    validInput({
      policy: {
        ...policy(),
        maxAdditionalCostUsdPerIntervention: 0.000001
      }
    })
  );

  assert.equal(relativeExceeded.advisorAuthority, "none");
  assert.match(relativeExceeded.reason, /more than 0.25/);

  assert.equal(absoluteExceeded.advisorAuthority, "none");
  assert.match(absoluteExceeded.reason, /maxAdditionalCostUsdPerIntervention/);
});

test("Limited Shadow Authority requires max intervention budgets to be configured", () => {
  const missingAdditionalBudget = evaluateLimitedShadowAuthority(
    validInput({
      policy: {
        ...policy(),
        maxAdditionalCostUsdPerIntervention: undefined
      }
    })
  );
  const missingMaxEstimatedBudget = evaluateLimitedShadowAuthority(
    validInput({
      policy: {
        ...policy(),
        maxEstimatedCostUsdPerIntervention: undefined
      }
    })
  );

  assert.equal(missingAdditionalBudget.advisorAuthority, "none");
  assert.match(missingAdditionalBudget.reason, /maxAdditionalCostUsdPerIntervention must be configured/);

  assert.equal(missingMaxEstimatedBudget.advisorAuthority, "none");
  assert.match(missingMaxEstimatedBudget.reason, /maxEstimatedCostUsdPerIntervention must be configured/);
});

test("Limited Shadow Authority returns an auditable rollback to COST-FIRST", () => {
  const evaluator = new LimitedShadowAuthorityPolicyV011();
  const result = evaluator.evaluate(
    validInput({
      advice: advice({ shadowEvaluationPassRate: 0.7, shadowSuccessRate: 0.7 })
    })
  );

  assert.equal(result.advisorAuthority, "none");
  assert.equal(result.appliedSelection.provider, result.actualSelection.provider);
  assert.equal(result.appliedSelection.model, result.actualSelection.model);
  assert.equal(result.rollbackAvailable, true);
  assert.equal(result.auditRecord.advisorAuthority, "none");
  assert.equal(result.auditRecord.authorityDecision, "fallback_cost_first");
  assert.equal(result.auditRecord.thresholdsApplied.minimumShadowEvaluationPassRate, 0.8);
  assert.equal(result.auditRecord.costFirstMetrics?.evaluationPassRate, 0.6);
  assert.equal(result.auditRecord.shadowMetrics?.evaluationPassRate, 0.7);
});

function validInput(overrides: Partial<Parameters<typeof evaluateLimitedShadowAuthority>[0]> = {}) {
  return {
    executionId: "exec_v011",
    actualSelection: route(),
    advice: advice(),
    analysisReport: report(),
    scorecards: scorecards(),
    pricingTable,
    estimatedInputTokens: 200,
    expectedOutputTokens: 30,
    policy: policy(),
    timestamp: new Date("2026-08-30T12:00:00.000Z"),
    ...overrides
  };
}

function route(): RoutingDecision {
  return {
    provider: "openai",
    model: "gpt-5-nano",
    taskType: "general",
    reason: "COST-FIRST selected openai/gpt-5-nano.",
    estimatedCostUsd: 0.000022,
    estimatedLatencyClass: "low"
  };
}

function policy(): LimitedShadowAuthorityPolicyConfig {
  return {
    advisorAuthority: "limited",
    allowedModels: [{ provider: "anthropic", model: "claude-haiku-4-5-20251001" }],
    maxAdditionalCostUsdPerIntervention: 0.00001,
    maxEstimatedCostUsdPerIntervention: 0.00005
  };
}

function advice(overrides: {
  dataQuality?: "complete" | "partial" | "insufficient_data";
  shadowEvaluationPassRate?: number;
  shadowSuccessRate?: number;
} = {}): ShadowRoutingAdvice {
  const shadowEvaluationPassRate = overrides.shadowEvaluationPassRate ?? 0.9;
  const shadowSuccessRate = overrides.shadowSuccessRate ?? 0.85;

  return {
    actualSelection: {
      provider: "openai",
      model: "gpt-5-nano",
      estimatedCostUsd: 0.000022,
      reason: "COST-FIRST selected openai/gpt-5-nano."
    },
    shadowRecommendation: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      reason: "Shadow recommendation has stronger historical pass and success rates.",
      metricsUsed: {
        executionCount: 10,
        evaluationPassCount: Math.round(shadowEvaluationPassRate * 10),
        evaluationPassRate: shadowEvaluationPassRate,
        successCount: Math.round(shadowSuccessRate * 10),
        successRate: shadowSuccessRate,
        averageActualCostUsd: 0.00003,
        averageLatencyMs: 1200,
        scorecardDataQuality: "complete"
      }
    },
    comparison: {
      matchesActualSelection: false,
      differenceReason:
        "COST-FIRST selected openai/gpt-5-nano; shadow advisor recommended anthropic/claude-haiku-4-5-20251001."
    },
    dataQuality: overrides.dataQuality ?? "complete",
    advisorAuthority: "none",
    reason: "Shadow recommendation differs from the COST-FIRST selection; this is observational only."
  };
}

function report(overrides: { evidenceStatus?: "sufficient" | "insufficient" } = {}): ShadowRoutingAnalysisReport {
  return {
    generatedAt: new Date("2026-08-30T12:00:00.000Z"),
    totalEvaluations: 5,
    matchCount: 3,
    divergenceCount: 2,
    insufficientDataCount: 0,
    matchRate: 0.6,
    divergenceRate: 0.4,
    observedDivergencePatterns: [],
    evidenceStatus: overrides.evidenceStatus ?? "sufficient",
    evidenceReason: "Evidence satisfies V0.10 thresholds.",
    metricsUsed: {
      minimumEvaluationsRequired: 5,
      matchCount: 3,
      divergenceCount: 2,
      insufficientDataRate: 0,
      divergencesWithAuditableReasonAndMetrics: 2
    },
    advisorAuthority: "none"
  };
}

function scorecards(overrides: {
  costFirstEvaluationPassRate?: number;
  costFirstSuccessRate?: number;
} = {}): ProviderScorecardSummary {
  return {
    byModel: {
      "openai:gpt-5-nano": scorecard({
        provider: "openai",
        model: "gpt-5-nano",
        evaluationPassRate: overrides.costFirstEvaluationPassRate ?? 0.6,
        successRate: overrides.costFirstSuccessRate ?? 0.7
      }),
      "anthropic:claude-haiku-4-5-20251001": scorecard({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        evaluationPassRate: 0.9,
        successRate: 0.85
      })
    }
  };
}

function scorecard(input: {
  provider: ProviderName;
  model: string;
  evaluationPassRate: number;
  successRate: number;
}): ProviderScorecardAggregate {
  const executionCount = 20;
  const evaluationPassCount = Math.round(input.evaluationPassRate * executionCount);
  const successCount = Math.round(input.successRate * executionCount);

  return {
    provider: input.provider,
    model: input.model,
    executionCount,
    successCount,
    failureCount: executionCount - successCount,
    needsHumanCount: 0,
    evaluationPassCount,
    evaluationFailCount: executionCount - evaluationPassCount,
    evaluationNeedsReviewCount: 0,
    totalActualCostUsd: 0.0002,
    averageActualCostUsd: 0.00001,
    averageLatencyMs: 1000,
    lastUpdatedAt: new Date("2026-08-30T12:00:00.000Z"),
    dataQuality: "complete"
  };
}
