import type {
  AuthorityDecisionAuditLogDecision,
  AuthorityDecisionAuditLogEntry,
  AuthorityDecisionAuditLogSummary,
  LimitedShadowAuthorityResult
} from "../types.js";
import type { StateMemory } from "./state-memory.js";

export interface AuthorityDecisionAuditLogInput {
  executionId: string;
  authorityResult: LimitedShadowAuthorityResult;
  id?: string;
  timestamp?: Date;
}

export interface AuthorityDecisionAuditLog {
  record(input: AuthorityDecisionAuditLogInput): Promise<AuthorityDecisionAuditLogEntry>;
  listEntries(executionId?: string): Promise<AuthorityDecisionAuditLogEntry[]>;
  summarize(executionId?: string): Promise<AuthorityDecisionAuditLogSummary>;
}

export class AuthorityDecisionAuditLogV012 implements AuthorityDecisionAuditLog {
  constructor(private readonly stateMemory: StateMemory) {}

  async record(input: AuthorityDecisionAuditLogInput): Promise<AuthorityDecisionAuditLogEntry> {
    const entry = createAuthorityDecisionAuditLogEntry(input);
    await this.stateMemory.saveAuthorityDecisionAuditEntry(entry);
    return entry;
  }

  async listEntries(executionId?: string): Promise<AuthorityDecisionAuditLogEntry[]> {
    return this.stateMemory.listAuthorityDecisionAuditEntries(executionId);
  }

  async summarize(executionId?: string): Promise<AuthorityDecisionAuditLogSummary> {
    return summarizeAuthorityDecisionAuditLogEntries(await this.listEntries(executionId));
  }
}

export { AuthorityDecisionAuditLogV012 as SkeletonAuthorityDecisionAuditLog };

export function createAuthorityDecisionAuditLogEntry(
  input: AuthorityDecisionAuditLogInput
): AuthorityDecisionAuditLogEntry {
  const reason = input.authorityResult.reason.trim();

  if (!reason) {
    throw new Error("Authority decision audit log entry requires a non-empty reason.");
  }

  return {
    id: input.id ?? createAuditLogEntryId(input.executionId, input.timestamp ?? new Date()),
    executionId: input.executionId,
    actualSelection: input.authorityResult.actualSelection,
    shadowRecommendation: input.authorityResult.shadowRecommendation,
    authorityDecision: normalizeAuthorityDecision(input.authorityResult),
    effectiveSelection: input.authorityResult.appliedSelection,
    advisorAuthority: input.authorityResult.advisorAuthority,
    evidenceStatus: input.authorityResult.auditRecord.evidenceStatus,
    dataQuality: input.authorityResult.auditRecord.dataQuality,
    metricsEvaluated: {
      costFirstMetrics: input.authorityResult.auditRecord.costFirstMetrics,
      shadowMetrics: input.authorityResult.auditRecord.shadowMetrics
    },
    thresholdsEvaluated: input.authorityResult.auditRecord.thresholdsApplied,
    pricingUsed: {
      costFirstEstimatedCostUsd:
        input.authorityResult.auditRecord.budgetChecked.costFirstEstimatedCostUsd,
      shadowEstimatedCostUsd:
        input.authorityResult.auditRecord.budgetChecked.shadowEstimatedCostUsd
    },
    budgetsUsed: {
      maxAdditionalCostRatio:
        input.authorityResult.auditRecord.budgetChecked.maxAdditionalCostRatio,
      maxAdditionalCostUsdPerIntervention:
        input.authorityResult.auditRecord.budgetChecked.maxAdditionalCostUsdPerIntervention,
      maxEstimatedCostUsdPerIntervention:
        input.authorityResult.auditRecord.budgetChecked.maxEstimatedCostUsdPerIntervention
    },
    costDelta: {
      costDeltaUsd: input.authorityResult.auditRecord.costDeltaUsd,
      costDeltaRatio: input.authorityResult.auditRecord.costDeltaRatio
    },
    reason,
    timestamp: input.timestamp ?? input.authorityResult.auditRecord.timestamp
  };
}

export function summarizeAuthorityDecisionAuditLogEntries(
  entries: AuthorityDecisionAuditLogEntry[]
): AuthorityDecisionAuditLogSummary {
  const totalDecisions = entries.length;
  const allowedCount = entries.filter((entry) => entry.authorityDecision === "allowed").length;
  const blockedCount = totalDecisions - allowedCount;
  const blockedByReason: Record<string, number> = {};

  for (const entry of entries) {
    if (entry.authorityDecision !== "blocked") {
      continue;
    }

    blockedByReason[entry.reason] = (blockedByReason[entry.reason] ?? 0) + 1;
  }

  return {
    totalDecisions,
    allowedCount,
    blockedCount,
    allowedRate: totalDecisions === 0 ? 0 : roundRatio(allowedCount / totalDecisions),
    blockedRate: totalDecisions === 0 ? 0 : roundRatio(blockedCount / totalDecisions),
    blockedByReason
  };
}

function normalizeAuthorityDecision(
  result: LimitedShadowAuthorityResult
): AuthorityDecisionAuditLogDecision {
  return result.authorityDecision === "allow_shadow_influence" ? "allowed" : "blocked";
}

function createAuditLogEntryId(executionId: string, timestamp: Date): string {
  return `authority_${executionId}_${timestamp.getTime()}`;
}

function roundRatio(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
