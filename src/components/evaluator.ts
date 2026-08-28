import type { EvaluationResult, Execution } from "../types.js";

export interface Evaluator {
  evaluate(input: { execution: Execution; result: string }): Promise<EvaluationResult>;
}

export class SkeletonEvaluator implements Evaluator {
  async evaluate(): Promise<EvaluationResult> {
    return {
      status: "needs_review",
      reason: "Skeleton evaluator; real evaluation is not implemented yet.",
      criteria: ["result_exists"]
    };
  }
}

