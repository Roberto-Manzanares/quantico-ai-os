import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AuthorityRuntimeSafetyMetricsV014,
  FileStateMemory,
  InMemoryStateMemory,
  generateAuthorityRuntimeSafetyMetricsReport,
  type AuthorityDecisionAuditLogEntry,
  type BudgetLedgerEntry,
  type EvaluationStatus,
  type Execution,
  type ExecutionStatus,
  type ProviderName
} from "../src/index.js";

test("Authority Runtime Safety Metrics calculates authority counts, rates and fail-closed reasons", () => {
  const report = generateAuthorityRuntimeSafetyMetricsReport({
    auditEntries: [
      auditEntry({ id: "allowed_a", executionId: "exec_allowed_a", authorityDecision: "allowed" }),
      auditEntry({
        id: "allowed_b",
        executionId: "exec_allowed_b",
        authorityDecision: "allowed",
        costDeltaUsd: -0.000001
      }),
      auditEntry({
        id: "blocked_a",
        executionId: "exec_blocked_a",
        authorityDecision: "blocked",
        reason: "Limited shadow authority failed closed: missing pricing."
      }),
      auditEntry({
        id: "blocked_b",
        executionId: "exec_blocked_b",
        authorityDecision: "blocked",
        reason: "Limited shadow authority failed closed: missing pricing."
      })
    ],
    ledgerEntries: [],
    executions: new Map(),
    generatedAt: new Date("2026-08-31T12:00:00.000Z")
  });

  assert.equal(report.totalAuthorityEvaluations, 4);
  assert.equal(report.allowedInterventions, 2);
  assert.equal(report.blockedInterventions, 2);
  assert.equal(report.allowedRate, 0.5);
  assert.equal(report.blockedRate, 0.5);
  assert.equal(report.failClosedCount, 2);
  assert.deepEqual(report.failClosedByReason, {
    "Limited shadow authority failed closed: missing pricing.": 2
  });
  assert.equal(report.totalAdditionalCostUsdAuthorized, 0.000004);
  assert.equal(report.averageAdditionalCostUsdAuthorized, 0.000004);
  assert.equal(report.maxAdditionalCostUsdObserved, 0.000004);
  assert.equal(report.dataQuality, "partial");
});

test("Authority Runtime Safety Metrics attributes outcome only to executed effectiveSelection", async () => {
  const memory = new InMemoryStateMemory();
  const metrics = new AuthorityRuntimeSafetyMetricsV014(memory);

  await memory.saveAuthorityDecisionAuditEntry(
    auditEntry({
      id: "allowed_shadow",
      executionId: "exec_allowed_shadow",
      authorityDecision: "allowed",
      actualProvider: "openai",
      actualModel: "gpt-5-nano",
      effectiveProvider: "anthropic",
      effectiveModel: "claude-haiku-4-5-20251001"
    })
  );
  await memory.saveExecution(
    execution({
      id: "exec_allowed_shadow",
      status: "succeeded",
      evaluationStatus: "pass"
    })
  );
  await memory.saveBudgetLedgerEntry(
    ledgerEntry({
      executionId: "exec_allowed_shadow",
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001"
    })
  );

  const report = await metrics.generate();
  const [comparison] = report.outcomeComparisons;

  assert.equal(comparison?.actualOutcome?.provider, "anthropic");
  assert.equal(comparison?.actualOutcome?.model, "claude-haiku-4-5-20251001");
  assert.equal(comparison?.actualOutcome?.executionStatus, "succeeded");
  assert.equal(comparison?.actualOutcome?.evaluationStatus, "pass");
  assert.equal(comparison?.counterfactualOutcome, "unavailable");
  assert.equal(comparison?.comparisonStatus, "insufficient_data");
  assert.match(comparison?.reason ?? "", /alternative selection has no observed outcome/);
  assert.deepEqual(report.outcomesByAuthorityDecision.allowed.byExecutionStatus, {
    succeeded: 1
  });
  assert.deepEqual(report.outcomesByAuthorityDecision.allowed.byEvaluationStatus, {
    pass: 1
  });
});

test("Authority Runtime Safety Metrics marks same executed COST-FIRST and shadow selection comparable", () => {
  const selection = { provider: "openai" as ProviderName, model: "gpt-5-nano" };
  const report = generateAuthorityRuntimeSafetyMetricsReport({
    auditEntries: [
      auditEntry({
        id: "same_selection",
        executionId: "exec_same",
        authorityDecision: "blocked",
        actualProvider: selection.provider,
        actualModel: selection.model,
        shadowProvider: selection.provider,
        shadowModel: selection.model,
        effectiveProvider: selection.provider,
        effectiveModel: selection.model
      })
    ],
    ledgerEntries: [ledgerEntry({ executionId: "exec_same", provider: "openai", model: "gpt-5-nano" })],
    executions: new Map([
      [
        "exec_same",
        execution({ id: "exec_same", status: "succeeded", evaluationStatus: "pass" })
      ]
    ])
  });

  assert.equal(report.outcomeComparisons[0]?.comparisonStatus, "comparable");
  assert.equal(report.outcomeComparisons[0]?.counterfactualOutcome, "unavailable");
  assert.equal(report.dataQuality, "complete");
});

test("Authority Runtime Safety Metrics reports insufficient_data for missing outcome evidence", () => {
  const report = generateAuthorityRuntimeSafetyMetricsReport({
    auditEntries: [
      auditEntry({ id: "missing_execution", executionId: "exec_missing" }),
      auditEntry({ id: "missing_evaluation", executionId: "exec_no_eval" }),
      auditEntry({ id: "missing_ledger", executionId: "exec_no_ledger" }),
      auditEntry({ id: "not_calculated_ledger", executionId: "exec_bad_ledger" })
    ],
    ledgerEntries: [
      ledgerEntry({
        executionId: "exec_bad_ledger",
        calculationStatus: "missing_usage",
        actualCostUsd: null
      })
    ],
    executions: new Map([
      ["exec_no_eval", execution({ id: "exec_no_eval", evaluationStatus: undefined })],
      ["exec_no_ledger", execution({ id: "exec_no_ledger", evaluationStatus: "pass" })],
      ["exec_bad_ledger", execution({ id: "exec_bad_ledger", evaluationStatus: "pass" })]
    ])
  });

  assert.deepEqual(
    report.outcomeComparisons.map((comparison) => comparison.comparisonStatus),
    ["insufficient_data", "insufficient_data", "insufficient_data", "insufficient_data"]
  );
  assert.deepEqual(
    report.outcomeComparisons.map((comparison) => comparison.counterfactualOutcome),
    ["unavailable", "unavailable", "unavailable", "unavailable"]
  );
  assert.equal(report.dataQuality, "partial");
  assert.ok(report.reasons.some((reason) => reason.includes("Execution state is missing")));
  assert.ok(report.reasons.some((reason) => reason.includes("evaluationStatus is missing")));
  assert.ok(report.reasons.some((reason) => reason.includes("Budget Ledger evidence is missing")));
});

test("Authority Runtime Safety Metrics empty report returns zero metrics and insufficient dataQuality", () => {
  const report = generateAuthorityRuntimeSafetyMetricsReport({
    auditEntries: [],
    ledgerEntries: [],
    executions: new Map(),
    generatedAt: new Date("2026-08-31T12:00:00.000Z")
  });

  assert.equal(report.totalAuthorityEvaluations, 0);
  assert.equal(report.allowedInterventions, 0);
  assert.equal(report.blockedInterventions, 0);
  assert.equal(report.allowedRate, 0);
  assert.equal(report.blockedRate, 0);
  assert.equal(report.failClosedCount, 0);
  assert.deepEqual(report.failClosedByReason, {});
  assert.equal(report.totalAdditionalCostUsdAuthorized, 0);
  assert.equal(report.averageAdditionalCostUsdAuthorized, 0);
  assert.equal(report.maxAdditionalCostUsdObserved, 0);
  assert.deepEqual(report.outcomesByAuthorityDecision.allowed.byEvaluationStatus, {});
  assert.equal(report.dataQuality, "insufficient");
});

test("Authority Runtime Safety Metrics is read-only over FileStateMemory", async () => {
  const state = await stateFile();

  try {
    const memory = new FileStateMemory(state.stateFilePath);
    await memory.saveAuthorityDecisionAuditEntry(
      auditEntry({ id: "file_entry", executionId: "exec_file", authorityDecision: "allowed" })
    );
    await memory.saveExecution(
      execution({ id: "exec_file", status: "succeeded", evaluationStatus: "pass" })
    );
    await memory.saveBudgetLedgerEntry(ledgerEntry({ executionId: "exec_file" }));

    const before = await readFile(state.stateFilePath, "utf8");
    const report = await new AuthorityRuntimeSafetyMetricsV014(memory).generate();
    const after = await readFile(state.stateFilePath, "utf8");

    assert.equal(report.totalAuthorityEvaluations, 1);
    assert.equal(before, after);
    assert.doesNotMatch(after, /OPENAI_API_KEY|ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID|sk-/);
  } finally {
    await state.cleanup();
  }
});

function auditEntry(
  overrides: Partial<AuthorityDecisionAuditLogEntry> & {
    id: string;
    executionId: string;
    authorityDecision?: "allowed" | "blocked";
    actualProvider?: ProviderName;
    actualModel?: string;
    shadowProvider?: ProviderName;
    shadowModel?: string;
    effectiveProvider?: ProviderName;
    effectiveModel?: string;
    costDeltaUsd?: number | null;
    reason?: string;
  }
): AuthorityDecisionAuditLogEntry {
  const actualSelection = {
    provider: overrides.actualProvider ?? "openai",
    model: overrides.actualModel ?? "gpt-5-nano",
    estimatedCostUsd: 0.000022,
    reason: "COST-FIRST selected the lowest cost compatible model."
  };
  const shadowRecommendation = {
    provider: overrides.shadowProvider ?? "anthropic",
    model: overrides.shadowModel ?? "claude-haiku-4-5-20251001",
    reason: "Shadow observed stronger historical outcomes.",
    metricsUsed: {
      executionCount: 10,
      evaluationPassCount: 9,
      evaluationPassRate: 0.9,
      successCount: 9,
      successRate: 0.9,
      averageActualCostUsd: 0.00003,
      averageLatencyMs: 1200,
      scorecardDataQuality: "complete" as const
    }
  };
  const effectiveSelection = {
    provider:
      overrides.effectiveProvider ??
      (overrides.authorityDecision === "allowed" ? shadowRecommendation.provider : actualSelection.provider),
    model:
      overrides.effectiveModel ??
      (overrides.authorityDecision === "allowed" ? shadowRecommendation.model : actualSelection.model),
    estimatedCostUsd: overrides.authorityDecision === "allowed" ? 0.000026 : 0.000022,
    reason:
      overrides.authorityDecision === "allowed"
        ? shadowRecommendation.reason
        : actualSelection.reason
  };

  return {
    id: overrides.id,
    executionId: overrides.executionId,
    actualSelection,
    shadowRecommendation,
    authorityDecision: overrides.authorityDecision ?? "allowed",
    effectiveSelection,
    advisorAuthority: overrides.authorityDecision === "blocked" ? "none" : "limited",
    evidenceStatus: "sufficient",
    dataQuality: "complete",
    metricsEvaluated: {
      costFirstMetrics: {
        executionCount: 10,
        evaluationPassCount: 6,
        evaluationPassRate: 0.6,
        successCount: 7,
        successRate: 0.7,
        averageActualCostUsd: 0.00002,
        averageLatencyMs: 900,
        scorecardDataQuality: "complete"
      },
      shadowMetrics: shadowRecommendation.metricsUsed
    },
    thresholdsEvaluated: {
      minimumShadowEvaluationPassRate: 0.8,
      minimumShadowSuccessRate: 0.8,
      minimumEvaluationPassRateAdvantage: 0.2,
      minimumSuccessRateAdvantage: 0.1,
      maxAdditionalCostRatio: 0.25
    },
    pricingUsed: {
      costFirstEstimatedCostUsd: 0.000022,
      shadowEstimatedCostUsd: 0.000026
    },
    budgetsUsed: {
      maxAdditionalCostRatio: 0.25,
      maxAdditionalCostUsdPerIntervention: 0.00001,
      maxEstimatedCostUsdPerIntervention: 0.00005
    },
    costDelta: {
      costDeltaUsd: overrides.costDeltaUsd ?? 0.000004,
      costDeltaRatio: 0.181818
    },
    reason:
      overrides.reason ??
      (overrides.authorityDecision === "blocked"
        ? "Limited shadow authority failed closed: insufficient evidence."
        : "Shadow recommendation satisfies V0.11 thresholds."),
    timestamp: new Date("2026-08-31T12:00:00.000Z")
  };
}

function execution(overrides: {
  id: string;
  status?: ExecutionStatus;
  evaluationStatus?: EvaluationStatus;
}): Execution {
  return {
    id: overrides.id,
    goal: "Test authority safety metrics.",
    taskType: "general",
    constraints: {},
    approvalPolicy: {},
    status: overrides.status ?? "succeeded",
    createdAt: new Date("2026-08-31T12:00:00.000Z"),
    updatedAt: new Date("2026-08-31T12:00:01.000Z"),
    finalResult: "ok",
    evaluation: overrides.evaluationStatus
      ? {
          status: overrides.evaluationStatus,
          reason: "Deterministic criteria passed.",
          criteria: ["contains_text"]
        }
      : undefined,
    metrics: {
      inputTokens: 100,
      outputTokens: 20,
      estimatedCostUsd: 0.000022,
      actualCostUsd: 0.000026,
      costDeltaUsd: 0.000004,
      latencyMs: 1000
    }
  };
}

function ledgerEntry(overrides: Partial<BudgetLedgerEntry> = {}): BudgetLedgerEntry {
  return {
    executionId: "exec_allowed",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    estimatedInputTokens: 100,
    expectedOutputTokens: 20,
    actualInputTokens: 100,
    actualOutputTokens: 20,
    inputPricePerMillion: 1,
    outputPricePerMillion: 5,
    estimatedCostUsd: 0.000022,
    actualCostUsd: 0.000026,
    costDeltaUsd: 0.000004,
    latencyMs: 1000,
    timestamp: new Date("2026-08-31T12:00:00.000Z"),
    calculationStatus: "calculated",
    ...overrides
  };
}

async function stateFile(): Promise<{ stateFilePath: string; cleanup: () => Promise<void> }> {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-authority-safety-"));

  return {
    stateFilePath: join(stateDir, "state.json"),
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}
