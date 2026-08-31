import type {
  ShadowRoutingAdvice,
  ShadowRoutingEvaluationLogEntry,
  ShadowRoutingEvaluationLogSummary
} from "../types.js";
import type { StateMemory } from "./state-memory.js";

export interface ShadowRoutingEvaluationLogInput {
  executionId: string;
  advice: ShadowRoutingAdvice;
  timestamp?: Date;
  id?: string;
}

export interface ShadowRoutingEvaluationLog {
  record(input: ShadowRoutingEvaluationLogInput): Promise<ShadowRoutingEvaluationLogEntry>;
  listEntries(executionId?: string): Promise<ShadowRoutingEvaluationLogEntry[]>;
  summarize(executionId?: string): Promise<ShadowRoutingEvaluationLogSummary>;
}

export class ShadowRoutingEvaluationLogV09 implements ShadowRoutingEvaluationLog {
  constructor(private readonly stateMemory: StateMemory) {}

  async record(input: ShadowRoutingEvaluationLogInput): Promise<ShadowRoutingEvaluationLogEntry> {
    const entry = createShadowRoutingEvaluationLogEntry(input);
    await this.stateMemory.saveShadowRoutingEvaluation(entry);
    return entry;
  }

  async listEntries(executionId?: string): Promise<ShadowRoutingEvaluationLogEntry[]> {
    return this.stateMemory.listShadowRoutingEvaluations(executionId);
  }

  async summarize(executionId?: string): Promise<ShadowRoutingEvaluationLogSummary> {
    return summarizeShadowRoutingEvaluationLogEntries(await this.listEntries(executionId));
  }
}

export { ShadowRoutingEvaluationLogV09 as SkeletonShadowRoutingEvaluationLog };

export function createShadowRoutingEvaluationLogEntry(
  input: ShadowRoutingEvaluationLogInput
): ShadowRoutingEvaluationLogEntry {
  const matchesActualSelection = input.advice.comparison.matchesActualSelection;
  const differenceReason =
    input.advice.comparison.differenceReason ??
    (matchesActualSelection ? undefined : "Shadow recommendation differs from actual selection.");

  return {
    id: input.id ?? createLogEntryId(input.executionId, input.timestamp ?? new Date()),
    executionId: input.executionId,
    timestamp: input.timestamp ?? new Date(),
    actualSelection: input.advice.actualSelection,
    shadowRecommendation: input.advice.shadowRecommendation,
    matchesActualSelection,
    differenceReason,
    metricsUsed: input.advice.shadowRecommendation?.metricsUsed ?? null,
    dataQuality: input.advice.dataQuality,
    advisorAuthority: "none"
  };
}

export function summarizeShadowRoutingEvaluationLogEntries(
  entries: ShadowRoutingEvaluationLogEntry[]
): ShadowRoutingEvaluationLogSummary {
  const totalEvaluations = entries.length;
  const matchCount = entries.filter((entry) => entry.matchesActualSelection).length;
  const insufficientDataCount = entries.filter(
    (entry) => entry.dataQuality === "insufficient_data"
  ).length;
  const divergenceCount = totalEvaluations - matchCount - insufficientDataCount;

  return {
    totalEvaluations,
    matchCount,
    divergenceCount,
    insufficientDataCount,
    matchRate: totalEvaluations === 0 ? 0 : roundRatio(matchCount / totalEvaluations),
    divergenceRate: totalEvaluations === 0 ? 0 : roundRatio(divergenceCount / totalEvaluations)
  };
}

function createLogEntryId(executionId: string, timestamp: Date): string {
  return `shadow_${executionId}_${timestamp.getTime()}`;
}

function roundRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
