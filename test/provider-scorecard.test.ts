import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileStateMemory,
  InMemoryStateMemory,
  ProviderScorecardV06,
  summarizeProviderScorecardEntries,
  type BudgetLedgerEntry,
  type EvaluationStatus,
  type Execution,
  type ExecutionStatus,
  type ProviderName
} from "../src/index.js";

test("Provider Scorecard aggregates complete metrics by provider/model", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveExecution(execution("exec_scorecard_success", "succeeded", "pass"));
  await memory.saveBudgetLedgerEntry(
    ledgerEntry({
      executionId: "exec_scorecard_success",
      actualCostUsd: 0.000016,
      latencyMs: 2240
    })
  );
  const scorecard = new ProviderScorecardV06(memory);

  const summary = await scorecard.summarize();
  const aggregate = summary.byModel["openai:gpt-5-nano"];

  assert.equal(aggregate?.provider, "openai");
  assert.equal(aggregate.model, "gpt-5-nano");
  assert.equal(aggregate.executionCount, 1);
  assert.equal(aggregate.successCount, 1);
  assert.equal(aggregate.failureCount, 0);
  assert.equal(aggregate.needsHumanCount, 0);
  assert.equal(aggregate.evaluationPassCount, 1);
  assert.equal(aggregate.evaluationFailCount, 0);
  assert.equal(aggregate.evaluationNeedsReviewCount, 0);
  assert.equal(aggregate.totalActualCostUsd, 0.000016);
  assert.equal(aggregate.averageActualCostUsd, 0.000016);
  assert.equal(aggregate.averageLatencyMs, 2240);
  assert.equal(aggregate.dataQuality, "complete");
  assert.equal(aggregate.reason, undefined);
});

test("Provider Scorecard groups metrics by provider/model deterministically", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveExecution(execution("exec_openai", "succeeded", "pass"));
  await memory.saveExecution(execution("exec_anthropic", "failed", "fail"));
  await memory.saveBudgetLedgerEntry(
    ledgerEntry({
      executionId: "exec_openai",
      provider: "openai",
      model: "gpt-5-nano",
      actualCostUsd: 0.000018,
      latencyMs: 2000
    })
  );
  await memory.saveBudgetLedgerEntry(
    ledgerEntry({
      executionId: "exec_anthropic",
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      actualCostUsd: 0.000295,
      latencyMs: 1141
    })
  );
  const scorecard = new ProviderScorecardV06(memory);

  const first = await scorecard.summarize();
  const second = await scorecard.summarize();

  assert.deepEqual(first, second);
  assert.equal(first.byModel["openai:gpt-5-nano"]?.successCount, 1);
  assert.equal(first.byModel["anthropic:claude-haiku-4-5-20251001"]?.failureCount, 1);
  assert.equal(first.byModel["anthropic:claude-haiku-4-5-20251001"]?.evaluationFailCount, 1);
});

test("Provider Scorecard excludes missing cost and latency from averages and marks partial", async () => {
  const summary = await summarizeProviderScorecardEntries(
    [
      ledgerEntry({
        executionId: "exec_partial_a",
        actualCostUsd: null,
        latencyMs: Number.NaN,
        calculationStatus: "missing_usage"
      }),
      ledgerEntry({
        executionId: "exec_partial_b",
        actualCostUsd: 0.00002,
        latencyMs: 100
      })
    ],
    {
      getExecution: async (id) =>
        id === "exec_partial_a"
          ? execution("exec_partial_a", "needs_human", "needs_review")
          : execution("exec_partial_b", "succeeded", "pass")
    }
  );

  const aggregate = summary.byModel["openai:gpt-5-nano"];

  assert.equal(aggregate?.executionCount, 2);
  assert.equal(aggregate.needsHumanCount, 1);
  assert.equal(aggregate.evaluationNeedsReviewCount, 1);
  assert.equal(aggregate.totalActualCostUsd, 0.00002);
  assert.equal(aggregate.averageActualCostUsd, 0.00002);
  assert.equal(aggregate.averageLatencyMs, 100);
  assert.equal(aggregate.dataQuality, "partial");
  assert.match(aggregate.reason ?? "", /actualCostUsd is missing/);
  assert.match(aggregate.reason ?? "", /latencyMs is missing/);
});

test("Provider Scorecard marks partial when execution or evaluation status is missing", async () => {
  const summary = await summarizeProviderScorecardEntries(
    [
      ledgerEntry({ executionId: "exec_missing_execution" }),
      ledgerEntry({ executionId: "exec_missing_evaluation", timestamp: new Date("2026-08-29T00:01:00.000Z") }),
      ledgerEntry({ executionId: "exec_awaiting", timestamp: new Date("2026-08-29T00:02:00.000Z") })
    ],
    {
      getExecution: async (id) => {
        if (id === "exec_missing_evaluation") {
          return execution("exec_missing_evaluation", "succeeded", undefined);
        }

        if (id === "exec_awaiting") {
          return execution("exec_awaiting", "awaiting_approval", undefined);
        }

        return undefined;
      }
    }
  );

  const aggregate = summary.byModel["openai:gpt-5-nano"];

  assert.equal(aggregate?.executionCount, 3);
  assert.equal(aggregate.successCount, 1);
  assert.equal(aggregate.needsHumanCount, 1);
  assert.equal(aggregate.dataQuality, "partial");
  assert.match(aggregate.reason ?? "", /missing from State\/Memory/);
  assert.match(aggregate.reason ?? "", /evaluationStatus is missing/);
  assert.match(aggregate.reason ?? "", /awaiting approval/);
});

test("Provider Scorecard reads persisted ledger and execution state", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-scorecard-"));
  const stateFilePath = join(stateDir, "state.json");
  const firstMemory = new FileStateMemory(stateFilePath);
  await firstMemory.saveExecution(execution("exec_persisted_scorecard", "succeeded", "pass"));
  await firstMemory.saveBudgetLedgerEntry(
    ledgerEntry({
      executionId: "exec_persisted_scorecard",
      actualCostUsd: 0.00003,
      latencyMs: 300
    })
  );

  const scorecard = new ProviderScorecardV06(new FileStateMemory(stateFilePath));
  const summary = await scorecard.summarize();

  assert.equal(summary.byModel["openai:gpt-5-nano"]?.totalActualCostUsd, 0.00003);
  assert.equal(summary.byModel["openai:gpt-5-nano"]?.averageLatencyMs, 300);

  await rm(stateDir, { recursive: true, force: true });
});

function ledgerEntry(overrides: Partial<BudgetLedgerEntry> = {}): BudgetLedgerEntry {
  return {
    executionId: "exec_scorecard",
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
    timestamp: new Date("2026-08-29T00:00:00.000Z"),
    calculationStatus: "calculated",
    ...overrides
  };
}

function execution(
  id: string,
  status: ExecutionStatus,
  evaluationStatus: EvaluationStatus | undefined
): Execution {
  return {
    id,
    goal: "Scorecard test goal",
    taskType: "general",
    constraints: {},
    approvalPolicy: {},
    status,
    createdAt: new Date("2026-08-29T00:00:00.000Z"),
    updatedAt: new Date("2026-08-29T00:00:00.000Z"),
    evaluation: evaluationStatus
      ? {
          status: evaluationStatus,
          reason: "test evaluation",
          criteria: ["test"]
        }
      : undefined,
    metrics: {
      inputTokens: 127,
      outputTokens: 24,
      estimatedCostUsd: 0.000018,
      actualCostUsd: 0.000016,
      costDeltaUsd: -0.000002,
      latencyMs: 2240
    }
  };
}
