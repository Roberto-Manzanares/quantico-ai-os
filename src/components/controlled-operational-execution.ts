import { createHash, randomUUID } from "node:crypto";
import type {
  ControlledExecutionAuditRequirements,
  ControlledExecutionManifestRecordingStatus,
  ControlledExecutionProfile,
  ControlledExecutionResult,
  ControlledExecutionRunLifecycleStatus,
  ControlledExecutionRunManifestEvent,
  ControlledExecutionRunManifestProfileSnapshot,
  ControlledExecutionRunManifestReferences,
  ControlledExecutionRunManifestSnapshot,
  ControlledRunApprovalDecision,
  ControlledRunApprovalResolutionResult,
  ControlledRunStatusDataQuality,
  ControlledRunStatusReadResult,
  EvaluationCriterion,
  ExecutionConstraints,
  ExecutionStatus,
  ShadowAdvisorSelection
} from "../types.js";
import type { ContextCompiler } from "./context-compiler.js";
import type { ExecutionAuditIndexV017 } from "./execution-audit-index.js";
import type { ExecutionAuditTimelineV016 } from "./execution-audit-timeline.js";
import type { ModelRouter } from "./model-router.js";
import type { TokenGovernor } from "./token-governor.js";
import type { StateMemory } from "./state-memory.js";
import type { HumanApprovalGate } from "./human-approval-gate.js";
import { determineTaskType, type Orchestrator } from "../orchestrator.js";

export interface ControlledOperationalExecutionDependencies {
  stateMemory: StateMemory;
  contextCompiler: ContextCompiler;
  modelRouter: ModelRouter;
  tokenGovernor: TokenGovernor;
  orchestrator: Orchestrator;
  executionAuditTimeline: ExecutionAuditTimelineV016;
  executionAuditIndex: ExecutionAuditIndexV017;
  humanApprovalGate: HumanApprovalGate;
}

export class ControlledOperationalExecutionV018 {
  constructor(private readonly dependencies: ControlledOperationalExecutionDependencies) {}

  async runControlledExecution(
    profile: ControlledExecutionProfile
  ): Promise<ControlledExecutionResult> {
    const runId = profile.runId ?? createRunId();
    const profileSnapshot = createProfileSnapshot(profile);
    const existingEvents = await this.dependencies.stateMemory.listControlledExecutionRunManifestEvents(runId);
    const idempotencyResult = await this.resolveIdempotency({
      runId,
      profile,
      profileSnapshot,
      existingEvents
    });

    if (idempotencyResult) {
      return idempotencyResult;
    }

    const runCreated = await this.recordManifestEvent({
      runId,
      lifecycleStatus: "run_created",
      profileSnapshot,
      reason: "Controlled execution run invocation received."
    });

    if (runCreated.status === "manifest_record_failed") {
      return manifestFailedResult(runId, profile, runCreated.reason);
    }

    const profileError = validateProfile(profile);

    if (profileError) {
      const result = rejected(runId, profile, profileError);
      return this.recordTransition(profileSnapshot, result, "profile_rejected");
    }

    if (profile.mode === "dry_run") {
      const result = await this.runDryRun(runId, profile);
      return this.recordTransition(profileSnapshot, result, dryRunLifecycleStatus(result.status));
    }

    const result = await this.runLive(runId, profile);
    return this.recordTransition(profileSnapshot, result, liveLifecycleStatus(result.status));
  }

  async getControlledRunStatus(runId: string): Promise<ControlledRunStatusReadResult> {
    const events = await this.dependencies.stateMemory.listControlledExecutionRunManifestEvents(runId);
    const snapshot = latestManifestSnapshot(events);

    if (!snapshot) {
      return {
        status: "not_found",
        runId,
        reason: `Controlled run not found for runId ${runId}.`
      };
    }

    return this.statusFromManifest(snapshot);
  }

  async resolveControlledRunApproval(
    runId: string,
    approvalDecision: { decision: ControlledRunApprovalDecision; reason?: string }
  ): Promise<ControlledRunApprovalResolutionResult> {
    const runStatus = await this.getControlledRunStatus(runId);

    if (runStatus.status === "not_found") {
      return {
        status: "not_found",
        runId,
        reason: runStatus.reason
      };
    }

    if (!runStatus.approvalResolutionEligible || !runStatus.executionId) {
      return {
        status: "not_resolvable",
        runId,
        executionId: runStatus.executionId,
        runStatus,
        reason: `Controlled run ${runId} has no resolvable approval from lifecycle ${runStatus.lifecycleStatus}.`
      };
    }

    try {
      const command = {
        executionId: runStatus.executionId,
        reason: approvalDecision.reason
      };
      const result =
        approvalDecision.decision === "approved"
          ? await this.dependencies.humanApprovalGate.approvePendingStep(
              command,
              this.dependencies.stateMemory
            )
          : await this.dependencies.humanApprovalGate.rejectPendingStep(
              command,
              this.dependencies.stateMemory
            );
      const refreshedStatus = await this.getControlledRunStatus(runId);

      if (approvalDecision.decision === "approved") {
        return {
          status: "approved",
          runId,
          executionId: runStatus.executionId,
          effectiveSelection: runStatus.effectiveSelection,
          approvalDecision: "approved",
          runStatus: refreshedStatus,
          reason: result.reason
        };
      }

      return {
        status: "rejected",
        runId,
        executionId: runStatus.executionId,
        effectiveSelection: runStatus.effectiveSelection,
        approvalDecision: "rejected",
        runStatus: refreshedStatus,
        reason: result.reason
      };
    } catch (error) {
      return {
        status: "approval_resolution_failed",
        runId,
        executionId: runStatus.executionId,
        runStatus,
        reason: error instanceof Error ? error.message : "Controlled run approval resolution failed."
      };
    }
  }

  private async resolveIdempotency(input: {
    runId: string;
    profile: ControlledExecutionProfile;
    profileSnapshot: ControlledExecutionRunManifestProfileSnapshot;
    existingEvents: ControlledExecutionRunManifestEvent[];
  }): Promise<ControlledExecutionResult | undefined> {
    if (input.existingEvents.length === 0) {
      return undefined;
    }

    const firstEvent = input.existingEvents[0];

    if (firstEvent?.profileFingerprint !== input.profileSnapshot.profileFingerprint) {
      const result = rejected(
        input.runId,
        input.profile,
        "RunId conflict: existing controlled execution run has a different profileFingerprint."
      );
      return this.recordTransition(input.profileSnapshot, result, "profile_rejected");
    }

    const latest = latestManifestSnapshot(input.existingEvents);

    if (!latest) {
      return manifestFailedResult(
        input.runId,
        input.profile,
        "Controlled execution run has existing manifest events but no derivable snapshot."
      );
    }

    return resultFromManifest(input.profile, latest);
  }

  private async runDryRun(
    runId: string,
    profile: ControlledExecutionProfile
  ): Promise<ControlledExecutionResult> {
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
      return rejected(runId, profile, `Profile rejected before provider call: ${tokenDecision.reason}`);
    }

    return {
      status: "dry_run_ready",
      profileValidationStatus: "profile_validated",
      runId,
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

  private async runLive(
    runId: string,
    profile: ControlledExecutionProfile
  ): Promise<ControlledExecutionResult> {
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
      runId,
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

  private async recordTransition(
    profileSnapshot: ControlledExecutionRunManifestProfileSnapshot,
    result: ControlledExecutionResult,
    lifecycleStatus: ControlledExecutionRunLifecycleStatus
  ): Promise<ControlledExecutionResult> {
    const recorded = await this.recordManifestEvent({
      runId: result.runId ?? createRunId(),
      lifecycleStatus,
      profileSnapshot,
      result,
      reason: result.reason
    });

    if (recorded.status === "manifest_record_failed") {
      return {
        ...result,
        manifestRecordingStatus: "manifest_record_failed",
        manifest: recorded.snapshot,
        reason: `${result.reason} Manifest recording failed: ${recorded.reason}`
      };
    }

    return {
      ...result,
      manifestRecordingStatus: "manifest_recorded",
      manifest: recorded.snapshot
    };
  }

  private async recordManifestEvent(input: {
    runId: string;
    lifecycleStatus: ControlledExecutionRunLifecycleStatus;
    profileSnapshot: ControlledExecutionRunManifestProfileSnapshot;
    result?: ControlledExecutionResult;
    reason: string;
  }): Promise<{
    status: ControlledExecutionManifestRecordingStatus;
    reason: string;
    snapshot?: ControlledExecutionRunManifestSnapshot;
  }> {
    try {
      const existingEvents = await this.dependencies.stateMemory.listControlledExecutionRunManifestEvents(input.runId);
      const event: ControlledExecutionRunManifestEvent = {
        id: `run_manifest_${input.runId}_${existingEvents.length}`,
        runId: input.runId,
        sequence: existingEvents.length,
        lifecycleStatus: input.lifecycleStatus,
        profileFingerprint: input.profileSnapshot.profileFingerprint,
        profileSnapshot: input.profileSnapshot,
        controlledStatus: input.result?.status,
        profileValidationStatus: input.result?.profileValidationStatus,
        executionId: input.result?.executionId,
        provider: input.result?.provider,
        model: input.result?.model,
        estimatedCostUsd: input.result?.estimatedCostUsd,
        actualCostUsd: input.result?.actualCostUsd,
        evaluationStatus: input.result?.evaluationStatus,
        references: await this.referencesFor(input.result),
        reason: sanitizeText(input.reason),
        createdAt: new Date()
      };

      await this.dependencies.stateMemory.saveControlledExecutionRunManifestEvent(event);
      const events = [...existingEvents, event];

      return {
        status: "manifest_recorded",
        reason: "Controlled execution run manifest event recorded.",
        snapshot: latestManifestSnapshot(events)
      };
    } catch (error) {
      return {
        status: "manifest_record_failed",
        reason: error instanceof Error ? error.message : "Unknown manifest persistence error."
      };
    }
  }

  private async referencesFor(
    result: ControlledExecutionResult | undefined
  ): Promise<ControlledExecutionRunManifestReferences> {
    if (!result?.executionId) {
      return {};
    }

    const [timeline, summary, ledgerEntries, authorityEntries] = await Promise.all([
      this.dependencies.executionAuditTimeline.getExecutionAuditTimeline(result.executionId),
      this.dependencies.executionAuditIndex.getExecutionAuditSummary(result.executionId),
      this.dependencies.stateMemory.listBudgetLedgerEntries(result.executionId),
      this.dependencies.stateMemory.listAuthorityDecisionAuditEntries(result.executionId)
    ]);

    return {
      executionId: result.executionId,
      timeline: {
        status: timeline.status,
        dataQuality: timeline.status === "found" ? timeline.dataQuality : undefined
      },
      auditSummary: {
        status: summary.status,
        requiresAttention: summary.status === "found" ? summary.summary.requiresAttention : undefined
      },
      budgetLedger: {
        entryCount: ledgerEntries.length
      },
      authorityAudit: {
        entryCount: authorityEntries.length
      }
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

  private async statusFromManifest(
    snapshot: ControlledExecutionRunManifestSnapshot
  ): Promise<ControlledRunStatusReadResult> {
    const latest = snapshot.latestEvent;
    const execution = latest.executionId
      ? await this.dependencies.stateMemory.getExecution(latest.executionId)
      : undefined;
    const pendingApproval = latest.executionId
      ? await this.dependencies.stateMemory.getPendingApprovalStep(latest.executionId)
      : undefined;
    const references = await this.referencesFor(
      latest.executionId
        ? {
            status: latest.controlledStatus ?? controlledStatusFromLifecycle(latest.lifecycleStatus),
            profileValidationStatus: latest.profileValidationStatus ?? "profile_validated",
            runId: latest.runId,
            executionId: latest.executionId,
            provider: latest.provider,
            model: latest.model,
            estimatedCostUsd: latest.estimatedCostUsd,
            actualCostUsd: latest.actualCostUsd,
            evaluationStatus: latest.evaluationStatus,
            reason: latest.reason
          }
        : undefined
    );
    const dataQuality = statusDataQuality({
      latest,
      executionStatus: execution?.status,
      hasPendingApproval: Boolean(pendingApproval)
    });

    return {
      status: "found",
      runId: snapshot.runId,
      executionId: latest.executionId,
      mode: latest.profileSnapshot.mode,
      lifecycleStatus: latest.lifecycleStatus,
      persistenceOutcome: snapshot.recordingStatus,
      profileFingerprint: snapshot.profileFingerprint,
      profileValidationStatus: latest.profileValidationStatus,
      controlledStatus: latest.controlledStatus,
      provider: latest.provider,
      model: latest.model,
      effectiveSelection: effectiveSelectionFromPendingStep(pendingApproval),
      evaluationStatus: latest.evaluationStatus,
      estimatedCostUsd: latest.estimatedCostUsd,
      actualCostUsd: latest.actualCostUsd,
      requiresHumanApproval: latest.lifecycleStatus === "live_pending_approval",
      approvalResolutionEligible:
        latest.lifecycleStatus === "live_pending_approval" && Boolean(pendingApproval),
      references,
      dataQuality,
      reason: controlledRunStatusReason({
        latest,
        dataQuality,
        executionStatus: execution?.status,
        hasPendingApproval: Boolean(pendingApproval)
      })
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
  runId: string,
  profile: Partial<ControlledExecutionProfile>,
  reason: string
): ControlledExecutionResult {
  return {
    status: "profile_rejected",
    profileValidationStatus: "profile_rejected",
    runId,
    profileId: profile.profileId,
    reason
  };
}

function manifestFailedResult(
  runId: string,
  profile: Partial<ControlledExecutionProfile>,
  reason: string
): ControlledExecutionResult {
  return {
    status: "profile_rejected",
    profileValidationStatus: "profile_rejected",
    runId,
    profileId: profile.profileId,
    reason: `Manifest recording failed before provider call: ${reason}`,
    manifestRecordingStatus: "manifest_record_failed"
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

function liveLifecycleStatus(
  status: ControlledExecutionResult["status"]
): ControlledExecutionRunLifecycleStatus {
  if (status === "execution_pending_approval") {
    return "live_pending_approval";
  }

  if (status === "execution_completed") {
    return "live_completed";
  }

  if (status === "dry_run_ready" || status === "profile_rejected") {
    return status;
  }

  return "live_failed";
}

function dryRunLifecycleStatus(
  status: ControlledExecutionResult["status"]
): ControlledExecutionRunLifecycleStatus {
  return status === "dry_run_ready" ? "dry_run_ready" : "profile_rejected";
}

function createRunId(): string {
  return `run_${randomUUID()}`;
}

function createProfileSnapshot(
  profile: ControlledExecutionProfile
): ControlledExecutionRunManifestProfileSnapshot {
  const constraints = profile.constraints ?? {};
  const normalizedProfile = {
    profileId: profile.profileId,
    mode: profile.mode,
    projectId: profile.projectId,
    goal: profile.goal,
    constraints,
    evaluationCriteria: profile.evaluationCriteria,
    approvalPolicy: profile.approvalPolicy,
    budgets: profile.budgets,
    auditRequirements: profile.auditRequirements,
    contextRefs: profile.contextRefs
  };

  return {
    profileId: profile.profileId,
    mode: profile.mode,
    profileFingerprint: digest(stableStringify(normalizedProfile)),
    goalDigest: digest(profile.goal ?? ""),
    goalLength: typeof profile.goal === "string" ? profile.goal.length : 0,
    constraintsDigest: digest(stableStringify(constraints)),
    constraintKeys: Object.keys(constraints).sort().map(sanitizeText),
    evaluationCriteriaSummary: (profile.evaluationCriteria ?? []).map((criterion) => ({
      type: criterion.type,
      descriptionPresent: Boolean("description" in criterion && criterion.description)
    })),
    approvalPolicySummary: {
      mediumRiskRequiresApproval: profile.approvalPolicy?.mediumRiskRequiresApproval,
      maxAutomaticCostUsd: profile.approvalPolicy?.maxAutomaticCostUsd
    },
    budgetsSummary: { ...(profile.budgets ?? {}) },
    auditRequirementsSummary: { ...(profile.auditRequirements ?? {}) }
  };
}

function latestManifestSnapshot(
  events: ControlledExecutionRunManifestEvent[]
): ControlledExecutionRunManifestSnapshot | undefined {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const latestEvent = ordered.at(-1);

  if (!latestEvent) {
    return undefined;
  }

  return {
    runId: latestEvent.runId,
    profileFingerprint: latestEvent.profileFingerprint,
    latestLifecycleStatus: latestEvent.lifecycleStatus,
    recordingStatus: "manifest_recorded",
    events: ordered,
    latestEvent
  };
}

function resultFromManifest(
  profile: ControlledExecutionProfile,
  snapshot: ControlledExecutionRunManifestSnapshot
): ControlledExecutionResult {
  const event = snapshot.latestEvent;
  const status = event.controlledStatus ?? controlledStatusFromLifecycle(event.lifecycleStatus);

  return {
    status,
    profileValidationStatus:
      event.profileValidationStatus ??
      (status === "profile_rejected" ? "profile_rejected" : "profile_validated"),
    runId: snapshot.runId,
    profileId: profile.profileId,
    executionId: event.executionId,
    provider: event.provider,
    model: event.model,
    estimatedCostUsd: event.estimatedCostUsd,
    actualCostUsd: event.actualCostUsd,
    evaluationStatus: event.evaluationStatus,
    reason: `Idempotent controlled execution run replayed from manifest lifecycle ${event.lifecycleStatus}.`,
    manifestRecordingStatus: "manifest_recorded",
    manifest: snapshot
  };
}

function controlledStatusFromLifecycle(
  lifecycleStatus: ControlledExecutionRunLifecycleStatus
): ControlledExecutionResult["status"] {
  if (lifecycleStatus === "dry_run_ready" || lifecycleStatus === "profile_rejected") {
    return lifecycleStatus;
  }

  if (lifecycleStatus === "live_pending_approval") {
    return "execution_pending_approval";
  }

  if (lifecycleStatus === "live_completed") {
    return "execution_completed";
  }

  return "execution_failed";
}

function effectiveSelectionFromPendingStep(
  pendingApproval: Awaited<ReturnType<StateMemory["getPendingApprovalStep"]>>
): ShadowAdvisorSelection | undefined {
  const value = pendingApproval?.metadata["effectiveSelection"];

  if (
    value &&
    typeof value === "object" &&
    "provider" in value &&
    "model" in value &&
    typeof (value as { provider?: unknown }).provider === "string" &&
    typeof (value as { model?: unknown }).model === "string"
  ) {
    return value as ShadowAdvisorSelection;
  }

  return undefined;
}

function statusDataQuality(input: {
  latest: ControlledExecutionRunManifestEvent;
  executionStatus?: ExecutionStatus;
  hasPendingApproval: boolean;
}): ControlledRunStatusDataQuality {
  if (input.latest.lifecycleStatus === "live_pending_approval") {
    if (!input.latest.executionId || !input.executionStatus) {
      return "partial";
    }

    if (!input.hasPendingApproval && input.executionStatus === "needs_human") {
      return "inconsistent";
    }

    if (!input.hasPendingApproval) {
      return "partial";
    }
  }

  if (input.latest.executionId && !input.executionStatus) {
    return "inconsistent";
  }

  return "complete";
}

function controlledRunStatusReason(input: {
  latest: ControlledExecutionRunManifestEvent;
  dataQuality: ControlledRunStatusDataQuality;
  executionStatus?: ExecutionStatus;
  hasPendingApproval: boolean;
}): string {
  if (input.dataQuality === "inconsistent") {
    return `Controlled run ${input.latest.runId} has inconsistent persisted evidence for lifecycle ${input.latest.lifecycleStatus}.`;
  }

  if (input.dataQuality === "partial") {
    return `Controlled run ${input.latest.runId} is found with partial evidence for lifecycle ${input.latest.lifecycleStatus}.`;
  }

  if (input.latest.lifecycleStatus === "live_pending_approval" && input.hasPendingApproval) {
    return `Controlled run ${input.latest.runId} is found and eligible for approval resolution.`;
  }

  return `Controlled run ${input.latest.runId} is found with lifecycle ${input.latest.lifecycleStatus}.`;
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeText(value: string): string {
  return value.replace(/api[_-]?key|token|secret|workspace[_-]?id|authorization/gi, "[redacted]");
}
