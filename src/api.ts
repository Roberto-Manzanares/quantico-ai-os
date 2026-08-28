import type {
  ApprovalCommand,
  ApprovalCommandResult,
  Execution,
  ExecutionRequest,
  ExecutionResultMetrics,
  ExecutionStatus
} from "./types.js";
import { createQuanticoSystem } from "./index.js";

export interface QuanticoApi {
  createExecution(request: ExecutionRequest): Promise<Execution>;
  getExecution(id: string): Promise<Execution | undefined>;
  getExecutionStatus(id: string): Promise<ExecutionStatus | undefined>;
  approvePendingStep(command: ApprovalCommand): Promise<ApprovalCommandResult>;
  rejectPendingStep(command: ApprovalCommand): Promise<ApprovalCommandResult>;
  getResultAndMetrics(id: string): Promise<ExecutionResultMetrics | undefined>;
}

export function createQuanticoApi(options: { stateFilePath?: string } = {}): QuanticoApi {
  const system = createQuanticoSystem(options);

  return {
    async createExecution(request: ExecutionRequest): Promise<Execution> {
      const result = await system.orchestrator.run(request);
      return result.execution;
    },
    async getExecution(id: string): Promise<Execution | undefined> {
      return system.stateMemory.getExecution(id);
    },
    async getExecutionStatus(id: string): Promise<ExecutionStatus | undefined> {
      const execution = await system.stateMemory.getExecution(id);
      return execution?.status;
    },
    async approvePendingStep(command: ApprovalCommand): Promise<ApprovalCommandResult> {
      return applyPendingStepDecision(command, "approved", system.stateMemory);
    },
    async rejectPendingStep(command: ApprovalCommand): Promise<ApprovalCommandResult> {
      return applyPendingStepDecision(command, "rejected", system.stateMemory);
    },
    async getResultAndMetrics(id: string): Promise<ExecutionResultMetrics | undefined> {
      const execution = await system.stateMemory.getExecution(id);

      if (!execution) {
        return undefined;
      }

      return {
        executionId: execution.id,
        status: execution.status,
        finalResult: execution.finalResult,
        metrics: execution.metrics
      };
    }
  };
}

async function applyPendingStepDecision(
  command: ApprovalCommand,
  decisionApplied: "approved" | "rejected",
  stateMemory: ReturnType<typeof createQuanticoSystem>["stateMemory"]
): Promise<ApprovalCommandResult> {
  const execution = await stateMemory.getExecution(command.executionId);

  if (!execution) {
    throw new Error(`Execution not found: ${command.executionId}`);
  }

  await stateMemory.appendEvent({
    id: `event_${Date.now().toString(36)}`,
    executionId: execution.id,
    type: "approval_decision",
    decisionApplied,
    payload: {
      reason: command.reason ?? "No reason provided."
    },
    createdAt: new Date()
  });

  return {
    executionId: execution.id,
    status: execution.status,
    decisionApplied,
    reason: "Approval command recorded; resume/cancel logic is not implemented in the skeleton."
  };
}
