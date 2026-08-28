import type {
  EvaluationResult,
  Execution,
  ExecutionRequest,
  ExecutionStatus,
  TaskType
} from "./types.js";
import type { ContextCompiler } from "./components/context-compiler.js";
import type { Evaluator } from "./components/evaluator.js";
import type { HumanApprovalGate } from "./components/human-approval-gate.js";
import type { ModelRouter } from "./components/model-router.js";
import type { StateMemory } from "./components/state-memory.js";
import type { TokenGovernor } from "./components/token-governor.js";

export interface OrchestratorDependencies {
  contextCompiler: ContextCompiler;
  modelRouter: ModelRouter;
  tokenGovernor: TokenGovernor;
  stateMemory: StateMemory;
  evaluator: Evaluator;
  humanApprovalGate: HumanApprovalGate;
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

    const context = await this.withStatus(execution, "compiling_context", () =>
      this.dependencies.contextCompiler.compile({
        ...request,
        maxContextTokens: execution.constraints.maxInputTokens,
        stateMemory: this.dependencies.stateMemory
      })
    );
    const routingDecision = await this.withStatus(execution, "routing_model", () =>
      this.dependencies.modelRouter.route({
        taskType: execution.taskType,
        context,
        constraints: execution.constraints,
        estimatedInputTokens: context.estimatedTokens
      })
    );
    const tokenDecision = await this.dependencies.tokenGovernor.evaluate({
      context,
      routingDecision,
      maxInputTokens: execution.constraints.maxInputTokens,
      maxOutputTokens: execution.constraints.maxOutputTokens,
      maxTotalTokens: execution.constraints.maxTotalTokens,
      expectedOutputTokens: execution.constraints.expectedOutputTokens,
      maxCostUsd: execution.constraints.maxCostUsd
    });

    if (tokenDecision.status === "reject") {
      execution.status = "failed";
      execution.updatedAt = new Date();
      await this.dependencies.stateMemory.saveExecution(execution);
    }

    execution.status = tokenDecision.status === "reject" ? "failed" : "succeeded";
    execution.updatedAt = new Date();
    await this.dependencies.stateMemory.saveExecution(execution);

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

    execution.status = tokenDecision.status === "reject" ? "failed" : "succeeded";
    execution.updatedAt = new Date();
    await this.dependencies.stateMemory.saveExecution(execution);

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
    return action();
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
