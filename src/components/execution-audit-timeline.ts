import type {
  AuthorityDecisionAuditLogEntry,
  BudgetLedgerEntry,
  Execution,
  ExecutionAuditTimelineDataQuality,
  ExecutionAuditTimelineItem,
  ExecutionAuditTimelineReadResult,
  ExecutionAuditTimelineSource,
  ExecutionEvent,
  PendingApprovalStep
} from "../types.js";
import type { StateMemory } from "./state-memory.js";

export class ExecutionAuditTimelineV016 {
  constructor(private readonly stateMemory: StateMemory) {}

  async getExecutionAuditTimeline(executionId: string): Promise<ExecutionAuditTimelineReadResult> {
    const execution = await this.stateMemory.getExecution(executionId);

    if (!execution) {
      return {
        status: "not_found",
        executionId,
        reason: `Execution audit timeline not found for ${executionId}: execution is not persisted.`
      };
    }

    const events = await this.stateMemory.listEvents(executionId);
    const authorityEntries = await this.stateMemory.listAuthorityDecisionAuditEntries(executionId);
    const ledgerEntries = await this.stateMemory.listBudgetLedgerEntries(executionId);
    const pendingApproval = await this.stateMemory.getPendingApprovalStep(executionId);
    const timeline = sortTimelineItems([
      ...executionItems(execution),
      ...events.map(eventItem),
      ...authorityEntries.map(authorityAuditItem),
      ...ledgerEntries.map(budgetLedgerItem),
      ...(pendingApproval ? [approvalItem(pendingApproval)] : [])
    ]);
    const quality = determineDataQuality({
      execution,
      events,
      authorityEntries,
      ledgerEntries,
      pendingApproval,
      timeline
    });

    return {
      status: "found",
      executionId,
      executionStatus: execution.status,
      timeline,
      dataQuality: quality.dataQuality,
      reason: quality.reason
    };
  }
}

export { ExecutionAuditTimelineV016 as SkeletonExecutionAuditTimeline };

interface DataQualityInput {
  execution: Execution;
  events: ExecutionEvent[];
  authorityEntries: AuthorityDecisionAuditLogEntry[];
  ledgerEntries: BudgetLedgerEntry[];
  pendingApproval: PendingApprovalStep | undefined;
  timeline: ExecutionAuditTimelineItem[];
}

function executionItems(execution: Execution): ExecutionAuditTimelineItem[] {
  const items: ExecutionAuditTimelineItem[] = [
    {
      timestamp: reliableDate(execution.createdAt),
      source: "execution",
      type: "execution_created",
      summary: `Execution ${execution.id} was persisted.`,
      details: sanitizeDetails({
        executionId: execution.id,
        projectId: execution.projectId,
        status: execution.status,
        taskType: execution.taskType,
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
        hasFinalResult: typeof execution.finalResult === "string",
        finalResultLength: execution.finalResult?.length ?? 0,
        metrics: execution.metrics,
        error: execution.error
      })
    },
    {
      timestamp: reliableDate(execution.updatedAt),
      source: "execution",
      type: "execution_state",
      summary: `Execution state is ${execution.status}.`,
      details: sanitizeDetails({
        executionId: execution.id,
        status: execution.status,
        metrics: execution.metrics,
        error: execution.error
      })
    }
  ];

  if (execution.evaluation) {
    items.push({
      timestamp: reliableDate(execution.updatedAt),
      source: "execution",
      type: "evaluation",
      summary: `Execution evaluation is ${execution.evaluation.status}.`,
      details: sanitizeDetails({
        executionId: execution.id,
        evaluationStatus: execution.evaluation.status,
        criteria: execution.evaluation.criteria,
        reason: execution.evaluation.reason,
        recommendedNextAction: execution.evaluation.recommendedNextAction
      })
    });
  }

  return items;
}

function eventItem(event: ExecutionEvent): ExecutionAuditTimelineItem {
  return {
    timestamp: reliableDate(event.createdAt),
    source: "event",
    type: event.type,
    summary: `Event ${event.type} was persisted.`,
    details: sanitizeDetails({
      eventId: event.id,
      executionId: event.executionId,
      riskLevel: event.riskLevel,
      decisionApplied: event.decisionApplied,
      payload: event.payload
    })
  };
}

function authorityAuditItem(entry: AuthorityDecisionAuditLogEntry): ExecutionAuditTimelineItem {
  return {
    timestamp: reliableDate(entry.timestamp),
    source: "authority_audit",
    type: "authority_decision",
    summary: `Authority decision was ${entry.authorityDecision}.`,
    details: sanitizeDetails({
      id: entry.id,
      executionId: entry.executionId,
      authorityDecision: entry.authorityDecision,
      advisorAuthority: entry.advisorAuthority,
      evidenceStatus: entry.evidenceStatus,
      dataQuality: entry.dataQuality,
      actualSelection: entry.actualSelection,
      shadowRecommendation: entry.shadowRecommendation
        ? {
            provider: entry.shadowRecommendation.provider,
            model: entry.shadowRecommendation.model,
            reason: entry.shadowRecommendation.reason,
            metricsUsed: entry.shadowRecommendation.metricsUsed
          }
        : null,
      effectiveSelection: entry.effectiveSelection,
      pricingUsed: entry.pricingUsed,
      budgetsUsed: entry.budgetsUsed,
      costDelta: entry.costDelta,
      reason: entry.reason
    })
  };
}

function budgetLedgerItem(entry: BudgetLedgerEntry): ExecutionAuditTimelineItem {
  return {
    timestamp: reliableDate(entry.timestamp),
    source: "budget_ledger",
    type: "budget_ledger_entry",
    summary: `Budget ledger entry is ${entry.calculationStatus}.`,
    details: sanitizeDetails({
      executionId: entry.executionId,
      projectId: entry.projectId,
      provider: entry.provider,
      model: entry.model,
      estimatedInputTokens: entry.estimatedInputTokens,
      expectedOutputTokens: entry.expectedOutputTokens,
      actualInputTokens: entry.actualInputTokens,
      actualOutputTokens: entry.actualOutputTokens,
      inputPricePerMillion: entry.inputPricePerMillion,
      outputPricePerMillion: entry.outputPricePerMillion,
      estimatedCostUsd: entry.estimatedCostUsd,
      actualCostUsd: entry.actualCostUsd,
      costDeltaUsd: entry.costDeltaUsd,
      latencyMs: entry.latencyMs,
      calculationStatus: entry.calculationStatus,
      calculationReason: entry.calculationReason
    })
  };
}

function approvalItem(step: PendingApprovalStep): ExecutionAuditTimelineItem {
  return {
    timestamp: reliableDate(step.createdAt),
    source: "approval",
    type: "pending_approval",
    summary: `Approval is pending for ${step.action.name}.`,
    details: sanitizeDetails({
      id: step.id,
      executionId: step.executionId,
      actionName: step.action.name,
      actionDescription: step.action.description,
      riskLevel: step.riskLevel,
      reason: step.reason,
      metadata: step.metadata
    })
  };
}

function determineDataQuality(input: DataQualityInput): {
  dataQuality: ExecutionAuditTimelineDataQuality;
  reason: string;
} {
  const issues: string[] = [];
  const contradictions: string[] = [];

  if (input.events.length === 0) {
    issues.push("No execution events are persisted.");
  }

  if (isTerminal(input.execution.status) && !input.execution.evaluation) {
    issues.push("Execution is terminal but evaluation is missing.");
  }

  if (input.execution.status === "needs_human" && !input.pendingApproval) {
    issues.push("Execution needs human input but pending approval record is missing.");
  }

  if (hasUnreliableTimestamp(input.timeline)) {
    issues.push("One or more persisted sources do not have a reliable timestamp.");
  }

  const calculatedLedgerTotal = sumCalculatedLedgerCost(input.ledgerEntries);
  if (
    typeof input.execution.metrics.actualCostUsd === "number" &&
    calculatedLedgerTotal !== null &&
    roundUsd(input.execution.metrics.actualCostUsd) !== calculatedLedgerTotal
  ) {
    contradictions.push(
      `Execution actualCostUsd ${roundUsd(
        input.execution.metrics.actualCostUsd
      )} does not match calculated ledger total ${calculatedLedgerTotal}.`
    );
  }

  for (const ledgerEntry of input.ledgerEntries) {
    if (
      ledgerEntry.calculationStatus === "calculated" &&
      input.authorityEntries.length > 0 &&
      !input.authorityEntries.some((entry) =>
        isSameProviderModel(entry.effectiveSelection, ledgerEntry)
      )
    ) {
      contradictions.push(
        `Ledger provider/model ${ledgerEntry.provider}/${ledgerEntry.model} does not match any authority effectiveSelection.`
      );
    }
  }

  if (contradictions.length > 0) {
    return {
      dataQuality: "inconsistent",
      reason: `Timeline has inconsistent persisted evidence: ${contradictions.join(" ")}`
    };
  }

  if (issues.length > 0) {
    return {
      dataQuality: "partial",
      reason: `Timeline has partial persisted evidence: ${issues.join(" ")}`
    };
  }

  return {
    dataQuality: "complete",
    reason: "Timeline has complete and consistent persisted evidence."
  };
}

function isTerminal(status: Execution["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function hasUnreliableTimestamp(items: ExecutionAuditTimelineItem[]): boolean {
  return items.some((item) => item.timestamp === null);
}

function sumCalculatedLedgerCost(entries: BudgetLedgerEntry[]): number | null {
  const calculated = entries.filter(
    (entry) => entry.calculationStatus === "calculated" && typeof entry.actualCostUsd === "number"
  );

  if (calculated.length === 0) {
    return null;
  }

  return roundUsd(calculated.reduce((sum, entry) => sum + (entry.actualCostUsd ?? 0), 0));
}

function isSameProviderModel(
  selection: { provider: string; model: string },
  ledgerEntry: BudgetLedgerEntry
): boolean {
  return selection.provider === ledgerEntry.provider && selection.model === ledgerEntry.model;
}

function reliableDate(value: Date): Date | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
}

function sortTimelineItems(items: ExecutionAuditTimelineItem[]): ExecutionAuditTimelineItem[] {
  return [...items].sort((left, right) => {
    const leftTime = left.timestamp?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightTime = right.timestamp?.getTime() ?? Number.POSITIVE_INFINITY;

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    const sourceComparison = sourceOrder(left.source) - sourceOrder(right.source);
    if (sourceComparison !== 0) {
      return sourceComparison;
    }

    return left.type.localeCompare(right.type);
  });
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

function sanitizeDetails(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(value) as Record<string, unknown>;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
      if (isSecretLikeKey(key)) {
        continue;
      }

      if (isPromptLikeKey(key)) {
        result[`${key}Length`] = typeof child === "string" ? child.length : null;
        continue;
      }

      result[key] = sanitizeValue(child);
    }

    return result;
  }

  return value;
}

function isSecretLikeKey(key: string): boolean {
  return /api[_-]?key|secret|workspace[_-]?id|authorization/i.test(key);
}

function isPromptLikeKey(key: string): boolean {
  return ["prompt", "messages", "content", "goal", "finalresult"].includes(key.toLowerCase());
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
