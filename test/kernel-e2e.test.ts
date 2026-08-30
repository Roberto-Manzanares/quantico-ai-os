import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createQuanticoSystem,
  ProviderAdapterError,
  type ModelCallRequest,
  type ModelCallResult,
  type BudgetLedgerEntry,
  type ModelConfig,
  type ModelPricingTable,
  type ProviderAdapter
} from "../src/index.js";

const modelConfigs: ModelConfig[] = [
  {
    provider: "openai",
    model: "kernel-test-model",
    taskTypes: ["generation", "general"],
    capabilities: ["text_generation"],
    latencyClass: "low",
    priority: 1
  }
];

const pricingTable: ModelPricingTable = {
  openai: {
    "kernel-test-model": {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 2
    }
  },
  anthropic: {}
};

test("Kernel executes the full V0.1 flow successfully with a fake provider", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const provider = new FakeProvider({
    content: "kernel success result",
    inputTokens: 12,
    outputTokens: 8,
    latencyMs: 25
  });
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai: provider }
  });

  const result = await system.orchestrator.run({
    goal: "Generate kernel success result",
    constraints: {
      preferredProvider: "openai",
      expectedOutputTokens: 8,
      maxInputTokens: 200,
      maxOutputTokens: 20,
      maxTotalTokens: 220,
      maxCostUsd: 1,
      evaluationCriteria: [{ type: "contains_text", value: "kernel success result" }]
    },
    contextRefs: ["text:fixture:kernel success context"]
  });
  const persisted = await system.stateMemory.getExecution(result.execution.id);
  const events = await system.stateMemory.listEvents(result.execution.id);
  const ledgerEntries = await system.stateMemory.listBudgetLedgerEntries(result.execution.id);

  assert.equal(result.execution.status, "succeeded");
  assert.equal(result.execution.taskType, "generation");
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0]?.model, "kernel-test-model");
  assert.equal(result.execution.finalResult, "kernel success result");
  assert.equal(result.execution.metrics.inputTokens, 12);
  assert.equal(result.execution.metrics.outputTokens, 8);
  assert.equal(result.execution.metrics.estimatedCostUsd, 0.000102);
  assert.equal(result.execution.metrics.actualCostUsd, 0.000028);
  assert.equal(result.execution.metrics.costDeltaUsd, -0.000074);
  assert.equal(result.execution.metrics.latencyMs, 25);
  assert.equal(result.evaluation.status, "pass");
  assert.ok(result.evaluation.criteria.includes("contains_text:pass"));
  assert.equal(persisted?.finalResult, "kernel success result");
  assert.ok(events.some((event) => event.type === "context_compiled"));
  assert.ok(events.some((event) => event.type === "model_routed"));
  assert.ok(events.some((event) => event.type === "token_governed"));
  assert.ok(events.some((event) => event.type === "model_called"));
  assert.ok(events.some((event) => event.type === "budget_ledger_recorded"));
  assert.ok(events.some((event) => event.type === "evaluation_completed"));
  assert.equal(ledgerEntries.length, 1);
  assert.equal(ledgerEntries[0]?.projectId, undefined);
  assert.equal(ledgerEntries[0]?.calculationStatus, "calculated");
  assert.equal(ledgerEntries[0]?.inputPricePerMillion, 1);
  assert.equal(ledgerEntries[0]?.outputPricePerMillion, 2);
  assert.equal(ledgerEntries[0]?.actualCostUsd, 0.000028);

  const rawState = await readFile(stateFilePath, "utf8");
  assert.match(rawState, /kernel success result/);

  await cleanup();
});

test("Kernel blocks before provider when project budget would be exceeded", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const provider = new FakeProvider({ content: "should not be called" });
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai: provider }
  });
  await system.stateMemory.saveBudgetLedgerEntry(
    ledgerEntry({
      executionId: "exec_previous_project_spend",
      projectId: "project_budget",
      actualCostUsd: 0.9
    })
  );

  const result = await system.orchestrator.run({
    projectId: "project_budget",
    goal: "Generate blocked by project budget",
    constraints: {
      preferredProvider: "openai",
      expectedOutputTokens: 50,
      maxProjectCostUsd: 0.90005
    }
  });
  const events = await system.stateMemory.listEvents(result.execution.id);
  const ledgerEntries = await system.stateMemory.listBudgetLedgerEntries(result.execution.id);

  assert.equal(result.execution.status, "failed");
  assert.equal(provider.calls.length, 0);
  assert.equal(result.execution.error?.code, "blocked_project_budget");
  assert.ok(events.some((event) => event.type === "budget_enforced"));
  assert.equal(ledgerEntries.length, 1);
  assert.equal(ledgerEntries[0]?.calculationStatus, "not_applicable");

  await cleanup();
});

test("Kernel returns needs_human when technical execution succeeds but goal fulfillment is not deterministic", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const provider = new FakeProvider({
    content: "A non-empty answer from the provider.",
    inputTokens: 12,
    outputTokens: 8,
    latencyMs: 25
  });
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai: provider }
  });

  const result = await system.orchestrator.run({
    goal: "Generate a strategically excellent answer",
    constraints: {
      preferredProvider: "openai",
      expectedOutputTokens: 8,
      maxCostUsd: 1
    }
  });

  assert.equal(provider.calls.length, 1);
  assert.equal(result.execution.finalResult, "A non-empty answer from the provider.");
  assert.equal(result.evaluation.status, "needs_review");
  assert.equal(result.execution.status, "needs_human");
  assert.match(result.evaluation.reason, /No explicit deterministic evaluation criteria/);

  await cleanup();
});

test("Kernel does not call provider when Token Governor rejects", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const provider = new FakeProvider({ content: "should not be called" });
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai: provider }
  });

  const result = await system.orchestrator.run({
    goal: "Generate blocked result",
    constraints: {
      preferredProvider: "openai",
      expectedOutputTokens: 50,
      maxTotalTokens: 5
    },
    contextRefs: ["text:fixture:block by token budget"]
  });
  const ledgerEntries = await system.stateMemory.listBudgetLedgerEntries(result.execution.id);

  assert.equal(result.execution.status, "failed");
  assert.equal(provider.calls.length, 0);
  assert.equal(result.execution.error?.code, "token_budget_exceeded");
  assert.equal(ledgerEntries.length, 1);
  assert.equal(ledgerEntries[0]?.calculationStatus, "not_applicable");
  assert.equal(ledgerEntries[0]?.actualCostUsd, null);

  await cleanup();
});

test("Kernel pauses for human approval before provider call", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const provider = new FakeProvider({ content: "should not be called" });
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai: provider }
  });

  const result = await system.orchestrator.run({
    goal: "Generate approval gated result",
    approvalPolicy: {},
    constraints: {
      preferredProvider: "openai",
      expectedOutputTokens: 10,
      modelCallRiskLevel: "HIGH"
    }
  });
  const pendingStep = await system.stateMemory.getPendingApprovalStep(result.execution.id);
  const ledgerEntries = await system.stateMemory.listBudgetLedgerEntries(result.execution.id);

  assert.equal(result.execution.status, "needs_human");
  assert.equal(result.evaluation.status, "needs_review");
  assert.equal(provider.calls.length, 0);
  assert.equal(pendingStep?.action.name, "provider_model_call");
  assert.equal(ledgerEntries.length, 0);

  await cleanup();
});

test("Kernel handles provider errors with traceable normalized failure", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const provider = new FailingProvider();
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai: provider }
  });

  const result = await system.orchestrator.run({
    goal: "Generate provider failure",
    constraints: {
      preferredProvider: "openai",
      expectedOutputTokens: 10
    }
  });
  const events = await system.stateMemory.listEvents(result.execution.id);
  const ledgerEntries = await system.stateMemory.listBudgetLedgerEntries(result.execution.id);

  assert.equal(result.execution.status, "failed");
  assert.equal(provider.calls.length, 1);
  assert.equal(result.execution.error?.code, "provider_error");
  assert.equal(result.evaluation.status, "fail");
  assert.ok(events.some((event) => event.type === "provider_error"));
  assert.equal(ledgerEntries.length, 1);
  assert.equal(ledgerEntries[0]?.calculationStatus, "missing_usage");
  assert.equal(ledgerEntries[0]?.actualCostUsd, null);

  await cleanup();
});

class FakeProvider implements ProviderAdapter {
  readonly provider = "openai" as const;
  readonly calls: ModelCallRequest[] = [];

  constructor(
    private readonly response: Partial<ModelCallResult> & {
      content: string;
    }
  ) {}

  async sendMessage(request: ModelCallRequest): Promise<ModelCallResult> {
    this.calls.push(request);

    return {
      content: this.response.content,
      provider: this.provider,
      model: request.model,
      inputTokens: this.response.inputTokens ?? 1,
      outputTokens: this.response.outputTokens ?? 1,
      estimatedCostUsd: null,
      latencyMs: this.response.latencyMs ?? 1
    };
  }
}

class FailingProvider implements ProviderAdapter {
  readonly provider = "openai" as const;
  readonly calls: ModelCallRequest[] = [];

  async sendMessage(request: ModelCallRequest): Promise<ModelCallResult> {
    this.calls.push(request);
    throw new ProviderAdapterError({
      provider: this.provider,
      model: request.model,
      code: "provider_error",
      message: "Fake provider failure",
      statusCode: 500
    });
  }
}

async function stateFile(): Promise<{ stateFilePath: string; cleanup: () => Promise<void> }> {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-kernel-"));

  return {
    stateFilePath: join(stateDir, "state.json"),
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}

function ledgerEntry(overrides: Partial<BudgetLedgerEntry> = {}): BudgetLedgerEntry {
  return {
    executionId: "exec_ledger",
    projectId: "project_fixture",
    provider: "openai",
    model: "kernel-test-model",
    estimatedInputTokens: 10,
    expectedOutputTokens: 10,
    actualInputTokens: 10,
    actualOutputTokens: 10,
    inputPricePerMillion: 1,
    outputPricePerMillion: 2,
    estimatedCostUsd: 0.00003,
    actualCostUsd: 0.00003,
    costDeltaUsd: 0,
    latencyMs: 1,
    timestamp: new Date("2026-08-29T00:00:00.000Z"),
    calculationStatus: "calculated",
    ...overrides
  };
}
