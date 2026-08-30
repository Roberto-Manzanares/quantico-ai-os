import type {
  ApprovalCommand,
  ApprovalCommandResult,
  Execution,
  ExecutionRequest,
  ExecutionResultMetrics,
  ExecutionStatus,
  ProviderName,
  ProviderScorecardLookupResult,
  ProviderScorecardSummary
} from "./types.js";
import { createQuanticoSystem } from "./index.js";

export interface QuanticoApi {
  createExecution(request: ExecutionRequest): Promise<Execution>;
  getExecution(id: string): Promise<Execution | undefined>;
  getExecutionStatus(id: string): Promise<ExecutionStatus | undefined>;
  approvePendingStep(command: ApprovalCommand): Promise<ApprovalCommandResult>;
  rejectPendingStep(command: ApprovalCommand): Promise<ApprovalCommandResult>;
  getResultAndMetrics(id: string): Promise<ExecutionResultMetrics | undefined>;
  listProviderScorecards(): Promise<ProviderScorecardSummary>;
  getProviderScorecard(provider: ProviderName, model: string): Promise<ProviderScorecardLookupResult>;
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
      return system.humanApprovalGate.approvePendingStep(command, system.stateMemory);
    },
    async rejectPendingStep(command: ApprovalCommand): Promise<ApprovalCommandResult> {
      return system.humanApprovalGate.rejectPendingStep(command, system.stateMemory);
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
        evaluation: execution.evaluation,
        metrics: execution.metrics
      };
    },
    async listProviderScorecards(): Promise<ProviderScorecardSummary> {
      return system.providerScorecard.summarize();
    },
    async getProviderScorecard(
      provider: ProviderName,
      model: string
    ): Promise<ProviderScorecardLookupResult> {
      const summary = await system.providerScorecard.summarize();
      const key = `${provider}:${model}`;
      const scorecard = summary.byModel[key];

      if (!scorecard) {
        return {
          status: "not_found",
          provider,
          model,
          reason: `Provider scorecard not found for ${provider}/${model}.`
        };
      }

      return {
        status: "found",
        scorecard
      };
    }
  };
}
