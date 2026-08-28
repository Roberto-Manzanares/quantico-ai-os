import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createQuanticoApi, createQuanticoSystem } from "../src/index.js";

test("Quantico AI OS skeleton loads and creates an execution", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-smoke-"));
  const stateFilePath = join(stateDir, "state.json");
  const system = createQuanticoSystem({ stateFilePath });
  const result = await system.orchestrator.run({ goal: "Generate a short test result" });

  assert.equal(result.execution.status, "failed");
  assert.equal(result.execution.taskType, "generation");
  assert.equal(result.evaluation.status, "needs_review");

  const rawState = await readFile(stateFilePath, "utf8");
  const persistedState = JSON.parse(rawState) as { executions: unknown[] };

  assert.equal(persistedState.executions.length, 1);

  await rm(stateDir, { recursive: true, force: true });
});

test("Quantico API exposes the V0.1 execution contract", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-api-"));
  const stateFilePath = join(stateDir, "state.json");
  const api = createQuanticoApi({ stateFilePath });
  const execution = await api.createExecution({ goal: "Analyze a test input" });

  assert.equal(await api.getExecutionStatus(execution.id), "failed");

  const resultAndMetrics = await api.getResultAndMetrics(execution.id);
  assert.equal(resultAndMetrics?.executionId, execution.id);
  assert.equal(resultAndMetrics?.status, "failed");

  const approval = await api.approvePendingStep({
    executionId: execution.id,
    reason: "Smoke test approval"
  });
  assert.equal(approval.decisionApplied, "approved");

  const rejection = await api.rejectPendingStep({
    executionId: execution.id,
    reason: "Smoke test rejection"
  });
  assert.equal(rejection.decisionApplied, "rejected");

  await rm(stateDir, { recursive: true, force: true });
});
