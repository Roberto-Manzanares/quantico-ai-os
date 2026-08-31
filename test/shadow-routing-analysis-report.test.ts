import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryStateMemory,
  ShadowRoutingAnalysisReporterV010,
  ShadowRoutingEvaluationLogV09,
  generateShadowRoutingAnalysisReport,
  type ProviderName,
  type ShadowAdvisorDataQuality,
  type ShadowAdvisorMetricsUsed,
  type ShadowRoutingAdvice,
  type ShadowRoutingEvaluationLogEntry
} from "../src/index.js";

test("Shadow Routing Analysis Report returns insufficient with no logs", () => {
  const report = generateShadowRoutingAnalysisReport([], {
    generatedAt: new Date("2026-08-30T12:00:00.000Z")
  });

  assert.equal(report.totalEvaluations, 0);
  assert.equal(report.matchCount, 0);
  assert.equal(report.divergenceCount, 0);
  assert.equal(report.insufficientDataCount, 0);
  assert.equal(report.evidenceStatus, "insufficient");
  assert.match(report.evidenceReason, /minimum required/);
  assert.equal(report.advisorAuthority, "none");
});

test("Shadow Routing Analysis Report summarizes persisted log entries", async () => {
  const evaluationLog = new ShadowRoutingEvaluationLogV09(new InMemoryStateMemory());
  await evaluationLog.record({
    id: "shadow_match",
    executionId: "exec_match",
    advice: advice({ actualProvider: "openai", shadowProvider: "openai", matches: true })
  });
  await evaluationLog.record({
    id: "shadow_divergence",
    executionId: "exec_divergence",
    advice: advice({
      actualProvider: "openai",
      shadowProvider: "anthropic",
      matches: false,
      differenceReason:
        "COST-FIRST selected openai/gpt-5-nano; shadow advisor recommended anthropic/claude-haiku-4-5-20251001."
    })
  });
  const reporter = new ShadowRoutingAnalysisReporterV010(evaluationLog);

  const report = await reporter.generate({
    minimumEvaluationsRequired: 2,
    generatedAt: new Date("2026-08-30T12:00:00.000Z")
  });

  assert.equal(report.totalEvaluations, 2);
  assert.equal(report.matchCount, 1);
  assert.equal(report.divergenceCount, 1);
  assert.equal(report.matchRate, 0.5);
  assert.equal(report.divergenceRate, 0.5);
  assert.equal(report.evidenceStatus, "sufficient");
  assert.equal(report.advisorAuthority, "none");
});

test("Shadow Routing Analysis Report identifies observable divergence patterns", () => {
  const report = generateShadowRoutingAnalysisReport(
    [
      entry({
        id: "divergence_a",
        actualProvider: "openai",
        shadowProvider: "anthropic",
        matches: false,
        differenceReason:
          "COST-FIRST selected openai/gpt-5-nano; shadow advisor recommended anthropic/claude-haiku-4-5-20251001.",
        metricsUsed: metrics({ evaluationPassRate: 1, successRate: 0.8, averageActualCostUsd: 0.000295, averageLatencyMs: 1141 })
      }),
      entry({
        id: "divergence_b",
        actualProvider: "openai",
        shadowProvider: "anthropic",
        matches: false,
        differenceReason:
          "COST-FIRST selected openai/gpt-5-nano; shadow advisor recommended anthropic/claude-haiku-4-5-20251001.",
        metricsUsed: metrics({ evaluationPassRate: 0.5, successRate: 0.6, averageActualCostUsd: 0.000305, averageLatencyMs: 1200 })
      }),
      entry({ id: "match_a", actualProvider: "openai", shadowProvider: "openai", matches: true }),
      entry({ id: "match_b", actualProvider: "anthropic", shadowProvider: "anthropic", matches: true }),
      entry({ id: "match_c", actualProvider: "openai", shadowProvider: "openai", matches: true })
    ],
    {
      minimumEvaluationsRequired: 5,
      generatedAt: new Date("2026-08-30T12:00:00.000Z")
    }
  );

  const [pattern] = report.observedDivergencePatterns;

  assert.equal(pattern?.actualProvider, "openai");
  assert.equal(pattern.actualModel, "gpt-5-nano");
  assert.equal(pattern.shadowProvider, "anthropic");
  assert.equal(pattern.shadowModel, "claude-haiku-4-5-20251001");
  assert.equal(pattern.count, 2);
  assert.equal(pattern.averageShadowEvaluationPassRate, 0.75);
  assert.equal(pattern.averageShadowSuccessRate, 0.7);
  assert.equal(pattern.averageShadowActualCostUsd, 0.0003);
  assert.equal(pattern.averageShadowLatencyMs, 1170.5);
  assert.equal(pattern.dataQuality, "complete");
  assert.equal(pattern.reasons.length, 1);
});

test("Shadow Routing Analysis Report requires minimum evaluations", () => {
  const report = generateShadowRoutingAnalysisReport(
    [
      entry({ id: "match", actualProvider: "openai", shadowProvider: "openai", matches: true }),
      entry({
        id: "divergence",
        actualProvider: "openai",
        shadowProvider: "anthropic",
        matches: false,
        differenceReason: "Different provider/model."
      })
    ],
    { minimumEvaluationsRequired: 5 }
  );

  assert.equal(report.evidenceStatus, "insufficient");
  assert.match(report.evidenceReason, /Only 2 evaluations/);
});

test("Shadow Routing Analysis Report requires both match and divergence evidence", () => {
  const onlyMatches = generateShadowRoutingAnalysisReport(
    [
      entry({ id: "match_a", actualProvider: "openai", shadowProvider: "openai", matches: true }),
      entry({ id: "match_b", actualProvider: "openai", shadowProvider: "openai", matches: true }),
      entry({ id: "match_c", actualProvider: "openai", shadowProvider: "openai", matches: true }),
      entry({ id: "match_d", actualProvider: "openai", shadowProvider: "openai", matches: true }),
      entry({ id: "match_e", actualProvider: "openai", shadowProvider: "openai", matches: true })
    ],
    { minimumEvaluationsRequired: 5 }
  );
  const onlyDivergences = generateShadowRoutingAnalysisReport(
    [
      entry({ id: "div_a", actualProvider: "openai", shadowProvider: "anthropic", matches: false, differenceReason: "Different." }),
      entry({ id: "div_b", actualProvider: "openai", shadowProvider: "anthropic", matches: false, differenceReason: "Different." }),
      entry({ id: "div_c", actualProvider: "openai", shadowProvider: "anthropic", matches: false, differenceReason: "Different." }),
      entry({ id: "div_d", actualProvider: "openai", shadowProvider: "anthropic", matches: false, differenceReason: "Different." }),
      entry({ id: "div_e", actualProvider: "openai", shadowProvider: "anthropic", matches: false, differenceReason: "Different." })
    ],
    { minimumEvaluationsRequired: 5 }
  );

  assert.equal(onlyMatches.evidenceStatus, "insufficient");
  assert.match(onlyMatches.evidenceReason, /No divergences/);
  assert.equal(onlyDivergences.evidenceStatus, "insufficient");
  assert.match(onlyDivergences.evidenceReason, /No matches/);
});

test("Shadow Routing Analysis Report rejects high insufficient data rate", () => {
  const report = generateShadowRoutingAnalysisReport(
    [
      entry({ id: "match", actualProvider: "openai", shadowProvider: "openai", matches: true }),
      entry({ id: "divergence", actualProvider: "openai", shadowProvider: "anthropic", matches: false, differenceReason: "Different." }),
      insufficientEntry("insufficient_a"),
      insufficientEntry("insufficient_b")
    ],
    { minimumEvaluationsRequired: 4 }
  );

  assert.equal(report.insufficientDataCount, 2);
  assert.equal(report.metricsUsed.insufficientDataRate, 0.5);
  assert.equal(report.evidenceStatus, "insufficient");
  assert.match(report.evidenceReason, /Insufficient data rate/);
});

test("Shadow Routing Analysis Report requires auditable divergence reason and metrics", () => {
  const report = generateShadowRoutingAnalysisReport(
    [
      entry({ id: "match_a", actualProvider: "openai", shadowProvider: "openai", matches: true }),
      entry({ id: "match_b", actualProvider: "openai", shadowProvider: "openai", matches: true }),
      entry({
        id: "divergence_missing_metrics",
        actualProvider: "openai",
        shadowProvider: "anthropic",
        matches: false,
        differenceReason: undefined,
        metricsUsed: null
      }),
      entry({ id: "match_c", actualProvider: "anthropic", shadowProvider: "anthropic", matches: true }),
      entry({ id: "match_d", actualProvider: "openai", shadowProvider: "openai", matches: true })
    ],
    { minimumEvaluationsRequired: 5 }
  );

  assert.equal(report.evidenceStatus, "insufficient");
  assert.equal(report.metricsUsed.divergencesWithAuditableReasonAndMetrics, 0);
  assert.match(report.evidenceReason, /missing auditable reason or metrics/);
});

test("Shadow Routing Analysis Report keeps advisorAuthority none and does not change selections", () => {
  const actualSelection = {
    provider: "openai" as const,
    model: "gpt-5-nano",
    estimatedCostUsd: 0.000018,
    reason: "COST-FIRST selected lowest estimated compatible cost."
  };
  const report = generateShadowRoutingAnalysisReport([
    logEntry({
      id: "stable_authority",
      actualSelection,
      shadowRecommendation: {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        reason: "Recommended by deterministic scorecard history.",
        metricsUsed: metrics()
      },
      matchesActualSelection: false,
      differenceReason: "Different provider/model.",
      metricsUsed: metrics()
    })
  ]);

  assert.equal(report.advisorAuthority, "none");
  assert.equal(actualSelection.provider, "openai");
  assert.equal(actualSelection.model, "gpt-5-nano");
});

function entry(options: {
  id: string;
  actualProvider: ProviderName;
  shadowProvider: ProviderName;
  matches: boolean;
  differenceReason?: string;
  metricsUsed?: ShadowAdvisorMetricsUsed | null;
  dataQuality?: ShadowAdvisorDataQuality;
}): ShadowRoutingEvaluationLogEntry {
  return logEntry({
    id: options.id,
    actualSelection: selection(options.actualProvider),
    shadowRecommendation: {
      provider: options.shadowProvider,
      model: modelFor(options.shadowProvider),
      reason: "Recommended by deterministic scorecard history.",
      metricsUsed: options.metricsUsed ?? metrics()
    },
    matchesActualSelection: options.matches,
    differenceReason: options.differenceReason,
    metricsUsed: options.metricsUsed === undefined ? metrics() : options.metricsUsed,
    dataQuality: options.dataQuality ?? "complete"
  });
}

function insufficientEntry(id: string): ShadowRoutingEvaluationLogEntry {
  return logEntry({
    id,
    shadowRecommendation: null,
    matchesActualSelection: false,
    metricsUsed: null,
    dataQuality: "insufficient_data"
  });
}

function advice(options: {
  actualProvider: ProviderName;
  shadowProvider: ProviderName;
  matches: boolean;
  differenceReason?: string;
}): ShadowRoutingAdvice {
  return {
    actualSelection: selection(options.actualProvider),
    shadowRecommendation: {
      provider: options.shadowProvider,
      model: modelFor(options.shadowProvider),
      reason: "Recommended by deterministic scorecard history.",
      metricsUsed: metrics()
    },
    comparison: {
      matchesActualSelection: options.matches,
      differenceReason: options.differenceReason
    },
    dataQuality: "complete",
    advisorAuthority: "none",
    reason: options.matches
      ? "Shadow recommendation matches the COST-FIRST selection."
      : "Shadow recommendation differs from the COST-FIRST selection; this is observational only."
  };
}

function logEntry(overrides: Partial<ShadowRoutingEvaluationLogEntry> = {}): ShadowRoutingEvaluationLogEntry {
  return {
    id: "shadow_analysis",
    executionId: "exec_analysis",
    timestamp: new Date("2026-08-30T12:00:00.000Z"),
    actualSelection: selection("openai"),
    shadowRecommendation: {
      provider: "openai",
      model: "gpt-5-nano",
      reason: "Recommended by deterministic scorecard history.",
      metricsUsed: metrics()
    },
    matchesActualSelection: true,
    metricsUsed: metrics(),
    dataQuality: "complete",
    advisorAuthority: "none",
    ...overrides
  };
}

function selection(provider: ProviderName) {
  return {
    provider,
    model: modelFor(provider),
    estimatedCostUsd: provider === "openai" ? 0.000018 : 0.000262,
    reason: "COST-FIRST selected lowest estimated compatible cost."
  };
}

function modelFor(provider: ProviderName): string {
  return provider === "openai" ? "gpt-5-nano" : "claude-haiku-4-5-20251001";
}

function metrics(overrides: Partial<ShadowAdvisorMetricsUsed> = {}): ShadowAdvisorMetricsUsed {
  return {
    executionCount: 2,
    evaluationPassCount: 2,
    evaluationPassRate: 1,
    successCount: 2,
    successRate: 1,
    averageActualCostUsd: 0.000016,
    averageLatencyMs: 2240,
    scorecardDataQuality: "complete",
    ...overrides
  };
}
