import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DeterministicEvaluator, type EvaluatorInput } from "../src/index.js";

const baseInput: EvaluatorInput = {
  goal: "Generate a useful summary",
  constraints: {
    maxCostUsd: 1,
    maxInputTokens: 100,
    maxOutputTokens: 100,
    maxTotalTokens: 200,
    evaluationCriteria: [{ type: "contains_text", value: "summary" }]
  },
  taskType: "generation",
  result: "This is a useful summary.",
  metadata: {
    executionId: "exec_eval",
    status: "succeeded",
    metrics: {
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0.01,
      latencyMs: 100
    }
  }
};

test("Evaluator returns pass when all deterministic criteria are satisfied", async () => {
  const evaluator = new DeterministicEvaluator();
  const result = await evaluator.evaluate(baseInput);

  assert.equal(result.status, "pass");
  assert.equal(result.recommendedNextAction, undefined);
  assert.ok(result.criteria.includes("contains_text:pass"));
});

test("Evaluator returns fail for empty result", async () => {
  const evaluator = new DeterministicEvaluator();
  const result = await evaluator.evaluate({ ...baseInput, result: "   " });

  assert.equal(result.status, "fail");
  assert.match(result.reason, /empty/i);
  assert.equal(typeof result.recommendedNextAction, "string");
});

test("Evaluator returns fail for failed execution status", async () => {
  const evaluator = new DeterministicEvaluator();
  const result = await evaluator.evaluate({
    ...baseInput,
    metadata: { ...baseInput.metadata, status: "failed" }
  });

  assert.equal(result.status, "fail");
  assert.match(result.reason, /failed/);
});

test("Evaluator returns fail when a verifiable constraint is violated", async () => {
  const evaluator = new DeterministicEvaluator();
  const result = await evaluator.evaluate({
    ...baseInput,
    constraints: { ...baseInput.constraints, maxOutputTokens: 5 }
  });

  assert.equal(result.status, "fail");
  assert.match(result.reason, /Output tokens 20 exceed max output tokens 5/);
});

test("Evaluator returns needs_review for non-deterministic criteria", async () => {
  const evaluator = new DeterministicEvaluator();
  const result = await evaluator.evaluate({
    ...baseInput,
    constraints: {
      evaluationCriteria: [{ type: "requires_review", description: "Assess strategic quality." }]
    }
  });

  assert.equal(result.status, "needs_review");
  assert.match(result.reason, /strategic quality/i);
  assert.equal(typeof result.recommendedNextAction, "string");
});

test("Evaluator result is deterministic for the same input", async () => {
  const evaluator = new DeterministicEvaluator();
  const first = await evaluator.evaluate(baseInput);
  const second = await evaluator.evaluate(baseInput);

  assert.deepEqual(first, second);
});

test("Evaluator does not depend on provider adapters", async () => {
  const source = await readFile("src/components/evaluator.ts", "utf8");

  assert.equal(source.includes("OpenAIAdapter"), false);
  assert.equal(source.includes("AnthropicAdapter"), false);
  assert.equal(source.includes("../providers"), false);
});

