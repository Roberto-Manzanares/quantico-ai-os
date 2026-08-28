import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createQuanticoApi,
  DeterministicHumanApprovalGate,
  FileStateMemory,
  type ActionDescriptor,
  type Execution
} from "../src/index.js";

const lowRiskAction: ActionDescriptor = {
  id: "read_context",
  name: "read_context",
  description: "Read local context",
  riskLevel: "LOW"
};

const mediumRiskAction: ActionDescriptor = {
  id: "write_summary",
  name: "write_summary",
  description: "Write summary",
  riskLevel: "MEDIUM"
};

const highRiskAction: ActionDescriptor = {
  id: "delete_file",
  name: "delete_file",
  description: "Delete a file",
  riskLevel: "HIGH"
};

test("LOW risk action produces allow", async () => {
  const gate = fixedGate();
  const result = await gate.evaluateAction({
    action: lowRiskAction,
    approvalPolicy: {}
  });

  assert.equal(result.status, "allow");
  assert.equal(result.riskLevel, "LOW");
  assert.equal(result.decisionApplied, "automatic");
  assert.match(result.reason, /LOW risk/);
});

test("HIGH risk action produces needs_approval and is persisted", async () => {
  const { stateMemory, cleanup } = await persistedState();
  await stateMemory.saveExecution(execution("exec_high"));
  const gate = fixedGate();

  const result = await gate.evaluateAction({
    executionId: "exec_high",
    action: highRiskAction,
    approvalPolicy: {},
    stateMemory,
    metadata: { step: "dangerous_step" }
  });

  const pendingStep = await stateMemory.getPendingApprovalStep("exec_high");
  const savedExecution = await stateMemory.getExecution("exec_high");

  assert.equal(result.status, "needs_approval");
  assert.equal(result.decisionApplied, "pending");
  assert.equal(pendingStep?.action.name, "delete_file");
  assert.equal(savedExecution?.status, "needs_human");

  await cleanup();
});

test("MEDIUM risk action respects approval_policy", async () => {
  const gate = fixedGate();
  const allowed = await gate.evaluateAction({
    action: mediumRiskAction,
    approvalPolicy: { mediumRiskRequiresApproval: false }
  });
  const pending = await gate.evaluateAction({
    action: mediumRiskAction,
    approvalPolicy: { mediumRiskRequiresApproval: true }
  });

  assert.equal(allowed.status, "allow");
  assert.equal(pending.status, "needs_approval");
});

test("sensitive action is not executable before approval", async () => {
  const { stateMemory, cleanup } = await persistedState();
  await stateMemory.saveExecution(execution("exec_pause"));
  const gate = fixedGate();

  const result = await gate.evaluateAction({
    executionId: "exec_pause",
    action: highRiskAction,
    approvalPolicy: {},
    stateMemory
  });

  assert.equal(result.status, "needs_approval");
  assert.equal(result.decisionApplied, "pending");
  assert.ok(await stateMemory.getPendingApprovalStep("exec_pause"));

  await cleanup();
});

test("approval persists and allows execution resume", async () => {
  const { stateMemory, cleanup } = await persistedState();
  await stateMemory.saveExecution(execution("exec_approve"));
  const gate = fixedGate();
  await gate.evaluateAction({
    executionId: "exec_approve",
    action: highRiskAction,
    approvalPolicy: {},
    stateMemory
  });

  const approval = await gate.approvePendingStep(
    { executionId: "exec_approve", reason: "Approved by test" },
    stateMemory
  );
  const events = await stateMemory.listEvents("exec_approve");
  const savedExecution = await stateMemory.getExecution("exec_approve");

  assert.equal(approval.decisionApplied, "approved");
  assert.equal(approval.status, "running");
  assert.equal(approval.pendingStep?.action.name, "delete_file");
  assert.equal(await stateMemory.getPendingApprovalStep("exec_approve"), undefined);
  assert.equal(savedExecution?.status, "running");
  assert.ok(events.some((event) => event.decisionApplied === "approved"));

  await cleanup();
});

test("rejection persists and blocks the action", async () => {
  const { stateMemory, cleanup } = await persistedState();
  await stateMemory.saveExecution(execution("exec_reject"));
  const gate = fixedGate();
  await gate.evaluateAction({
    executionId: "exec_reject",
    action: highRiskAction,
    approvalPolicy: {},
    stateMemory
  });

  const rejection = await gate.rejectPendingStep(
    { executionId: "exec_reject", reason: "Rejected by test" },
    stateMemory
  );
  const events = await stateMemory.listEvents("exec_reject");
  const savedExecution = await stateMemory.getExecution("exec_reject");

  assert.equal(rejection.status, "cancelled");
  assert.equal(rejection.decisionApplied, "rejected");
  assert.equal(await stateMemory.getPendingApprovalStep("exec_reject"), undefined);
  assert.equal(savedExecution?.status, "cancelled");
  assert.ok(events.some((event) => event.decisionApplied === "rejected"));

  await cleanup();
});

test("risk level, decision, reason, action, and timestamp are recorded", async () => {
  const { stateMemory, cleanup } = await persistedState();
  await stateMemory.saveExecution(execution("exec_record"));
  const gate = fixedGate();

  await gate.evaluateAction({
    executionId: "exec_record",
    action: highRiskAction,
    approvalPolicy: {},
    stateMemory,
    metadata: { step: "recorded_step" }
  });

  const events = await stateMemory.listEvents("exec_record");
  const event = events.find((item) => item.type === "approval_evaluated");

  assert.equal(event?.riskLevel, "HIGH");
  assert.equal(event?.decisionApplied, "pending");
  assert.equal((event?.payload.action as ActionDescriptor).name, "delete_file");
  assert.equal(typeof event?.payload.reason, "string");
  assert.ok(event?.createdAt instanceof Date);

  await cleanup();
});

test("Human Approval Gate behavior is deterministic with a fixed clock", async () => {
  const gate = fixedGate();
  const input = {
    action: mediumRiskAction,
    approvalPolicy: { mediumRiskRequiresApproval: true }
  };

  const first = await gate.evaluateAction(input);
  const second = await gate.evaluateAction(input);

  assert.deepEqual(first, second);
});

test("pending approval state survives FileStateMemory reload", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-approval-reload-"));
  const stateFilePath = join(stateDir, "state.json");
  const firstMemory = new FileStateMemory(stateFilePath);
  await firstMemory.saveExecution(execution("exec_reload"));
  const gate = fixedGate();

  await gate.evaluateAction({
    executionId: "exec_reload",
    action: highRiskAction,
    approvalPolicy: {},
    stateMemory: firstMemory
  });

  const secondMemory = new FileStateMemory(stateFilePath);
  const pendingStep = await secondMemory.getPendingApprovalStep("exec_reload");

  assert.equal(pendingStep?.executionId, "exec_reload");
  assert.equal(pendingStep?.action.name, "delete_file");
  assert.ok(pendingStep?.createdAt instanceof Date);

  await rm(stateDir, { recursive: true, force: true });
});

test("API approval methods operate on persisted pending steps", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-approval-api-"));
  const stateFilePath = join(stateDir, "state.json");
  const stateMemory = new FileStateMemory(stateFilePath);
  await stateMemory.saveExecution(execution("exec_api_approval"));
  const gate = fixedGate();
  await gate.evaluateAction({
    executionId: "exec_api_approval",
    action: highRiskAction,
    approvalPolicy: {},
    stateMemory
  });

  const api = createQuanticoApi({ stateFilePath });
  const approval = await api.approvePendingStep({
    executionId: "exec_api_approval",
    reason: "Approved through API"
  });
  const status = await api.getExecutionStatus("exec_api_approval");

  assert.equal(approval.decisionApplied, "approved");
  assert.equal(approval.pendingStep?.action.name, "delete_file");
  assert.equal(status, "running");

  await rm(stateDir, { recursive: true, force: true });
});

function fixedGate(): DeterministicHumanApprovalGate {
  return new DeterministicHumanApprovalGate(() => new Date("2026-01-01T00:00:00.000Z"));
}

async function persistedState(): Promise<{
  stateMemory: FileStateMemory;
  cleanup: () => Promise<void>;
}> {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-approval-"));
  const stateMemory = new FileStateMemory(join(stateDir, "state.json"));

  return {
    stateMemory,
    cleanup: () => rm(stateDir, { recursive: true, force: true })
  };
}

function execution(id: string): Execution {
  return {
    id,
    goal: "Run an approval test",
    taskType: "general",
    constraints: {},
    approvalPolicy: {},
    status: "created",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    metrics: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      latencyMs: 0
    }
  };
}
