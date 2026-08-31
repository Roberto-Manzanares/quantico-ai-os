import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  FileStateMemory,
  createQuanticoApi,
  type AuthorityDecisionAuditLogEntry,
  type BudgetLedgerEntry,
  type EvaluationStatus,
  type Execution,
  type ExecutionStatus,
  type ProviderName
} from "../src/index.js";

test("Authority Runtime Safety Metrics Read API returns the complete report as found", async () => {
  const state = await stateFile();

  try {
    const memory = new FileStateMemory(state.stateFilePath);
    await seedFoundExecution(memory, "exec_read_api");

    const api = createQuanticoApi({ stateFilePath: state.stateFilePath });
    const result = await api.getAuthorityRuntimeSafetyMetrics();

    assert.equal(result.status, "found");
    assert.equal(result.report.totalAuthorityEvaluations, 1);
    assert.equal(result.report.allowedInterventions, 1);
    assert.equal(result.report.outcomeComparisons[0]?.actualOutcome?.provider, "anthropic");
    assert.equal(result.report.outcomeComparisons[0]?.counterfactualOutcome, "unavailable");
    assert.match(result.reason, /dataQuality/);
  } finally {
    await state.cleanup();
  }
});

test("Authority Runtime Safety Metrics Read API returns found for execution evidence with insufficient_data", async () => {
  const state = await stateFile();

  try {
    const memory = new FileStateMemory(state.stateFilePath);
    await memory.saveAuthorityDecisionAuditEntry(
      auditEntry({ id: "partial_entry", executionId: "exec_partial" })
    );
    await memory.saveExecution(
      execution({ id: "exec_partial", status: "succeeded", evaluationStatus: undefined })
    );

    const api = createQuanticoApi({ stateFilePath: state.stateFilePath });
    const result = await api.getAuthorityRuntimeSafetyMetricsForExecution("exec_partial");

    assert.equal(result.status, "found");

    if (result.status === "found") {
      assert.equal(result.executionId, "exec_partial");
      assert.equal(result.dataQuality, "partial");
      assert.equal(result.outcomeComparisons.length, 1);
      assert.equal(result.outcomeComparisons[0]?.comparisonStatus, "insufficient_data");
      assert.equal(result.outcomeComparisons[0]?.actualOutcome, null);
      assert.equal(result.outcomeComparisons[0]?.counterfactualOutcome, "unavailable");
      assert.match(result.reason, /partial dataQuality/);
      assert.match(result.reason, /insufficient_data/);
    }
  } finally {
    await state.cleanup();
  }
});

test("Authority Runtime Safety Metrics Read API returns not_found only without authority evidence", async () => {
  const state = await stateFile();

  try {
    const memory = new FileStateMemory(state.stateFilePath);
    await memory.saveExecution(
      execution({ id: "exec_without_authority", status: "succeeded", evaluationStatus: "pass" })
    );
    await memory.saveBudgetLedgerEntry(ledgerEntry({ executionId: "exec_without_authority" }));

    const api = createQuanticoApi({ stateFilePath: state.stateFilePath });
    const result = await api.getAuthorityRuntimeSafetyMetricsForExecution("exec_without_authority");

    assert.deepEqual(result, {
      status: "not_found",
      executionId: "exec_without_authority",
      reason:
        "Authority runtime safety metrics not found for exec_without_authority: no authority evidence is persisted for this execution."
    });
  } finally {
    await state.cleanup();
  }
});

test("Authority Runtime Safety Metrics Read API preserves dataQuality and is read-only", async () => {
  const state = await stateFile();

  try {
    const memory = new FileStateMemory(state.stateFilePath);
    await seedFoundExecution(memory, "exec_readonly");

    const api = createQuanticoApi({ stateFilePath: state.stateFilePath });
    const before = await readFile(state.stateFilePath, "utf8");
    const result = await api.getAuthorityRuntimeSafetyMetricsForExecution("exec_readonly");
    const after = await readFile(state.stateFilePath, "utf8");

    assert.equal(result.status, "found");

    if (result.status === "found") {
      assert.equal(result.dataQuality, "partial");
      assert.equal(result.outcomeComparisons[0]?.actualOutcome?.provider, "anthropic");
      assert.equal(result.outcomeComparisons[0]?.comparisonStatus, "insufficient_data");
      assert.equal(result.outcomeComparisons[0]?.counterfactualOutcome, "unavailable");
    }

    assert.equal(before, after);
    assert.doesNotMatch(after, /OPENAI_API_KEY|ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID|sk-/);
  } finally {
    await state.cleanup();
  }
});

async function seedFoundExecution(memory: FileStateMemory, executionId: string): Promise<void> {
  await memory.saveAuthorityDecisionAuditEntry(
    auditEntry({
      id: `${executionId}_authority`,
      executionId,
      authorityDecision: "allowed",
      actualProvider: "openai",
      actualModel: "gpt-5-nano",
      effectiveProvider: "anthropic",
      effectiveModel: "claude-haiku-4-5-20251001"
    })
  );
  await memory.saveExecution(
    execution({ id: executionId, status: "succeeded", evaluationStatus: "pass" })
  );
  await memory.saveBudgetLedgerEntry(
    ledgerEntry({
      executionId,
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001"
    })
  );
}

function auditEntry(
  overrides: Partial<AuthorityDecisionAuditLogEntry> & {
    id: string;
    executionId: string;
    authorityDecision?: "allowed" | "blocked";
    actualProvider?: ProviderName;
    actualModel?: string;
    effectiveProvider?: ProviderName;
    effectiveModel?: string;
  }
): AuthorityDecisionAuditLogEntry {
  const actualSelection = {
    provider: overrides.actualProvider ?? "openai",
    model: overrides.actualModel ?? "gpt-5-nano",
    estimatedCostUsd: 0.000022,
    reason: "COST-FIRST selected the lowest cost compatible model."
  };
  const shadowRecommendation = {
    provider: "anthropic" as ProviderName,
    model: "claude-haiku-4-5-20251001",
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
      (overrides.authorityDecision === "blocked"
        ? actualSelection.provider
        : shadowRecommendation.provider),
    model:
      overrides.effectiveModel ??
      (overrides.authorityDecision === "blocked"
        ? actualSelection.model
        : shadowRecommendation.model),
    estimatedCostUsd: overrides.authorityDecision === "blocked" ? 0.000022 : 0.000026,
    reason:
      overrides.authorityDecision === "blocked"
        ? actualSelection.reason
        : shadowRecommendation.reason
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
      costDeltaUsd: 0.000004,
      costDeltaRatio: 0.181818
    },
    reason:
      overrides.authorityDecision === "blocked"
        ? "Limited shadow authority failed closed: insufficient evidence."
        : "Shadow recommendation satisfies V0.11 thresholds.",
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
    goal: "Test authority safety metrics read API.",
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
    executionId: "exec_read_api",
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
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-authority-safety-api-"));

  return {
    stateFilePath: join(stateDir, "state.json"),
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}
