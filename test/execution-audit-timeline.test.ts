import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ExecutionAuditTimelineV016,
  FileStateMemory,
  InMemoryStateMemory,
  createQuanticoApi,
  type AuthorityDecisionAuditLogEntry,
  type BudgetLedgerEntry,
  type Execution,
  type ExecutionEvent,
  type PendingApprovalStep,
  type ProviderName
} from "../src/index.js";

test("Execution Audit Timeline returns not_found only when execution is not persisted", async () => {
  const timeline = new ExecutionAuditTimelineV016(new InMemoryStateMemory());

  const missing = await timeline.getExecutionAuditTimeline("exec_missing");

  assert.equal(missing.status, "not_found");
  assert.equal(missing.executionId, "exec_missing");
  assert.match(missing.reason, /execution is not persisted/);
});

test("Execution Audit Timeline returns found when execution exists through API", async () => {
  const state = await stateFile();

  try {
    const memory = new FileStateMemory(state.stateFilePath);
    await memory.saveExecution(execution({ id: "exec_found" }));

    const api = createQuanticoApi({ stateFilePath: state.stateFilePath });
    const result = await api.getExecutionAuditTimeline("exec_found");

    assert.equal(result.status, "found");
    assert.equal(result.executionId, "exec_found");
    assert.equal(result.executionStatus, "succeeded");
    assert.ok(result.timeline.length >= 2);
  } finally {
    await state.cleanup();
  }
});

test("Execution Audit Timeline uses persisted sources without promoting embedded evaluation to an independent source", async () => {
  const memory = new InMemoryStateMemory();
  const timeline = new ExecutionAuditTimelineV016(memory);
  const timestamp = new Date("2026-08-31T12:00:00.000Z");

  await memory.saveExecution(execution({ id: "exec_sources", timestamp }));
  await memory.appendEvent(event({ executionId: "exec_sources", createdAt: timestamp }));
  await memory.saveAuthorityDecisionAuditEntry(auditEntry({ executionId: "exec_sources", timestamp }));
  await memory.saveBudgetLedgerEntry(ledgerEntry({ executionId: "exec_sources", timestamp }));
  await memory.savePendingApprovalStep(pendingApproval({ executionId: "exec_sources", timestamp }));

  const result = await timeline.getExecutionAuditTimeline("exec_sources");
  assert.equal(result.status, "found");

  const sources = result.timeline.map((item) => item.source);
  assert.ok(sources.includes("execution"));
  assert.ok(sources.includes("event"));
  assert.ok(sources.includes("authority_audit"));
  assert.ok(sources.includes("budget_ledger"));
  assert.ok(sources.includes("approval"));

  const evaluationItem = result.timeline.find((item) => item.type === "evaluation");
  assert.equal(evaluationItem?.source, "execution");

  const authorityItem = result.timeline.find((item) => item.source === "authority_audit");
  assert.equal(
    (authorityItem?.details.effectiveSelection as { provider: ProviderName }).provider,
    "openai"
  );

  const ledgerItem = result.timeline.find((item) => item.source === "budget_ledger");
  assert.equal(ledgerItem?.details.inputPricePerMillion, 0.05);
  assert.equal(ledgerItem?.details.outputPricePerMillion, 0.4);
  assert.equal(ledgerItem?.details.actualInputTokens, 127);
});

test("Execution Audit Timeline orders deterministically by timestamp, source and type", async () => {
  const memory = new InMemoryStateMemory();
  const timeline = new ExecutionAuditTimelineV016(memory);
  const timestamp = new Date("2026-08-31T12:00:00.000Z");

  await memory.saveExecution(execution({ id: "exec_order", timestamp }));
  await memory.appendEvent(
    event({ executionId: "exec_order", id: "event_b", type: "b_event", createdAt: timestamp })
  );
  await memory.appendEvent(
    event({ executionId: "exec_order", id: "event_a", type: "a_event", createdAt: timestamp })
  );
  await memory.saveAuthorityDecisionAuditEntry(auditEntry({ executionId: "exec_order", timestamp }));
  await memory.saveBudgetLedgerEntry(ledgerEntry({ executionId: "exec_order", timestamp }));

  const result = await timeline.getExecutionAuditTimeline("exec_order");
  assert.equal(result.status, "found");

  assert.deepEqual(
    result.timeline.map((item) => `${item.source}:${item.type}`).slice(0, 7),
    [
      "execution:evaluation",
      "execution:execution_created",
      "execution:execution_state",
      "event:a_event",
      "event:b_event",
      "authority_audit:authority_decision",
      "budget_ledger:budget_ledger_entry"
    ]
  );
});

test("Execution Audit Timeline reports complete, partial and inconsistent dataQuality", async () => {
  const completeMemory = new InMemoryStateMemory();
  const partialMemory = new InMemoryStateMemory();
  const inconsistentMemory = new InMemoryStateMemory();

  await completeMemory.saveExecution(execution({ id: "exec_complete" }));
  await completeMemory.appendEvent(event({ executionId: "exec_complete" }));
  await completeMemory.saveAuthorityDecisionAuditEntry(auditEntry({ executionId: "exec_complete" }));
  await completeMemory.saveBudgetLedgerEntry(ledgerEntry({ executionId: "exec_complete" }));

  await partialMemory.saveExecution(execution({ id: "exec_partial" }));

  await inconsistentMemory.saveExecution(
    execution({ id: "exec_inconsistent", actualCostUsd: 0.0001 })
  );
  await inconsistentMemory.appendEvent(event({ executionId: "exec_inconsistent" }));
  await inconsistentMemory.saveAuthorityDecisionAuditEntry(auditEntry({ executionId: "exec_inconsistent" }));
  await inconsistentMemory.saveBudgetLedgerEntry(ledgerEntry({ executionId: "exec_inconsistent" }));

  const complete = await new ExecutionAuditTimelineV016(completeMemory).getExecutionAuditTimeline(
    "exec_complete"
  );
  const partial = await new ExecutionAuditTimelineV016(partialMemory).getExecutionAuditTimeline(
    "exec_partial"
  );
  const inconsistent = await new ExecutionAuditTimelineV016(
    inconsistentMemory
  ).getExecutionAuditTimeline("exec_inconsistent");

  assert.equal(complete.status, "found");
  assert.equal(complete.dataQuality, "complete");
  assert.match(complete.reason, /complete and consistent/);

  assert.equal(partial.status, "found");
  assert.equal(partial.dataQuality, "partial");
  assert.match(partial.reason, /No execution events are persisted/);

  assert.equal(inconsistent.status, "found");
  assert.equal(inconsistent.dataQuality, "inconsistent");
  assert.match(inconsistent.reason, /does not match calculated ledger total/);
});

test("Execution Audit Timeline protects prompts and secrets while preserving auditable token fields", async () => {
  const state = await stateFile();

  try {
    const memory = new FileStateMemory(state.stateFilePath);
    await memory.saveExecution(
      execution({
        id: "exec_safe",
        goal: "do not expose this prompt literal",
        finalResult: "do not expose this result literal"
      })
    );
    await memory.appendEvent(
      event({
        executionId: "exec_safe",
        payload: {
          apiKey: "sk-should-not-appear",
          workspaceId: "workspace-should-not-appear",
          prompt: "do not expose event prompt",
          inputTokens: 127,
          outputTokens: 24
        }
      })
    );
    await memory.saveBudgetLedgerEntry(ledgerEntry({ executionId: "exec_safe" }));

    const before = await readFile(state.stateFilePath, "utf8");
    const result = await new ExecutionAuditTimelineV016(memory).getExecutionAuditTimeline("exec_safe");
    const after = await readFile(state.stateFilePath, "utf8");
    const serialized = JSON.stringify(result);

    assert.equal(before, after);
    assert.doesNotMatch(serialized, /do not expose this prompt literal/);
    assert.doesNotMatch(serialized, /do not expose this result literal/);
    assert.doesNotMatch(serialized, /do not expose event prompt/);
    assert.doesNotMatch(serialized, /sk-should-not-appear/);
    assert.doesNotMatch(serialized, /workspace-should-not-appear/);
    assert.match(serialized, /inputTokens/);
    assert.match(serialized, /outputTokens/);
    assert.match(serialized, /finalResultLength/);
    assert.doesNotMatch(serialized, /finalResultLengthLength/);
  } finally {
    await state.cleanup();
  }
});

function execution(
  overrides: Partial<Execution> & {
    id: string;
    timestamp?: Date;
    actualCostUsd?: number;
  }
): Execution {
  const createdAt = overrides.timestamp ?? new Date("2026-08-31T12:00:00.000Z");
  const updatedAt = overrides.timestamp ?? new Date("2026-08-31T12:00:01.000Z");

  return {
    id: overrides.id,
    projectId: overrides.projectId,
    goal: overrides.goal ?? "Generate a safe audit timeline.",
    taskType: overrides.taskType ?? "general",
    constraints: overrides.constraints ?? {},
    approvalPolicy: overrides.approvalPolicy ?? {},
    status: overrides.status ?? "succeeded",
    createdAt,
    updatedAt,
    finalResult: overrides.finalResult ?? "QUANTICO_OK",
    evaluation:
      overrides.evaluation ??
      ({
        status: "pass",
        reason: "Explicit criteria passed.",
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
    id: overrides.id ?? "event_model_selected",
    executionId: overrides.executionId,
    type: overrides.type ?? "model_selected",
    riskLevel: overrides.riskLevel,
    decisionApplied: overrides.decisionApplied,
    payload:
      overrides.payload ??
      ({
        provider: "openai",
        model: "gpt-5-nano",
        inputTokens: 127,
        outputTokens: 24
      } satisfies Record<string, unknown>),
    createdAt: overrides.createdAt ?? new Date("2026-08-31T12:00:00.500Z")
  };
}

function auditEntry(
  overrides: Partial<AuthorityDecisionAuditLogEntry> & {
    executionId: string;
    timestamp?: Date;
  }
): AuthorityDecisionAuditLogEntry {
  const actualSelection = {
    provider: "openai" as ProviderName,
    model: "gpt-5-nano",
    estimatedCostUsd: 0.000018,
    reason: "COST-FIRST selected the lowest cost compatible model."
  };

  return {
    id: overrides.id ?? "authority_entry",
    executionId: overrides.executionId,
    actualSelection,
    shadowRecommendation: null,
    authorityDecision: overrides.authorityDecision ?? "blocked",
    effectiveSelection: overrides.effectiveSelection ?? actualSelection,
    advisorAuthority: overrides.advisorAuthority ?? "none",
    evidenceStatus: overrides.evidenceStatus ?? "sufficient",
    dataQuality: overrides.dataQuality ?? "complete",
    metricsEvaluated: overrides.metricsEvaluated ?? {
      costFirstMetrics: null,
      shadowMetrics: null
    },
    thresholdsEvaluated: overrides.thresholdsEvaluated ?? {
      minimumShadowEvaluationPassRate: 0.8,
      minimumShadowSuccessRate: 0.8,
      minimumEvaluationPassRateAdvantage: 0.2,
      minimumSuccessRateAdvantage: 0.1,
      maxAdditionalCostRatio: 0.25
    },
    pricingUsed: overrides.pricingUsed ?? {
      costFirstEstimatedCostUsd: 0.000018,
      shadowEstimatedCostUsd: null
    },
    budgetsUsed: overrides.budgetsUsed ?? {
      maxAdditionalCostRatio: 0.25,
      maxAdditionalCostUsdPerIntervention: 0.00001,
      maxEstimatedCostUsdPerIntervention: 0.00005
    },
    costDelta: overrides.costDelta ?? {
      costDeltaUsd: null,
      costDeltaRatio: null
    },
    reason: overrides.reason ?? "Authority remained at COST-FIRST.",
    timestamp: overrides.timestamp ?? new Date("2026-08-31T12:00:00.600Z")
  };
}

function ledgerEntry(
  overrides: Partial<BudgetLedgerEntry> & { executionId: string }
): BudgetLedgerEntry {
  return {
    executionId: overrides.executionId,
    projectId: overrides.projectId,
    provider: overrides.provider ?? "openai",
    model: overrides.model ?? "gpt-5-nano",
    estimatedInputTokens: overrides.estimatedInputTokens ?? 112,
    expectedOutputTokens: overrides.expectedOutputTokens ?? 30,
    actualInputTokens: overrides.actualInputTokens ?? 127,
    actualOutputTokens: overrides.actualOutputTokens ?? 24,
    inputPricePerMillion: overrides.inputPricePerMillion ?? 0.05,
    outputPricePerMillion: overrides.outputPricePerMillion ?? 0.4,
    estimatedCostUsd: overrides.estimatedCostUsd ?? 0.000018,
    actualCostUsd: overrides.actualCostUsd ?? 0.000016,
    costDeltaUsd: overrides.costDeltaUsd ?? -0.000002,
    latencyMs: overrides.latencyMs ?? 2240,
    timestamp: overrides.timestamp ?? new Date("2026-08-31T12:00:00.700Z"),
    calculationStatus: overrides.calculationStatus ?? "calculated",
    calculationReason: overrides.calculationReason
  };
}

function pendingApproval(
  overrides: Partial<PendingApprovalStep> & { executionId: string; timestamp?: Date }
): PendingApprovalStep {
  return {
    id: overrides.id ?? "approval_step",
    executionId: overrides.executionId,
    action: overrides.action ?? {
      id: "provider_call",
      name: "provider_call",
      description: "Execute the selected provider call.",
      riskLevel: "HIGH"
    },
    riskLevel: overrides.riskLevel ?? "HIGH",
    reason: overrides.reason ?? "High risk action requires approval.",
    createdAt: overrides.timestamp ?? new Date("2026-08-31T12:00:00.800Z"),
    metadata: overrides.metadata ?? {
      provider: "openai",
      model: "gpt-5-nano"
    }
  };
}

async function stateFile(): Promise<{ stateFilePath: string; cleanup: () => Promise<void> }> {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-execution-timeline-"));

  return {
    stateFilePath: join(stateDir, "state.json"),
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}
