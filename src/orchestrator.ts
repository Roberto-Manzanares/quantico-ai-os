import type {
  EvaluationResult,
  Execution,
  ExecutionRequest,
  ExecutionStatus,
  ModelCallResult,
  ProviderName,
  TaskType
} from "./types.js";
import type { ContextCompiler } from "./components/context-compiler.js";
import type { Evaluator } from "./components/evaluator.js";
import type { HumanApprovalGate } from "./components/human-approval-gate.js";
import type { ModelRouter } from "./components/model-router.js";
import type { StateMemory } from "./components/state-memory.js";
import type { TokenGovernor } from "./components/token-governor.js";
import { ProviderAdapterError, type ProviderAdapter } from "./providers/provider-adapter.js";

export interface OrchestratorDependencies {
  contextCompiler: ContextCompiler;
  modelRouter: ModelRouter;
  tokenGovernor: TokenGovernor;
  stateMemory: StateMemory;
  evaluator: Evaluator;
  humanApprovalGate: HumanApprovalGate;
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

    const tokenDecision = await this.dependencies.tokenGovernor.evaluate({
      context,
      routingDecision,
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
        provider: routingDecision.provider,
        model: routingDecision.model,
        estimatedCostUsd: tokenDecision.estimatedCostUsd
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

    const provider = this.dependencies.providers[routingDecision.provider];

    if (!provider) {
      execution.status = "failed";
      execution.error = {
        code: "provider_unavailable",
        message: `Provider adapter is not configured: ${routingDecision.provider}.`
      };
      execution.updatedAt = new Date();
      await this.dependencies.stateMemory.saveExecution(execution);
      await this.appendEvent(execution, "provider_error", execution.error);
      const evaluation = await this.evaluateAndPersist(execution);
      return { execution, evaluation };
    }

    let modelCall: ModelCallResult;

    try {
      modelCall = await this.withStatus(execution, "running", () =>
        provider.sendMessage({
          executionId: execution.id,
          model: routingDecision.model,
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
      const evaluation = await this.evaluateAndPersist(execution);
      return { execution, evaluation };
    }

    execution.finalResult = modelCall.content;
    execution.metrics = {
      inputTokens: modelCall.inputTokens,
      outputTokens: modelCall.outputTokens,
      estimatedCostUsd: tokenDecision.estimatedCostUsd ?? 0,
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
      latencyMs: modelCall.latencyMs
    });

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
}

function determineTaskType(goal: string): TaskType {
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
