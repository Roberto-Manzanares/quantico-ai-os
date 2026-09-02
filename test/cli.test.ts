import test from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/cli.js";
import type { QuanticoApi } from "../src/index.js";

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
