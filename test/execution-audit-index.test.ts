import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ExecutionAuditIndexV017,
  ExecutionAuditTimelineV016,
  FileStateMemory,
  InMemoryStateMemory,
  createQuanticoApi,
  type AuthorityDecisionAuditLogEntry,
  type BudgetLedgerEntry,
  type Execution,
  type ExecutionAuditTimelineReadResult,
  type ExecutionEvent,
  type ExecutionStatus,
  type PendingApprovalStep,
  type ProviderName
} from "../src/index.js";

test("Execution Audit Index returns found summaries and not_found only without persisted Execution", async () => {
  const state = await stateFile();

  try {
    const memory = new FileStateMemory(state.stateFilePath);
    await persistCompleteExecution(memory, execution({ id: "exec_found" }));

    const api = createQuanticoApi({ stateFilePath: state.stateFilePath });
    const list = await api.listExecutionAuditSummaries();
    const found = await api.getExecutionAuditSummary("exec_found");
    const missing = await api.getExecutionAuditSummary("exec_missing");

    assert.equal(list.status, "found");
    assert.equal(list.totalExecutions, 1);
    assert.equal(list.summaries[0]?.executionId, "exec_found");
    assert.equal(found.status, "found");
    assert.equal(found.summary.timelineDataQuality, "complete");
    assert.equal(missing.status, "not_found");
    assert.match(missing.reason, /execution is not persisted/);
  } finally {
    await state.cleanup();
  }
});

test("Execution Audit Index derives summary fields from V0.16 timeline evidence", async () => {
  const memory = new InMemoryStateMemory();
  const index = new ExecutionAuditIndexV017(memory);

  await memory.saveExecution(execution({ id: "exec_sources", status: "needs_human" }));
  await memory.appendEvent(event({ executionId: "exec_sources" }));
  await memory.saveAuthorityDecisionAuditEntry(auditEntry({ executionId: "exec_sources" }));
  await memory.saveBudgetLedgerEntry(ledgerEntry({ executionId: "exec_sources" }));
  await memory.savePendingApprovalStep(pendingApproval({ executionId: "exec_sources" }));

  const result = await index.getExecutionAuditSummary("exec_sources");
  assert.equal(result.status, "found");

  assert.equal(result.summary.hasAuthorityAudit, true);
  assert.equal(result.summary.hasBudgetLedger, true);
  assert.equal(result.summary.hasEvaluation, true);
  assert.equal(result.summary.hasApproval, true);
  assert.deepEqual(result.summary.sourcesPresent, [
    "execution",
    "event",
    "authority_audit",
    "budget_ledger",
    "approval"
  ]);
  assert.equal(result.summary.requiresAttention, true);
  assert.deepEqual(result.summary.attentionReasons, ["Execution status is needs_human."]);
});

test("Execution Audit Index calculates requiresAttention only from explicit conditions", async () => {
  const memory = new InMemoryStateMemory();
  const index = new ExecutionAuditIndexV017(memory);

  await persistCompleteExecution(memory, execution({ id: "exec_ok", status: "succeeded" }));
  await memory.saveExecution(execution({ id: "exec_partial", status: "succeeded" }));
  await persistCompleteExecution(memory, execution({ id: "exec_failed", status: "failed" }));
  await persistCompleteExecution(memory, execution({ id: "exec_needs_human", status: "needs_human" }));
  await persistCompleteExecution(memory, execution({ id: "exec_awaiting", status: "awaiting_approval" }));
  await memory.savePendingApprovalStep(pendingApproval({ executionId: "exec_needs_human" }));
  await memory.savePendingApprovalStep(pendingApproval({ executionId: "exec_awaiting" }));
  await persistInconsistentExecution(memory, "exec_inconsistent");

  const summaries = await index.listExecutionAuditSummaries();
  const byId = Object.fromEntries(summaries.summaries.map((summary) => [summary.executionId, summary]));

  assert.equal(byId.exec_ok?.requiresAttention, false);
  assert.deepEqual(byId.exec_ok?.attentionReasons, []);
  assert.equal(byId.exec_partial?.requiresAttention, true);
  assert.deepEqual(byId.exec_partial?.attentionReasons, ["Timeline dataQuality is partial."]);
  assert.equal(byId.exec_failed?.requiresAttention, true);
  assert.deepEqual(byId.exec_failed?.attentionReasons, ["Execution status is failed."]);
  assert.equal(byId.exec_needs_human?.requiresAttention, true);
  assert.deepEqual(byId.exec_needs_human?.attentionReasons, ["Execution status is needs_human."]);
  assert.equal(byId.exec_awaiting?.requiresAttention, true);
  assert.deepEqual(byId.exec_awaiting?.attentionReasons, [
    "Execution status is awaiting_approval."
  ]);
  assert.equal(byId.exec_inconsistent?.requiresAttention, true);
  assert.deepEqual(byId.exec_inconsistent?.attentionReasons, [
    "Timeline dataQuality is inconsistent."
  ]);
});

test("Execution Audit Index applies filters after valid summaries and limit after sorting", async () => {
  const memory = new InMemoryStateMemory();
  const index = new ExecutionAuditIndexV017(memory);

  await persistCompleteExecution(
    memory,
    execution({
      id: "exec_b",
      projectId: "proj_a",
      updatedAt: new Date("2026-08-31T12:03:00.000Z"),
      createdAt: new Date("2026-08-31T12:00:00.000Z")
    })
  );
  await persistCompleteExecution(
    memory,
    execution({
      id: "exec_a",
      projectId: "proj_a",
      updatedAt: new Date("2026-08-31T12:03:00.000Z"),
      createdAt: new Date("2026-08-31T12:00:00.000Z")
    })
  );
  await persistCompleteExecution(
    memory,
    execution({
      id: "exec_newest",
      projectId: "proj_b",
      updatedAt: new Date("2026-08-31T12:04:00.000Z"),
      createdAt: new Date("2026-08-31T12:00:00.000Z")
    })
  );
  await memory.saveExecution(
    execution({
      id: "exec_partial",
      projectId: "proj_a",
      updatedAt: new Date("2026-08-31T12:05:00.000Z"),
      createdAt: new Date("2026-08-31T12:00:00.000Z")
    })
  );

  const ordered = await index.listExecutionAuditSummaries();
  assert.deepEqual(
    ordered.summaries.map((summary) => summary.executionId),
    ["exec_partial", "exec_newest", "exec_a", "exec_b"]
  );

  const filtered = await index.listExecutionAuditSummaries({
    projectId: "proj_a",
    requiresAttention: false,
    dataQuality: "complete",
    limit: 1
  });

  assert.equal(filtered.totalExecutions, 1);
  assert.deepEqual(filtered.filtersApplied, {
    projectId: "proj_a",
    dataQuality: "complete",
    requiresAttention: false,
    limit: 1
  });
  assert.deepEqual(
    filtered.summaries.map((summary) => summary.executionId),
    ["exec_a"]
  );
});

test("Execution Audit Index preserves found for partial or inconsistent V0.16 timeline dataQuality", async () => {
  const memory = new InMemoryStateMemory();
  const index = new ExecutionAuditIndexV017(memory);

  await memory.saveExecution(execution({ id: "exec_partial" }));
  await persistInconsistentExecution(memory, "exec_inconsistent");

  const partial = await index.getExecutionAuditSummary("exec_partial");
  const inconsistent = await index.getExecutionAuditSummary("exec_inconsistent");
  const listed = await index.listExecutionAuditSummaries();

  assert.equal(partial.status, "found");
  assert.equal(partial.summary.timelineDataQuality, "partial");
  assert.equal(inconsistent.status, "found");
  assert.equal(inconsistent.summary.timelineDataQuality, "inconsistent");
  assert.equal(listed.dataQuality, "inconsistent");
});

test("Execution Audit Index delegates timeline construction to V0.16", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveExecution(execution({ id: "exec_delegated" }));
  const timeline = new StubTimeline(memory);
  const index = new ExecutionAuditIndexV017(memory, timeline);

  const result = await index.getExecutionAuditSummary("exec_delegated");

  assert.equal(timeline.calls, 1);
  assert.equal(result.status, "found");
  assert.equal(result.summary.timelineDataQuality, "partial");
  assert.equal(result.summary.timelineItemCount, 1);
  assert.equal(result.summary.sourcesPresent[0], "event");
});

test("Execution Audit Index is read-only over FileStateMemory", async () => {
  const state = await stateFile();

  try {
    const memory = new FileStateMemory(state.stateFilePath);
    await persistCompleteExecution(memory, execution({ id: "exec_file" }));

    const before = await readFile(state.stateFilePath, "utf8");
    const index = new ExecutionAuditIndexV017(memory);
    await index.listExecutionAuditSummaries();
    await index.getExecutionAuditSummary("exec_file");
    const after = await readFile(state.stateFilePath, "utf8");

    assert.equal(before, after);
  } finally {
    await state.cleanup();
  }
});

class StubTimeline extends ExecutionAuditTimelineV016 {
  calls = 0;

  override async getExecutionAuditTimeline(
    executionId: string
  ): Promise<ExecutionAuditTimelineReadResult> {
    this.calls += 1;

    return {
      status: "found",
      executionId,
      executionStatus: "succeeded",
      timeline: [
        {
          timestamp: new Date("2026-08-31T12:00:00.000Z"),
          source: "event",
          type: "stub_event",
          summary: "Stubbed V0.16 timeline item.",
          details: { executionId }
        }
      ],
      dataQuality: "partial",
      reason: "Stubbed V0.16 partial timeline."
    };
  }
}

async function persistCompleteExecution(
  memory: InMemoryStateMemory | FileStateMemory,
  item: Execution
): Promise<void> {
  await memory.saveExecution(item);
  await memory.appendEvent(event({ executionId: item.id, createdAt: item.createdAt }));
}

async function persistInconsistentExecution(
  memory: InMemoryStateMemory,
  executionId: string
): Promise<void> {
  await memory.saveExecution(execution({ id: executionId, actualCostUsd: 0.0001 }));
  await memory.appendEvent(event({ executionId }));
  await memory.saveAuthorityDecisionAuditEntry(auditEntry({ executionId }));
  await memory.saveBudgetLedgerEntry(ledgerEntry({ executionId }));
}

function execution(
  overrides: Partial<Execution> & {
    id: string;
    status?: ExecutionStatus;
    actualCostUsd?: number;
  }
): Execution {
  return {
    id: overrides.id,
    projectId: overrides.projectId,
    goal: overrides.goal ?? "Generate audit index summary.",
    taskType: overrides.taskType ?? "general",
    constraints: overrides.constraints ?? {},
    approvalPolicy: overrides.approvalPolicy ?? {},
    status: overrides.status ?? "succeeded",
    createdAt: overrides.createdAt ?? new Date("2026-08-31T12:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-08-31T12:00:01.000Z"),
    finalResult: overrides.finalResult ?? "ok",
    evaluation:
      overrides.evaluation ??
      ({
        status: overrides.status === "failed" ? "fail" : "pass",
        reason: "Explicit criteria evaluated.",
        criteria: ["contains_text"]
      } as const),
    metrics: {
      inputTokens: 127,
      outputTokens: 24,
      estimatedCostUsd: 0.000018,
      actualCostUsd: overrides.actualCostUsd ?? 0.000016,
      costDeltaUsd: -0.000002,
      latencyMs: 2240,
      ...overrides.metrics
    },
    error: overrides.error
  };
}

function event(overrides: Partial<ExecutionEvent> & { executionId: string }): ExecutionEvent {
  return {
    id: overrides.id ?? `event_${overrides.executionId}`,
    executionId: overrides.executionId,
    type: overrides.type ?? "execution_recorded",
    riskLevel: overrides.riskLevel,
    decisionApplied: overrides.decisionApplied,
    payload: overrides.payload ?? {
      executionId: overrides.executionId
    },
    createdAt: overrides.createdAt ?? new Date("2026-08-31T12:00:00.500Z")
  };
}

function auditEntry(overrides: { executionId: string }): AuthorityDecisionAuditLogEntry {
  const actualSelection = {
    provider: "openai" as ProviderName,
    model: "gpt-5-nano",
    estimatedCostUsd: 0.000018,
    reason: "COST-FIRST selected lowest cost compatible model."
  };

  return {
    id: `auth_${overrides.executionId}`,
    executionId: overrides.executionId,
    actualSelection,
    shadowRecommendation: null,
    authorityDecision: "blocked",
    effectiveSelection: actualSelection,
    advisorAuthority: "none",
    evidenceStatus: "sufficient",
    dataQuality: "complete",
    metricsEvaluated: {
      costFirstMetrics: null,
      shadowMetrics: null
    },
    thresholdsEvaluated: {
      minimumShadowEvaluationPassRate: 0.8,
      minimumShadowSuccessRate: 0.8,
      minimumEvaluationPassRateAdvantage: 0.2,
      minimumSuccessRateAdvantage: 0.1,
      maxAdditionalCostRatio: 0.25
    },
    pricingUsed: {
      costFirstEstimatedCostUsd: 0.000018,
      shadowEstimatedCostUsd: null
    },
    budgetsUsed: {
      maxAdditionalCostRatio: 0.25,
      maxAdditionalCostUsdPerIntervention: 0.00001,
      maxEstimatedCostUsdPerIntervention: 0.00005
    },
    costDelta: {
      costDeltaUsd: null,
      costDeltaRatio: null
    },
    reason: "Authority remained COST-FIRST.",
    timestamp: new Date("2026-08-31T12:00:00.600Z")
  };
}

function ledgerEntry(overrides: { executionId: string }): BudgetLedgerEntry {
  return {
    executionId: overrides.executionId,
    provider: "openai",
    model: "gpt-5-nano",
    estimatedInputTokens: 112,
    expectedOutputTokens: 30,
    actualInputTokens: 127,
    actualOutputTokens: 24,
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0.4,
    estimatedCostUsd: 0.000018,
    actualCostUsd: 0.000016,
    costDeltaUsd: -0.000002,
    latencyMs: 2240,
    timestamp: new Date("2026-08-31T12:00:00.700Z"),
    calculationStatus: "calculated"
  };
}

function pendingApproval(overrides: { executionId: string }): PendingApprovalStep {
  return {
    id: `approval_${overrides.executionId}`,
    executionId: overrides.executionId,
    action: {
      id: "provider_call",
      name: "provider_call",
      description: "Execute provider call.",
      riskLevel: "HIGH"
    },
    riskLevel: "HIGH",
    reason: "High risk action requires approval.",
    createdAt: new Date("2026-08-31T12:00:00.800Z"),
    metadata: {
      provider: "openai",
      model: "gpt-5-nano"
    }
  };
}

async function stateFile(): Promise<{ stateFilePath: string; cleanup: () => Promise<void> }> {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-execution-index-"));

  return {
    stateFilePath: join(stateDir, "state.json"),
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}
