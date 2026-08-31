import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AuthorityDecisionAuditLogV012,
  FileStateMemory,
  InMemoryStateMemory,
  createAuthorityDecisionAuditLogEntry,
  summarizeAuthorityDecisionAuditLogEntries,
  type LimitedShadowAuthorityResult,
  type ProviderName
} from "../src/index.js";

test("Authority Decision Audit Log persists allowed decisions with full audit fields", async () => {
  const log = new AuthorityDecisionAuditLogV012(new InMemoryStateMemory());

  const entry = await log.record({
    id: "authority_allowed",
    executionId: "exec_allowed",
    authorityResult: authorityResult({ allowed: true }),
    timestamp: new Date("2026-08-30T12:00:00.000Z")
  });

  assert.equal(entry.id, "authority_allowed");
  assert.equal(entry.executionId, "exec_allowed");
  assert.equal(entry.authorityDecision, "allowed");
  assert.equal(entry.advisorAuthority, "limited");
  assert.equal(entry.effectiveSelection.provider, "anthropic");
  assert.equal(entry.evidenceStatus, "sufficient");
  assert.equal(entry.dataQuality, "complete");
  assert.equal(entry.metricsEvaluated.costFirstMetrics?.evaluationPassRate, 0.6);
  assert.equal(entry.metricsEvaluated.shadowMetrics?.evaluationPassRate, 0.9);
  assert.equal(entry.thresholdsEvaluated.minimumShadowEvaluationPassRate, 0.8);
  assert.equal(entry.pricingUsed.costFirstEstimatedCostUsd, 0.000022);
  assert.equal(entry.pricingUsed.shadowEstimatedCostUsd, 0.000026);
  assert.equal(entry.budgetsUsed.maxAdditionalCostUsdPerIntervention, 0.00001);
  assert.equal(entry.costDelta.costDeltaUsd, 0.000004);
  assert.equal(entry.reason, "Shadow recommendation satisfies V0.11 thresholds.");
});

test("Authority Decision Audit Log persists blocked decisions with COST-FIRST effective selection", async () => {
  const log = new AuthorityDecisionAuditLogV012(new InMemoryStateMemory());

  const entry = await log.record({
    id: "authority_blocked",
    executionId: "exec_blocked",
    authorityResult: authorityResult({
      allowed: false,
      reason:
        "Limited shadow authority failed closed: evidenceStatus must be sufficient."
    })
  });

  assert.equal(entry.authorityDecision, "blocked");
  assert.equal(entry.advisorAuthority, "none");
  assert.equal(entry.effectiveSelection.provider, "openai");
  assert.equal(entry.effectiveSelection.model, "gpt-5-nano");
  assert.match(entry.reason, /failed closed/);
});

test("Authority Decision Audit Log lists all entries and filters by executionId", async () => {
  const log = new AuthorityDecisionAuditLogV012(new InMemoryStateMemory());

  await log.record({
    id: "entry_a",
    executionId: "exec_a",
    authorityResult: authorityResult({ allowed: true })
  });
  await log.record({
    id: "entry_b",
    executionId: "exec_b",
    authorityResult: authorityResult({ allowed: false })
  });
  await log.record({
    id: "entry_c",
    executionId: "exec_a",
    authorityResult: authorityResult({ allowed: false })
  });

  assert.equal((await log.listEntries()).length, 3);
  assert.deepEqual(
    (await log.listEntries("exec_a")).map((entry) => entry.id),
    ["entry_a", "entry_c"]
  );
});

test("Authority Decision Audit Log summarizes allowed and blocked decisions", () => {
  const summary = summarizeAuthorityDecisionAuditLogEntries([
    auditEntry({ id: "allowed_a", allowed: true }),
    auditEntry({ id: "blocked_a", allowed: false, reason: "pricing missing" }),
    auditEntry({ id: "blocked_b", allowed: false, reason: "pricing missing" }),
    auditEntry({ id: "blocked_c", allowed: false, reason: "dataQuality incomplete" })
  ]);

  assert.equal(summary.totalDecisions, 4);
  assert.equal(summary.allowedCount, 1);
  assert.equal(summary.blockedCount, 3);
  assert.equal(summary.allowedRate, 0.25);
  assert.equal(summary.blockedRate, 0.75);
  assert.deepEqual(summary.blockedByReason, {
    "pricing missing": 2,
    "dataQuality incomplete": 1
  });
});

test("Authority Decision Audit Log append-only keeps duplicate ids as separate audit records", async () => {
  const log = new AuthorityDecisionAuditLogV012(new InMemoryStateMemory());

  await log.record({
    id: "duplicate_id",
    executionId: "exec_append",
    authorityResult: authorityResult({ allowed: true })
  });
  await log.record({
    id: "duplicate_id",
    executionId: "exec_append",
    authorityResult: authorityResult({ allowed: false })
  });

  const entries = await log.listEntries("exec_append");
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((entry) => entry.authorityDecision),
    ["allowed", "blocked"]
  );
});

test("Authority Decision Audit Log persists through FileStateMemory without prompts or secrets", async () => {
  const state = await stateFile();

  try {
    const firstLog = new AuthorityDecisionAuditLogV012(new FileStateMemory(state.stateFilePath));
    await firstLog.record({
      id: "file_entry",
      executionId: "exec_file",
      authorityResult: authorityResult({ allowed: true })
    });

    const secondLog = new AuthorityDecisionAuditLogV012(new FileStateMemory(state.stateFilePath));
    const entries = await secondLog.listEntries("exec_file");
    const rawState = await readFile(state.stateFilePath, "utf8");

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.id, "file_entry");
    assert.doesNotMatch(rawState, /prompt/i);
    assert.doesNotMatch(rawState, /OPENAI_API_KEY|ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID|sk-/);
  } finally {
    await state.cleanup();
  }
});

test("Authority Decision Audit Log rejects entries without an auditable reason", () => {
  assert.throws(
    () =>
      createAuthorityDecisionAuditLogEntry({
        executionId: "exec_empty_reason",
        authorityResult: authorityResult({ allowed: false, reason: "   " })
      }),
    /non-empty reason/
  );
});

test("Authority Decision Audit Log empty summary returns zero counts", () => {
  assert.deepEqual(summarizeAuthorityDecisionAuditLogEntries([]), {
    totalDecisions: 0,
    allowedCount: 0,
    blockedCount: 0,
    allowedRate: 0,
    blockedRate: 0,
    blockedByReason: {}
  });
});

function auditEntry(input: {
  id: string;
  allowed: boolean;
  reason?: string;
}) {
  return createAuthorityDecisionAuditLogEntry({
    id: input.id,
    executionId: "exec_summary",
    authorityResult: authorityResult({
      allowed: input.allowed,
      reason: input.reason
    })
  });
}

function authorityResult(input: {
  allowed: boolean;
  reason?: string;
}): LimitedShadowAuthorityResult {
  const actualSelection = {
    provider: "openai" as ProviderName,
    model: "gpt-5-nano",
    estimatedCostUsd: 0.000022,
    reason: "COST-FIRST selected openai/gpt-5-nano."
  };
  const shadowRecommendation = {
    provider: "anthropic" as ProviderName,
    model: "claude-haiku-4-5-20251001",
    reason: "Shadow recommendation has stronger historical pass and success rates.",
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
  const costFirstMetrics = {
    executionCount: 10,
    evaluationPassCount: 6,
    evaluationPassRate: 0.6,
    successCount: 7,
    successRate: 0.7,
    averageActualCostUsd: 0.00002,
    averageLatencyMs: 900,
    scorecardDataQuality: "complete" as const
  };
  const shadowSelection = {
    provider: shadowRecommendation.provider,
    model: shadowRecommendation.model,
    estimatedCostUsd: 0.000026,
    reason: shadowRecommendation.reason
  };
  const allowed = input.allowed;
  const reason =
    input.reason ??
    (allowed
      ? "Shadow recommendation satisfies V0.11 thresholds."
      : "Limited shadow authority failed closed: evidenceStatus must be sufficient.");

  return {
    advisorAuthority: allowed ? "limited" : "none",
    authorityDecision: allowed ? "allow_shadow_influence" : "fallback_cost_first",
    actualSelection,
    shadowRecommendation,
    appliedSelection: allowed ? shadowSelection : actualSelection,
    reason,
    rollbackAvailable: true,
    auditRecordRequired: true,
    auditRecord: {
      executionId: "exec_audit",
      advisorAuthority: allowed ? "limited" : "none",
      authorityDecision: allowed ? "allow_shadow_influence" : "fallback_cost_first",
      actualSelection,
      shadowRecommendation,
      appliedSelection: allowed ? shadowSelection : actualSelection,
      evidenceStatus: "sufficient",
      dataQuality: "complete",
      conditionsChecked: [{ condition: "audit_complete", passed: true, reason: "ok" }],
      budgetChecked: {
        costFirstEstimatedCostUsd: 0.000022,
        shadowEstimatedCostUsd: 0.000026,
        maxAdditionalCostRatio: 0.25,
        maxAdditionalCostUsdPerIntervention: 0.00001,
        maxEstimatedCostUsdPerIntervention: 0.00005
      },
      thresholdsApplied: {
        minimumShadowEvaluationPassRate: 0.8,
        minimumShadowSuccessRate: 0.8,
        minimumEvaluationPassRateAdvantage: 0.2,
        minimumSuccessRateAdvantage: 0.1,
        maxAdditionalCostRatio: 0.25
      },
      costFirstMetrics,
      shadowMetrics: shadowRecommendation.metricsUsed,
      costDeltaUsd: 0.000004,
      costDeltaRatio: 0.181818,
      reason,
      timestamp: new Date("2026-08-30T12:00:00.000Z")
    }
  };
}

async function stateFile(): Promise<{ stateFilePath: string; cleanup: () => Promise<void> }> {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-authority-audit-"));

  return {
    stateFilePath: join(stateDir, "state.json"),
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}
