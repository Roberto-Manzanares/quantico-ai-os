import { createHash, randomUUID } from "node:crypto";
import type {
  ControlledApprovalCompletionResult,
  ControlledExecutionAuditRequirements,
  BudgetLedgerEntry,
  ControlledExecutionContinuationResult,
  ControlledExecutionManifestRecordingStatus,
  ControlledExecutionProfile,
  ControlledExecutionResult,
  ControlledExecutionRunLifecycleStatus,
  ControlledExecutionRunManifestEvent,
  ControlledExecutionRunManifestProfileSnapshot,
  ControlledExecutionRunManifestReferences,
  ControlledExecutionRunManifestSnapshot,
  ControlledRunFinalizationResult,
  ControlledRunApprovalDecision,
  ControlledRunApprovalResolutionResult,
  ControlledRunClosureResult,
  ControlledRunStatusDataQuality,
  ControlledRunStatusReadResult,
  EvaluationCriterion,
  ExecutionEvent,
  ExecutionConstraints,
  ExecutionStatus,
  ShadowAdvisorSelection,
  TokenDecision
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

  async continueApprovedExecution(runId: string): Promise<ControlledExecutionContinuationResult> {
    const runStatus = await this.getControlledRunStatus(runId);

    if (runStatus.status === "not_found") {
      return {
        status: "not_found",
        runId,
        reason: runStatus.reason
      };
    }

    const manifestEvents = await this.dependencies.stateMemory.listControlledExecutionRunManifestEvents(runId);
    const manifestSnapshot = latestManifestSnapshot(manifestEvents);
    const profileSnapshot = manifestSnapshot?.latestEvent.profileSnapshot;

    if (!profileSnapshot) {
      return notContinuable(runId, runStatus, `Controlled run ${runId} has no recoverable manifest profile snapshot.`);
    }

    if (runStatus.lifecycleStatus === "live_completed") {
      return this.continuationFromCompletedManifest(runStatus);
    }

    if (runStatus.lifecycleStatus !== "live_pending_approval" || !runStatus.executionId) {
      return notContinuable(runId, runStatus, `Controlled run ${runId} is not in live_pending_approval lifecycle.`);
    }

    const execution = await this.dependencies.stateMemory.getExecution(runStatus.executionId);

    if (!execution) {
      return notContinuable(runId, runStatus, `Execution not found for controlled run ${runId}.`);
    }

    const pendingApproval = await this.dependencies.stateMemory.getPendingApprovalStep(runStatus.executionId);

    if (pendingApproval) {
      return notContinuable(runId, runStatus, `Controlled run ${runId} still has an active pending approval.`);
    }

    const events = await this.dependencies.stateMemory.listEvents(runStatus.executionId);

    if (!hasApprovedResolution(events)) {
      return notContinuable(runId, runStatus, `Controlled run ${runId} has no approved V0.20 approval resolution.`);
    }

    if (hasProviderCallEvidence(events, await this.dependencies.stateMemory.listBudgetLedgerEntries(runStatus.executionId))) {
      return notContinuable(runId, runStatus, `Controlled run ${runId} already has provider call evidence for this continuation.`);
    }

    const effectiveSelection = recoverEffectiveSelection(events);

    if (!effectiveSelection) {
      return notContinuable(runId, runStatus, `Controlled run ${runId} has no recoverable effectiveSelection.`);
    }

    const tokenDecision = recoverTokenDecision(events);

    if (!tokenDecision || tokenDecision.status !== "allow") {
      return notContinuable(runId, runStatus, `Controlled run ${runId} has no recoverable allowed Token Governor decision.`);
    }

    try {
      const orchestration = await this.dependencies.orchestrator.continueApprovedExecution({
        executionId: runStatus.executionId,
        effectiveSelection,
        tokenDecision
      });
      const ledgerEntries = await this.dependencies.stateMemory.listBudgetLedgerEntries(
        orchestration.execution.id
      );
      const providerLedgerEntry = ledgerEntries.find((entry) => entry.calculationStatus !== "not_applicable");
      const postAudit = await this.postAudit(orchestration.execution.id, {
        requireTimeline: true,
        requireAuditSummary: true
      });
      const controlledResult: ControlledExecutionResult = {
        status: liveStatus(orchestration.execution.status),
        profileValidationStatus: "profile_validated",
        runId,
        profileId: profileSnapshot.profileId,
        executionId: orchestration.execution.id,
        provider: providerLedgerEntry?.provider ?? effectiveSelection.provider,
        model: providerLedgerEntry?.model ?? effectiveSelection.model,
        estimatedCostUsd: orchestration.execution.metrics.estimatedCostUsd,
        actualCostUsd: orchestration.execution.metrics.actualCostUsd,
        evaluationStatus: orchestration.evaluation.status,
        postAudit,
        reason: `Approved execution continuation finished with execution status ${orchestration.execution.status}.`
      };
      const recorded = await this.recordTransition(
        profileSnapshot,
        controlledResult,
        liveLifecycleStatus(controlledResult.status)
      );

      if (recorded.manifestRecordingStatus === "manifest_record_failed") {
        return {
          status: "continuation_failed",
          runId,
          executionId: orchestration.execution.id,
          effectiveSelection,
          manifestRecordingStatus: recorded.manifestRecordingStatus,
          manifest: recorded.manifest,
          reason: recorded.reason
        };
      }

      if (orchestration.execution.status !== "succeeded") {
        return {
          status: "continuation_failed",
          runId,
          executionId: orchestration.execution.id,
          effectiveSelection,
          manifestRecordingStatus: recorded.manifestRecordingStatus,
          manifest: recorded.manifest,
          reason: `Approved execution continuation ended with execution status ${orchestration.execution.status}.`
        };
      }

      return {
        status: "continued",
        runId,
        executionId: orchestration.execution.id,
        executionStatus: orchestration.execution.status,
        effectiveSelection,
        provider: controlledResult.provider,
        model: controlledResult.model,
        estimatedCostUsd: controlledResult.estimatedCostUsd,
        actualCostUsd: controlledResult.actualCostUsd,
        evaluationStatus: orchestration.evaluation.status,
        postAudit,
        manifestRecordingStatus: recorded.manifestRecordingStatus,
        manifest: recorded.manifest,
        reason: "Approved execution continued without rerouting, authority reevaluation, or a new Execution."
      };
    } catch (error) {
      return {
        status: "continuation_failed",
        runId,
        executionId: runStatus.executionId,
        effectiveSelection,
        reason: error instanceof Error ? error.message : "Approved execution continuation failed."
      };
    }
  }

  async completeControlledRunApproval(
    runId: string,
    approvalDecision: { decision: ControlledRunApprovalDecision; reason?: string }
  ): Promise<ControlledApprovalCompletionResult> {
    const runStatus = await this.getControlledRunStatus(runId);

    if (runStatus.status === "not_found") {
      return {
        status: "not_found",
        runId,
        reason: runStatus.reason
      };
    }

    if (approvalDecision.decision === "approved" && runStatus.lifecycleStatus === "live_completed") {
      const continuation = await this.continueApprovedExecution(runId);

      if (continuation.status === "continued") {
        return completedFromContinuation(runId, undefined, continuation);
      }

      return completionFromContinuationFailure(runId, undefined, continuation);
    }

    if (approvalDecision.decision === "rejected" && runStatus.executionId) {
      const events = await this.dependencies.stateMemory.listEvents(runStatus.executionId);

      if (hasRejectedResolution(events)) {
        return {
          status: "rejected",
          runId,
          executionId: runStatus.executionId,
          effectiveSelection: recoverEffectiveSelection(events) ?? runStatus.effectiveSelection,
          approvalResolution: {
            status: "rejected",
            runId,
            executionId: runStatus.executionId,
            effectiveSelection: recoverEffectiveSelection(events) ?? runStatus.effectiveSelection,
            approvalDecision: "rejected",
            runStatus,
            reason: `Idempotent rejected approval completion replayed for run ${runId}.`
          },
          reason: `Controlled run ${runId} approval was already rejected; provider call remains blocked.`
        };
      }
    }

    const approvalResolution = await this.resolveControlledRunApproval(runId, approvalDecision);

    if (approvalResolution.status === "not_found") {
      return {
        status: "not_found",
        runId,
        reason: approvalResolution.reason
      };
    }

    if (approvalResolution.status === "rejected") {
      return {
        status: "rejected",
        runId,
        executionId: approvalResolution.executionId,
        effectiveSelection: approvalResolution.effectiveSelection,
        approvalResolution,
        reason: "Controlled run approval was rejected; provider call was not executed."
      };
    }

    if (approvalResolution.status !== "approved") {
      return {
        status:
          approvalResolution.status === "not_resolvable" ? "not_completable" : "completion_failed",
        runId,
        executionId: approvalResolution.executionId,
        approvalResolution,
        reason: `Controlled run approval could not be completed: ${approvalResolution.reason}`
      };
    }

    const continuation = await this.continueApprovedExecution(runId);

    if (continuation.status === "continued") {
      return completedFromContinuation(runId, approvalResolution, continuation);
    }

    return completionFromContinuationFailure(runId, approvalResolution, continuation);
  }

  async finalizeControlledRun(runId: string): Promise<ControlledRunFinalizationResult> {
    const manifestEvents = await this.dependencies.stateMemory.listControlledExecutionRunManifestEvents(runId);
    const manifestSnapshot = latestManifestSnapshot(manifestEvents);

    if (!manifestSnapshot) {
      return {
        status: "not_found",
        runId,
        reason: `Controlled run not found for runId ${runId}.`
      };
    }

    const existingFinalization = [...manifestSnapshot.events]
      .reverse()
      .find((event) => event.finalization);

    if (existingFinalization?.finalization?.status === "finalized") {
      return {
        status: "finalized",
        runId,
        executionId: existingFinalization.executionId,
        lifecycleStatus: existingFinalization.lifecycleStatus,
        dataQuality: existingFinalization.finalization.dataQuality ?? "complete",
        references: existingFinalization.finalization.checkedReferences,
        manifestRecordingStatus: "manifest_recorded",
        manifest: manifestSnapshot,
        reason: `Controlled run ${runId} was already finalized from append-only manifest evidence.`
      };
    }

    const latest = manifestSnapshot.latestEvent;

    if (!isFinalizableLifecycle(latest.lifecycleStatus)) {
      return {
        status: "not_finalizable",
        runId,
        executionId: latest.executionId,
        lifecycleStatus: latest.lifecycleStatus,
        reason: `Controlled run ${runId} is not finalizable from lifecycle ${latest.lifecycleStatus}.`
      };
    }

    const check = await this.checkFinalizationConsistency(latest);

    if (check.status === "not_finalizable") {
      return {
        status: "not_finalizable",
        runId,
        executionId: latest.executionId,
        lifecycleStatus: latest.lifecycleStatus,
        reason: check.reason
      };
    }

    if (check.status === "finalization_inconsistent") {
      return {
        status: "finalization_inconsistent",
        runId,
        executionId: latest.executionId,
        lifecycleStatus: latest.lifecycleStatus,
        dataQuality: check.dataQuality,
        references: check.references,
        reason: check.reason
      };
    }

    const recorded = await this.recordFinalizationEvent({
      latest,
      references: check.references,
      dataQuality: check.dataQuality,
      reason: check.reason
    });

    if (recorded.status === "manifest_record_failed") {
      return {
        status: "finalization_failed",
        runId,
        executionId: latest.executionId,
        lifecycleStatus: latest.lifecycleStatus,
        manifestRecordingStatus: recorded.status,
        manifest: recorded.snapshot,
        reason: `Controlled run ${runId} finalization was verified but marker recording failed: ${recorded.reason}`
      };
    }

    return {
      status: "finalized",
      runId,
      executionId: latest.executionId,
      lifecycleStatus: latest.lifecycleStatus,
      dataQuality: check.dataQuality,
      references: check.references,
      manifestRecordingStatus: "manifest_recorded",
      manifest: recorded.snapshot,
      reason: check.reason
    };
  }

  async closeControlledRun(
    runId: string,
    options: { approvalDecision?: ControlledRunApprovalDecision; reason?: string } = {}
  ): Promise<ControlledRunClosureResult> {
    const runStatus = await this.getControlledRunStatus(runId);

    if (runStatus.status === "not_found") {
      return {
        status: "not_found",
        runId,
        reason: runStatus.reason
      };
    }

    if (runStatus.lifecycleStatus === "live_pending_approval") {
      if (!options.approvalDecision) {
        return {
          status: "not_closable",
          runId,
          executionId: runStatus.executionId,
          reason: `Controlled run ${runId} requires an explicit approvalDecision before closure.`
        };
      }

      const completion = await this.completeControlledRunApproval(runId, {
        decision: options.approvalDecision,
        reason: options.reason
      });

      if (completion.status === "not_found") {
        return {
          status: "not_found",
          runId,
          reason: completion.reason
        };
      }

      if (completion.status === "not_completable") {
        return {
          status: "not_closable",
          runId,
          executionId: completion.executionId,
          completion,
          reason: completion.reason
        };
      }

      if (completion.status === "completion_failed") {
        return {
          status: "closure_failed",
          runId,
          executionId: completion.executionId,
          completion,
          reason: completion.reason
        };
      }

      const finalization = await this.finalizeControlledRun(runId);

      if (completion.status === "rejected") {
        if (finalization.status === "finalized") {
          return {
            status: "rejected",
            runId,
            executionId: completion.executionId,
            completion,
            finalization,
            reason: "Controlled run approval was rejected and closure evidence was finalized."
          };
        }

        if (finalization.status === "not_finalizable") {
          return {
            status: "rejected",
            runId,
            executionId: completion.executionId,
            completion,
            finalization,
            reason: "Controlled run approval was rejected; V0.23 finalization is not applicable yet and provider calls remain zero."
          };
        }

        return closureFromFinalizationFailure(runId, completion.executionId, completion, finalization);
      }

      return closureFromFinalization(runId, completion.executionId, completion, finalization);
    }

    if (isFinalizableLifecycle(runStatus.lifecycleStatus)) {
      const finalization = await this.finalizeControlledRun(runId);
      return closureFromFinalization(runId, runStatus.executionId, undefined, finalization);
    }

    return {
      status: "not_closable",
      runId,
      executionId: runStatus.executionId,
      reason: `Controlled run ${runId} is not closable from lifecycle ${runStatus.lifecycleStatus}.`
    };
  }

  private async continuationFromCompletedManifest(
    runStatus: Extract<ControlledRunStatusReadResult, { status: "found" }>
  ): Promise<ControlledExecutionContinuationResult> {
    const executionId = runStatus.executionId;

    if (!executionId) {
      return {
        status: "not_continuable",
        runId: runStatus.runId,
        runStatus,
        reason: `Controlled run ${runStatus.runId} has completed manifest lifecycle without executionId.`
      };
    }

    const events = await this.dependencies.stateMemory.listEvents(executionId);
    const effectiveSelection = recoverEffectiveSelection(events) ?? runStatus.effectiveSelection;

    if (!effectiveSelection) {
      return {
        status: "not_continuable",
        runId: runStatus.runId,
        executionId,
        runStatus,
        reason: `Controlled run ${runStatus.runId} has completed lifecycle but no recoverable effectiveSelection.`
      };
    }

    const execution = await this.dependencies.stateMemory.getExecution(executionId);

    if (!execution) {
      return {
        status: "not_continuable",
        runId: runStatus.runId,
        executionId,
        runStatus,
        reason: `Execution not found for completed controlled run ${runStatus.runId}.`
      };
    }

    return {
      status: "continued",
      runId: runStatus.runId,
      executionId,
      executionStatus: execution.status,
      effectiveSelection,
      provider: runStatus.provider,
      model: runStatus.model,
      estimatedCostUsd: runStatus.estimatedCostUsd,
      actualCostUsd: runStatus.actualCostUsd,
      evaluationStatus: runStatus.evaluationStatus,
      reason: `Idempotent approved continuation replayed from manifest lifecycle ${runStatus.lifecycleStatus}.`
    };
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

  private async recordFinalizationEvent(input: {
    latest: ControlledExecutionRunManifestEvent;
    references: ControlledExecutionRunManifestReferences;
    dataQuality: "complete" | "partial";
    reason: string;
  }): Promise<{
    status: ControlledExecutionManifestRecordingStatus;
    reason: string;
    snapshot?: ControlledExecutionRunManifestSnapshot;
  }> {
    try {
      const existingEvents = await this.dependencies.stateMemory.listControlledExecutionRunManifestEvents(
        input.latest.runId
      );
      const event: ControlledExecutionRunManifestEvent = {
        id: `run_manifest_${input.latest.runId}_${existingEvents.length}`,
        runId: input.latest.runId,
        sequence: existingEvents.length,
        lifecycleStatus: input.latest.lifecycleStatus,
        profileFingerprint: input.latest.profileFingerprint,
        profileSnapshot: input.latest.profileSnapshot,
        controlledStatus: input.latest.controlledStatus,
        profileValidationStatus: input.latest.profileValidationStatus,
        executionId: input.latest.executionId,
        provider: input.latest.provider,
        model: input.latest.model,
        estimatedCostUsd: input.latest.estimatedCostUsd,
        actualCostUsd: input.latest.actualCostUsd,
        evaluationStatus: input.latest.evaluationStatus,
        references: input.references,
        finalization: {
          status: "finalized",
          dataQuality: input.dataQuality,
          checkedReferences: input.references,
          reason: sanitizeText(input.reason),
          createdAt: new Date()
        },
        reason: sanitizeText(input.reason),
        createdAt: new Date()
      };

      await this.dependencies.stateMemory.saveControlledExecutionRunManifestEvent(event);

      return {
        status: "manifest_recorded",
        reason: "Controlled run finalization marker recorded.",
        snapshot: latestManifestSnapshot([...existingEvents, event])
      };
    } catch (error) {
      return {
        status: "manifest_record_failed",
        reason: error instanceof Error ? error.message : "Unknown finalization marker persistence error."
      };
    }
  }

  private async checkFinalizationConsistency(
    latest: ControlledExecutionRunManifestEvent
  ): Promise<
    | {
        status: "finalized";
        dataQuality: "complete" | "partial";
        references: ControlledExecutionRunManifestReferences;
        reason: string;
      }
    | {
        status: "not_finalizable";
        reason: string;
      }
    | {
        status: "finalization_inconsistent";
        dataQuality?: "complete" | "partial" | "inconsistent";
        references: ControlledExecutionRunManifestReferences;
        reason: string;
      }
  > {
    if (!latest.executionId) {
      if (latest.lifecycleStatus === "profile_rejected" || latest.lifecycleStatus === "dry_run_ready") {
        return {
          status: "finalized",
          dataQuality: "complete",
          references: latest.references,
          reason: `Controlled run ${latest.runId} finalized from terminal manifest lifecycle ${latest.lifecycleStatus} without fictitious Execution.`
        };
      }

      return {
        status: "not_finalizable",
        reason: `Controlled run ${latest.runId} has no executionId for lifecycle ${latest.lifecycleStatus}.`
      };
    }

    const [execution, events, ledgerEntries, timeline, summary, authorityEntries] = await Promise.all([
      this.dependencies.stateMemory.getExecution(latest.executionId),
      this.dependencies.stateMemory.listEvents(latest.executionId),
      this.dependencies.stateMemory.listBudgetLedgerEntries(latest.executionId),
      this.dependencies.executionAuditTimeline.getExecutionAuditTimeline(latest.executionId),
      this.dependencies.executionAuditIndex.getExecutionAuditSummary(latest.executionId),
      this.dependencies.stateMemory.listAuthorityDecisionAuditEntries(latest.executionId)
    ]);
    const references: ControlledExecutionRunManifestReferences = {
      executionId: latest.executionId,
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
    const contradictions: string[] = [];

    if (!execution) {
      contradictions.push(`Manifest references missing Execution ${latest.executionId}.`);
    }

    if (execution && !lifecycleMatchesExecution(latest.lifecycleStatus, execution.status)) {
      contradictions.push(
        `Manifest lifecycle ${latest.lifecycleStatus} contradicts Execution status ${execution.status}.`
      );
    }

    if (timeline.status !== "found") {
      contradictions.push(`Timeline is not found for Execution ${latest.executionId}.`);
    } else if (timeline.dataQuality === "inconsistent") {
      contradictions.push(`Timeline reports inconsistent evidence: ${timeline.reason}`);
    }

    if (summary.status === "found" && summary.summary.hasInconsistency) {
      contradictions.push(`Audit summary reports inconsistency for Execution ${latest.executionId}.`);
    }

    if (hasProviderCallEvidence(events, ledgerEntries) && ledgerEntries.length === 0) {
      contradictions.push("Provider call evidence exists without Budget Ledger entry.");
    }

    if (latest.lifecycleStatus === "live_completed" && !hasProviderCallEvidence(events, ledgerEntries)) {
      contradictions.push("Completed live run has no provider call evidence.");
    }

    if (latest.provider) {
      const providerLedgerEntry = ledgerEntries.find((entry) => entry.calculationStatus !== "not_applicable");

      if (
        providerLedgerEntry &&
        (providerLedgerEntry.provider !== latest.provider || providerLedgerEntry.model !== latest.model)
      ) {
        contradictions.push(
          `Manifest provider/model ${latest.provider}/${latest.model} contradicts Budget Ledger ${providerLedgerEntry.provider}/${providerLedgerEntry.model}.`
        );
      }
    }

    if (contradictions.length > 0) {
      return {
        status: "finalization_inconsistent",
        dataQuality: timeline.status === "found" ? timeline.dataQuality : undefined,
        references,
        reason: `Controlled run ${latest.runId} cannot be finalized: ${contradictions.join(" ")}`
      };
    }

    return {
      status: "finalized",
      dataQuality: timeline.status === "found" && timeline.dataQuality === "complete" ? "complete" : "partial",
      references,
      reason: `Controlled run ${latest.runId} finalized with coherent persisted Manifest, Execution, Ledger, and Timeline evidence.`
    };
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

function notContinuable(
  runId: string,
  runStatus: Extract<ControlledRunStatusReadResult, { status: "found" }>,
  reason: string
): ControlledExecutionContinuationResult {
  return {
    status: "not_continuable",
    runId,
    executionId: runStatus.executionId,
    runStatus,
    reason
  };
}

function hasApprovedResolution(events: ExecutionEvent[]): boolean {
  return events.some(
    (event) => event.type === "approval_decision" && event.decisionApplied === "approved"
  );
}

function hasRejectedResolution(events: ExecutionEvent[]): boolean {
  return events.some(
    (event) => event.type === "approval_decision" && event.decisionApplied === "rejected"
  );
}

function hasProviderCallEvidence(
  events: ExecutionEvent[],
  ledgerEntries: BudgetLedgerEntry[]
): boolean {
  return (
    events.some((event) => event.type === "model_called" || event.type === "provider_error") ||
    ledgerEntries.some((entry) => entry.calculationStatus !== "not_applicable")
  );
}

function completedFromContinuation(
  runId: string,
  approvalResolution: ControlledRunApprovalResolutionResult | undefined,
  continuation: Extract<ControlledExecutionContinuationResult, { status: "continued" }>
): ControlledApprovalCompletionResult {
  return {
    status: "completed",
    runId,
    executionId: continuation.executionId,
    effectiveSelection: continuation.effectiveSelection,
    provider: continuation.provider,
    model: continuation.model,
    estimatedCostUsd: continuation.estimatedCostUsd,
    actualCostUsd: continuation.actualCostUsd,
    evaluationStatus: continuation.evaluationStatus,
    executionStatus: continuation.executionStatus,
    approvalResolution,
    continuation,
    reason: "Controlled approval completion resolved approval and continued the approved execution."
  };
}

function completionFromContinuationFailure(
  runId: string,
  approvalResolution: ControlledRunApprovalResolutionResult | undefined,
  continuation: ControlledExecutionContinuationResult
): ControlledApprovalCompletionResult {
  if (continuation.status === "not_found") {
    return {
      status: "not_found",
      runId,
      reason: continuation.reason
    };
  }

  if (continuation.status === "not_continuable") {
    return {
      status: "not_completable",
      runId,
      executionId: continuation.executionId,
      approvalResolution,
      continuation,
      reason: continuation.reason
    };
  }

  return {
    status: "completion_failed",
    runId,
    executionId: continuation.executionId,
    approvalResolution,
    continuation,
    reason: continuation.reason
  };
}

function closureFromFinalization(
  runId: string,
  executionId: string | undefined,
  completion: ControlledApprovalCompletionResult | undefined,
  finalization: ControlledRunFinalizationResult
): ControlledRunClosureResult {
  if (finalization.status === "finalized") {
    return {
      status: "closed",
      runId,
      executionId: finalization.executionId ?? executionId,
      completion,
      finalization,
      reason: "Controlled run closure completed through V0.23 finalization."
    };
  }

  return closureFromFinalizationFailure(runId, executionId, completion, finalization);
}

function closureFromFinalizationFailure(
  runId: string,
  executionId: string | undefined,
  completion: ControlledApprovalCompletionResult | undefined,
  finalization: ControlledRunFinalizationResult
): ControlledRunClosureResult {
  if (finalization.status === "not_found") {
    return {
      status: "not_found",
      runId,
      reason: finalization.reason
    };
  }

  if (finalization.status === "not_finalizable") {
    return {
      status: "not_closable",
      runId,
      executionId: finalization.executionId ?? executionId,
      completion,
      finalization,
      reason: finalization.reason
    };
  }

  if (finalization.status === "finalization_inconsistent") {
    return {
      status: "closure_inconsistent",
      runId,
      executionId: finalization.executionId ?? executionId,
      completion,
      finalization,
      reason: finalization.reason
    };
  }

  return {
    status: "closure_failed",
    runId,
    executionId: finalization.executionId ?? executionId,
    completion,
    finalization,
    reason: finalization.reason
  };
}

function recoverEffectiveSelection(events: ExecutionEvent[]): ShadowAdvisorSelection | undefined {
  for (const event of [...events].reverse()) {
    const direct = maybeSelection((event.payload as Record<string, unknown>)["effectiveSelection"]);

    if (direct) {
      return direct;
    }

    const metadata = (event.payload as Record<string, unknown>)["metadata"];

    if (metadata && typeof metadata === "object") {
      const nested = maybeSelection((metadata as Record<string, unknown>)["effectiveSelection"]);

      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function maybeSelection(value: unknown): ShadowAdvisorSelection | undefined {
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

function recoverTokenDecision(events: ExecutionEvent[]): TokenDecision | undefined {
  for (const event of [...events].reverse()) {
    const tokenDecision = (event.payload as Record<string, unknown>)["tokenDecision"];

    if (isTokenDecision(tokenDecision)) {
      return tokenDecision;
    }
  }

  return undefined;
}

function isTokenDecision(value: unknown): value is TokenDecision {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    ((value as { status?: unknown }).status === "allow" ||
      (value as { status?: unknown }).status === "reject") &&
    typeof (value as { estimatedInputTokens?: unknown }).estimatedInputTokens === "number" &&
    typeof (value as { estimatedOutputTokens?: unknown }).estimatedOutputTokens === "number" &&
    typeof (value as { estimatedTotalTokens?: unknown }).estimatedTotalTokens === "number" &&
    (typeof (value as { estimatedCostUsd?: unknown }).estimatedCostUsd === "number" ||
      (value as { estimatedCostUsd?: unknown }).estimatedCostUsd === null) &&
    typeof (value as { reason?: unknown }).reason === "string"
  );
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

function isFinalizableLifecycle(lifecycleStatus: ControlledExecutionRunLifecycleStatus): boolean {
  return (
    lifecycleStatus === "profile_rejected" ||
    lifecycleStatus === "dry_run_ready" ||
    lifecycleStatus === "live_completed" ||
    lifecycleStatus === "live_failed"
  );
}

function lifecycleMatchesExecution(
  lifecycleStatus: ControlledExecutionRunLifecycleStatus,
  executionStatus: ExecutionStatus
): boolean {
  if (lifecycleStatus === "live_completed") {
    return executionStatus === "succeeded";
  }

  if (lifecycleStatus === "live_failed") {
    return executionStatus === "failed" || executionStatus === "cancelled";
  }

  return true;
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
