import type {
  Execution,
  ExecutionAuditSummary,
  ExecutionAuditSummaryListResult,
  ExecutionAuditSummaryOptions,
  ExecutionAuditSummaryReadResult,
  ExecutionAuditTimelineDataQuality,
  ExecutionAuditTimelineReadResult,
  ExecutionAuditTimelineSource
} from "../types.js";
import { ExecutionAuditTimelineV016 } from "./execution-audit-timeline.js";
import type { StateMemory } from "./state-memory.js";

export class ExecutionAuditIndexV017 {
  private readonly timeline: ExecutionAuditTimelineV016;

  constructor(private readonly stateMemory: StateMemory, timeline?: ExecutionAuditTimelineV016) {
    this.timeline = timeline ?? new ExecutionAuditTimelineV016(stateMemory);
  }

  async listExecutionAuditSummaries(
    options: ExecutionAuditSummaryOptions = {}
  ): Promise<ExecutionAuditSummaryListResult> {
    const executions = await this.stateMemory.listExecutions();
    const summaries = await Promise.all(
      executions.map((execution) => this.summaryFromExecution(execution))
    );
    const filtered = applyFilters(summaries, options);
    const ordered = orderSummaries(filtered);
    const limited = applyLimit(ordered, options.limit);
    const dataQuality = indexDataQuality(limited);

    return {
      status: "found",
      summaries: limited,
      totalExecutions: limited.length,
      filtersApplied: normalizeFilters(options),
      dataQuality,
      reason: listReason(limited.length, dataQuality, options)
    };
  }

  async getExecutionAuditSummary(
    executionId: string
  ): Promise<ExecutionAuditSummaryReadResult> {
    const execution = await this.stateMemory.getExecution(executionId);

    if (!execution) {
      return {
        status: "not_found",
        executionId,
        reason: `Execution audit summary not found for ${executionId}: execution is not persisted.`
      };
    }

    const summary = await this.summaryFromExecution(execution);

    return {
      status: "found",
      executionId,
      summary,
      reason: `Execution audit summary found for ${executionId} with ${summary.timelineDataQuality} timelineDataQuality.`
    };
  }

  private async summaryFromExecution(execution: Execution): Promise<ExecutionAuditSummary> {
    const timelineResult = await this.timeline.getExecutionAuditTimeline(execution.id);

    if (timelineResult.status === "not_found") {
      return {
        executionId: execution.id,
        projectId: execution.projectId,
        executionStatus: execution.status,
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
        timelineDataQuality: "partial",
        timelineItemCount: 0,
        sourcesPresent: [],
        hasAuthorityAudit: false,
        hasBudgetLedger: false,
        hasEvaluation: false,
        hasApproval: false,
        hasInconsistency: false,
        requiresAttention: true,
        attentionReasons: [
          "Execution is persisted but V0.16 timeline could not be built from persisted evidence."
        ]
      };
    }

    return buildSummary(execution, timelineResult);
  }
}

export { ExecutionAuditIndexV017 as SkeletonExecutionAuditIndex };

function buildSummary(
  execution: Execution,
  timelineResult: Extract<ExecutionAuditTimelineReadResult, { status: "found" }>
): ExecutionAuditSummary {
  const sourcesPresent = uniqueSources(timelineResult.timeline.map((item) => item.source));
  const hasAuthorityAudit = sourcesPresent.includes("authority_audit");
  const hasBudgetLedger = sourcesPresent.includes("budget_ledger");
  const hasEvaluation = timelineResult.timeline.some(
    (item) => item.source === "evaluation" || item.type === "evaluation"
  );
  const hasApproval = sourcesPresent.includes("approval");
  const hasInconsistency = timelineResult.dataQuality === "inconsistent";
  const attentionReasons = attentionReasonsFor(
    execution.status,
    timelineResult.dataQuality
  );

  return {
    executionId: execution.id,
    projectId: execution.projectId,
    executionStatus: execution.status,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
    timelineDataQuality: timelineResult.dataQuality,
    timelineItemCount: timelineResult.timeline.length,
    sourcesPresent,
    hasAuthorityAudit,
    hasBudgetLedger,
    hasEvaluation,
    hasApproval,
    hasInconsistency,
    requiresAttention: attentionReasons.length > 0,
    attentionReasons
  };
}

function attentionReasonsFor(
  status: Execution["status"],
  dataQuality: ExecutionAuditTimelineDataQuality
): string[] {
  const reasons: string[] = [];

  if (dataQuality === "partial") {
    reasons.push("Timeline dataQuality is partial.");
  }

  if (dataQuality === "inconsistent") {
    reasons.push("Timeline dataQuality is inconsistent.");
  }

  if (status === "failed" || status === "needs_human" || status === "awaiting_approval") {
    reasons.push(`Execution status is ${status}.`);
  }

  return reasons;
}

function applyFilters(
  summaries: ExecutionAuditSummary[],
  options: ExecutionAuditSummaryOptions
): ExecutionAuditSummary[] {
  return summaries.filter((summary) => {
    if (options.executionStatus && summary.executionStatus !== options.executionStatus) {
      return false;
    }

    if (options.projectId && summary.projectId !== options.projectId) {
      return false;
    }

    if (options.dataQuality && summary.timelineDataQuality !== options.dataQuality) {
      return false;
    }

    if (
      typeof options.requiresAttention === "boolean" &&
      summary.requiresAttention !== options.requiresAttention
    ) {
      return false;
    }

    return true;
  });
}

function orderSummaries(summaries: ExecutionAuditSummary[]): ExecutionAuditSummary[] {
  return [...summaries].sort((left, right) => {
    const updatedComparison = right.updatedAt.getTime() - left.updatedAt.getTime();
    if (updatedComparison !== 0) {
      return updatedComparison;
    }

    const createdComparison = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdComparison !== 0) {
      return createdComparison;
    }

    return left.executionId.localeCompare(right.executionId);
  });
}

function applyLimit(
  summaries: ExecutionAuditSummary[],
  limit: number | undefined
): ExecutionAuditSummary[] {
  if (typeof limit !== "number") {
    return summaries;
  }

  return summaries.slice(0, Math.max(0, Math.floor(limit)));
}

function indexDataQuality(
  summaries: ExecutionAuditSummary[]
): ExecutionAuditTimelineDataQuality {
  if (summaries.some((summary) => summary.timelineDataQuality === "inconsistent")) {
    return "inconsistent";
  }

  if (summaries.some((summary) => summary.timelineDataQuality === "partial")) {
    return "partial";
  }

  return "complete";
}

function uniqueSources(sources: ExecutionAuditTimelineSource[]): ExecutionAuditTimelineSource[] {
  const seen = new Set<ExecutionAuditTimelineSource>();

  for (const source of sources) {
    seen.add(source);
  }

  return [...seen].sort((left, right) => sourceOrder(left) - sourceOrder(right));
}

function sourceOrder(source: ExecutionAuditTimelineSource): number {
  return {
    execution: 0,
    event: 1,
    authority_audit: 2,
    budget_ledger: 3,
    approval: 4,
    evaluation: 5
  }[source];
}

function normalizeFilters(options: ExecutionAuditSummaryOptions): ExecutionAuditSummaryOptions {
  const normalized: ExecutionAuditSummaryOptions = {};

  if (options.executionStatus) {
    normalized.executionStatus = options.executionStatus;
  }

  if (options.projectId) {
    normalized.projectId = options.projectId;
  }

  if (options.dataQuality) {
    normalized.dataQuality = options.dataQuality;
  }

  if (typeof options.requiresAttention === "boolean") {
    normalized.requiresAttention = options.requiresAttention;
  }

  if (typeof options.limit === "number") {
    normalized.limit = options.limit;
  }

  return normalized;
}

function listReason(
  totalExecutions: number,
  dataQuality: ExecutionAuditTimelineDataQuality,
  options: ExecutionAuditSummaryOptions
): string {
  if (totalExecutions === 0) {
    return hasFilters(options)
      ? "Execution audit index found no executions matching the applied filters."
      : "Execution audit index found no persisted executions.";
  }

  return `Execution audit index returned ${totalExecutions} summaries with ${dataQuality} dataQuality.`;
}

function hasFilters(options: ExecutionAuditSummaryOptions): boolean {
  return (
    Boolean(options.executionStatus) ||
    Boolean(options.projectId) ||
    Boolean(options.dataQuality) ||
    typeof options.requiresAttention === "boolean" ||
    typeof options.limit === "number"
  );
}
