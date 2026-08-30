import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BudgetLedgerV04,
  FileStateMemory,
  summarizeBudgetLedgerEntries,
  type ModelPricingTable,
  type RoutingDecision,
  type TokenDecision
} from "../src/index.js";

const pricingTable: ModelPricingTable = {
  openai: {
    "ledger-model": {
      inputUsdPerMillionTokens: 1.2,
      outputUsdPerMillionTokens: 2.4
    }
  },
  anthropic: {
    "other-model": {
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 4
    }
  }
};

test("Budget Ledger calculates actual cost, delta, and pricing snapshot", async () => {
  const { ledger, cleanup } = await testLedger();
  const entry = await ledger.record({
    executionId: "exec_ledger_calculated",
    routingDecision: route("openai", "ledger-model"),
    tokenDecision: tokenDecision({ estimatedCostUsd: 0.0000034 }),
    modelCall: {
      content: "ok",
      provider: "openai",
      model: "ledger-model",
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: null,
      latencyMs: 12
    },
    providerCalled: true,
    timestamp: new Date("2026-08-29T00:00:00.000Z")
  });

  assert.equal(entry.calculationStatus, "calculated");
  assert.equal(entry.projectId, undefined);
  assert.equal(entry.inputPricePerMillion, 1.2);
  assert.equal(entry.outputPricePerMillion, 2.4);
  assert.equal(entry.actualCostUsd, 0.000004);
  assert.equal(entry.costDeltaUsd, 0);
  assert.equal(entry.latencyMs, 12);

  await cleanup();
});

test("Budget Ledger persists entries with historical pricing snapshots", async () => {
  const state = await stateFile();
  const firstLedger = new BudgetLedgerV04(new FileStateMemory(state.stateFilePath), pricingTable);
  await firstLedger.record({
    executionId: "exec_persisted",
    routingDecision: route("openai", "ledger-model"),
    tokenDecision: tokenDecision({ estimatedCostUsd: 0.00001 }),
    modelCall: {
      content: "ok",
      provider: "openai",
      model: "ledger-model",
      inputTokens: 4,
      outputTokens: 2,
      estimatedCostUsd: null,
      latencyMs: 7
    },
    providerCalled: true,
    timestamp: new Date("2026-08-29T01:00:00.000Z")
  });

  const updatedPricing: ModelPricingTable = {
    openai: {
      "ledger-model": {
        inputUsdPerMillionTokens: 100,
        outputUsdPerMillionTokens: 200
      }
    },
    anthropic: {}
  };
  const secondLedger = new BudgetLedgerV04(new FileStateMemory(state.stateFilePath), updatedPricing);
  const [entry] = await secondLedger.listEntries("exec_persisted");

  assert.equal(entry?.inputPricePerMillion, 1.2);
  assert.equal(entry?.outputPricePerMillion, 2.4);
  assert.equal(entry?.actualCostUsd, 0.00001);

  await state.cleanup();
});

test("Budget Ledger marks missing_usage when provider usage is absent or partial", async () => {
  const { ledger, cleanup } = await testLedger();
  const entry = await ledger.record({
    executionId: "exec_missing_usage",
    routingDecision: route("openai", "ledger-model"),
    tokenDecision: tokenDecision({ estimatedCostUsd: 0.00001 }),
    modelCall: {
      content: "ok",
      provider: "openai",
      model: "ledger-model",
      inputTokens: 10,
      outputTokens: undefined as unknown as number,
      estimatedCostUsd: null,
      latencyMs: 5
    },
    providerCalled: true
  });

  assert.equal(entry.calculationStatus, "missing_usage");
  assert.equal(entry.actualCostUsd, null);
  assert.equal(entry.costDeltaUsd, null);
  assert.match(entry.calculationReason ?? "", /complete actual token usage/);

  await cleanup();
});

test("Budget Ledger marks missing_pricing without treating unknown price as zero", async () => {
  const { ledger, cleanup } = await testLedger({ openai: {}, anthropic: {} });
  const entry = await ledger.record({
    executionId: "exec_missing_pricing",
    routingDecision: route("openai", "ledger-model"),
    tokenDecision: tokenDecision({ estimatedCostUsd: 0.00001 }),
    modelCall: {
      content: "ok",
      provider: "openai",
      model: "ledger-model",
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostUsd: null,
      latencyMs: 5
    },
    providerCalled: true
  });

  assert.equal(entry.calculationStatus, "missing_pricing");
  assert.equal(entry.inputPricePerMillion, null);
  assert.equal(entry.outputPricePerMillion, null);
  assert.equal(entry.actualCostUsd, null);
  assert.equal(entry.costDeltaUsd, null);

  await cleanup();
});

test("Budget Ledger marks not_applicable only when no provider call happened", async () => {
  const { ledger, cleanup } = await testLedger();
  const entry = await ledger.record({
    executionId: "exec_not_applicable",
    routingDecision: route("openai", "ledger-model"),
    tokenDecision: tokenDecision({ estimatedCostUsd: 0.00001 }),
    providerCalled: false,
    latencyMs: 0
  });

  assert.equal(entry.calculationStatus, "not_applicable");
  assert.equal(entry.actualInputTokens, null);
  assert.equal(entry.actualOutputTokens, null);
  assert.equal(entry.actualCostUsd, null);
  assert.equal(entry.costDeltaUsd, null);

  await cleanup();
});

test("Budget Ledger summaries include only calculated actual costs", () => {
  const summary = summarizeBudgetLedgerEntries([
    {
      executionId: "exec_a",
      projectId: "project_a",
      provider: "openai",
      model: "ledger-model",
      estimatedInputTokens: 1,
      expectedOutputTokens: 1,
      actualInputTokens: 10,
      actualOutputTokens: 5,
      inputPricePerMillion: 1,
      outputPricePerMillion: 2,
      estimatedCostUsd: 0.00001,
      actualCostUsd: 0.00002,
      costDeltaUsd: 0.00001,
      latencyMs: 3,
      timestamp: new Date("2026-08-29T00:00:00.000Z"),
      calculationStatus: "calculated"
    },
    {
      executionId: "exec_a",
      projectId: "project_a",
      provider: "openai",
      model: "ledger-model",
      estimatedInputTokens: 1,
      expectedOutputTokens: 1,
      actualInputTokens: null,
      actualOutputTokens: null,
      inputPricePerMillion: 1,
      outputPricePerMillion: 2,
      estimatedCostUsd: 0.00001,
      actualCostUsd: null,
      costDeltaUsd: null,
      latencyMs: 9,
      timestamp: new Date("2026-08-29T00:01:00.000Z"),
      calculationStatus: "missing_usage"
    }
  ]);

  assert.equal(summary.byExecution.exec_a.entryCount, 1);
  assert.equal(summary.byExecution.exec_a.actualCostUsd, 0.00002);
  assert.equal(summary.byProject.project_a.entryCount, 1);
  assert.equal(summary.byProject.project_a.actualCostUsd, 0.00002);
  assert.equal(summary.byProvider.openai.entryCount, 1);
  assert.equal(summary.byModel["openai:ledger-model"].actualInputTokens, 10);
  assert.equal(summary.byProvider.anthropic.entryCount, 0);
});

async function testLedger(
  pricing: ModelPricingTable = pricingTable
): Promise<{ ledger: BudgetLedgerV04; cleanup: () => Promise<void> }> {
  const state = await stateFile();
  const memory = new FileStateMemory(state.stateFilePath);

  return {
    ledger: new BudgetLedgerV04(memory, pricing),
    cleanup: state.cleanup
  };
}

async function stateFile(): Promise<{ stateFilePath: string; cleanup: () => Promise<void> }> {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-ledger-"));

  return {
    stateFilePath: join(stateDir, "state.json"),
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}

function route(provider: "openai" | "anthropic", model: string): RoutingDecision {
  return {
    provider,
    model,
    taskType: "general",
    reason: "test route",
    estimatedCostUsd: 0.00001,
    estimatedLatencyClass: "low"
  };
}

function tokenDecision(options: { estimatedCostUsd: number | null }): TokenDecision {
  return {
    status: "allow",
    estimatedInputTokens: 20,
    estimatedOutputTokens: 10,
    estimatedTotalTokens: 30,
    estimatedCostUsd: options.estimatedCostUsd,
    reason: "test token decision"
  };
}
