import test from "node:test";
import assert from "node:assert/strict";
import {
  ShadowRoutingAdvisorV08,
  type ProviderScorecardAggregate,
  type ProviderScorecardSummary,
  type ProviderName,
  type RoutingDecision
} from "../src/index.js";

test("Shadow Routing Advisor recommends by evaluation pass rate before cost", () => {
  const advisor = new ShadowRoutingAdvisorV08();

  const advice = advisor.advise({
    actualSelection: route("openai", "gpt-5-nano", 0.000018),
    scorecards: scorecards([
      aggregate({
        provider: "openai",
        model: "gpt-5-nano",
        evaluationPassCount: 1,
        evaluationFailCount: 1,
        successCount: 2,
        averageActualCostUsd: 0.00001,
        averageLatencyMs: 100
      }),
      aggregate({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        evaluationPassCount: 2,
        evaluationFailCount: 0,
        successCount: 1,
        averageActualCostUsd: 0.0009,
        averageLatencyMs: 900
      })
    ])
  });

  assert.equal(advice.shadowRecommendation?.provider, "anthropic");
  assert.equal(advice.shadowRecommendation?.model, "claude-haiku-4-5-20251001");
  assert.equal(advice.shadowRecommendation?.metricsUsed.evaluationPassRate, 1);
  assert.equal(advice.comparison.matchesActualSelection, false);
  assert.match(advice.comparison.differenceReason ?? "", /COST-FIRST selected openai\/gpt-5-nano/);
  assert.equal(advice.advisorAuthority, "none");
});

test("Shadow Routing Advisor uses success rate after evaluation pass rate", () => {
  const advisor = new ShadowRoutingAdvisorV08();

  const advice = advisor.advise({
    actualSelection: route("anthropic", "claude-haiku-4-5-20251001", 0.000262),
    scorecards: scorecards([
      aggregate({
        provider: "openai",
        model: "gpt-5-nano",
        evaluationPassCount: 1,
        evaluationFailCount: 1,
        successCount: 2,
        averageActualCostUsd: 0.0005,
        averageLatencyMs: 500
      }),
      aggregate({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        evaluationPassCount: 1,
        evaluationFailCount: 1,
        successCount: 1,
        averageActualCostUsd: 0.0001,
        averageLatencyMs: 100
      })
    ])
  });

  assert.equal(advice.shadowRecommendation?.provider, "openai");
  assert.equal(advice.shadowRecommendation?.metricsUsed.successRate, 1);
  assert.equal(advice.comparison.matchesActualSelection, false);
});

test("Shadow Routing Advisor uses lower average actual cost before latency", () => {
  const advisor = new ShadowRoutingAdvisorV08();

  const advice = advisor.advise({
    actualSelection: route("openai", "gpt-5-nano", 0.000018),
    scorecards: scorecards([
      aggregate({
        provider: "openai",
        model: "gpt-5-nano",
        averageActualCostUsd: 0.0002,
        averageLatencyMs: 10
      }),
      aggregate({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        averageActualCostUsd: 0.0001,
        averageLatencyMs: 1000
      })
    ])
  });

  assert.equal(advice.shadowRecommendation?.provider, "anthropic");
  assert.equal(advice.shadowRecommendation?.metricsUsed.averageActualCostUsd, 0.0001);
});

test("Shadow Routing Advisor uses lower latency after equivalent cost", () => {
  const advisor = new ShadowRoutingAdvisorV08();

  const advice = advisor.advise({
    actualSelection: route("openai", "gpt-5-nano", 0.000018),
    scorecards: scorecards([
      aggregate({
        provider: "openai",
        model: "gpt-5-nano",
        averageActualCostUsd: 0.0001,
        averageLatencyMs: 300
      }),
      aggregate({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        averageActualCostUsd: 0.0001,
        averageLatencyMs: 200
      })
    ])
  });

  assert.equal(advice.shadowRecommendation?.provider, "anthropic");
  assert.equal(advice.shadowRecommendation?.metricsUsed.averageLatencyMs, 200);
});

test("Shadow Routing Advisor uses provider:model deterministic tie break", () => {
  const advisor = new ShadowRoutingAdvisorV08();

  const advice = advisor.advise({
    actualSelection: route("openai", "gpt-5-nano", 0.000018),
    scorecards: scorecards([
      aggregate({
        provider: "openai",
        model: "z-model"
      }),
      aggregate({
        provider: "anthropic",
        model: "a-model"
      })
    ])
  });

  assert.equal(advice.shadowRecommendation?.provider, "anthropic");
  assert.equal(advice.shadowRecommendation?.model, "a-model");
});

test("Shadow Routing Advisor excludes candidates with insufficient data", () => {
  const advisor = new ShadowRoutingAdvisorV08();

  const advice = advisor.advise({
    actualSelection: route("openai", "gpt-5-nano", 0.000018),
    scorecards: scorecards([
      aggregate({
        provider: "openai",
        model: "gpt-5-nano",
        executionCount: 0,
        evaluationPassCount: 0,
        evaluationFailCount: 0,
        evaluationNeedsReviewCount: 0,
        averageActualCostUsd: 0.000001,
        averageLatencyMs: 1
      }),
      aggregate({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        averageActualCostUsd: 0.000295,
        averageLatencyMs: 1141
      })
    ])
  });

  assert.equal(advice.shadowRecommendation?.provider, "anthropic");
  assert.equal(advice.dataQuality, "complete");
});

test("Shadow Routing Advisor returns insufficient_data when no candidate has enough data", () => {
  const advisor = new ShadowRoutingAdvisorV08();

  const advice = advisor.advise({
    actualSelection: route("openai", "gpt-5-nano", 0.000018),
    scorecards: scorecards([
      aggregate({
        provider: "openai",
        model: "gpt-5-nano",
        executionCount: 1,
        evaluationPassCount: 0,
        evaluationFailCount: 0,
        evaluationNeedsReviewCount: 0
      })
    ])
  });

  assert.equal(advice.shadowRecommendation, null);
  assert.equal(advice.dataQuality, "insufficient_data");
  assert.equal(advice.advisorAuthority, "none");
  assert.match(advice.reason, /no provider\/model scorecard/);
});

test("Shadow Routing Advisor preserves partial data quality when recommending partial scorecards", () => {
  const advisor = new ShadowRoutingAdvisorV08();

  const advice = advisor.advise({
    actualSelection: route("openai", "gpt-5-nano", 0.000018),
    scorecards: scorecards([
      aggregate({
        provider: "openai",
        model: "gpt-5-nano",
        dataQuality: "partial",
        averageActualCostUsd: null,
        averageLatencyMs: 100,
        reason: "actualCostUsd is missing for at least one ledger entry."
      })
    ])
  });

  assert.equal(advice.shadowRecommendation?.provider, "openai");
  assert.equal(advice.shadowRecommendation.metricsUsed.scorecardDataQuality, "partial");
  assert.equal(advice.dataQuality, "partial");
  assert.equal(advice.comparison.matchesActualSelection, true);
});

test("Shadow Routing Advisor limits recommendations to compatible candidate scorecards", () => {
  const advisor = new ShadowRoutingAdvisorV08();

  const advice = advisor.advise({
    actualSelection: route("openai", "gpt-5-nano", 0.000018),
    candidates: [{ provider: "openai", model: "gpt-5-nano" }],
    scorecards: scorecards([
      aggregate({
        provider: "openai",
        model: "gpt-5-nano",
        evaluationPassCount: 1,
        evaluationFailCount: 1,
        averageActualCostUsd: 0.00001,
        averageLatencyMs: 100
      }),
      aggregate({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        evaluationPassCount: 2,
        evaluationFailCount: 0,
        averageActualCostUsd: 0.000001,
        averageLatencyMs: 1
      })
    ])
  });

  assert.equal(advice.shadowRecommendation?.provider, "openai");
  assert.equal(advice.comparison.matchesActualSelection, true);
});

test("Shadow Routing Advisor does not modify COST-FIRST selection", () => {
  const advisor = new ShadowRoutingAdvisorV08();
  const actualSelection = route("openai", "gpt-5-nano", 0.000018);

  const advice = advisor.advise({
    actualSelection,
    scorecards: scorecards([
      aggregate({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        evaluationPassCount: 2,
        evaluationFailCount: 0,
        averageActualCostUsd: 0.000295,
        averageLatencyMs: 1141
      })
    ])
  });

  assert.equal(advice.actualSelection.provider, "openai");
  assert.equal(actualSelection.provider, "openai");
  assert.equal(advice.shadowRecommendation?.provider, "anthropic");
  assert.equal(advice.advisorAuthority, "none");
});

function scorecards(aggregates: ProviderScorecardAggregate[]): ProviderScorecardSummary {
  return {
    byModel: Object.fromEntries(
      aggregates.map((aggregate) => [`${aggregate.provider}:${aggregate.model}`, aggregate])
    )
  };
}

function aggregate(
  overrides: Partial<ProviderScorecardAggregate> & { provider: ProviderName; model: string }
): ProviderScorecardAggregate {
  return {
    executionCount: 2,
    successCount: 1,
    failureCount: 1,
    needsHumanCount: 0,
    evaluationPassCount: 1,
    evaluationFailCount: 1,
    evaluationNeedsReviewCount: 0,
    totalActualCostUsd: 0.00002,
    averageActualCostUsd: 0.00001,
    averageLatencyMs: 100,
    lastUpdatedAt: new Date("2026-08-30T12:00:00.000Z"),
    dataQuality: "complete",
    ...overrides
  };
}

function route(provider: ProviderName, model: string, estimatedCostUsd: number): RoutingDecision {
  return {
    provider,
    model,
    taskType: "general",
    reason: "COST-FIRST selected lowest estimated cost.",
    estimatedCostUsd,
    estimatedLatencyClass: "low"
  };
}
