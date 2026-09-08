import assert from "node:assert/strict";
import test from "node:test";
import { startDashboard } from "../src/dashboard.js";
import type { ControlledExecutionProfile, QuanticoApi } from "../src/index.js";

test("dashboard reads audit views and delegates explicit run actions without provider calls", async () => {
  let receivedProfile: ControlledExecutionProfile | undefined;
  let approval: { runId: string; decision: string } | undefined;
  const api = {
    async listExecutionAuditSummaries() {
      return {
        status: "found" as const,
        summaries: [{ executionId: "exec_dashboard", executionStatus: "succeeded", timelineDataQuality: "complete" }],
        totalExecutions: 1,
        filtersApplied: {},
        dataQuality: "complete" as const,
        reason: "found"
      };
    },
    async getExecutionAuditSummary() { return { status: "found" as const, executionId: "exec_dashboard", summary: {}, reason: "found" }; },
    async getResultAndMetrics() { return { executionId: "exec_dashboard", status: "succeeded", finalResult: "OK", metrics: { actualCostUsd: 0.00001 } }; },
    async getExecutionAuditTimeline() { return { status: "found" as const, executionId: "exec_dashboard", executionStatus: "succeeded", timeline: [], dataQuality: "complete" as const, reason: "found" }; },
    async getAuthorityRuntimeSafetyMetricsForExecution() { return { status: "not_found" as const, executionId: "exec_dashboard", reason: "no authority evidence" }; },
    async runControlledExecution(profile: ControlledExecutionProfile) {
      receivedProfile = profile;
      return { status: "dry_run_ready" as const, profileValidationStatus: "profile_validated" as const, runId: "run_dashboard", reason: "ready" };
    },
    async getControlledRunStatus(runId: string) { return { status: "not_found" as const, runId, reason: "not found" }; },
    async resolveControlledRunApproval(runId: string, decision: { decision: "approved" | "rejected" }) {
      approval = { runId, decision: decision.decision };
      return { status: decision.decision, runId, executionId: "exec_dashboard", reason: "recorded" };
    },
    async continueApprovedExecution() { return { status: "not_continuable" as const, runId: "run_dashboard", reason: "not requested in this test" }; },
    async finalizeControlledRun() { return { status: "not_finalizable" as const, runId: "run_dashboard", reason: "not requested in this test" }; },
    async closeControlledRun() { return { status: "not_closable" as const, runId: "run_dashboard", reason: "not requested in this test" }; }
  } as unknown as QuanticoApi;
  const dashboard = await startDashboard({ port: 0, createApi: () => api });

  try {
    const page = await fetch(dashboard.url).then((response) => response.text());
    assert.match(page, /Launch controlled run/);

    const clientScript = await fetch(`${dashboard.url}/dashboard.js`).then((response) => response.text());
    assert.match(clientScript, /loadExecutions/);

    const executions = await fetch(`${dashboard.url}/api/executions`).then((response) => response.json()) as { totalExecutions: number };
    assert.equal(executions.totalExecutions, 1);

    const detail = await fetch(`${dashboard.url}/api/executions/exec_dashboard`).then((response) => response.json()) as { result: { finalResult: string } };
    assert.equal(detail.result.finalResult, "OK");

    const profile = { mode: "dry_run", goal: "verify", constraints: {}, evaluationCriteria: [], approvalPolicy: {}, budgets: {}, auditRequirements: { requireTimeline: true, requireAuditSummary: true } };
    const launched = await fetch(`${dashboard.url}/api/runs`, { method: "POST", body: JSON.stringify(profile) }).then((response) => response.json()) as { runId: string };
    assert.equal(launched.runId, "run_dashboard");
    assert.equal(receivedProfile?.mode, "dry_run");

    const approvalResult = await fetch(`${dashboard.url}/api/runs/run_dashboard/approval`, { method: "POST", body: JSON.stringify({ decision: "approved" }) }).then((response) => response.json()) as { status: string };
    assert.equal(approvalResult.status, "approved");
    assert.deepEqual(approval, { runId: "run_dashboard", decision: "approved" });
  } finally {
    await dashboard.close();
  }
});
