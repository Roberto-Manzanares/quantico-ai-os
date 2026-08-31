import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createQuanticoApi,
  createQuanticoSystem,
  type ControlledExecutionProfile,
  type ModelCallRequest,
  type ModelCallResult,
  type ModelConfig,
  type ModelPricingTable,
  type ProviderAdapter
} from "../src/index.js";

const modelConfigs: ModelConfig[] = [
  {
    provider: "openai",
    model: "v018-openai-cheap",
    taskTypes: ["general", "generation"],
    capabilities: ["text_generation"],
    latencyClass: "low",
    priority: 1
  },
  {
    provider: "anthropic",
    model: "v018-anthropic-costly",
    taskTypes: ["general", "generation"],
    capabilities: ["text_generation"],
    latencyClass: "medium",
    priority: 2
  }
];

const pricingTable: ModelPricingTable = {
  openai: {
    "v018-openai-cheap": {
      inputUsdPerMillionTokens: 0.05,
      outputUsdPerMillionTokens: 0.4
    }
  },
  anthropic: {
    "v018-anthropic-costly": {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 5
    }
  }
};

test("V0.18 dry_run validates profile and estimates eligibility without provider calls", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("QUANTICO_V018_OK");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const result = await system.controlledOperationalExecution.runControlledExecution(
      profile({ mode: "dry_run" })
    );

    assert.equal(result.status, "dry_run_ready");
    assert.equal(result.profileValidationStatus, "profile_validated");
    assert.equal(result.provider, "openai");
    assert.equal(result.model, "v018-openai-cheap");
    assert.equal(openai.calls.length, 0);
    assert.equal((await system.stateMemory.listExecutions()).length, 0);
    assert.ok(result.dryRun);
    assert.equal(result.dryRun?.taskType, "general");
    assert.equal(typeof result.dryRun?.estimatedCostUsd, "number");
  } finally {
    await cleanup();
  }
});

test("V0.18 dry_run rejects invalid deterministic criteria before provider", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const result = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "dry_run",
        evaluationCriteria: [{ type: "requires_review", description: "semantic only" }]
      })
    );

    assert.equal(result.status, "profile_rejected");
    assert.equal(result.profileValidationStatus, "profile_rejected");
    assert.match(result.reason, /not deterministically verifiable/);
    assert.equal(openai.calls.length, 0);
    assert.equal((await system.stateMemory.listExecutions()).length, 0);
  } finally {
    await cleanup();
  }
});

test("V0.18 live rejects missing verifiable budget before provider", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const result = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "live",
        budgets: {
          maxCostUsd: undefined,
          maxOutputTokens: 32,
          maxTotalTokens: 500
        }
      })
    );

    assert.equal(result.status, "profile_rejected");
    assert.match(result.reason, /verifiable maxCostUsd/);
    assert.equal(openai.calls.length, 0);
    assert.equal((await system.stateMemory.listExecutions()).length, 0);
  } finally {
    await cleanup();
  }
});

test("V0.18 live delegates one execution to Kernel and returns post-audit", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("QUANTICO_V018_OK");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const result = await system.controlledOperationalExecution.runControlledExecution(
      profile({ mode: "live" })
    );

    assert.equal(result.status, "execution_completed");
    assert.equal(result.evaluationStatus, "pass");
    assert.equal(openai.calls.length, 1);
    assert.equal(result.provider, "openai");
    assert.equal(result.model, "v018-openai-cheap");
    assert.equal(result.postAudit?.timelineStatus, "found");
    assert.equal(result.postAudit?.auditSummaryStatus, "found");
    assert.equal(result.postAudit?.timelineDataQuality, "complete");
    assert.equal((await system.stateMemory.listExecutions()).length, 1);
    assert.equal((await system.stateMemory.listBudgetLedgerEntries(result.executionId)).length, 1);
  } finally {
    await cleanup();
  }
});

test("V0.18 live preserves Human Approval Gate and pauses before provider", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const result = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "live",
        constraints: {
          modelCallRiskLevel: "HIGH"
        }
      })
    );

    assert.equal(result.status, "execution_pending_approval");
    assert.equal(result.evaluationStatus, "needs_review");
    assert.equal(openai.calls.length, 0);
    assert.ok(result.executionId);
    assert.ok(await system.stateMemory.getPendingApprovalStep(result.executionId));
    assert.equal(result.postAudit?.auditSummaryStatus, "found");
    assert.equal(result.postAudit?.requiresAttention, true);
  } finally {
    await cleanup();
  }
});

test("V0.18 API exposes runControlledExecution", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const api = createQuanticoApi({ stateFilePath });

  try {
    const result = await api.runControlledExecution(profile({ mode: "dry_run" }));

    assert.equal(result.status, "dry_run_ready");
    assert.equal(result.profileValidationStatus, "profile_validated");
  } finally {
    await cleanup();
  }
});

function profile(
  overrides: Partial<ControlledExecutionProfile> = {}
): ControlledExecutionProfile {
  const budgets = {
    maxCostUsd: 0.001,
    maxInputTokens: 500,
    maxOutputTokens: 32,
    maxTotalTokens: 532,
    expectedOutputTokens: 32,
    ...overrides.budgets
  };
  const constraints = {
    ...overrides.constraints
  };
  const auditRequirements = {
    requireTimeline: true,
    requireAuditSummary: true,
    ...overrides.auditRequirements
  };

  return {
    profileId: "profile_v018",
    goal: "Return exactly QUANTICO_V018_OK",
    ...overrides,
    approvalPolicy: {
      ...overrides.approvalPolicy
    },
    auditRequirements,
    mode: overrides.mode ?? "dry_run",
    constraints,
    budgets,
    evaluationCriteria: overrides.evaluationCriteria ?? [
      { type: "contains_text", value: "QUANTICO_V018_OK" }
    ]
  };
}

class FakeProvider implements ProviderAdapter {
  readonly provider = "openai" as const;
  readonly calls: ModelCallRequest[] = [];

  constructor(private readonly content: string) {}

  async sendMessage(request: ModelCallRequest): Promise<ModelCallResult> {
    this.calls.push(request);

    return {
      content: this.content,
      provider: this.provider,
      model: request.model,
      inputTokens: 100,
      outputTokens: 20,
      estimatedCostUsd: null,
      latencyMs: 15
    };
  }
}

async function stateFile(): Promise<{ stateFilePath: string; cleanup: () => Promise<void> }> {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-controlled-execution-"));

  return {
    stateFilePath: join(stateDir, "state.json"),
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}
