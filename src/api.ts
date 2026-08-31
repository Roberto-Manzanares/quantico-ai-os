import type {
  ApprovalCommand,
  ApprovalCommandResult,
  AuthorityRuntimeSafetyDataQuality,
  AuthorityRuntimeSafetyMetricsExecutionReadResult,
  AuthorityRuntimeSafetyMetricsReadResult,
  AuthorityRuntimeOutcomeComparison,
  Execution,
  ExecutionAuditTimelineReadResult,
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
  getAuthorityRuntimeSafetyMetrics(): Promise<AuthorityRuntimeSafetyMetricsReadResult>;
  getAuthorityRuntimeSafetyMetricsForExecution(
    executionId: string
  ): Promise<AuthorityRuntimeSafetyMetricsExecutionReadResult>;
  getExecutionAuditTimeline(executionId: string): Promise<ExecutionAuditTimelineReadResult>;
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
    },
    async getAuthorityRuntimeSafetyMetrics(): Promise<AuthorityRuntimeSafetyMetricsReadResult> {
      const report = await system.authorityRuntimeSafetyMetrics.generate();

      return {
        status: "found",
        report,
        reason: `Authority runtime safety metrics report generated with ${report.dataQuality} dataQuality.`
      };
    },
    async getAuthorityRuntimeSafetyMetricsForExecution(
      executionId: string
    ): Promise<AuthorityRuntimeSafetyMetricsExecutionReadResult> {
      const auditEntries = await system.stateMemory.listAuthorityDecisionAuditEntries(executionId);

      if (auditEntries.length === 0) {
        return {
          status: "not_found",
          executionId,
          reason: `Authority runtime safety metrics not found for ${executionId}: no authority evidence is persisted for this execution.`
        };
      }

      const report = await system.authorityRuntimeSafetyMetrics.generate();
      const outcomeComparisons = report.outcomeComparisons.filter(
        (comparison) => comparison.executionId === executionId
      );
      const dataQuality = dataQualityForExecution(report.dataQuality, outcomeComparisons);

      return {
        status: "found",
        executionId,
        report,
        outcomeComparisons,
        dataQuality,
        reason: reasonForExecutionRead(executionId, dataQuality, outcomeComparisons)
      };
    },
    async getExecutionAuditTimeline(executionId: string): Promise<ExecutionAuditTimelineReadResult> {
      return system.executionAuditTimeline.getExecutionAuditTimeline(executionId);
    }
  };
}

function dataQualityForExecution(
  reportDataQuality: AuthorityRuntimeSafetyDataQuality,
  outcomeComparisons: AuthorityRuntimeOutcomeComparison[]
): AuthorityRuntimeSafetyDataQuality {
  if (
    Array.isArray(outcomeComparisons) &&
    outcomeComparisons.some((comparison) => comparison.comparisonStatus === "insufficient_data")
  ) {
    return "partial";
  }

  return reportDataQuality === "insufficient" ? "partial" : reportDataQuality;
}

function reasonForExecutionRead(
  executionId: string,
  dataQuality: AuthorityRuntimeSafetyDataQuality,
  outcomeComparisons: AuthorityRuntimeOutcomeComparison[]
): string {
  const hasInsufficientData =
    Array.isArray(outcomeComparisons) &&
    outcomeComparisons.some((comparison) => comparison.comparisonStatus === "insufficient_data");

  if (hasInsufficientData) {
    return `Authority runtime safety metrics found for ${executionId} with ${dataQuality} dataQuality and insufficient_data outcome evidence.`;
  }

  return `Authority runtime safety metrics found for ${executionId} with ${dataQuality} dataQuality.`;
}
