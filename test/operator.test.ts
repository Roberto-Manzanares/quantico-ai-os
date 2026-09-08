import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createQuanticoSystem,
  LocalOperator,
  type ModelCallRequest,
  type ModelCallResult,
  type ModelConfig,
  type ModelPricingTable,
  type ProviderAdapter
} from "../src/index.js";

const modelConfigs: ModelConfig[] = [{
  provider: "openai",
  model: "operator-test-model",
  taskTypes: ["research", "general"],
  capabilities: ["text_generation"],
  latencyClass: "low",
  priority: 1
}];

const pricingTable: ModelPricingTable = {
  openai: { "operator-test-model": { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2 } },
  anthropic: {}
};

test("Operator E2E researches and writes a summary after real Human Gate approval without provider calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "quantico-operator-"));
  const stateFilePath = join(root, "state.json");
  const provider = new NeverCalledProvider();
  const system = createQuanticoSystem({ stateFilePath, modelConfigs, pricingTable, providers: { openai: provider } });
  const operator = new LocalOperator({
    state: system.stateMemory,
    controlledExecution: system.controlledOperationalExecution,
    humanApprovalGate: system.humanApprovalGate,
    budgetLedger: system.budgetLedger,
    workspaceRoot: root,
    fetchFn: async () => new Response("Quantico source fixture: a concise research finding.", { status: 200 })
  });

  try {
    const plan = await operator.prepare("Investiga Quantico AI OS y guarda un resumen");
    assert.equal(plan.provider, "openai");
    assert.equal(plan.model, "operator-test-model");
    assert.ok(plan.estimatedCostUsd !== null && plan.estimatedCostUsd > 0);
    assert.equal(plan.steps[1]?.status, "awaiting_approval");
    assert.equal(provider.calls, 0);
    assert.ok(await system.stateMemory.getPendingApprovalStep(plan.executionId));

    await operator.approve(plan, "Safe fixture approval.");
    const result = await operator.execute(plan, "https://example.test/quantico", "research/quantico.md");
    const written = await readFile(result.outputPath ?? "", "utf8");
    const execution = await system.stateMemory.getExecution(plan.executionId);
    const events = await system.stateMemory.listEvents(plan.executionId);
    const ledger = await system.stateMemory.listBudgetLedgerEntries(plan.executionId);
    const timeline = await system.executionAuditTimeline.getExecutionAuditTimeline(plan.executionId);

    assert.match(written, /Quantico source fixture/);
    assert.deepEqual(result.sources, ["https://example.test/quantico"]);
    assert.equal(execution?.status, "succeeded");
    assert.ok(events.some((event) => event.type === "operator_plan_created"));
    assert.ok(events.some((event) => event.type === "approval_decision" && event.decisionApplied === "approved"));
    assert.ok(events.some((event) => event.type === "operator_completed"));
    assert.equal(ledger.length, 1);
    assert.equal(timeline.status, "found");
    assert.equal(provider.calls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Operator rejects a plan without fetching or writing", async () => {
  const root = await mkdtemp(join(tmpdir(), "quantico-operator-"));
  const system = createQuanticoSystem({
    stateFilePath: join(root, "state.json"),
    modelConfigs,
    pricingTable,
    providers: { openai: new NeverCalledProvider() }
  });
  const operator = new LocalOperator({
    state: system.stateMemory,
    controlledExecution: system.controlledOperationalExecution,
    humanApprovalGate: system.humanApprovalGate,
    budgetLedger: system.budgetLedger,
    workspaceRoot: root,
    fetchFn: async () => { throw new Error("fetch must remain blocked"); }
  });

  try {
    const plan = await operator.prepare("Investiga una fuente y guarda un resumen");
    await operator.reject(plan);
    await assert.rejects(operator.execute(plan, "https://example.test/blocked", "blocked.md"));
    assert.equal((await system.stateMemory.getExecution(plan.executionId))?.status, "cancelled");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

class NeverCalledProvider implements ProviderAdapter {
  readonly provider = "openai" as const;
  calls = 0;

  async sendMessage(_request: ModelCallRequest): Promise<ModelCallResult> {
    this.calls += 1;
    throw new Error("Provider calls are forbidden in Operator tests.");
  }
}
