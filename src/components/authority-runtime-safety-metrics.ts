import type {
  AuthorityDecisionAuditLogEntry,
  AuthorityRuntimeObservedOutcome,
  AuthorityRuntimeOutcomeAggregate,
  AuthorityRuntimeOutcomeComparison,
  AuthorityRuntimeSafetyDataQuality,
  AuthorityRuntimeSafetyMetricsReport,
  BudgetLedgerEntry,
  EvaluationStatus,
  Execution,
  ExecutionStatus
} from "../types.js";
import type { StateMemory } from "./state-memory.js";

export class AuthorityRuntimeSafetyMetricsV014 {
  constructor(private readonly stateMemory: StateMemory) {}

  async generate(): Promise<AuthorityRuntimeSafetyMetricsReport> {
    const auditEntries = await this.stateMemory.listAuthorityDecisionAuditEntries();
    const ledgerEntries = await this.stateMemory.listBudgetLedgerEntries();
    const executions = await loadExecutions(this.stateMemory, auditEntries);

    return generateAuthorityRuntimeSafetyMetricsReport({
      auditEntries,
      ledgerEntries,
      executions
    });
  }
}

export { AuthorityRuntimeSafetyMetricsV014 as SkeletonAuthorityRuntimeSafetyMetrics };

export interface AuthorityRuntimeSafetyMetricsInput {
  auditEntries: AuthorityDecisionAuditLogEntry[];
  ledgerEntries: BudgetLedgerEntry[];
  executions: Map<string, Execution | undefined>;
  generatedAt?: Date;
}

export function generateAuthorityRuntimeSafetyMetricsReport(
  input: AuthorityRuntimeSafetyMetricsInput
): AuthorityRuntimeSafetyMetricsReport {
  const totalAuthorityEvaluations = input.auditEntries.length;
  const allowedInterventions = input.auditEntries.filter(
    (entry) => entry.authorityDecision === "allowed"
  ).length;
  const blockedInterventions = totalAuthorityEvaluations - allowedInterventions;
  const failClosedByReason = countFailClosedByReason(input.auditEntries);
  const failClosedCount = Object.values(failClosedByReason).reduce((sum, count) => sum + count, 0);
  const additionalCosts = input.auditEntries
    .filter((entry) => entry.authorityDecision === "allowed")
    .map((entry) => entry.costDelta.costDeltaUsd)
    .filter((cost): cost is number => typeof cost === "number" && cost > 0);
  const outcomeComparisons = input.auditEntries.map((entry) =>
    buildOutcomeComparison(entry, input.executions.get(entry.executionId), input.ledgerEntries)
  );
  const reasons = collectReasons(input.auditEntries, outcomeComparisons);

  return {
    generatedAt: input.generatedAt ?? new Date(),
    totalAuthorityEvaluations,
    allowedInterventions,
    blockedInterventions,
    allowedRate:
      totalAuthorityEvaluations === 0
        ? 0
        : roundRatio(allowedInterventions / totalAuthorityEvaluations),
    blockedRate:
      totalAuthorityEvaluations === 0
        ? 0
        : roundRatio(blockedInterventions / totalAuthorityEvaluations),
    failClosedCount,
    failClosedByReason,
    totalAdditionalCostUsdAuthorized: roundUsd(additionalCosts.reduce((sum, cost) => sum + cost, 0)),
    averageAdditionalCostUsdAuthorized:
      additionalCosts.length === 0
        ? 0
        : roundUsd(additionalCosts.reduce((sum, cost) => sum + cost, 0) / additionalCosts.length),
    maxAdditionalCostUsdObserved:
      additionalCosts.length === 0 ? 0 : roundUsd(Math.max(...additionalCosts)),
    outcomeComparisons,
    outcomesByAuthorityDecision: summarizeObservedOutcomes(outcomeComparisons),
    dataQuality: determineDataQuality(input.auditEntries, outcomeComparisons),
    reasons
  };
}

async function loadExecutions(
  stateMemory: StateMemory,
  auditEntries: AuthorityDecisionAuditLogEntry[]
): Promise<Map<string, Execution | undefined>> {
  const executions = new Map<string, Execution | undefined>();

  for (const executionId of new Set(auditEntries.map((entry) => entry.executionId))) {
    executions.set(executionId, await stateMemory.getExecution(executionId));
  }

  return executions;
}

function buildOutcomeComparison(
  entry: AuthorityDecisionAuditLogEntry,
  execution: Execution | undefined,
  ledgerEntries: BudgetLedgerEntry[]
): AuthorityRuntimeOutcomeComparison {
  const base = {
    executionId: entry.executionId,
    authorityDecision: entry.authorityDecision,
    actualSelection: entry.actualSelection,
    shadowRecommendation: entry.shadowRecommendation,
    effectiveSelection: entry.effectiveSelection,
    counterfactualOutcome: "unavailable" as const
  };

  if (!execution) {
    return {
      ...base,
      actualOutcome: null,
      comparisonStatus: "insufficient_data",
      reason: "Execution state is missing for the authority decision."
    };
  }

  if (!isTerminalExecutionStatus(execution.status)) {
    return {
      ...base,
      actualOutcome: null,
      comparisonStatus: "insufficient_data",
      reason: "Execution state is not terminal."
    };
  }

  if (!execution.evaluation?.status) {
    return {
      ...base,
      actualOutcome: null,
      comparisonStatus: "insufficient_data",
      reason: "Execution evaluationStatus is missing."
    };
  }

  if (!hasApplicableCalculatedLedger(entry, ledgerEntries)) {
    return {
      ...base,
      actualOutcome: observedOutcome(entry, execution.evaluation.status, execution.status),
      comparisonStatus: "insufficient_data",
      reason: "Applicable calculated Budget Ledger evidence is missing."
    };
  }

  if (!isSameSelection(entry.actualSelection, entry.effectiveSelection)) {
    return {
      ...base,
      actualOutcome: observedOutcome(entry, execution.evaluation.status, execution.status),
      comparisonStatus: "insufficient_data",
      reason:
        "Only the effectiveSelection was executed; the alternative selection has no observed outcome."
    };
  }

  if (
    entry.shadowRecommendation &&
    !isSameSelection(entry.shadowRecommendation, entry.effectiveSelection)
  ) {
    return {
      ...base,
      actualOutcome: observedOutcome(entry, execution.evaluation.status, execution.status),
      comparisonStatus: "insufficient_data",
      reason:
        "Only the effectiveSelection was executed; the shadow recommendation has no observed outcome."
    };
  }

  return {
    ...base,
    actualOutcome: observedOutcome(entry, execution.evaluation.status, execution.status),
    comparisonStatus: "comparable",
    reason: "COST-FIRST and shadow refer to the same executed selection."
  };
}

function observedOutcome(
  entry: AuthorityDecisionAuditLogEntry,
  evaluationStatus: EvaluationStatus,
  executionStatus: ExecutionStatus
): AuthorityRuntimeObservedOutcome {
  return {
    provider: entry.effectiveSelection.provider,
    model: entry.effectiveSelection.model,
    executionStatus,
    evaluationStatus
  };
}

function hasApplicableCalculatedLedger(
  entry: AuthorityDecisionAuditLogEntry,
  ledgerEntries: BudgetLedgerEntry[]
): boolean {
  return ledgerEntries.some(
    (ledgerEntry) =>
      ledgerEntry.executionId === entry.executionId &&
      ledgerEntry.provider === entry.effectiveSelection.provider &&
      ledgerEntry.model === entry.effectiveSelection.model &&
      ledgerEntry.calculationStatus === "calculated" &&
      typeof ledgerEntry.actualCostUsd === "number"
  );
}

function isTerminalExecutionStatus(status: ExecutionStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function isSameSelection(
  left: { provider: string; model: string },
  right: { provider: string; model: string }
): boolean {
  return left.provider === right.provider && left.model === right.model;
}

function countFailClosedByReason(
  entries: AuthorityDecisionAuditLogEntry[]
): Record<string, number> {
  const byReason: Record<string, number> = {};

  for (const entry of entries) {
    if (entry.authorityDecision !== "blocked" || !isFailClosedReason(entry.reason)) {
      continue;
    }

    byReason[entry.reason] = (byReason[entry.reason] ?? 0) + 1;
  }

  return byReason;
}

function isFailClosedReason(reason: string): boolean {
  return /fail[- ]closed|fallback|rollback|insufficient|missing|unknown|incomplete|ambiguous|pricing|budget|audit|not verifiable|evidenceStatus|dataQuality/i.test(
    reason
  );
}

function summarizeObservedOutcomes(
  comparisons: AuthorityRuntimeOutcomeComparison[]
): {
  allowed: AuthorityRuntimeOutcomeAggregate;
  blocked: AuthorityRuntimeOutcomeAggregate;
} {
  const allowed = emptyOutcomeAggregate();
  const blocked = emptyOutcomeAggregate();

  for (const comparison of comparisons) {
    if (!comparison.actualOutcome) {
      continue;
    }

    const aggregate = comparison.authorityDecision === "allowed" ? allowed : blocked;
    aggregate.executionCount += 1;
    increment(aggregate.byExecutionStatus, comparison.actualOutcome.executionStatus);
    increment(aggregate.byEvaluationStatus, comparison.actualOutcome.evaluationStatus);
  }

  return { allowed, blocked };
}

function emptyOutcomeAggregate(): AuthorityRuntimeOutcomeAggregate {
  return {
    executionCount: 0,
    byExecutionStatus: {},
    byEvaluationStatus: {}
  };
}

function increment<T extends string>(target: Partial<Record<T, number>>, key: T): void {
  target[key] = (target[key] ?? 0) + 1;
}

function determineDataQuality(
  auditEntries: AuthorityDecisionAuditLogEntry[],
  comparisons: AuthorityRuntimeOutcomeComparison[]
): AuthorityRuntimeSafetyDataQuality {
  if (auditEntries.length === 0) {
    return "insufficient";
  }

  if (
    auditEntries.some((entry) => entry.authorityDecision === "allowed" && entry.costDelta.costDeltaUsd === null) ||
    comparisons.some((comparison) => comparison.comparisonStatus === "insufficient_data")
  ) {
    return "partial";
  }

  return "complete";
}

function collectReasons(
  auditEntries: AuthorityDecisionAuditLogEntry[],
  comparisons: AuthorityRuntimeOutcomeComparison[]
): string[] {
  return [
    ...new Set([
      ...auditEntries.map((entry) => entry.reason),
      ...comparisons.map((comparison) => comparison.reason)
    ])
  ];
}

function roundRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
