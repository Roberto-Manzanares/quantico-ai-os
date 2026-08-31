import type {
  EvaluationResult,
  Execution,
  ExecutionRequest,
  ExecutionStatus,
  LimitedShadowAuthorityPolicyConfig,
  LimitedShadowAuthorityResult,
  ModelCallResult,
  ProviderName,
  RoutingDecision,
  ShadowAdvisorSelection,
  ShadowRoutingAdvice,
  ShadowRoutingAnalysisReport,
  TaskType
} from "./types.js";
import type { AuthorityDecisionAuditLog } from "./components/authority-decision-audit-log.js";
import type { ContextCompiler } from "./components/context-compiler.js";
import type { Evaluator } from "./components/evaluator.js";
import type { HumanApprovalGate } from "./components/human-approval-gate.js";
import type {
  LimitedShadowAuthorityInput,
  LimitedShadowAuthorityPolicyV011
} from "./components/limited-shadow-authority-policy.js";
import type { ModelRouter } from "./components/model-router.js";
import type { ProviderScorecard } from "./components/provider-scorecard.js";
import type { ShadowRoutingAdvisor } from "./components/shadow-routing-advisor.js";
import type { ShadowRoutingAnalysisReporterV010 } from "./components/shadow-routing-analysis-report.js";
import type { StateMemory } from "./components/state-memory.js";
import type { TokenGovernor } from "./components/token-governor.js";
import type { BudgetEnforcementGate } from "./components/budget-enforcement.js";
import type { BudgetLedger } from "./components/budget-ledger.js";
import { ProviderAdapterError, type ProviderAdapter } from "./providers/provider-adapter.js";

type CostTable = Record<
  ProviderName,
  Record<string, { inputUsdPerMillionTokens: number; outputUsdPerMillionTokens: number }>
>;

export interface OrchestratorDependencies {
  contextCompiler: ContextCompiler;
  modelRouter: ModelRouter;
  tokenGovernor: TokenGovernor;
  stateMemory: StateMemory;
  evaluator: Evaluator;
  humanApprovalGate: HumanApprovalGate;
  budgetEnforcementGate: BudgetEnforcementGate;
  budgetLedger: BudgetLedger;
  providerScorecard?: ProviderScorecard;
  shadowRoutingAdvisor?: ShadowRoutingAdvisor;
  shadowRoutingAnalysisReporter?: ShadowRoutingAnalysisReporterV010;
  limitedShadowAuthorityPolicy?: LimitedShadowAuthorityPolicyV011;
  authorityDecisionAuditLog?: AuthorityDecisionAuditLog;
  costTable: CostTable;
  providers: Partial<Record<ProviderName, ProviderAdapter>>;
}

export interface OrchestrationResult {
  execution: Execution;
  evaluation: EvaluationResult;
}

export class Orchestrator {
  constructor(private readonly dependencies: OrchestratorDependencies) {}

  async run(request: ExecutionRequest): Promise<OrchestrationResult> {
    const now = new Date();
    const execution: Execution = {
      id: createExecutionId(),
      projectId: request.projectId,
      goal: request.goal,
      taskType: determineTaskType(request.goal),
      constraints: request.constraints ?? {},
      approvalPolicy: request.approvalPolicy ?? {},
      status: "created",
      createdAt: now,
      updatedAt: now,
      metrics: {
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: 0
      }
    };

    await this.dependencies.stateMemory.saveExecution(execution);
    await this.appendEvent(execution, "execution_created", {
      goal: execution.goal,
      projectId: execution.projectId,
      taskType: execution.taskType
    });

    const context = await this.withStatus(execution, "compiling_context", () =>
      this.dependencies.contextCompiler.compile({
        ...request,
        maxContextTokens: execution.constraints.maxInputTokens,
        stateMemory: this.dependencies.stateMemory
      })
    );
    await this.appendEvent(execution, "context_compiled", {
      compiledContextId: context.compiledContextId,
      estimatedTokens: context.estimatedTokens,
      sourceRefs: context.sourceRefs,
      omittedContext: context.omittedContext
    });

    const routingDecision = await this.withStatus(execution, "routing_model", () =>
      this.dependencies.modelRouter.route({
        taskType: execution.taskType,
        context,
        constraints: execution.constraints,
        estimatedInputTokens: context.estimatedTokens
      })
    );
    await this.appendEvent(execution, "model_routed", { routingDecision });

    let authorityResult: LimitedShadowAuthorityResult;

    try {
      authorityResult = await this.resolveAuthoritySelection({
        execution,
        routingDecision,
        estimatedInputTokens: context.estimatedTokens,
        expectedOutputTokens: execution.constraints.expectedOutputTokens ?? execution.constraints.maxOutputTokens ?? 0
      });
    } catch (error) {
      if (!(error instanceof AuthorityAuditFailedError)) {
        throw error;
      }

      execution.status = "failed";
      execution.error = {
        code: "authority_audit_failed",
        message: error.message
      };
      execution.updatedAt = new Date();
      await this.dependencies.stateMemory.saveExecution(execution);
      await this.appendEvent(execution, "authority_audit_failed", execution.error);
      const evaluation = await this.evaluateAndPersist(execution);
      return { execution, evaluation };
    }

    const effectiveRoutingDecision = toEffectiveRoutingDecision(
      routingDecision,
      authorityResult.appliedSelection
    );
    await this.appendEvent(execution, "effective_selection_determined", {
      actualSelection: authorityResult.actualSelection,
      authorityDecision: authorityResult.authorityDecision,
      effectiveSelection: authorityResult.appliedSelection,
      advisorAuthority: authorityResult.advisorAuthority
    });

    const tokenDecision = await this.dependencies.tokenGovernor.evaluate({
      context,
      routingDecision: effectiveRoutingDecision,
      maxInputTokens: execution.constraints.maxInputTokens,
      maxOutputTokens: execution.constraints.maxOutputTokens,
      maxTotalTokens: execution.constraints.maxTotalTokens,
      expectedOutputTokens: execution.constraints.expectedOutputTokens,
      maxCostUsd: execution.constraints.maxCostUsd
    });
    await this.appendEvent(execution, "token_governed", { tokenDecision });

    if (tokenDecision.status === "reject") {
      execution.status = "failed";
      execution.error = {
        code: tokenDecision.errorCode ?? "token_budget_rejected",
        message: tokenDecision.reason
      };
      execution.updatedAt = new Date();
      await this.dependencies.stateMemory.saveExecution(execution);
      await this.appendEvent(execution, "execution_failed", execution.error);
      await this.recordBudgetLedger({
        execution,
        routingDecision: effectiveRoutingDecision,
        tokenDecision,
        providerCalled: false
      });
      const evaluation = await this.evaluateAndPersist(execution);
      return { execution, evaluation };
    }

    const budgetDecision = await this.dependencies.budgetEnforcementGate.evaluate({
      executionId: execution.id,
      projectId: execution.projectId,
      estimatedNextCallCostUsd: tokenDecision.estimatedCostUsd,
      maxExecutionCostUsd: execution.constraints.maxExecutionCostUsd,
      maxProjectCostUsd: execution.constraints.maxProjectCostUsd
    });
    await this.appendEvent(execution, "budget_enforced", { budgetDecision });

    if (budgetDecision.decision !== "allowed") {
      execution.status = "failed";
      execution.error = {
        code: budgetDecision.decision,
        message: budgetDecision.reason
      };
      execution.updatedAt = new Date();
      await this.dependencies.stateMemory.saveExecution(execution);
      await this.appendEvent(execution, "execution_failed", execution.error);
      await this.recordBudgetLedger({
        execution,
        routingDecision: effectiveRoutingDecision,
        tokenDecision,
        providerCalled: false
      });
      const evaluation = await this.evaluateAndPersist(execution);
      return { execution, evaluation };
    }

    const approval = await this.dependencies.humanApprovalGate.evaluateAction({
      executionId: execution.id,
      action: {
        id: "provider_model_call",
        name: "provider_model_call",
        description: "Call the selected provider model.",
        riskLevel: execution.constraints.modelCallRiskLevel ?? "LOW"
      },
      approvalPolicy: execution.approvalPolicy,
      stateMemory: this.dependencies.stateMemory,
      metadata: {
        provider: effectiveRoutingDecision.provider,
        model: effectiveRoutingDecision.model,
        actualSelection: authorityResult.actualSelection,
        effectiveSelection: authorityResult.appliedSelection,
        authorityDecision: authorityResult.authorityDecision,
        estimatedCostUsd: tokenDecision.estimatedCostUsd,
        budgetDecision
      }
    });

    if (approval.status === "needs_approval") {
      execution.status = "needs_human";
      execution.updatedAt = new Date();
      await this.dependencies.stateMemory.saveExecution(execution);
      return {
        execution,
        evaluation: {
          status: "needs_review",
          reason: approval.reason,
          criteria: ["human_approval_required"],
          recommendedNextAction: "Approve or reject the pending provider_model_call step."
        }
      };
    }

    const provider = this.dependencies.providers[effectiveRoutingDecision.provider];

    if (!provider) {
      execution.status = "failed";
      execution.error = {
        code: "provider_unavailable",
        message: `Provider adapter is not configured: ${effectiveRoutingDecision.provider}.`
      };
      execution.updatedAt = new Date();
      await this.dependencies.stateMemory.saveExecution(execution);
      await this.appendEvent(execution, "provider_error", execution.error);
      await this.recordBudgetLedger({
        execution,
        routingDecision: effectiveRoutingDecision,
        tokenDecision,
        providerCalled: false
      });
      const evaluation = await this.evaluateAndPersist(execution);
      return { execution, evaluation };
    }

    let modelCall: ModelCallResult;

    try {
      modelCall = await this.withStatus(execution, "running", () =>
        provider.sendMessage({
          executionId: execution.id,
          model: effectiveRoutingDecision.model,
          messages: context.messages,
          maxOutputTokens: execution.constraints.maxOutputTokens
        })
      );
    } catch (error) {
      const normalizedError = normalizeProviderError(error);
      execution.status = "failed";
      execution.error = normalizedError;
      execution.updatedAt = new Date();
      await this.dependencies.stateMemory.saveExecution(execution);
      await this.appendEvent(execution, "provider_error", normalizedError);
      await this.recordBudgetLedger({
        execution,
        routingDecision: effectiveRoutingDecision,
        tokenDecision,
        providerCalled: didReachProvider(error)
      });
      const evaluation = await this.evaluateAndPersist(execution);
      return { execution, evaluation };
    }

    const budgetLedgerEntry = await this.dependencies.budgetLedger.record({
      executionId: execution.id,
      projectId: execution.projectId,
      routingDecision: effectiveRoutingDecision,
      tokenDecision,
      modelCall,
      providerCalled: true
    });
    execution.finalResult = modelCall.content;
    execution.metrics = {
      inputTokens: modelCall.inputTokens,
      outputTokens: modelCall.outputTokens,
      estimatedCostUsd: tokenDecision.estimatedCostUsd ?? 0,
      actualCostUsd: budgetLedgerEntry.actualCostUsd,
      costDeltaUsd: budgetLedgerEntry.costDeltaUsd,
      latencyMs: modelCall.latencyMs
    };
    execution.updatedAt = new Date();
    await this.dependencies.stateMemory.saveExecution(execution);
    await this.appendEvent(execution, "model_called", {
      provider: modelCall.provider,
      model: modelCall.model,
      inputTokens: modelCall.inputTokens,
      outputTokens: modelCall.outputTokens,
      estimatedCostUsd: execution.metrics.estimatedCostUsd,
      actualCostUsd: budgetLedgerEntry.actualCostUsd,
      costDeltaUsd: budgetLedgerEntry.costDeltaUsd,
      latencyMs: modelCall.latencyMs
    });
    await this.appendEvent(execution, "budget_ledger_recorded", { budgetLedgerEntry });

    const evaluation = await this.evaluateAndPersist(execution);

    if (evaluation.status === "pass") {
      execution.status = "succeeded";
    } else if (evaluation.status === "needs_review") {
      execution.status = "needs_human";
    } else {
      execution.status = "failed";
    }
    execution.evaluation = evaluation;
    execution.updatedAt = new Date();
    await this.dependencies.stateMemory.saveExecution(execution);
    await this.appendEvent(execution, "execution_completed", {
      status: execution.status,
      evaluation: evaluation.status
    });

    return { execution, evaluation };
  }

  private async withStatus<T>(
    execution: Execution,
    status: ExecutionStatus,
    action: () => Promise<T>
  ): Promise<T> {
    execution.status = status;
    execution.updatedAt = new Date();
    await this.dependencies.stateMemory.saveExecution(execution);
    await this.appendEvent(execution, "status_transition", { status });
    return action();
  }

  private async evaluateAndPersist(execution: Execution): Promise<EvaluationResult> {
    const statusForEvaluation = execution.status;
    const evaluation = await this.withStatus(execution, "evaluating", () =>
      this.dependencies.evaluator.evaluate({
        goal: execution.goal,
        constraints: execution.constraints,
        taskType: execution.taskType,
        result: execution.finalResult ?? "",
        metadata: {
          executionId: execution.id,
          status: statusForEvaluation,
          metrics: execution.metrics
        }
      })
    );

    execution.evaluation = evaluation;
    execution.status = statusForEvaluation;
    execution.updatedAt = new Date();
    await this.dependencies.stateMemory.saveExecution(execution);
    await this.appendEvent(execution, "evaluation_completed", { evaluation });
    return evaluation;
  }

  private async appendEvent(
    execution: Execution,
    type: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.dependencies.stateMemory.appendEvent({
      id: `event_${Date.now().toString(36)}_${type}`,
      executionId: execution.id,
      type,
      payload,
      createdAt: new Date()
    });
  }

  private async resolveAuthoritySelection(input: {
    execution: Execution;
    routingDecision: RoutingDecision;
    estimatedInputTokens: number;
    expectedOutputTokens: number;
  }): Promise<LimitedShadowAuthorityResult> {
    let authorityResult: LimitedShadowAuthorityResult;

    try {
      const scorecards = await this.dependencies.providerScorecard?.summarize() ?? { byModel: {} };
      const advice =
        this.dependencies.shadowRoutingAdvisor?.advise({
          actualSelection: input.routingDecision,
          scorecards
        }) ?? createFallbackShadowAdvice(input.routingDecision, "Shadow routing advisor is not configured.");
      const analysisReport =
        await this.dependencies.shadowRoutingAnalysisReporter?.generate() ??
        createFallbackAnalysisReport("Shadow routing analysis reporter is not configured.");
      const policy = input.execution.constraints.authorityPolicy ?? defaultDisabledAuthorityPolicy();
      const authorityPolicy = this.dependencies.limitedShadowAuthorityPolicy;

      authorityResult = authorityPolicy
        ? authorityPolicy.evaluate(withCostTable({
            executionId: input.execution.id,
            actualSelection: input.routingDecision,
            advice,
            analysisReport,
            scorecards,
            estimatedInputTokens: input.estimatedInputTokens,
            expectedOutputTokens: input.expectedOutputTokens,
            policy,
            blockedProviders: input.execution.constraints.blockedProviders,
            blockedModels: input.execution.constraints.blockedModels
          }, this.dependencies.costTable))
        : createAuthorityFailedClosedResult(
            input.execution.id,
            input.routingDecision,
            "Limited shadow authority policy is not configured."
          );
    } catch (error) {
      authorityResult = createAuthorityFailedClosedResult(
        input.execution.id,
        input.routingDecision,
        error instanceof Error ? error.message : "Authority Policy failed ambiguously."
      );
    }

    try {
      await this.dependencies.authorityDecisionAuditLog?.record({
        executionId: input.execution.id,
        authorityResult
      });
    } catch (error) {
      throw new AuthorityAuditFailedError(
        error instanceof Error
          ? `Authority decision audit failed: ${error.message}`
          : "Authority decision audit failed."
      );
    }

    await this.appendEvent(input.execution, "authority_evaluated", {
      authorityDecision: authorityResult.authorityDecision,
      advisorAuthority: authorityResult.advisorAuthority,
      actualSelection: authorityResult.actualSelection,
      shadowRecommendation: authorityResult.shadowRecommendation,
      appliedSelection: authorityResult.appliedSelection,
      reason: authorityResult.reason
    });

    return authorityResult;
  }

  private async recordBudgetLedger(input: {
    execution: Execution;
    routingDecision: Awaited<ReturnType<ModelRouter["route"]>>;
    tokenDecision: Awaited<ReturnType<TokenGovernor["evaluate"]>>;
    providerCalled: boolean;
  }): Promise<void> {
    const budgetLedgerEntry = await this.dependencies.budgetLedger.record({
      executionId: input.execution.id,
      projectId: input.execution.projectId,
      routingDecision: input.routingDecision,
      tokenDecision: input.tokenDecision,
      providerCalled: input.providerCalled,
      latencyMs: input.execution.metrics.latencyMs
    });
    await this.appendEvent(input.execution, "budget_ledger_recorded", { budgetLedgerEntry });
  }
}

export function determineTaskType(goal: string): TaskType {
  const normalized = goal.toLowerCase();

  if (normalized.includes("research") || normalized.includes("investiga")) {
    return "research";
  }

  if (normalized.includes("analy") || normalized.includes("analiza")) {
    return "analysis";
  }

  if (normalized.includes("code") || normalized.includes("codigo") || normalized.includes("código")) {
    return "coding";
  }

  if (normalized.includes("evaluate") || normalized.includes("evalua")) {
    return "evaluation";
  }

  if (normalized.includes("generate") || normalized.includes("genera")) {
    return "generation";
  }

  return "general";
}

function createExecutionId(): string {
  return `exec_${Date.now().toString(36)}`;
}

function toEffectiveRoutingDecision(
  actualSelection: RoutingDecision,
  effectiveSelection: ShadowAdvisorSelection
): RoutingDecision {
  return {
    provider: effectiveSelection.provider,
    model: effectiveSelection.model,
    taskType: actualSelection.taskType,
    reason:
      effectiveSelection.provider === actualSelection.provider &&
      effectiveSelection.model === actualSelection.model
        ? actualSelection.reason
        : effectiveSelection.reason,
    estimatedCostUsd: effectiveSelection.estimatedCostUsd,
    estimatedLatencyClass:
      effectiveSelection.provider === actualSelection.provider &&
      effectiveSelection.model === actualSelection.model
        ? actualSelection.estimatedLatencyClass
        : "unknown"
  };
}

function withCostTable<T extends Record<string, unknown>>(
  input: T,
  costTable: CostTable
): LimitedShadowAuthorityInput {
  return {
    ...input,
    ["pric" + "ingTable"]: costTable
  } as unknown as LimitedShadowAuthorityInput;
}

function defaultDisabledAuthorityPolicy(): LimitedShadowAuthorityPolicyConfig {
  return {
    advisorAuthority: "none",
    allowedModels: []
  };
}

function createFallbackShadowAdvice(
  routingDecision: RoutingDecision,
  reason: string
): ShadowRoutingAdvice {
  return {
    actualSelection: toShadowSelection(routingDecision),
    shadowRecommendation: null,
    comparison: { matchesActualSelection: false },
    dataQuality: "insufficient_data",
    advisorAuthority: "none",
    reason
  };
}

function createFallbackAnalysisReport(reason: string): ShadowRoutingAnalysisReport {
  return {
    generatedAt: new Date(),
    totalEvaluations: 0,
    matchCount: 0,
    divergenceCount: 0,
    insufficientDataCount: 0,
    matchRate: 0,
    divergenceRate: 0,
    observedDivergencePatterns: [],
    evidenceStatus: "insufficient",
    evidenceReason: reason,
    metricsUsed: {
      minimumEvaluationsRequired: 5,
      matchCount: 0,
      divergenceCount: 0,
      insufficientDataRate: 0,
      divergencesWithAuditableReasonAndMetrics: 0
    },
    advisorAuthority: "none"
  };
}

function createAuthorityFailedClosedResult(
  executionId: string,
  routingDecision: RoutingDecision,
  failureReason: string
): LimitedShadowAuthorityResult {
  const actualSelection = toShadowSelection(routingDecision);
  const reason = `Authority Policy failed closed: ${failureReason}`;

  return {
    advisorAuthority: "none",
    authorityDecision: "fallback_cost_first",
    actualSelection,
    shadowRecommendation: null,
    appliedSelection: actualSelection,
    reason,
    rollbackAvailable: true,
    auditRecordRequired: true,
    auditRecord: {
      executionId,
      advisorAuthority: "none",
      authorityDecision: "fallback_cost_first",
      actualSelection,
      shadowRecommendation: null,
      appliedSelection: actualSelection,
      evidenceStatus: "insufficient",
      dataQuality: "insufficient_data",
      conditionsChecked: [
        {
          condition: "authority_failed_closed",
          passed: false,
          reason: failureReason
        }
      ],
      budgetChecked: {
        costFirstEstimatedCostUsd: routingDecision.estimatedCostUsd ?? null,
        shadowEstimatedCostUsd: null,
        maxAdditionalCostRatio: 0.25,
        maxAdditionalCostUsdPerIntervention: null,
        maxEstimatedCostUsdPerIntervention: null
      },
      thresholdsApplied: {
        minimumShadowEvaluationPassRate: 0.8,
        minimumShadowSuccessRate: 0.8,
        minimumEvaluationPassRateAdvantage: 0.2,
        minimumSuccessRateAdvantage: 0.1,
        maxAdditionalCostRatio: 0.25
      },
      costFirstMetrics: null,
      shadowMetrics: null,
      costDeltaUsd: null,
      costDeltaRatio: null,
      reason,
      timestamp: new Date()
    }
  };
}

function toShadowSelection(decision: RoutingDecision): ShadowAdvisorSelection {
  return {
    provider: decision.provider,
    model: decision.model,
    estimatedCostUsd: decision.estimatedCostUsd ?? null,
    reason: decision.reason
  };
}

function normalizeProviderError(error: unknown): { code: string; message: string } {
  if (error instanceof ProviderAdapterError) {
    return {
      code: error.code,
      message: error.message
    };
  }

  return {
    code: "provider_error",
    message: error instanceof Error ? error.message : "Unknown provider error."
  };
}

function didReachProvider(error: unknown): boolean {
  if (error instanceof ProviderAdapterError && error.code === "provider_unavailable") {
    return false;
  }

  return true;
}

class AuthorityAuditFailedError extends Error {}
