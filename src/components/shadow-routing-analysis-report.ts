import type {
  ShadowAdvisorDataQuality,
  ShadowRoutingAnalysisReport,
  ShadowRoutingDivergencePattern,
  ShadowRoutingEvaluationLogEntry
} from "../types.js";
import type { ShadowRoutingEvaluationLog } from "./shadow-routing-evaluation-log.js";
import { summarizeShadowRoutingEvaluationLogEntries } from "./shadow-routing-evaluation-log.js";

export interface ShadowRoutingAnalysisReportOptions {
  minimumEvaluationsRequired?: number;
  generatedAt?: Date;
}

export class ShadowRoutingAnalysisReporterV010 {
  constructor(private readonly evaluationLog: ShadowRoutingEvaluationLog) {}

  async generate(
    options: ShadowRoutingAnalysisReportOptions = {}
  ): Promise<ShadowRoutingAnalysisReport> {
    const entries = await this.evaluationLog.listEntries();
    return generateShadowRoutingAnalysisReport(entries, options);
  }
}

export { ShadowRoutingAnalysisReporterV010 as SkeletonShadowRoutingAnalysisReporter };

export function generateShadowRoutingAnalysisReport(
  entries: ShadowRoutingEvaluationLogEntry[],
  options: ShadowRoutingAnalysisReportOptions = {}
): ShadowRoutingAnalysisReport {
  const minimumEvaluationsRequired = options.minimumEvaluationsRequired ?? 5;
  const summary = summarizeShadowRoutingEvaluationLogEntries(entries);
  const observedDivergencePatterns = buildDivergencePatterns(entries);
  const divergencesWithAuditableReasonAndMetrics = entries.filter(
    (entry) =>
      isDivergence(entry) &&
      Boolean(entry.differenceReason) &&
      entry.metricsUsed !== null &&
      entry.shadowRecommendation !== null
  ).length;
  const insufficientDataRate =
    summary.totalEvaluations === 0
      ? 0
      : roundRatio(summary.insufficientDataCount / summary.totalEvaluations);
  const evidence = determineEvidenceStatus({
    minimumEvaluationsRequired,
    totalEvaluations: summary.totalEvaluations,
    matchCount: summary.matchCount,
    divergenceCount: summary.divergenceCount,
    insufficientDataRate,
    divergencesWithAuditableReasonAndMetrics
  });

  return {
    generatedAt: options.generatedAt ?? new Date(),
    totalEvaluations: summary.totalEvaluations,
    matchCount: summary.matchCount,
    divergenceCount: summary.divergenceCount,
    insufficientDataCount: summary.insufficientDataCount,
    matchRate: summary.matchRate,
    divergenceRate: summary.divergenceRate,
    observedDivergencePatterns,
    evidenceStatus: evidence.status,
    evidenceReason: evidence.reason,
    metricsUsed: {
      minimumEvaluationsRequired,
      matchCount: summary.matchCount,
      divergenceCount: summary.divergenceCount,
      insufficientDataRate,
      divergencesWithAuditableReasonAndMetrics
    },
    advisorAuthority: "none"
  };
}

interface EvidenceInput {
  minimumEvaluationsRequired: number;
  totalEvaluations: number;
  matchCount: number;
  divergenceCount: number;
  insufficientDataRate: number;
  divergencesWithAuditableReasonAndMetrics: number;
}

function determineEvidenceStatus(input: EvidenceInput): {
  status: "sufficient" | "insufficient";
  reason: string;
} {
  if (input.totalEvaluations < input.minimumEvaluationsRequired) {
    return {
      status: "insufficient",
      reason: `Only ${input.totalEvaluations} evaluations available; minimum required is ${input.minimumEvaluationsRequired}.`
    };
  }

  if (input.matchCount === 0) {
    return {
      status: "insufficient",
      reason: "No matches are available to compare against divergence patterns."
    };
  }

  if (input.divergenceCount === 0) {
    return {
      status: "insufficient",
      reason: "No divergences are available to analyze."
    };
  }

  if (input.insufficientDataRate >= 0.5) {
    return {
      status: "insufficient",
      reason: `Insufficient data rate ${input.insufficientDataRate} is too high for authority consideration.`
    };
  }

  if (input.divergencesWithAuditableReasonAndMetrics < input.divergenceCount) {
    return {
      status: "insufficient",
      reason: "At least one divergence is missing auditable reason or metrics."
    };
  }

  return {
    status: "sufficient",
    reason:
      "Evidence meets deterministic thresholds: minimum evaluations, at least one match, at least one divergence, insufficient data below 0.5, and all divergences include auditable reasons and metrics."
  };
}

interface DivergencePatternBuilder {
  actualProvider: string;
  actualModel: string;
  shadowProvider: string;
  shadowModel: string;
  count: number;
  totalEvaluationPassRate: number;
  evaluationPassRateCount: number;
  totalSuccessRate: number;
  successRateCount: number;
  totalActualCostUsd: number;
  actualCostCount: number;
  totalLatencyMs: number;
  latencyCount: number;
  dataQualityValues: Set<ShadowAdvisorDataQuality>;
  reasons: Set<string>;
}

function buildDivergencePatterns(
  entries: ShadowRoutingEvaluationLogEntry[]
): ShadowRoutingDivergencePattern[] {
  const builders = new Map<string, DivergencePatternBuilder>();

  for (const entry of entries) {
    if (!isDivergence(entry) || !entry.shadowRecommendation) {
      continue;
    }

    const key = [
      entry.actualSelection.provider,
      entry.actualSelection.model,
      entry.shadowRecommendation.provider,
      entry.shadowRecommendation.model
    ].join("->");
    const builder = builders.get(key) ?? newDivergencePatternBuilder(entry);
    builders.set(key, builder);
    builder.count += 1;
    builder.dataQualityValues.add(entry.dataQuality);

    if (entry.differenceReason) {
      builder.reasons.add(entry.differenceReason);
    }

    if (entry.metricsUsed) {
      builder.totalEvaluationPassRate += entry.metricsUsed.evaluationPassRate;
      builder.evaluationPassRateCount += 1;
      builder.totalSuccessRate += entry.metricsUsed.successRate;
      builder.successRateCount += 1;

      if (entry.metricsUsed.averageActualCostUsd !== null) {
        builder.totalActualCostUsd += entry.metricsUsed.averageActualCostUsd;
        builder.actualCostCount += 1;
      }

      if (entry.metricsUsed.averageLatencyMs !== null) {
        builder.totalLatencyMs += entry.metricsUsed.averageLatencyMs;
        builder.latencyCount += 1;
      }
    }
  }

  return [...builders.values()]
    .map(buildDivergencePattern)
    .sort((left, right) => right.count - left.count || patternKey(left).localeCompare(patternKey(right)));
}

function newDivergencePatternBuilder(
  entry: ShadowRoutingEvaluationLogEntry
): DivergencePatternBuilder {
  return {
    actualProvider: entry.actualSelection.provider,
    actualModel: entry.actualSelection.model,
    shadowProvider: entry.shadowRecommendation?.provider ?? "",
    shadowModel: entry.shadowRecommendation?.model ?? "",
    count: 0,
    totalEvaluationPassRate: 0,
    evaluationPassRateCount: 0,
    totalSuccessRate: 0,
    successRateCount: 0,
    totalActualCostUsd: 0,
    actualCostCount: 0,
    totalLatencyMs: 0,
    latencyCount: 0,
    dataQualityValues: new Set<ShadowAdvisorDataQuality>(),
    reasons: new Set<string>()
  };
}

function buildDivergencePattern(builder: DivergencePatternBuilder): ShadowRoutingDivergencePattern {
  return {
    actualProvider: builder.actualProvider as ShadowRoutingDivergencePattern["actualProvider"],
    actualModel: builder.actualModel,
    shadowProvider: builder.shadowProvider as ShadowRoutingDivergencePattern["shadowProvider"],
    shadowModel: builder.shadowModel,
    count: builder.count,
    averageShadowEvaluationPassRate:
      builder.evaluationPassRateCount === 0
        ? null
        : roundRatio(builder.totalEvaluationPassRate / builder.evaluationPassRateCount),
    averageShadowSuccessRate:
      builder.successRateCount === 0 ? null : roundRatio(builder.totalSuccessRate / builder.successRateCount),
    averageShadowActualCostUsd:
      builder.actualCostCount === 0 ? null : roundUsd(builder.totalActualCostUsd / builder.actualCostCount),
    averageShadowLatencyMs:
      builder.latencyCount === 0 ? null : roundMs(builder.totalLatencyMs / builder.latencyCount),
    dataQuality: derivePatternDataQuality(builder.dataQualityValues),
    reasons: [...builder.reasons].sort()
  };
}

function derivePatternDataQuality(values: Set<ShadowAdvisorDataQuality>): ShadowAdvisorDataQuality {
  if (values.has("insufficient_data")) {
    return "insufficient_data";
  }

  if (values.has("partial")) {
    return "partial";
  }

  return "complete";
}

function isDivergence(entry: ShadowRoutingEvaluationLogEntry): boolean {
  return !entry.matchesActualSelection && entry.dataQuality !== "insufficient_data";
}

function patternKey(pattern: ShadowRoutingDivergencePattern): string {
  return `${pattern.actualProvider}:${pattern.actualModel}->${pattern.shadowProvider}:${pattern.shadowModel}`;
}

function roundRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}
