import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createQuanticoApi,
  FileStateMemory,
  type BudgetLedgerEntry,
  type EvaluationStatus,
  type Execution,
  type ExecutionStatus
} from "../src/index.js";

test("Provider Scorecard Read API lists aggregated scorecards", async () => {
  const state = await stateFile();
  await seedScorecardState(state.stateFilePath);
  const api = createQuanticoApi({ stateFilePath: state.stateFilePath });

  const summary = await api.listProviderScorecards();

  assert.equal(summary.byModel["openai:gpt-5-nano"]?.executionCount, 1);
  assert.equal(summary.byModel["openai:gpt-5-nano"]?.evaluationPassCount, 1);
  assert.equal(summary.byModel["anthropic:claude-haiku-4-5-20251001"]?.executionCount, 1);
  assert.equal(summary.byModel["anthropic:claude-haiku-4-5-20251001"]?.evaluationFailCount, 1);

  await state.cleanup();
});

test("Provider Scorecard Read API returns one provider/model scorecard", async () => {
  const state = await stateFile();
  await seedScorecardState(state.stateFilePath);
  const api = createQuanticoApi({ stateFilePath: state.stateFilePath });

  const result = await api.getProviderScorecard("openai", "gpt-5-nano");

  assert.equal(result.status, "found");
  assert.equal(result.scorecard.provider, "openai");
  assert.equal(result.scorecard.model, "gpt-5-nano");
  assert.equal(result.scorecard.totalActualCostUsd, 0.000016);
  assert.equal(result.scorecard.averageLatencyMs, 2240);
  assert.equal(result.scorecard.dataQuality, "complete");

  await state.cleanup();
});

test("Provider Scorecard Read API returns auditable not_found", async () => {
  const state = await stateFile();
  await seedScorecardState(state.stateFilePath);
  const api = createQuanticoApi({ stateFilePath: state.stateFilePath });

  const result = await api.getProviderScorecard("anthropic", "missing-model");

  assert.equal(result.status, "not_found");
  assert.equal(result.provider, "anthropic");
  assert.equal(result.model, "missing-model");
  assert.match(result.reason, /not found/i);

  await state.cleanup();
});

test("Provider Scorecard Read API is read-only", async () => {
  const state = await stateFile();
  await seedScorecardState(state.stateFilePath);
  const before = await readFile(state.stateFilePath, "utf8");
  const api = createQuanticoApi({ stateFilePath: state.stateFilePath });

  await api.listProviderScorecards();
  await api.getProviderScorecard("openai", "gpt-5-nano");
  await api.getProviderScorecard("anthropic", "missing-model");

  const after = await readFile(state.stateFilePath, "utf8");
  assert.equal(after, before);

  await state.cleanup();
});

async function seedScorecardState(stateFilePath: string): Promise<void> {
  const memory = new FileStateMemory(stateFilePath);
  await memory.saveExecution(execution("exec_read_openai", "succeeded", "pass"));
  await memory.saveExecution(execution("exec_read_anthropic", "failed", "fail"));
  await memory.saveBudgetLedgerEntry(
    ledgerEntry({
      executionId: "exec_read_openai",
      provider: "openai",
      model: "gpt-5-nano",
      actualCostUsd: 0.000016,
      latencyMs: 2240
    })
  );
  await memory.saveBudgetLedgerEntry(
    ledgerEntry({
      executionId: "exec_read_anthropic",
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      actualCostUsd: 0.000295,
      latencyMs: 1141
    })
  );
}

async function stateFile(): Promise<{ stateFilePath: string; cleanup: () => Promise<void> }> {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-scorecard-api-"));

  return {
    stateFilePath: join(stateDir, "state.json"),
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}

function ledgerEntry(overrides: Partial<BudgetLedgerEntry> = {}): BudgetLedgerEntry {
  return {
    executionId: "exec_scorecard_api",
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
    timestamp: new Date("2026-08-30T12:00:00.000Z"),
    calculationStatus: "calculated",
    ...overrides
  };
}

function execution(
  id: string,
  status: ExecutionStatus,
  evaluationStatus: EvaluationStatus
): Execution {
  return {
    id,
    goal: "Read scorecard",
    taskType: "general",
    constraints: {},
    approvalPolicy: {},
    status,
    createdAt: new Date("2026-08-30T12:00:00.000Z"),
    updatedAt: new Date("2026-08-30T12:00:00.000Z"),
    evaluation: {
      status: evaluationStatus,
      reason: "synthetic",
      criteria: ["synthetic"]
    },
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
