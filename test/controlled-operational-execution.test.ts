import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createQuanticoApi,
  createQuanticoSystem,
  ControlledOperationalExecutionV018,
  FileStateMemory,
  type ControlledExecutionProfile,
  type ControlledExecutionRunManifestEvent,
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
    assert.ok(result.runId);
    assert.notEqual(result.runId, result.executionId);
    assert.equal(result.provider, "openai");
    assert.equal(result.model, "v018-openai-cheap");
    assert.equal(openai.calls.length, 0);
    assert.equal((await system.stateMemory.listExecutions()).length, 0);
    const manifestEvents = await system.stateMemory.listControlledExecutionRunManifestEvents(
      result.runId
    );
    assert.equal(result.manifestRecordingStatus, "manifest_recorded");
    assert.equal(manifestEvents.length, 2);
    assert.deepEqual(
      manifestEvents.map((event) => event.lifecycleStatus),
      ["run_created", "dry_run_ready"]
    );
    assert.equal(manifestEvents[1]?.executionId, undefined);
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
    assert.ok(result.runId);
    const manifestEvents = await system.stateMemory.listControlledExecutionRunManifestEvents(
      result.runId
    );
    assert.equal(manifestEvents.length, 2);
    assert.equal(manifestEvents[1]?.lifecycleStatus, "profile_rejected");
    assert.equal(manifestEvents[1]?.executionId, undefined);
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
    assert.equal(result.manifestRecordingStatus, "manifest_recorded");
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
    assert.ok(result.runId);
    assert.ok(result.executionId);
    assert.notEqual(result.runId, result.executionId);
    assert.equal(openai.calls.length, 1);
    assert.equal(result.provider, "openai");
    assert.equal(result.model, "v018-openai-cheap");
    assert.equal(result.postAudit?.timelineStatus, "found");
    assert.equal(result.postAudit?.auditSummaryStatus, "found");
    assert.equal(result.postAudit?.timelineDataQuality, "complete");
    assert.equal((await system.stateMemory.listExecutions()).length, 1);
    assert.equal((await system.stateMemory.listBudgetLedgerEntries(result.executionId)).length, 1);
    const manifestEvents = await system.stateMemory.listControlledExecutionRunManifestEvents(
      result.runId
    );
    assert.equal(manifestEvents.length, 2);
    assert.equal(manifestEvents[1]?.lifecycleStatus, "live_completed");
    assert.equal(manifestEvents[1]?.executionId, result.executionId);
    assert.equal(manifestEvents[1]?.references.timeline?.status, "found");
    assert.equal(manifestEvents[1]?.references.auditSummary?.status, "found");
    assert.equal(manifestEvents[1]?.references.budgetLedger?.entryCount, 1);
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
    const manifestEvents = await system.stateMemory.listControlledExecutionRunManifestEvents(
      result.runId
    );
    assert.equal(manifestEvents.length, 2);
    assert.equal(manifestEvents[1]?.lifecycleStatus, "live_pending_approval");
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
    assert.ok(result.runId);
  } finally {
    await cleanup();
  }
});

test("V0.19 reusing the same runId and profileFingerprint is idempotent", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("QUANTICO_V018_OK");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });
  const controlledProfile = profile({ mode: "live", runId: "run_v019_idempotent" });

  try {
    const first = await system.controlledOperationalExecution.runControlledExecution(
      controlledProfile
    );
    const second = await system.controlledOperationalExecution.runControlledExecution(
      controlledProfile
    );
    const manifestEvents = await system.stateMemory.listControlledExecutionRunManifestEvents(
      "run_v019_idempotent"
    );

    assert.equal(first.status, "execution_completed");
    assert.equal(second.status, "execution_completed");
    assert.equal(first.executionId, second.executionId);
    assert.equal(openai.calls.length, 1);
    assert.equal(manifestEvents.length, 2);
  } finally {
    await cleanup();
  }
});

test("V0.19 runId conflict with a different profileFingerprint fails closed", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("QUANTICO_V018_OK");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const first = await system.controlledOperationalExecution.runControlledExecution(
      profile({ mode: "dry_run", runId: "run_v019_conflict" })
    );
    const conflict = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "dry_run",
        runId: "run_v019_conflict",
        goal: "Return different safe text"
      })
    );
    const manifestEvents = await system.stateMemory.listControlledExecutionRunManifestEvents(
      "run_v019_conflict"
    );

    assert.equal(first.status, "dry_run_ready");
    assert.equal(conflict.status, "profile_rejected");
    assert.match(conflict.reason, /RunId conflict/);
    assert.equal(openai.calls.length, 0);
    assert.equal(manifestEvents.length, 3);
    assert.equal(manifestEvents[2]?.lifecycleStatus, "profile_rejected");
  } finally {
    await cleanup();
  }
});

test("V0.19 manifest history is append-only and persists through FileStateMemory", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai: new FakeProvider("QUANTICO_V018_OK") }
  });

  try {
    const result = await system.controlledOperationalExecution.runControlledExecution(
      profile({ mode: "dry_run", runId: "run_v019_persisted" })
    );
    const reloadedMemory = new FileStateMemory(stateFilePath);
    const manifestEvents = await reloadedMemory.listControlledExecutionRunManifestEvents(
      result.runId
    );

    assert.equal(manifestEvents.length, 2);
    assert.deepEqual(
      manifestEvents.map((event) => event.sequence),
      [0, 1]
    );
    assert.deepEqual(
      manifestEvents.map((event) => event.lifecycleStatus),
      ["run_created", "dry_run_ready"]
    );
  } finally {
    await cleanup();
  }
});

test("V0.19 pre-provider manifest persistence failure stops before provider", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });
  const failingMemory = new FailingManifestStateMemory(stateFilePath, "always");
  const controlled = new ControlledOperationalExecutionV018({
    stateMemory: failingMemory,
    contextCompiler: system.contextCompiler,
    modelRouter: system.modelRouter,
    tokenGovernor: system.tokenGovernor,
    orchestrator: system.orchestrator,
    executionAuditTimeline: system.executionAuditTimeline,
    executionAuditIndex: system.executionAuditIndex,
    humanApprovalGate: system.humanApprovalGate
  });

  try {
    const result = await controlled.runControlledExecution(
      profile({ mode: "live", runId: "run_v019_pre_provider_failure" })
    );

    assert.equal(result.status, "profile_rejected");
    assert.equal(result.manifestRecordingStatus, "manifest_record_failed");
    assert.equal(openai.calls.length, 0);
  } finally {
    await cleanup();
  }
});

test("V0.19 post-provider manifest failure does not retry provider call", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("QUANTICO_V018_OK");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });
  const failingMemory = new FailingManifestStateMemory(stateFilePath, "after-run-created");
  const controlled = new ControlledOperationalExecutionV018({
    stateMemory: failingMemory,
    contextCompiler: system.contextCompiler,
    modelRouter: system.modelRouter,
    tokenGovernor: system.tokenGovernor,
    orchestrator: system.orchestrator,
    executionAuditTimeline: system.executionAuditTimeline,
    executionAuditIndex: system.executionAuditIndex,
    humanApprovalGate: system.humanApprovalGate
  });

  try {
    const result = await controlled.runControlledExecution(
      profile({ mode: "live", runId: "run_v019_post_provider_failure" })
    );

    assert.equal(result.status, "execution_completed");
    assert.equal(result.manifestRecordingStatus, "manifest_record_failed");
    assert.equal(openai.calls.length, 1);
    assert.equal((await system.stateMemory.listExecutions()).length, 1);
  } finally {
    await cleanup();
  }
});

test("V0.19 approval resume keeps runId, executionId, and effectiveSelection without rerun", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called before approval");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });
  const controlledProfile = profile({
    mode: "live",
    runId: "run_v019_approval_resume",
    constraints: {
      modelCallRiskLevel: "HIGH"
    }
  });

  try {
    const pending = await system.controlledOperationalExecution.runControlledExecution(
      controlledProfile
    );
    assert.ok(pending.executionId);
    const pendingStep = await system.stateMemory.getPendingApprovalStep(pending.executionId);
    const effectiveSelection = pendingStep?.metadata["effectiveSelection"];

    await system.humanApprovalGate.approvePendingStep(
      { executionId: pending.executionId ?? "", reason: "approved for V0.19 dry-run test" },
      system.stateMemory
    );
    const replay = await system.controlledOperationalExecution.runControlledExecution(
      controlledProfile
    );
    const manifestEvents = await system.stateMemory.listControlledExecutionRunManifestEvents(
      "run_v019_approval_resume"
    );

    assert.equal(pending.status, "execution_pending_approval");
    assert.equal(replay.status, "execution_pending_approval");
    assert.equal(replay.runId, pending.runId);
    assert.equal(replay.executionId, pending.executionId);
    assert.deepEqual(effectiveSelection, pendingStep?.metadata["effectiveSelection"]);
    assert.equal(openai.calls.length, 0);
    assert.equal(manifestEvents.length, 2);
  } finally {
    await cleanup();
  }
});

test("V0.19 manifest sanitizes profile data and does not persist prompts or secrets", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai: new FakeProvider("QUANTICO_V018_OK") }
  });

  try {
    const result = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "dry_run",
        runId: "run_v019_sanitize",
        goal: "Return QUANTICO_V018_OK without leaking sk-secret-value",
        constraints: {
          ...profile().constraints,
          // @ts-expect-error deliberately verifies unknown sensitive fields are not persisted as values
          apiKey: "sk-secret-value"
        }
      })
    );
    const manifestEvents = await system.stateMemory.listControlledExecutionRunManifestEvents(
      result.runId
    );
    const serialized = JSON.stringify(manifestEvents);

    assert.equal(result.status, "dry_run_ready");
    assert.doesNotMatch(serialized, /sk-secret-value/);
    assert.doesNotMatch(serialized, /Return QUANTICO_V018_OK without leaking/);
    assert.match(serialized, /goalDigest/);
    assert.match(serialized, /\[redacted\]/);
  } finally {
    await cleanup();
  }
});

test("V0.20 getControlledRunStatus returns found and not_found from manifest evidence", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai: new FakeProvider("QUANTICO_V018_OK") }
  });

  try {
    const run = await system.controlledOperationalExecution.runControlledExecution(
      profile({ mode: "dry_run", runId: "run_v020_status" })
    );
    const found = await system.controlledOperationalExecution.getControlledRunStatus(run.runId ?? "");
    const missing = await system.controlledOperationalExecution.getControlledRunStatus("run_v020_missing");

    assert.equal(found.status, "found");
    assert.equal(found.status === "found" ? found.lifecycleStatus : undefined, "dry_run_ready");
    assert.equal(found.status === "found" ? found.approvalResolutionEligible : undefined, false);
    assert.equal(missing.status, "not_found");
    assert.match(missing.reason, /not found/);
  } finally {
    await cleanup();
  }
});

test("V0.20 approval resolution approves pending step without continuing provider call", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called before approval");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const pending = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "live",
        runId: "run_v020_approve",
        constraints: { modelCallRiskLevel: "HIGH" }
      })
    );
    assert.ok(pending.executionId);
    const beforeStatus = await system.controlledOperationalExecution.getControlledRunStatus(pending.runId ?? "");
    assert.equal(beforeStatus.status, "found");
    assert.equal(beforeStatus.status === "found" ? beforeStatus.approvalResolutionEligible : undefined, true);
    const effectiveSelection = beforeStatus.status === "found" ? beforeStatus.effectiveSelection : undefined;

    const approved = await system.controlledOperationalExecution.resolveControlledRunApproval(
      pending.runId ?? "",
      { decision: "approved", reason: "approved for V0.20 approval resolution" }
    );
    const execution = await system.stateMemory.getExecution(pending.executionId);
    const manifestEvents = await system.stateMemory.listControlledExecutionRunManifestEvents(pending.runId);

    assert.equal(approved.status, "approved");
    assert.equal(approved.runId, pending.runId);
    assert.equal(approved.executionId, pending.executionId);
    assert.deepEqual(approved.status === "approved" ? approved.effectiveSelection : undefined, effectiveSelection);
    assert.equal(execution?.status, "running");
    assert.equal(await system.stateMemory.getPendingApprovalStep(pending.executionId), undefined);
    assert.equal(openai.calls.length, 0);
    assert.equal(manifestEvents.length, 2);
  } finally {
    await cleanup();
  }
});

test("V0.20 approval resolution rejects pending action with zero provider calls", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const pending = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "live",
        runId: "run_v020_reject",
        constraints: { modelCallRiskLevel: "HIGH" }
      })
    );
    assert.ok(pending.executionId);

    const rejected = await system.controlledOperationalExecution.resolveControlledRunApproval(
      pending.runId ?? "",
      { decision: "rejected", reason: "blocked for V0.20 test" }
    );
    const execution = await system.stateMemory.getExecution(pending.executionId);

    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.runId, pending.runId);
    assert.equal(rejected.executionId, pending.executionId);
    assert.equal(execution?.status, "cancelled");
    assert.equal(await system.stateMemory.getPendingApprovalStep(pending.executionId), undefined);
    assert.equal(openai.calls.length, 0);
  } finally {
    await cleanup();
  }
});

test("V0.20 states without pending approval fail closed without provider calls", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const dryRun = await system.controlledOperationalExecution.runControlledExecution(
      profile({ mode: "dry_run", runId: "run_v020_not_resolvable" })
    );
    const resolution = await system.controlledOperationalExecution.resolveControlledRunApproval(
      dryRun.runId ?? "",
      { decision: "approved" }
    );

    assert.equal(resolution.status, "not_resolvable");
    assert.equal(openai.calls.length, 0);
  } finally {
    await cleanup();
  }
});

test("V0.20 missing pending approval fails closed even when manifest is pending", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const pending = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "live",
        runId: "run_v020_missing_pending",
        constraints: { modelCallRiskLevel: "HIGH" }
      })
    );
    assert.ok(pending.executionId);
    await system.stateMemory.clearPendingApprovalStep(pending.executionId);

    const status = await system.controlledOperationalExecution.getControlledRunStatus(pending.runId ?? "");
    const resolution = await system.controlledOperationalExecution.resolveControlledRunApproval(
      pending.runId ?? "",
      { decision: "approved" }
    );

    assert.equal(status.status, "found");
    assert.equal(status.status === "found" ? status.approvalResolutionEligible : undefined, false);
    assert.equal(status.status === "found" ? status.dataQuality : undefined, "inconsistent");
    assert.equal(resolution.status, "not_resolvable");
    assert.equal(openai.calls.length, 0);
  } finally {
    await cleanup();
  }
});

test("V0.20 API exposes controlled run status and approval resolution", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const api = createQuanticoApi({ stateFilePath });

  try {
    const run = await api.runControlledExecution(profile({ mode: "dry_run", runId: "run_v020_api" }));
    const status = await api.getControlledRunStatus(run.runId ?? "");
    const resolution = await api.resolveControlledRunApproval(run.runId ?? "", { decision: "approved" });

    assert.equal(status.status, "found");
    assert.equal(resolution.status, "not_resolvable");
  } finally {
    await cleanup();
  }
});

test("V0.21 continues an approved execution without rerouting or creating a new Execution", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("QUANTICO_V018_OK");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const pending = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "live",
        runId: "run_v021_continue",
        constraints: { modelCallRiskLevel: "HIGH" }
      })
    );
    const beforeApproval = await system.controlledOperationalExecution.getControlledRunStatus(
      pending.runId ?? ""
    );
    const expectedSelection =
      beforeApproval.status === "found" ? beforeApproval.effectiveSelection : undefined;

    await system.controlledOperationalExecution.resolveControlledRunApproval(pending.runId ?? "", {
      decision: "approved",
      reason: "approved for V0.21 continuation"
    });
    const continued = await system.controlledOperationalExecution.continueApprovedExecution(
      pending.runId ?? ""
    );
    const executions = await system.stateMemory.listExecutions();
    const ledgerEntries = await system.stateMemory.listBudgetLedgerEntries(pending.executionId);
    const manifestEvents = await system.stateMemory.listControlledExecutionRunManifestEvents(
      pending.runId
    );

    assert.equal(continued.status, "continued");
    assert.equal(continued.status === "continued" ? continued.runId : undefined, pending.runId);
    assert.equal(continued.status === "continued" ? continued.executionId : undefined, pending.executionId);
    assert.deepEqual(
      continued.status === "continued" ? continued.effectiveSelection : undefined,
      expectedSelection
    );
    assert.equal((await system.stateMemory.getExecution(pending.executionId ?? ""))?.status, "succeeded");
    assert.equal(openai.calls.length, 1);
    assert.equal(executions.length, 1);
    assert.equal(ledgerEntries.length, 1);
    assert.equal(manifestEvents.length, 3);
    assert.deepEqual(
      manifestEvents.map((event) => event.lifecycleStatus),
      ["run_created", "live_pending_approval", "live_completed"]
    );
  } finally {
    await cleanup();
  }
});

test("V0.21 continueApprovedExecution returns not_found without provider calls", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const result = await system.controlledOperationalExecution.continueApprovedExecution(
      "run_v021_missing"
    );

    assert.equal(result.status, "not_found");
    assert.equal(openai.calls.length, 0);
  } finally {
    await cleanup();
  }
});

test("V0.21 unresolved approval is not continuable and does not call provider", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const pending = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "live",
        runId: "run_v021_unresolved",
        constraints: { modelCallRiskLevel: "HIGH" }
      })
    );
    const result = await system.controlledOperationalExecution.continueApprovedExecution(
      pending.runId ?? ""
    );

    assert.equal(result.status, "not_continuable");
    assert.match(result.reason, /active pending approval/);
    assert.equal(openai.calls.length, 0);
  } finally {
    await cleanup();
  }
});

test("V0.21 pending approval evidence must be resolved as approved", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const pending = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "live",
        runId: "run_v021_missing_approval_resolution",
        constraints: { modelCallRiskLevel: "HIGH" }
      })
    );
    await system.stateMemory.clearPendingApprovalStep(pending.executionId ?? "");
    const result = await system.controlledOperationalExecution.continueApprovedExecution(
      pending.runId ?? ""
    );

    assert.equal(result.status, "not_continuable");
    assert.match(result.reason, /no approved V0\.20 approval resolution/);
    assert.equal(openai.calls.length, 0);
  } finally {
    await cleanup();
  }
});

test("V0.21 missing effectiveSelection fails closed before provider", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const stateMemory = new MissingEffectiveSelectionStateMemory(stateFilePath);
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });
  const controlled = new ControlledOperationalExecutionV018({
    stateMemory,
    contextCompiler: system.contextCompiler,
    modelRouter: system.modelRouter,
    tokenGovernor: system.tokenGovernor,
    orchestrator: system.orchestrator,
    executionAuditTimeline: system.executionAuditTimeline,
    executionAuditIndex: system.executionAuditIndex,
    humanApprovalGate: system.humanApprovalGate
  });

  try {
    const pending = await controlled.runControlledExecution(
      profile({
        mode: "live",
        runId: "run_v021_no_selection",
        constraints: { modelCallRiskLevel: "HIGH" }
      })
    );
    await controlled.resolveControlledRunApproval(pending.runId ?? "", { decision: "approved" });
    const result = await controlled.continueApprovedExecution(pending.runId ?? "");

    assert.equal(result.status, "not_continuable");
    assert.match(result.reason, /no recoverable effectiveSelection/);
    assert.equal(openai.calls.length, 0);
  } finally {
    await cleanup();
  }
});

test("V0.21 prior provider call evidence blocks continuation before another call", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("should not be called");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const pending = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "live",
        runId: "run_v021_prior_provider_call",
        constraints: { modelCallRiskLevel: "HIGH" }
      })
    );
    await system.controlledOperationalExecution.resolveControlledRunApproval(pending.runId ?? "", {
      decision: "approved"
    });
    await system.stateMemory.appendEvent({
      id: "event_v021_prior_model_called",
      executionId: pending.executionId ?? "",
      type: "model_called",
      payload: { provider: "openai", model: "v018-openai-cheap" },
      createdAt: new Date()
    });
    const result = await system.controlledOperationalExecution.continueApprovedExecution(
      pending.runId ?? ""
    );

    assert.equal(result.status, "not_continuable");
    assert.match(result.reason, /already has provider call evidence/);
    assert.equal(openai.calls.length, 0);
  } finally {
    await cleanup();
  }
});

test("V0.21 continuation is idempotent after completion and does not duplicate provider, ledger, or manifest", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const openai = new FakeProvider("QUANTICO_V018_OK");
  const system = createQuanticoSystem({
    stateFilePath,
    modelConfigs,
    pricingTable,
    providers: { openai }
  });

  try {
    const pending = await system.controlledOperationalExecution.runControlledExecution(
      profile({
        mode: "live",
        runId: "run_v021_idempotent",
        constraints: { modelCallRiskLevel: "HIGH" }
      })
    );
    await system.controlledOperationalExecution.resolveControlledRunApproval(pending.runId ?? "", {
      decision: "approved"
    });
    const first = await system.controlledOperationalExecution.continueApprovedExecution(
      pending.runId ?? ""
    );
    const second = await system.controlledOperationalExecution.continueApprovedExecution(
      pending.runId ?? ""
    );
    const ledgerEntries = await system.stateMemory.listBudgetLedgerEntries(pending.executionId);
    const manifestEvents = await system.stateMemory.listControlledExecutionRunManifestEvents(
      pending.runId
    );

    assert.equal(first.status, "continued");
    assert.equal(second.status, "continued");
    assert.equal(openai.calls.length, 1);
    assert.equal(ledgerEntries.length, 1);
    assert.equal(manifestEvents.length, 3);
  } finally {
    await cleanup();
  }
});

test("V0.21 API exposes approved execution continuation", async () => {
  const { stateFilePath, cleanup } = await stateFile();
  const api = createQuanticoApi({ stateFilePath });

  try {
    const result = await api.continueApprovedExecution("run_v021_api_missing");

    assert.equal(result.status, "not_found");
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

class FailingManifestStateMemory extends FileStateMemory {
  private saveAttempts = 0;

  constructor(
    filePath: string,
    private readonly mode: "always" | "after-run-created"
  ) {
    super(filePath);
  }

  override async saveControlledExecutionRunManifestEvent(
    event: ControlledExecutionRunManifestEvent
  ): Promise<void> {
    this.saveAttempts += 1;

    if (this.mode === "always" || this.saveAttempts > 1) {
      throw new Error("manifest persistence unavailable");
    }

    await super.saveControlledExecutionRunManifestEvent(event);
  }
}

class MissingEffectiveSelectionStateMemory extends FileStateMemory {
  override async listEvents(executionId: string) {
    const events = await super.listEvents(executionId);

    return events.filter(
      (event) =>
        event.type !== "effective_selection_determined" &&
        event.type !== "approval_evaluated"
    );
  }
}

async function stateFile(): Promise<{ stateFilePath: string; cleanup: () => Promise<void> }> {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-controlled-execution-"));

  return {
    stateFilePath: join(stateDir, "state.json"),
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}
