import type {
  ActionDescriptor,
  ApprovalCommand,
  ApprovalCommandResult,
  ApprovalPolicy,
  ApprovalResult,
  ExecutionStatus,
  PendingApprovalStep
} from "../types.js";
import type { StateMemory } from "./state-memory.js";

export interface HumanApprovalGateInput {
  executionId?: string;
  action: ActionDescriptor;
  approvalPolicy: ApprovalPolicy;
  stateMemory?: StateMemory;
  metadata?: Record<string, unknown>;
}

export interface HumanApprovalGate {
  evaluateAction(input: HumanApprovalGateInput): Promise<ApprovalResult>;
  approvePendingStep(command: ApprovalCommand, stateMemory: StateMemory): Promise<ApprovalCommandResult>;
  rejectPendingStep(command: ApprovalCommand, stateMemory: StateMemory): Promise<ApprovalCommandResult>;
}

export class DeterministicHumanApprovalGate implements HumanApprovalGate {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async evaluateAction(input: HumanApprovalGateInput): Promise<ApprovalResult> {
    const { action, approvalPolicy } = input;
    const createdAt = this.now();

    if (action.riskLevel === "LOW") {
      return this.recordAndReturn(input, {
        status: "allow",
        decisionApplied: "automatic",
        reason: "LOW risk actions run automatically.",
        createdAt
      });
    }

    if (action.riskLevel === "MEDIUM" && !approvalPolicy.mediumRiskRequiresApproval) {
      return this.recordAndReturn(input, {
        status: "allow",
        decisionApplied: "automatic",
        reason: "MEDIUM risk action allowed by approval policy.",
        createdAt
      });
    }

    const reason =
      action.riskLevel === "HIGH"
        ? "HIGH risk actions require mandatory human approval."
        : "MEDIUM risk action requires approval by approval policy.";

    return this.createPendingApproval(input, reason, createdAt);
  }

  async approvePendingStep(
    command: ApprovalCommand,
    stateMemory: StateMemory
  ): Promise<ApprovalCommandResult> {
    const pendingStep = await requirePendingStep(command.executionId, stateMemory);

    await stateMemory.appendEvent({
      id: createEventId("approval_approved", this.now()),
      executionId: command.executionId,
      type: "approval_decision",
      riskLevel: pendingStep.riskLevel,
      decisionApplied: "approved",
      payload: {
        action: pendingStep.action,
        pendingStepId: pendingStep.id,
        reason: command.reason ?? "No reason provided."
      },
      createdAt: this.now()
    });
    await stateMemory.clearPendingApprovalStep(command.executionId);
    await updateExecutionStatus(command.executionId, "running", stateMemory);

    return {
      executionId: command.executionId,
      status: "running",
      decisionApplied: "approved",
      reason: "Pending step approved and recovered for execution resume.",
      pendingStep
    };
  }

  async rejectPendingStep(
    command: ApprovalCommand,
    stateMemory: StateMemory
  ): Promise<ApprovalCommandResult> {
    const pendingStep = await requirePendingStep(command.executionId, stateMemory);

    await stateMemory.appendEvent({
      id: createEventId("approval_rejected", this.now()),
      executionId: command.executionId,
      type: "approval_decision",
      riskLevel: pendingStep.riskLevel,
      decisionApplied: "rejected",
      payload: {
        action: pendingStep.action,
        pendingStepId: pendingStep.id,
        reason: command.reason ?? "No reason provided."
      },
      createdAt: this.now()
    });
    await stateMemory.clearPendingApprovalStep(command.executionId);
    await updateExecutionStatus(command.executionId, "cancelled", stateMemory);

    return {
      executionId: command.executionId,
      status: "cancelled",
      decisionApplied: "rejected",
      reason: "Pending step rejected; action remains blocked.",
      pendingStep
    };
  }

  private async recordAndReturn(
    input: HumanApprovalGateInput,
    decision: {
      status: "allow";
      decisionApplied: "automatic";
      reason: string;
      createdAt: Date;
    }
  ): Promise<ApprovalResult> {
    const result = toApprovalResult(input, decision);
    await appendEvaluationEvent(input, result);
    return result;
  }

  private async createPendingApproval(
    input: HumanApprovalGateInput,
    reason: string,
    createdAt: Date
  ): Promise<ApprovalResult> {
    const result = toApprovalResult(input, {
      status: "needs_approval",
      decisionApplied: "pending",
      reason,
      createdAt
    });

    if (input.executionId && input.stateMemory) {
      const pendingStep: PendingApprovalStep = {
        id: createPendingStepId(input.executionId, input.action),
        executionId: input.executionId,
        action: input.action,
        riskLevel: input.action.riskLevel,
        reason,
        createdAt,
        metadata: input.metadata ?? {}
      };

      await input.stateMemory.savePendingApprovalStep(pendingStep);
      await updateExecutionStatus(input.executionId, "needs_human", input.stateMemory);
    }

    await appendEvaluationEvent(input, result);
    return { ...result, pendingStepId: input.executionId ? createPendingStepId(input.executionId, input.action) : undefined };
  }
}

export { DeterministicHumanApprovalGate as SkeletonHumanApprovalGate };

function toApprovalResult(
  input: HumanApprovalGateInput,
  decision: {
    status: ApprovalResult["status"];
    decisionApplied: ApprovalResult["decisionApplied"];
    reason: string;
    createdAt: Date;
  }
): ApprovalResult {
  return {
    status: decision.status,
    executionId: input.executionId,
    pendingStepId:
      decision.status === "needs_approval" && input.executionId
        ? createPendingStepId(input.executionId, input.action)
        : undefined,
    action: input.action,
    riskLevel: input.action.riskLevel,
    decisionApplied: decision.decisionApplied,
    reason: decision.reason,
    createdAt: decision.createdAt,
    metadata: input.metadata ?? {}
  };
}

async function appendEvaluationEvent(
  input: HumanApprovalGateInput,
  result: ApprovalResult
): Promise<void> {
  if (!input.executionId || !input.stateMemory) {
    return;
  }

  await input.stateMemory.appendEvent({
    id: createEventId("approval_evaluated", result.createdAt),
    executionId: input.executionId,
    type: "approval_evaluated",
    riskLevel: result.riskLevel,
    decisionApplied: result.decisionApplied,
    payload: {
      status: result.status,
      action: result.action,
      pendingStepId: result.pendingStepId,
      reason: result.reason,
      metadata: result.metadata
    },
    createdAt: result.createdAt
  });
}

async function requirePendingStep(
  executionId: string,
  stateMemory: StateMemory
): Promise<PendingApprovalStep> {
  const pendingStep = await stateMemory.getPendingApprovalStep(executionId);

  if (!pendingStep) {
    throw new Error(`Pending approval step not found for execution: ${executionId}`);
  }

  return pendingStep;
}

async function updateExecutionStatus(
  executionId: string,
  status: ExecutionStatus,
  stateMemory: StateMemory
): Promise<void> {
  const execution = await stateMemory.getExecution(executionId);

  if (!execution) {
    return;
  }

  execution.status = status;
  execution.updatedAt = new Date();
  await stateMemory.saveExecution(execution);
}

function createPendingStepId(executionId: string, action: ActionDescriptor): string {
  return `${executionId}:${action.id ?? action.name}`;
}

function createEventId(prefix: string, createdAt: Date): string {
  return `${prefix}_${createdAt.getTime().toString(36)}`;
}
