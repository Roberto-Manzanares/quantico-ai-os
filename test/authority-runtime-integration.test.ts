import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  BudgetEnforcementGateV05,
  BudgetLedgerV04,
  DeterministicModelRouter,
  FileStateMemory,
  Orchestrator,
  ShadowRoutingAnalysisReporterV010,
  ShadowRoutingAdvisorV08,
  ShadowRoutingEvaluationLogV09,
  DeterministicTokenGovernor,
  createQuanticoSystem,
  type AuthorityDecisionAuditLog,
  type AuthorityDecisionAuditLogEntry,
  type BudgetLedgerEntry,
  type Execution,
  type LimitedShadowAuthorityResult,
  type ModelCallRequest,
  type ModelCallResult,
  type ModelConfig,
  type ModelPricingTable,
  type ProviderAdapter,
  type ProviderName,
  type ShadowAdvisorMetricsUsed,
  type ShadowRoutingEvaluationLogEntry
} from "../src/index.js";

const modelConfigs: ModelConfig[] = [
  {
    provider: "openai",
    model: "cost-first-model",
    taskTypes: ["generation", "general"],
    capabilities: ["text_generation"],
    latencyClass: "low",
    priority: 1
  },
  {
    provider: "anthropic",
    model: "shadow-model",
    taskTypes: ["generation", "general"],
    capabilities: ["text_generation"],
    latencyClass: "low",
    priority: 2
  }
];

const pricingTable: ModelPricingTable = {
  openai: {
    "cost-first-model": {
      inputUsdPerMillionTokens: 0.05,
      outputUsdPerMillionTokens: 0.4
    }
  },
  anthropic: {
    "shadow-model": {
      inputUsdPerMillionTokens: 0.06,
      outputUsdPerMillionTokens: 0.45
    }
  }
};

test("Authority Runtime Integration uses shadow effectiveSelection when policy allows it", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("openai", "cost-first result");
  const anthropic = new FakeProvider("anthropic", "shadow success result");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai, anthropic }
  });

  try {
    await seedAuthorityEvidence(system.stateMemory);

    const result = await system.orchestrator.run({
      goal: "Generate shadow success result",
      constraints: {
        expectedOutputTokens: 30,
        maxCostUsd: 1,
        evaluationCriteria: [{ type: "contains_text", value: "shadow success result" }],
        authorityPolicy: enabledAuthorityPolicy()
      }
    });
    const auditEntries = await system.stateMemory.listAuthorityDecisionAuditEntries(
      result.execution.id
    );
    const ledgerEntries = await system.stateMemory.listBudgetLedgerEntries(result.execution.id);

    assert.equal(result.execution.status, "succeeded");
    assert.equal(openai.calls.length, 0);
    assert.equal(anthropic.calls.length, 1);
    assert.equal(anthropic.calls[0]?.model, "shadow-model");
    assert.equal(auditEntries.length, 1);
    assert.equal(auditEntries[0]?.authorityDecision, "allowed");
    assert.equal(auditEntries[0]?.effectiveSelection.provider, "anthropic");
    assert.equal(auditEntries[0]?.effectiveSelection.model, "shadow-model");
    assert.equal(ledgerEntries.length, 1);
    assert.equal(ledgerEntries[0]?.provider, "anthropic");
    assert.equal(ledgerEntries[0]?.model, "shadow-model");
  } finally {
    await cleanup();
  }
});

test("Authority Runtime Integration fails closed to COST-FIRST when policy evidence is insufficient", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("openai", "cost first success result");
  const anthropic = new FakeProvider("anthropic", "should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai, anthropic }
  });

  try {
    await seedScorecards(system.stateMemory);

    const result = await system.orchestrator.run({
      goal: "Generate cost first success result",
      constraints: {
        expectedOutputTokens: 30,
        maxCostUsd: 1,
        evaluationCriteria: [{ type: "contains_text", value: "cost first success result" }],
        authorityPolicy: enabledAuthorityPolicy()
      }
    });
    const auditEntries = await system.stateMemory.listAuthorityDecisionAuditEntries(
      result.execution.id
    );

    assert.equal(result.execution.status, "succeeded");
    assert.equal(openai.calls.length, 1);
    assert.equal(anthropic.calls.length, 0);
    assert.equal(auditEntries.length, 1);
    assert.equal(auditEntries[0]?.authorityDecision, "blocked");
    assert.equal(auditEntries[0]?.advisorAuthority, "none");
    assert.equal(auditEntries[0]?.effectiveSelection.provider, "openai");
    assert.match(auditEntries[0]?.reason ?? "", /evidenceStatus must be sufficient/);
  } finally {
    await cleanup();
  }
});

test("Authority Runtime Integration stops before provider when authority audit persistence fails", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const stateMemory = new FileStateMemory(stateFilePath);
  const openai = new FakeProvider("openai", "should not be called");
  const anthropic = new FakeProvider("anthropic", "should not be called");
  const evaluationLog = new ShadowRoutingEvaluationLogV09(stateMemory);
  const orchestrator = new Orchestrator({
    contextCompiler: createQuanticoSystem({ stateFilePath }).contextCompiler,
    modelRouter: new DeterministicModelRouter(modelConfigs, pricingTable),
    tokenGovernor: new DeterministicTokenGovernor(pricingTable),
    budgetEnforcementGate: new BudgetEnforcementGateV05(stateMemory),
    budgetLedger: new BudgetLedgerV04(stateMemory, pricingTable),
    stateMemory,
    humanApprovalGate: createQuanticoSystem({ stateFilePath }).humanApprovalGate,
    evaluator: createQuanticoSystem({ stateFilePath }).evaluator,
    providerScorecard: createQuanticoSystem({ stateFilePath }).providerScorecard,
    shadowRoutingAdvisor: new ShadowRoutingAdvisorV08(),
    shadowRoutingAnalysisReporter: new ShadowRoutingAnalysisReporterV010(evaluationLog),
    limitedShadowAuthorityPolicy: createQuanticoSystem({ stateFilePath }).limitedShadowAuthorityPolicy,
    authorityDecisionAuditLog: new FailingAuthorityDecisionAuditLog(),
    costTable: pricingTable,
    providers: { openai, anthropic }
  });

  try {
    await seedAuthorityEvidence(stateMemory);

    const result = await orchestrator.run({
      goal: "Generate audit failure",
      constraints: {
        expectedOutputTokens: 30,
        maxCostUsd: 1,
        authorityPolicy: enabledAuthorityPolicy()
      }
    });
    const ledgerEntries = await stateMemory.listBudgetLedgerEntries(result.execution.id);

    assert.equal(result.execution.status, "failed");
    assert.equal(result.execution.error?.code, "authority_audit_failed");
    assert.equal(openai.calls.length, 0);
    assert.equal(anthropic.calls.length, 0);
    assert.equal(ledgerEntries.length, 0);
  } finally {
    await cleanup();
  }
});

test("Authority Runtime Integration does not reroute when Token Governor rejects effectiveSelection", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("openai", "should not be called");
  const anthropic = new FakeProvider("anthropic", "should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai, anthropic }
  });

  try {
    await seedAuthorityEvidence(system.stateMemory);

    const result = await system.orchestrator.run({
      goal: "Generate token rejected result",
      constraints: {
        expectedOutputTokens: 30,
        maxTotalTokens: 5,
        authorityPolicy: enabledAuthorityPolicy()
      }
    });
    const auditEntries = await system.stateMemory.listAuthorityDecisionAuditEntries(
      result.execution.id
    );
    const ledgerEntries = await system.stateMemory.listBudgetLedgerEntries(result.execution.id);

    assert.equal(result.execution.status, "failed");
    assert.equal(result.execution.error?.code, "token_budget_exceeded");
    assert.equal(openai.calls.length, 0);
    assert.equal(anthropic.calls.length, 0);
    assert.equal(auditEntries.length, 1);
    assert.equal(auditEntries[0]?.authorityDecision, "allowed");
    assert.equal(auditEntries[0]?.effectiveSelection.provider, "anthropic");
    assert.equal(ledgerEntries.length, 1);
    assert.equal(ledgerEntries[0]?.provider, "anthropic");
    assert.equal(ledgerEntries[0]?.calculationStatus, "not_applicable");
  } finally {
    await cleanup();
  }
});

test("Authority Runtime Integration does not reroute when Budget Enforcement rejects effectiveSelection", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("openai", "should not be called");
  const anthropic = new FakeProvider("anthropic", "should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai, anthropic }
  });

  try {
    await seedAuthorityEvidence(system.stateMemory);

    const result = await system.orchestrator.run({
      goal: "Generate budget rejected result",
      constraints: {
        expectedOutputTokens: 30,
        maxExecutionCostUsd: 0.000001,
        authorityPolicy: enabledAuthorityPolicy()
      }
    });
    const auditEntries = await system.stateMemory.listAuthorityDecisionAuditEntries(
      result.execution.id
    );

    assert.equal(result.execution.status, "failed");
    assert.equal(result.execution.error?.code, "blocked_execution_budget");
    assert.equal(openai.calls.length, 0);
    assert.equal(anthropic.calls.length, 0);
    assert.equal(auditEntries.length, 1);
    assert.equal(auditEntries[0]?.authorityDecision, "allowed");
    assert.equal(auditEntries[0]?.effectiveSelection.provider, "anthropic");
  } finally {
    await cleanup();
  }
});

test("Authority Runtime Integration preserves effectiveSelection through human approval pause", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("openai", "should not be called");
  const anthropic = new FakeProvider("anthropic", "should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai, anthropic }
  });

  try {
    await seedAuthorityEvidence(system.stateMemory);

    const result = await system.orchestrator.run({
      goal: "Generate approval gated result",
      constraints: {
        expectedOutputTokens: 30,
        modelCallRiskLevel: "HIGH",
        authorityPolicy: enabledAuthorityPolicy()
      }
    });
    const pending = await system.stateMemory.getPendingApprovalStep(result.execution.id);
    const beforeApproveAuditEntries = await system.stateMemory.listAuthorityDecisionAuditEntries(
      result.execution.id
    );

    await system.humanApprovalGate.approvePendingStep(
      { executionId: result.execution.id, reason: "approved for dry-run" },
      system.stateMemory
    );

    const afterApproveAuditEntries = await system.stateMemory.listAuthorityDecisionAuditEntries(
      result.execution.id
    );

    assert.equal(result.execution.status, "needs_human");
    assert.equal(openai.calls.length, 0);
    assert.equal(anthropic.calls.length, 0);
    assert.equal(pending?.metadata["provider"], "anthropic");
    assert.equal(
      (pending?.metadata["effectiveSelection"] as { provider?: string } | undefined)?.provider,
      "anthropic"
    );
    assert.equal(
      (pending?.metadata["effectiveSelection"] as { model?: string } | undefined)?.model,
      "shadow-model"
    );
    assert.deepEqual(
      pending?.metadata["effectiveSelection"],
      beforeApproveAuditEntries[0]?.effectiveSelection
    );
    assert.equal(beforeApproveAuditEntries.length, 1);
    assert.equal(afterApproveAuditEntries.length, 1);
  } finally {
    await cleanup();
  }
});

async function seedAuthorityEvidence(stateMemory: FileStateMemory): Promise<void> {
  await seedScorecards(stateMemory);

  for (let index = 0; index < 3; index += 1) {
    await stateMemory.saveShadowRoutingEvaluation(
      shadowLogEntry({
        id: `match_${index}`,
        executionId: `match_${index}`,
        matchesActualSelection: true
      })
    );
  }

  for (let index = 0; index < 2; index += 1) {
    await stateMemory.saveShadowRoutingEvaluation(
      shadowLogEntry({
        id: `divergence_${index}`,
        executionId: `divergence_${index}`,
        matchesActualSelection: false
      })
    );
  }
}

async function seedScorecards(stateMemory: FileStateMemory): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await stateMemory.saveExecution(
      execution({
        id: `score_openai_${index}`,
        status: index < 7 ? "succeeded" : "failed",
        evaluationStatus: index < 6 ? "pass" : "fail"
      })
    );
    await stateMemory.saveBudgetLedgerEntry(
      ledgerEntry({
        executionId: `score_openai_${index}`,
        provider: "openai",
        model: "cost-first-model"
      })
    );
  }

  for (let index = 0; index < 10; index += 1) {
    await stateMemory.saveExecution(
      execution({
        id: `score_anthropic_${index}`,
        status: index < 9 ? "succeeded" : "failed",
        evaluationStatus: index < 9 ? "pass" : "fail"
      })
    );
    await stateMemory.saveBudgetLedgerEntry(
      ledgerEntry({
        executionId: `score_anthropic_${index}`,
        provider: "anthropic",
        model: "shadow-model"
      })
    );
  }
}

function enabledAuthorityPolicy() {
  return {
    advisorAuthority: "limited" as const,
    allowedModels: [{ provider: "anthropic" as const, model: "shadow-model" }],
    maxAdditionalCostUsdPerIntervention: 0.00001,
    maxEstimatedCostUsdPerIntervention: 0.00005
  };
}

function execution(input: {
  id: string;
  status: Execution["status"];
  evaluationStatus: NonNullable<Execution["evaluation"]>["status"];
}): Execution {
  return {
    id: input.id,
    goal: "historical execution",
    taskType: "general",
    constraints: {},
    approvalPolicy: {},
    status: input.status,
    createdAt: new Date("2026-08-30T12:00:00.000Z"),
    updatedAt: new Date("2026-08-30T12:00:00.000Z"),
    evaluation: {
      status: input.evaluationStatus,
      reason: "historical evaluation",
      criteria: ["historical"]
    },
    metrics: {
      inputTokens: 10,
      outputTokens: 10,
      estimatedCostUsd: 0.00001,
      latencyMs: 1
    }
  };
}

function ledgerEntry(input: {
  executionId: string;
  provider: ProviderName;
  model: string;
}): BudgetLedgerEntry {
  return {
    executionId: input.executionId,
    provider: input.provider,
    model: input.model,
    estimatedInputTokens: 10,
    expectedOutputTokens: 10,
    actualInputTokens: 10,
    actualOutputTokens: 10,
    inputPricePerMillion: 0.01,
    outputPricePerMillion: 0.01,
    estimatedCostUsd: 0.00001,
    actualCostUsd: 0.00001,
    costDeltaUsd: 0,
    latencyMs: 1,
    timestamp: new Date("2026-08-30T12:00:00.000Z"),
    calculationStatus: "calculated"
  };
}

function shadowLogEntry(input: {
  id: string;
  executionId: string;
  matchesActualSelection: boolean;
}): ShadowRoutingEvaluationLogEntry {
  const actualSelection = {
    provider: "openai" as const,
    model: "cost-first-model",
    estimatedCostUsd: 0.000022,
    reason: "COST-FIRST selected openai/cost-first-model."
  };
  const shadowRecommendation = input.matchesActualSelection
    ? {
        provider: "openai" as const,
        model: "cost-first-model",
        reason: "Shadow matched COST-FIRST.",
        metricsUsed: metrics("openai")
      }
    : {
        provider: "anthropic" as const,
        model: "shadow-model",
        reason: "Shadow recommendation has stronger historical pass and success rates.",
        metricsUsed: metrics("anthropic")
      };

  return {
    id: input.id,
    executionId: input.executionId,
    timestamp: new Date("2026-08-30T12:00:00.000Z"),
    actualSelection,
    shadowRecommendation,
    matchesActualSelection: input.matchesActualSelection,
    differenceReason: input.matchesActualSelection
      ? undefined
      : "COST-FIRST selected openai/cost-first-model; shadow advisor recommended anthropic/shadow-model.",
    metricsUsed: shadowRecommendation.metricsUsed,
    dataQuality: "complete",
    advisorAuthority: "none"
  };
}

function metrics(provider: ProviderName): ShadowAdvisorMetricsUsed {
  return provider === "anthropic"
    ? {
        executionCount: 10,
        evaluationPassCount: 9,
        evaluationPassRate: 0.9,
        successCount: 9,
        successRate: 0.9,
        averageActualCostUsd: 0.00001,
        averageLatencyMs: 1,
        scorecardDataQuality: "complete"
      }
    : {
        executionCount: 10,
        evaluationPassCount: 6,
        evaluationPassRate: 0.6,
        successCount: 7,
        successRate: 0.7,
        averageActualCostUsd: 0.00001,
        averageLatencyMs: 1,
        scorecardDataQuality: "complete"
      };
}

class FakeProvider implements ProviderAdapter {
  readonly calls: ModelCallRequest[] = [];

  constructor(
    readonly provider: ProviderName,
    private readonly content: string
  ) {}

  async sendMessage(request: ModelCallRequest): Promise<ModelCallResult> {
    this.calls.push(request);

    return {
      content: this.content,
      provider: this.provider,
      model: request.model,
      inputTokens: 12,
      outputTokens: 8,
      estimatedCostUsd: null,
      latencyMs: 25
    };
  }
}

class FailingAuthorityDecisionAuditLog implements AuthorityDecisionAuditLog {
  async record(): Promise<AuthorityDecisionAuditLogEntry> {
    throw new Error("audit persistence unavailable");
  }

  async listEntries(): Promise<AuthorityDecisionAuditLogEntry[]> {
    return [];
  }

  async summarize() {
    return {
      totalDecisions: 0,
      allowedCount: 0,
      blockedCount: 0,
      allowedRate: 0,
      blockedRate: 0,
      blockedByReason: {}
    };
  }
}

async function stateFile(): Promise<{ stateFilePath: string; cleanup: () => Promise<void> }> {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-authority-runtime-"));

  return {
    stateFilePath: join(stateDir, "state.json"),
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}
