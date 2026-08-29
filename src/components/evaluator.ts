import type {
  EvaluationCriterion,
  EvaluationResult,
  ExecutionConstraints,
  ExecutionMetrics,
  ExecutionStatus,
  TaskType
} from "../types.js";

export interface EvaluatorInput {
  goal: string;
  constraints: ExecutionConstraints;
  taskType: TaskType;
  result: string;
  metadata: {
    executionId: string;
    status: ExecutionStatus;
    metrics: ExecutionMetrics;
  };
}

export interface Evaluator {
  evaluate(input: EvaluatorInput): Promise<EvaluationResult>;
}

export class DeterministicEvaluator implements Evaluator {
  async evaluate(input: EvaluatorInput): Promise<EvaluationResult> {
    const criteria: string[] = [
      `goal_present:${input.goal.trim().length > 0}`,
      `task_type:${input.taskType}`,
      `result_not_empty:${input.result.trim().length > 0}`,
      `execution_status:${input.metadata.status}`
    ];

    if (input.metadata.status === "failed" || input.metadata.status === "cancelled") {
      return fail(criteria, `Execution status is ${input.metadata.status}.`);
    }

    if (input.result.trim().length === 0) {
      return fail(criteria, "Result content is empty.");
    }

    const constraintFailure = evaluateVerifiableConstraints(input, criteria);

    if (constraintFailure) {
      return fail(criteria, constraintFailure);
    }

    const evaluationCriteria = input.constraints.evaluationCriteria ?? [];

    if (evaluationCriteria.length === 0) {
      return {
        status: "needs_review",
        reason: "No explicit deterministic evaluation criteria were provided.",
        criteria,
        recommendedNextAction: "Add explicit evaluation criteria or review the result manually."
      };
    }

    const criterionOutcome = evaluateExplicitCriteria(evaluationCriteria, input.result, criteria);

    if (criterionOutcome.status === "fail") {
      return fail(criteria, criterionOutcome.reason);
    }

    if (criterionOutcome.status === "needs_review") {
      return {
        status: "needs_review",
        reason: criterionOutcome.reason,
        criteria,
        recommendedNextAction: "Review the result manually against the non-deterministic criteria."
      };
    }

    return {
      status: "pass",
      reason: "All deterministic evaluation criteria passed.",
      criteria
    };
  }
}

export { DeterministicEvaluator as SkeletonEvaluator };

function evaluateVerifiableConstraints(input: EvaluatorInput, criteria: string[]): string | undefined {
  const { constraints } = input;
  const { metrics } = input.metadata;

  if (constraints.maxCostUsd !== undefined) {
    const passed = metrics.estimatedCostUsd <= constraints.maxCostUsd;
    criteria.push(`max_cost_usd:${passed}`);

    if (!passed) {
      return `Estimated cost USD ${metrics.estimatedCostUsd} exceeds max cost USD ${constraints.maxCostUsd}.`;
    }
  }

  if (constraints.maxInputTokens !== undefined) {
    const passed = metrics.inputTokens <= constraints.maxInputTokens;
    criteria.push(`max_input_tokens:${passed}`);

    if (!passed) {
      return `Input tokens ${metrics.inputTokens} exceed max input tokens ${constraints.maxInputTokens}.`;
    }
  }

  if (constraints.maxOutputTokens !== undefined) {
    const passed = metrics.outputTokens <= constraints.maxOutputTokens;
    criteria.push(`max_output_tokens:${passed}`);

    if (!passed) {
      return `Output tokens ${metrics.outputTokens} exceed max output tokens ${constraints.maxOutputTokens}.`;
    }
  }

  if (constraints.maxTotalTokens !== undefined) {
    const totalTokens = metrics.inputTokens + metrics.outputTokens;
    const passed = totalTokens <= constraints.maxTotalTokens;
    criteria.push(`max_total_tokens:${passed}`);

    if (!passed) {
      return `Total tokens ${totalTokens} exceed max total tokens ${constraints.maxTotalTokens}.`;
    }
  }

  return undefined;
}

function evaluateExplicitCriteria(
  evaluationCriteria: EvaluationCriterion[],
  result: string,
  criteria: string[]
): { status: "pass" | "fail" | "needs_review"; reason: string } {
  for (const criterion of evaluationCriteria) {
    const outcome = evaluateCriterion(criterion, result);
    criteria.push(`${criterion.type}:${outcome.status}`);

    if (outcome.status !== "pass") {
      return outcome;
    }
  }

  return { status: "pass", reason: "All explicit deterministic criteria passed." };
}

function evaluateCriterion(
  criterion: EvaluationCriterion,
  result: string
): { status: "pass" | "fail" | "needs_review"; reason: string } {
  switch (criterion.type) {
    case "contains_text":
      return result.includes(criterion.value)
        ? { status: "pass", reason: "Required text is present." }
        : { status: "fail", reason: `Result does not contain required text: ${criterion.value}.` };
    case "not_contains_text":
      return !result.includes(criterion.value)
        ? { status: "pass", reason: "Forbidden text is absent." }
        : { status: "fail", reason: `Result contains forbidden text: ${criterion.value}.` };
    case "min_length":
      return result.length >= criterion.value
        ? { status: "pass", reason: "Result meets minimum length." }
        : { status: "fail", reason: `Result length ${result.length} is below minimum ${criterion.value}.` };
    case "max_length":
      return result.length <= criterion.value
        ? { status: "pass", reason: "Result meets maximum length." }
        : { status: "fail", reason: `Result length ${result.length} exceeds maximum ${criterion.value}.` };
    case "requires_review":
      return { status: "needs_review", reason: criterion.description };
  }
}

function fail(criteria: string[], reason: string): EvaluationResult {
  return {
    status: "fail",
    reason,
    criteria,
    recommendedNextAction: "Fix the failed condition and run evaluation again."
  };
}
