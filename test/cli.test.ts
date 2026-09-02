import test from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/cli.js";
import type { ControlledExecutionProfile, QuanticoApi } from "../src/index.js";

test("CLI controlled-run reads a profile JSON and delegates to runControlledExecution", async () => {
  const output: string[] = [];
  let receivedStateFilePath: string | undefined;
  let receivedProfileMode: string | undefined;
  let receivedGoal: string | undefined;
  const api = {
    async runControlledExecution(profile: ControlledExecutionProfile) {
      receivedProfileMode = profile.mode;
      receivedGoal = profile.goal;

      return {
        status: "dry_run_ready",
        profileValidationStatus: "profile_validated",
        runId: "run_cli_controlled",
        executionId: undefined,
        provider: "openai",
        model: "gpt-5-nano",
        estimatedCostUsd: 0.000018,
        actualCostUsd: undefined,
        evaluationStatus: undefined,
        reason: "dry run ready"
      };
    }
  } as unknown as QuanticoApi;
  const exitCode = await runCli(["controlled-run", "profile.json", "--state-file", "tmp/state.json"], {
    createApi: (options) => {
      receivedStateFilePath = options?.stateFilePath;
      return api;
    },
    readTextFile: async () =>
      JSON.stringify({
        mode: "dry_run",
        goal: "Return QUANTICO_CLI_OK",
        constraints: {},
        evaluationCriteria: [{ type: "contains_text", value: "QUANTICO_CLI_OK" }],
        approvalPolicy: {},
        budgets: { maxCostUsd: 0.001, maxOutputTokens: 32, maxTotalTokens: 256 },
        auditRequirements: { requireTimeline: true, requireAuditSummary: true }
      }),
    stdout: (message) => output.push(message)
  });
  const payload = JSON.parse(output[0] ?? "{}") as Record<string, unknown>;

  assert.equal(exitCode, 0);
  assert.equal(receivedStateFilePath, "tmp/state.json");
  assert.equal(receivedProfileMode, "dry_run");
  assert.equal(receivedGoal, "Return QUANTICO_CLI_OK");
  assert.equal(payload["runId"], "run_cli_controlled");
  assert.equal(payload["status"], "dry_run_ready");
  assert.equal(payload["provider"], "openai");
  assert.equal("goal" in payload, false);
});

test("CLI controlled-run rejects invalid profile JSON before API use", async () => {
  let apiCalled = false;
  const errors: string[] = [];
  const exitCode = await runCli(["controlled-run", "bad-profile.json"], {
    createApi: () => {
      apiCalled = true;
      return {} as QuanticoApi;
    },
    readTextFile: async () => "{not json",
    stderr: (message) => errors.push(message)
  });

  assert.equal(exitCode, 1);
  assert.equal(apiCalled, false);
  assert.match(errors.join("\n"), /profile JSON is invalid/);
});

test("CLI controlled-run returns non-zero when profile is rejected", async () => {
  const output: string[] = [];
  const api = {
    async runControlledExecution() {
      return {
        status: "profile_rejected",
        profileValidationStatus: "profile_rejected",
        runId: "run_cli_rejected",
        reason: "Profile evaluationCriteria must include deterministic criteria."
      };
    }
  } as unknown as QuanticoApi;
  const exitCode = await runCli(["controlled-run", "profile.json"], {
    createApi: () => api,
    readTextFile: async () => JSON.stringify({ mode: "live" }),
    stdout: (message) => output.push(message)
  });
  const payload = JSON.parse(output[0] ?? "{}") as Record<string, unknown>;

  assert.equal(exitCode, 1);
  assert.equal(payload["status"], "profile_rejected");
  assert.equal(payload["reason"], "Profile evaluationCriteria must include deterministic criteria.");
});

test("CLI close-run delegates to the controlled closure API", async () => {
  const output: string[] = [];
  const calls: Array<{ runId: string; approvalDecision?: "approved" | "rejected"; reason?: string }> = [];
  const api = {
    async closeControlledRun(
      runId: string,
      options?: { approvalDecision?: "approved" | "rejected"; reason?: string }
    ) {
      calls.push({ runId, ...options });

      return {
        status: "closed",
        runId,
        executionId: "exec_cli_close",
        reason: "closed from CLI"
      };
    }
  } as QuanticoApi;

  const exitCode = await runCli(["close-run", "run_cli_close", "--approve", "--reason", "ok"], {
    createApi: () => api,
    stdout: (message) => output.push(message)
  });
  const payload = JSON.parse(output[0] ?? "{}") as Record<string, unknown>;

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [{ runId: "run_cli_close", approvalDecision: "approved", reason: "ok" }]);
  assert.equal(payload["runId"], "run_cli_close");
  assert.equal(payload["executionId"], "exec_cli_close");
  assert.equal(payload["status"], "closed");
});

test("CLI close-run supports rejection and state file selection", async () => {
  let receivedStateFilePath: string | undefined;
  let receivedDecision: "approved" | "rejected" | undefined;
  const api = {
    async closeControlledRun(
      runId: string,
      options?: { approvalDecision?: "approved" | "rejected"; reason?: string }
    ) {
      receivedDecision = options?.approvalDecision;

      return {
        status: "rejected",
        runId,
        executionId: "exec_cli_reject",
        reason: "rejected from CLI"
      };
    }
  } as QuanticoApi;
  const exitCode = await runCli(["close-run", "run_cli_reject", "--reject", "--state-file", "tmp/state.json"], {
    createApi: (options) => {
      receivedStateFilePath = options?.stateFilePath;
      return api;
    },
    stdout: () => undefined
  });

  assert.equal(exitCode, 0);
  assert.equal(receivedDecision, "rejected");
  assert.equal(receivedStateFilePath, "tmp/state.json");
});

test("CLI close-run rejects conflicting approval flags before API use", async () => {
  let apiCalled = false;
  const errors: string[] = [];
  const exitCode = await runCli(["close-run", "run_cli_conflict", "--approve", "--reject"], {
    createApi: () => {
      apiCalled = true;
      return {} as QuanticoApi;
    },
    stderr: (message) => errors.push(message)
  });

  assert.equal(exitCode, 1);
  assert.equal(apiCalled, false);
  assert.match(errors.join("\n"), /Use only one of --approve or --reject/);
});

test("CLI controlled-status reads a run status without exposing profile data", async () => {
  const output: string[] = [];
  let receivedRunId: string | undefined;
  let receivedStateFilePath: string | undefined;
  const api = {
    async getControlledRunStatus(runId: string) {
      receivedRunId = runId;

      return {
        status: "found",
        runId,
        executionId: "exec_cli_status",
        mode: "live",
        lifecycleStatus: "live_completed",
        persistenceOutcome: "manifest_recorded",
        profileFingerprint: "profile_hash",
        profileValidationStatus: "profile_validated",
        controlledStatus: "execution_completed",
        provider: "openai",
        model: "gpt-5-nano",
        estimatedCostUsd: 0.000018,
        actualCostUsd: 0.000016,
        evaluationStatus: "pass",
        requiresHumanApproval: false,
        approvalResolutionEligible: false,
        references: {},
        dataQuality: "complete",
        reason: "Controlled run status is complete."
      };
    }
  } as unknown as QuanticoApi;
  const exitCode = await runCli(["controlled-status", "run_cli_status", "--state-file", "tmp/state.json"], {
    createApi: (options) => {
      receivedStateFilePath = options?.stateFilePath;
      return api;
    },
    stdout: (message) => output.push(message)
  });
  const payload = JSON.parse(output[0] ?? "{}") as Record<string, unknown>;

  assert.equal(exitCode, 0);
  assert.equal(receivedRunId, "run_cli_status");
  assert.equal(receivedStateFilePath, "tmp/state.json");
  assert.equal(payload["status"], "found");
  assert.equal(payload["runId"], "run_cli_status");
  assert.equal(payload["executionId"], "exec_cli_status");
  assert.equal(payload["lifecycleStatus"], "live_completed");
  assert.equal(payload["provider"], "openai");
  assert.equal(payload["model"], "gpt-5-nano");
  assert.equal(payload["dataQuality"], "complete");
  assert.equal("profileFingerprint" in payload, false);
  assert.equal("references" in payload, false);
});

test("CLI controlled-status returns non-zero for missing runs", async () => {
  const output: string[] = [];
  const api = {
    async getControlledRunStatus(runId: string) {
      return {
        status: "not_found",
        runId,
        reason: `Controlled run ${runId} was not found.`
      };
    }
  } as unknown as QuanticoApi;
  const exitCode = await runCli(["controlled-status", "run_cli_missing"], {
    createApi: () => api,
    stdout: (message) => output.push(message)
  });
  const payload = JSON.parse(output[0] ?? "{}") as Record<string, unknown>;

  assert.equal(exitCode, 1);
  assert.equal(payload["status"], "not_found");
  assert.equal(payload["runId"], "run_cli_missing");
  assert.match(String(payload["reason"]), /not found/);
});

test("CLI controlled-status rejects invalid arguments before API use", async () => {
  let apiCalled = false;
  const errors: string[] = [];
  const exitCode = await runCli(["controlled-status", "run_cli_status", "--unknown"], {
    createApi: () => {
      apiCalled = true;
      return {} as QuanticoApi;
    },
    stderr: (message) => errors.push(message)
  });

  assert.equal(exitCode, 1);
  assert.equal(apiCalled, false);
  assert.match(errors.join("\n"), /Unknown controlled-status option/);
});

test("CLI execution-timeline reads an audit timeline", async () => {
  const output: string[] = [];
  let receivedExecutionId: string | undefined;
  let receivedStateFilePath: string | undefined;
  const api = {
    async getExecutionAuditTimeline(executionId: string) {
      receivedExecutionId = executionId;

      return {
        status: "found",
        executionId,
        executionStatus: "succeeded",
        dataQuality: "complete",
        timeline: [
          {
            timestamp: new Date("2026-08-31T12:00:00.000Z"),
            source: "execution",
            type: "execution_created",
            summary: "Execution was created.",
            details: { provider: "openai", model: "gpt-5-nano", inputTokens: 127 }
          }
        ],
        reason: "Timeline has complete and consistent persisted evidence."
      };
    }
  } as unknown as QuanticoApi;
  const exitCode = await runCli(["execution-timeline", "exec_cli_timeline", "--state-file", "tmp/state.json"], {
    createApi: (options) => {
      receivedStateFilePath = options?.stateFilePath;
      return api;
    },
    stdout: (message) => output.push(message)
  });
  const payload = JSON.parse(output[0] ?? "{}") as Record<string, unknown>;
  const timeline = payload["timeline"] as Array<Record<string, unknown>>;

  assert.equal(exitCode, 0);
  assert.equal(receivedExecutionId, "exec_cli_timeline");
  assert.equal(receivedStateFilePath, "tmp/state.json");
  assert.equal(payload["status"], "found");
  assert.equal(payload["executionId"], "exec_cli_timeline");
  assert.equal(payload["executionStatus"], "succeeded");
  assert.equal(payload["dataQuality"], "complete");
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0]?.["source"], "execution");
  assert.equal(timeline[0]?.["timestamp"], "2026-08-31T12:00:00.000Z");
});

test("CLI execution-timeline returns non-zero when execution is missing", async () => {
  const output: string[] = [];
  const api = {
    async getExecutionAuditTimeline(executionId: string) {
      return {
        status: "not_found",
        executionId,
        reason: `Execution ${executionId} was not found.`
      };
    }
  } as unknown as QuanticoApi;
  const exitCode = await runCli(["execution-timeline", "exec_cli_missing"], {
    createApi: () => api,
    stdout: (message) => output.push(message)
  });
  const payload = JSON.parse(output[0] ?? "{}") as Record<string, unknown>;

  assert.equal(exitCode, 1);
  assert.equal(payload["status"], "not_found");
  assert.equal(payload["executionId"], "exec_cli_missing");
  assert.match(String(payload["reason"]), /not found/);
});

test("CLI execution-timeline rejects invalid arguments before API use", async () => {
  let apiCalled = false;
  const errors: string[] = [];
  const exitCode = await runCli(["execution-timeline", "exec_cli_timeline", "--bad"], {
    createApi: () => {
      apiCalled = true;
      return {} as QuanticoApi;
    },
    stderr: (message) => errors.push(message)
  });

  assert.equal(exitCode, 1);
  assert.equal(apiCalled, false);
  assert.match(errors.join("\n"), /Unknown execution-timeline option/);
});

test("CLI execution-summaries lists audit summaries with filters", async () => {
  const output: string[] = [];
  let receivedStateFilePath: string | undefined;
  let receivedOptions: Record<string, unknown> | undefined;
  const api = {
    async listExecutionAuditSummaries(options?: Record<string, unknown>) {
      receivedOptions = options;

      return {
        status: "found",
        totalExecutions: 2,
        filtersApplied: options ?? {},
        dataQuality: "partial",
        summaries: [
          {
            executionId: "exec_cli_attention",
            projectId: "proj_cli",
            executionStatus: "failed",
            createdAt: new Date("2026-08-31T12:00:00.000Z"),
            updatedAt: new Date("2026-08-31T12:01:00.000Z"),
            timelineDataQuality: "partial",
            timelineItemCount: 3,
            sourcesPresent: ["execution"],
            hasAuthorityAudit: false,
            hasBudgetLedger: false,
            hasEvaluation: true,
            hasApproval: false,
            hasInconsistency: false,
            requiresAttention: true,
            attentionReasons: ["executionStatus=failed"]
          }
        ],
        reason: "Execution audit summaries listed."
      };
    }
  } as unknown as QuanticoApi;
  const exitCode = await runCli(
    [
      "execution-summaries",
      "--status",
      "failed",
      "--project-id",
      "proj_cli",
      "--data-quality",
      "partial",
      "--requires-attention",
      "true",
      "--limit",
      "5",
      "--state-file",
      "tmp/state.json"
    ],
    {
      createApi: (options) => {
        receivedStateFilePath = options?.stateFilePath;
        return api;
      },
      stdout: (message) => output.push(message)
    }
  );
  const payload = JSON.parse(output[0] ?? "{}") as Record<string, unknown>;
  const summaries = payload["summaries"] as Array<Record<string, unknown>>;

  assert.equal(exitCode, 0);
  assert.equal(receivedStateFilePath, "tmp/state.json");
  assert.deepEqual(receivedOptions, {
    executionStatus: "failed",
    projectId: "proj_cli",
    dataQuality: "partial",
    requiresAttention: true,
    limit: 5
  });
  assert.equal(payload["status"], "found");
  assert.equal(payload["totalExecutions"], 2);
  assert.equal(payload["dataQuality"], "partial");
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.["executionId"], "exec_cli_attention");
  assert.equal(summaries[0]?.["requiresAttention"], true);
});

test("CLI execution-summaries works without filters", async () => {
  const output: string[] = [];
  let receivedOptions: Record<string, unknown> | undefined;
  const api = {
    async listExecutionAuditSummaries(options?: Record<string, unknown>) {
      receivedOptions = options;

      return {
        status: "found",
        totalExecutions: 0,
        filtersApplied: options ?? {},
        dataQuality: "complete",
        summaries: [],
        reason: "No executions are persisted."
      };
    }
  } as unknown as QuanticoApi;
  const exitCode = await runCli(["execution-summaries"], {
    createApi: () => api,
    stdout: (message) => output.push(message)
  });
  const payload = JSON.parse(output[0] ?? "{}") as Record<string, unknown>;

  assert.equal(exitCode, 0);
  assert.deepEqual(receivedOptions, {});
  assert.equal(payload["status"], "found");
  assert.equal(payload["totalExecutions"], 0);
});

test("CLI execution-summaries rejects invalid arguments before API use", async () => {
  let apiCalled = false;
  const errors: string[] = [];
  const exitCode = await runCli(["execution-summaries", "--limit", "0"], {
    createApi: () => {
      apiCalled = true;
      return {} as QuanticoApi;
    },
    stderr: (message) => errors.push(message)
  });

  assert.equal(exitCode, 1);
  assert.equal(apiCalled, false);
  assert.match(errors.join("\n"), /positive integer/);
});
