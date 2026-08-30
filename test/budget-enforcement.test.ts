import test from "node:test";
import assert from "node:assert/strict";
import {
  BudgetEnforcementGateV05,
  InMemoryStateMemory,
  type BudgetLedgerEntry
} from "../src/index.js";

test("Budget Enforcement allows when projected execution cost equals budget", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveBudgetLedgerEntry(entry({ actualCostUsd: 0.7 }));
  const gate = new BudgetEnforcementGateV05(memory);

  const decision = await gate.evaluate({
    executionId: "exec_budget",
    projectId: "project_budget",
    estimatedNextCallCostUsd: 0.3,
    maxExecutionCostUsd: 1
  });

  assert.equal(decision.decision, "allowed");
  assert.equal(decision.accumulatedActualCostUsd, 0.7);
  assert.equal(decision.projectedCostUsd, 1);
  assert.equal(decision.applicableBudgetUsd, 1);
});

test("Budget Enforcement blocks when execution budget would be exceeded", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveBudgetLedgerEntry(entry({ actualCostUsd: 0.7 }));
  const gate = new BudgetEnforcementGateV05(memory);

  const decision = await gate.evaluate({
    executionId: "exec_budget",
    projectId: "project_budget",
    estimatedNextCallCostUsd: 0.300001,
    maxExecutionCostUsd: 1
  });

  assert.equal(decision.decision, "blocked_execution_budget");
  assert.equal(decision.accumulatedActualCostUsd, 0.7);
  assert.equal(decision.projectedCostUsd, 1.000001);
  assert.match(decision.reason, /execution cost/i);
});

test("Budget Enforcement blocks when project budget would be exceeded", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveBudgetLedgerEntry(entry({ executionId: "exec_previous", actualCostUsd: 0.9 }));
  const gate = new BudgetEnforcementGateV05(memory);

  const decision = await gate.evaluate({
    executionId: "exec_next",
    projectId: "project_budget",
    estimatedNextCallCostUsd: 0.2,
    maxProjectCostUsd: 1
  });

  assert.equal(decision.decision, "blocked_project_budget");
  assert.equal(decision.accumulatedActualCostUsd, 0.9);
  assert.equal(decision.projectedCostUsd, 1.1);
  assert.equal(decision.applicableBudgetUsd, 1);
});

test("Budget Enforcement returns budget_unknown when project budget is active without projectId", async () => {
  const gate = new BudgetEnforcementGateV05(new InMemoryStateMemory());

  const decision = await gate.evaluate({
    executionId: "exec_no_project",
    estimatedNextCallCostUsd: 0.1,
    maxProjectCostUsd: 1
  });

  assert.equal(decision.decision, "budget_unknown");
  assert.equal(decision.projectId, undefined);
  assert.equal(decision.projectedCostUsd, null);
  assert.match(decision.reason, /requires an explicit projectId/);
});

test("Budget Enforcement reports project accumulated spend when project budget applies", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveBudgetLedgerEntry(entry({ executionId: "exec_previous", actualCostUsd: 0.4 }));
  const gate = new BudgetEnforcementGateV05(memory);

  const decision = await gate.evaluate({
    executionId: "exec_next",
    projectId: "project_budget",
    estimatedNextCallCostUsd: 0.2,
    maxProjectCostUsd: 1
  });

  assert.equal(decision.decision, "allowed");
  assert.equal(decision.accumulatedActualCostUsd, 0.4);
  assert.equal(decision.projectedCostUsd, 0.6);
  assert.equal(decision.applicableBudgetUsd, 1);
});

test("Budget Enforcement does not mix entries from different projects", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveBudgetLedgerEntry(
    entry({ executionId: "exec_other", projectId: "project_other", actualCostUsd: 0.95 })
  );
  await memory.saveBudgetLedgerEntry(
    entry({ executionId: "exec_same", projectId: "project_budget", actualCostUsd: 0.2 })
  );
  const gate = new BudgetEnforcementGateV05(memory);

  const decision = await gate.evaluate({
    executionId: "exec_next",
    projectId: "project_budget",
    estimatedNextCallCostUsd: 0.3,
    maxProjectCostUsd: 0.5
  });

  assert.equal(decision.decision, "allowed");
  assert.equal(decision.accumulatedActualCostUsd, 0.2);
  assert.equal(decision.projectedCostUsd, 0.5);
});

test("Budget Enforcement allows when no accumulated budgets are configured", async () => {
  const gate = new BudgetEnforcementGateV05(new InMemoryStateMemory());

  const decision = await gate.evaluate({
    executionId: "exec_budget",
    estimatedNextCallCostUsd: 0.2
  });

  assert.equal(decision.decision, "allowed");
  assert.equal(decision.projectId, undefined);
  assert.equal(decision.accumulatedActualCostUsd, 0);
  assert.equal(decision.projectedCostUsd, 0.2);
  assert.equal(decision.applicableBudgetUsd, null);
});

test("Budget Enforcement uses execution block before project block when both exceed", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveBudgetLedgerEntry(entry({ actualCostUsd: 0.9 }));
  const gate = new BudgetEnforcementGateV05(memory);

  const decision = await gate.evaluate({
    executionId: "exec_budget",
    projectId: "project_budget",
    estimatedNextCallCostUsd: 0.2,
    maxExecutionCostUsd: 1,
    maxProjectCostUsd: 1
  });

  assert.equal(decision.decision, "blocked_execution_budget");
});

test("Budget Enforcement returns budget_unknown when next estimated cost is unknown", async () => {
  const gate = new BudgetEnforcementGateV05(new InMemoryStateMemory());

  const decision = await gate.evaluate({
    executionId: "exec_budget",
    projectId: "project_budget",
    estimatedNextCallCostUsd: null,
    maxExecutionCostUsd: 1
  });

  assert.equal(decision.decision, "budget_unknown");
  assert.equal(decision.projectedCostUsd, null);
  assert.match(decision.reason, /unknown/i);
});

test("Budget Enforcement fails closed on applicable missing_usage ledger entries", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveBudgetLedgerEntry(
    entry({
      calculationStatus: "missing_usage",
      actualCostUsd: null
    })
  );
  const gate = new BudgetEnforcementGateV05(memory);

  const decision = await gate.evaluate({
    executionId: "exec_budget",
    projectId: "project_budget",
    estimatedNextCallCostUsd: 0.1,
    maxExecutionCostUsd: 1
  });

  assert.equal(decision.decision, "budget_unknown");
  assert.match(decision.reason, /Execution ledger contains unknown actual cost/);
});

test("Budget Enforcement fails closed on applicable missing_pricing project entries", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveBudgetLedgerEntry(
    entry({
      executionId: "exec_previous",
      calculationStatus: "missing_pricing",
      actualCostUsd: null
    })
  );
  const gate = new BudgetEnforcementGateV05(memory);

  const decision = await gate.evaluate({
    executionId: "exec_next",
    projectId: "project_budget",
    estimatedNextCallCostUsd: 0.1,
    maxProjectCostUsd: 1
  });

  assert.equal(decision.decision, "budget_unknown");
  assert.match(decision.reason, /Project ledger contains unknown actual cost/);
});

test("Budget Enforcement ignores not_applicable entries for accumulated spend", async () => {
  const memory = new InMemoryStateMemory();
  await memory.saveBudgetLedgerEntry(
    entry({
      calculationStatus: "not_applicable",
      actualCostUsd: null
    })
  );
  const gate = new BudgetEnforcementGateV05(memory);

  const decision = await gate.evaluate({
    executionId: "exec_budget",
    projectId: "project_budget",
    estimatedNextCallCostUsd: 0.1,
    maxExecutionCostUsd: 0.1
  });

  assert.equal(decision.decision, "allowed");
  assert.equal(decision.accumulatedActualCostUsd, 0);
  assert.equal(decision.projectedCostUsd, 0.1);
});

function entry(overrides: Partial<BudgetLedgerEntry> = {}): BudgetLedgerEntry {
  return {
    executionId: "exec_budget",
    projectId: "project_budget",
    provider: "openai",
    model: "gpt-5-nano",
    estimatedInputTokens: 100,
    expectedOutputTokens: 20,
    actualInputTokens: 100,
    actualOutputTokens: 20,
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0.4,
    estimatedCostUsd: 0.000013,
    actualCostUsd: 0.7,
    costDeltaUsd: 0.699987,
    latencyMs: 10,
    timestamp: new Date("2026-08-29T00:00:00.000Z"),
    calculationStatus: "calculated",
    ...overrides
  };
}
