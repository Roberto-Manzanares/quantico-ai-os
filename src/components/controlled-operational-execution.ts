import type {
  ControlledExecutionAuditRequirements,
  ControlledExecutionProfile,
  ControlledExecutionResult,
  EvaluationCriterion,
  ExecutionConstraints,
  ExecutionStatus
} from "../types.js";
import type { ContextCompiler } from "./context-compiler.js";
import type { ExecutionAuditIndexV017 } from "./execution-audit-index.js";
import type { ExecutionAuditTimelineV016 } from "./execution-audit-timeline.js";
import type { ModelRouter } from "./model-router.js";
import type { TokenGovernor } from "./token-governor.js";
import type { StateMemory } from "./state-memory.js";
import { determineTaskType, type Orchestrator } from "../orchestrator.js";

export interface ControlledOperationalExecutionDependencies {
  stateMemory: StateMemory;
  contextCompiler: ContextCompiler;
  modelRouter: ModelRouter;
  tokenGovernor: TokenGovernor;
  orchestrator: Orchestrator;
  executionAuditTimeline: ExecutionAuditTimelineV016;
  executionAuditIndex: ExecutionAuditIndexV017;
}

export class ControlledOperationalExecutionV018 {
  constructor(private readonly dependencies: ControlledOperationalExecutionDependencies) {}

  async runControlledExecution(
    profile: ControlledExecutionProfile
  ): Promise<ControlledExecutionResult> {
    const profileError = validateProfile(profile);

    if (profileError) {
      return rejected(profile, profileError);
    }

    if (profile.mode === "dry_run") {
      return this.runDryRun(profile);
    }

    return this.runLive(profile);
  }

  private async runDryRun(profile: ControlledExecutionProfile): Promise<ControlledExecutionResult> {
    const constraints = profileConstraints(profile);
    const taskType = determineTaskType(profile.goal);
    const context = await this.dependencies.contextCompiler.compile({
      goal: profile.goal,
      projectId: profile.projectId,
      constraints,
      approvalPolicy: profile.approvalPolicy,
      contextRefs: profile.contextRefs,
      maxContextTokens: constraints.maxInputTokens,
      stateMemory: this.dependencies.stateMemory
    });
    const routingDecision = await this.dependencies.modelRouter.route({
      taskType,
      context,
      constraints,
      estimatedInputTokens: context.estimatedTokens
    });
    const tokenDecision = await this.dependencies.tokenGovernor.evaluate({
      context,
      routingDecision,
      maxInputTokens: constraints.maxInputTokens,
      maxOutputTokens: constraints.maxOutputTokens,
      maxTotalTokens: constraints.maxTotalTokens,
      expectedOutputTokens: constraints.expectedOutputTokens,
      maxCostUsd: constraints.maxCostUsd
    });

    if (tokenDecision.status === "reject") {
      return rejected(profile, `Profile rejected before provider call: ${tokenDecision.reason}`);
    }

    return {
      status: "dry_run_ready",
      profileValidationStatus: "profile_validated",
      profileId: profile.profileId,
      provider: routingDecision.provider,
      model: routingDecision.model,
      estimatedCostUsd: tokenDecision.estimatedCostUsd,
      reason: "Profile validated; dry_run is ready without executing a provider call.",
      dryRun: {
        taskType,
        compiledContextId: context.compiledContextId,
        estimatedInputTokens: tokenDecision.estimatedInputTokens,
        expectedOutputTokens: tokenDecision.estimatedOutputTokens,
        provider: routingDecision.provider,
        model: routingDecision.model,
        estimatedCostUsd: tokenDecision.estimatedCostUsd,
        routingReason: routingDecision.reason,
        tokenDecisionReason: tokenDecision.reason
      }
    };
  }

  private async runLive(profile: ControlledExecutionProfile): Promise<ControlledExecutionResult> {
    const result = await this.dependencies.orchestrator.run({
      goal: profile.goal,
      projectId: profile.projectId,
      constraints: profileConstraints(profile),
      approvalPolicy: profile.approvalPolicy,
      contextRefs: profile.contextRefs
    });
    const ledgerEntries = await this.dependencies.stateMemory.listBudgetLedgerEntries(
      result.execution.id
    );
    const providerLedgerEntry = ledgerEntries.find((entry) => entry.calculationStatus !== "not_applicable");
    const postAudit = await this.postAudit(result.execution.id, profile.auditRequirements);

    return {
      status: liveStatus(result.execution.status),
      profileValidationStatus: "profile_validated",
      profileId: profile.profileId,
      executionId: result.execution.id,
      provider: providerLedgerEntry?.provider,
      model: providerLedgerEntry?.model,
      estimatedCostUsd: result.execution.metrics.estimatedCostUsd,
      actualCostUsd: result.execution.metrics.actualCostUsd,
      evaluationStatus: result.evaluation.status,
      postAudit,
      reason: `Live execution finished with execution status ${result.execution.status}.`
    };
  }

  private async postAudit(
    executionId: string,
    auditRequirements: ControlledExecutionAuditRequirements
  ) {
    const timeline = auditRequirements.requireTimeline
      ? await this.dependencies.executionAuditTimeline.getExecutionAuditTimeline(executionId)
      : undefined;
    const summary = auditRequirements.requireAuditSummary
      ? await this.dependencies.executionAuditIndex.getExecutionAuditSummary(executionId)
      : undefined;

    return {
      timelineStatus: timeline?.status ?? "not_found",
      timelineDataQuality: timeline?.status === "found" ? timeline.dataQuality : undefined,
      auditSummaryStatus: summary?.status ?? "not_found",
      requiresAttention: summary?.status === "found" ? summary.summary.requiresAttention : undefined,
      reason: postAuditReason(timeline, summary)
    };
  }
}

export { ControlledOperationalExecutionV018 as SkeletonControlledOperationalExecution };

function validateProfile(profile: ControlledExecutionProfile): string | undefined {
  if (!profile || typeof profile !== "object") {
    return "Profile is required.";
  }

  if (!profile.goal || profile.goal.trim().length === 0) {
    return "Profile goal is required.";
  }

  if (profile.mode !== "dry_run" && profile.mode !== "live") {
    return "Profile mode must be dry_run or live.";
  }

  if (!profile.constraints || typeof profile.constraints !== "object") {
    return "Profile constraints are required.";
  }

  if (!Array.isArray(profile.evaluationCriteria) || profile.evaluationCriteria.length === 0) {
    return "Profile evaluationCriteria must include deterministic criteria.";
  }

  const invalidCriterion = profile.evaluationCriteria.find((criterion) => !isDeterministicCriterion(criterion));
  if (invalidCriterion) {
    return `Profile evaluation criterion is not deterministically verifiable: ${invalidCriterion.type}.`;
  }

  if (!profile.approvalPolicy || typeof profile.approvalPolicy !== "object") {
    return "Profile approvalPolicy is required.";
  }

  if (!profile.budgets || typeof profile.budgets !== "object") {
    return "Profile budgets are required.";
  }

  if (profile.budgets.maxProjectCostUsd !== undefined && !profile.projectId) {
    return "Profile projectId is required when maxProjectCostUsd is configured.";
  }

  if (!hasVerifiableBudget(profile)) {
    return "Profile requires verifiable maxCostUsd, maxOutputTokens, and maxTotalTokens before provider call.";
  }

  if (!profile.auditRequirements || typeof profile.auditRequirements !== "object") {
    return "Profile auditRequirements are required.";
  }

  return undefined;
}

function hasVerifiableBudget(profile: ControlledExecutionProfile): boolean {
  return (
    isNonNegativeNumber(profile.budgets.maxCostUsd) &&
    isNonNegativeNumber(profile.budgets.maxOutputTokens) &&
    isNonNegativeNumber(profile.budgets.maxTotalTokens)
  );
}

function isDeterministicCriterion(criterion: EvaluationCriterion): boolean {
  if (criterion.type === "requires_review") {
    return false;
  }

  if (criterion.type === "contains_text" || criterion.type === "not_contains_text") {
    return criterion.value.trim().length > 0;
  }

  return isNonNegativeNumber(criterion.value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function profileConstraints(profile: ControlledExecutionProfile): ExecutionConstraints {
  return {
    ...profile.constraints,
    ...profile.budgets,
    evaluationCriteria: profile.evaluationCriteria
  };
}

function rejected(
  profile: Partial<ControlledExecutionProfile>,
  reason: string
): ControlledExecutionResult {
  return {
    status: "profile_rejected",
    profileValidationStatus: "profile_rejected",
    profileId: profile.profileId,
    reason
  };
}

function liveStatus(status: ExecutionStatus): ControlledExecutionResult["status"] {
  if (status === "needs_human" || status === "awaiting_approval") {
    return "execution_pending_approval";
  }

  if (status === "succeeded") {
    return "execution_completed";
  }

  return "execution_failed";
}

function postAuditReason(
  timeline: Awaited<ReturnType<ExecutionAuditTimelineV016["getExecutionAuditTimeline"]>> | undefined,
  summary: Awaited<ReturnType<ExecutionAuditIndexV017["getExecutionAuditSummary"]>> | undefined
): string {
  const parts: string[] = [];

  if (timeline) {
    parts.push(`timeline=${timeline.status}`);
  }

  if (summary) {
    parts.push(`audit_summary=${summary.status}`);
  }

  return parts.length > 0
    ? `Post-audit completed using ${parts.join(", ")}.`
    : "Post-audit was not requested by profile auditRequirements.";
}
