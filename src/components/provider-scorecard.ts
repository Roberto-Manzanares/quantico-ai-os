import type {
  BudgetLedgerEntry,
  EvaluationStatus,
  Execution,
  ExecutionStatus,
  ProviderName,
  ProviderScorecardAggregate,
  ProviderScorecardSummary
} from "../types.js";
import type { StateMemory } from "./state-memory.js";

export interface ProviderScorecard {
  summarize(): Promise<ProviderScorecardSummary>;
}

interface ExecutionLookup {
  getExecution(id: string): Promise<Execution | undefined>;
}

export class ProviderScorecardV06 implements ProviderScorecard {
  constructor(private readonly stateMemory: StateMemory) {}

  async summarize(): Promise<ProviderScorecardSummary> {
    const entries = await this.stateMemory.listBudgetLedgerEntries();
    const executionIds = [...new Set(entries.map((entry) => entry.executionId))];
    const executions = new Map<string, Execution>();

    for (const executionId of executionIds) {
      const execution = await this.stateMemory.getExecution(executionId);
      if (execution) {
        executions.set(executionId, execution);
      }
    }

    return summarizeProviderScorecardEntries(entries, {
      getExecution: async (id) => executions.get(id)
    });
  }
}

export { ProviderScorecardV06 as SkeletonProviderScorecard };

export async function summarizeProviderScorecardEntries(
  entries: BudgetLedgerEntry[],
  executionLookup: ExecutionLookup
): Promise<ProviderScorecardSummary> {
  const builders = new Map<string, ScorecardBuilder>();

  for (const entry of entries) {
    const key = scorecardKey(entry.provider, entry.model);
    const builder = builders.get(key) ?? newScorecardBuilder(entry.provider, entry.model);
    builders.set(key, builder);
    builder.entryCount += 1;

    if (typeof entry.actualCostUsd === "number") {
      builder.totalActualCostUsd += entry.actualCostUsd;
      builder.actualCostEntryCount += 1;
    } else {
      builder.partialReasons.add("actualCostUsd is missing for at least one ledger entry.");
    }

    if (Number.isFinite(entry.latencyMs)) {
      builder.totalLatencyMs += entry.latencyMs;
      builder.latencyEntryCount += 1;
    } else {
      builder.partialReasons.add("latencyMs is missing for at least one ledger entry.");
    }

    if (!builder.lastUpdatedAt || entry.timestamp > builder.lastUpdatedAt) {
      builder.lastUpdatedAt = entry.timestamp;
    }

    if (builder.seenExecutionIds.has(entry.executionId)) {
      continue;
    }

    builder.seenExecutionIds.add(entry.executionId);
    const execution = await executionLookup.getExecution(entry.executionId);

    if (!execution) {
      builder.partialReasons.add(`Execution ${entry.executionId} is missing from State/Memory.`);
      continue;
    }

    countExecutionStatus(builder, execution.status);
    countEvaluationStatus(builder, execution.evaluation?.status);
  }

  const byModel: Record<string, ProviderScorecardAggregate> = {};
  for (const [key, builder] of builders) {
    byModel[key] = buildAggregate(builder);
  }

  return { byModel };
}

interface ScorecardBuilder {
  provider: ProviderName;
  model: string;
  entryCount: number;
  seenExecutionIds: Set<string>;
  successCount: number;
  failureCount: number;
  needsHumanCount: number;
  evaluationPassCount: number;
  evaluationFailCount: number;
  evaluationNeedsReviewCount: number;
  totalActualCostUsd: number;
  actualCostEntryCount: number;
  totalLatencyMs: number;
  latencyEntryCount: number;
  lastUpdatedAt?: Date;
  partialReasons: Set<string>;
}

function newScorecardBuilder(provider: ProviderName, model: string): ScorecardBuilder {
  return {
    provider,
    model,
    entryCount: 0,
    seenExecutionIds: new Set<string>(),
    successCount: 0,
    failureCount: 0,
    needsHumanCount: 0,
    evaluationPassCount: 0,
    evaluationFailCount: 0,
    evaluationNeedsReviewCount: 0,
    totalActualCostUsd: 0,
    actualCostEntryCount: 0,
    totalLatencyMs: 0,
    latencyEntryCount: 0,
    partialReasons: new Set<string>()
  };
}

function countExecutionStatus(builder: ScorecardBuilder, status: ExecutionStatus): void {
  if (status === "succeeded") {
    builder.successCount += 1;
    return;
  }

  if (status === "failed" || status === "cancelled") {
    builder.failureCount += 1;
    return;
  }

  if (status === "needs_human" || status === "awaiting_approval") {
    builder.needsHumanCount += 1;
    if (status === "awaiting_approval") {
      builder.partialReasons.add("At least one execution is awaiting approval and may still change.");
    }
    return;
  }

  builder.partialReasons.add(`Execution status ${status} is not a final scorecard status.`);
}

function countEvaluationStatus(
  builder: ScorecardBuilder,
  evaluationStatus: EvaluationStatus | undefined
): void {
  if (evaluationStatus === "pass") {
    builder.evaluationPassCount += 1;
    return;
  }

  if (evaluationStatus === "fail") {
    builder.evaluationFailCount += 1;
    return;
  }

  if (evaluationStatus === "needs_review") {
    builder.evaluationNeedsReviewCount += 1;
    return;
  }

  builder.partialReasons.add("evaluationStatus is missing for at least one execution.");
}

function buildAggregate(builder: ScorecardBuilder): ProviderScorecardAggregate {
  return {
    provider: builder.provider,
    model: builder.model,
    executionCount: builder.seenExecutionIds.size,
    successCount: builder.successCount,
    failureCount: builder.failureCount,
    needsHumanCount: builder.needsHumanCount,
    evaluationPassCount: builder.evaluationPassCount,
    evaluationFailCount: builder.evaluationFailCount,
    evaluationNeedsReviewCount: builder.evaluationNeedsReviewCount,
    totalActualCostUsd: roundUsd(builder.totalActualCostUsd),
    averageActualCostUsd:
      builder.actualCostEntryCount === 0
        ? null
        : roundUsd(builder.totalActualCostUsd / builder.actualCostEntryCount),
    averageLatencyMs:
      builder.latencyEntryCount === 0 ? null : roundMs(builder.totalLatencyMs / builder.latencyEntryCount),
    lastUpdatedAt: builder.lastUpdatedAt,
    dataQuality: builder.partialReasons.size === 0 ? "complete" : "partial",
    reason: builder.partialReasons.size === 0 ? undefined : [...builder.partialReasons].join(" ")
  };
}

function scorecardKey(provider: ProviderName, model: string): string {
  return `${provider}:${model}`;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}
