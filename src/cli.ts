#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { createQuanticoApi, createQuanticoSystem, type QuanticoApi } from "./index.js";

export interface CliDependencies {
  createApi?: (options?: { stateFilePath?: string }) => QuanticoApi;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
}

export async function runCli(
  argv: string[],
  dependencies: CliDependencies = {}
): Promise<number> {
  const [command, ...args] = argv;
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;

  if (command === "run" && args.length > 0) {
    const system = createQuanticoSystem();
    const result = await system.orchestrator.run({ goal: args.join(" ") });

    stdout(
      json({
      executionId: result.execution.id,
      status: result.execution.status,
      taskType: result.execution.taskType,
      metrics: result.execution.metrics,
      evaluation: result.evaluation
      })
    );

    return 0;
  }

  if (command === "close-run") {
    const parsed = parseCloseRunArgs(args);

    if (!parsed.ok) {
      stderr(parsed.reason);
      stderr(usage());
      return 1;
    }

    const api = (dependencies.createApi ?? createQuanticoApi)({
      stateFilePath: parsed.stateFilePath
    });
    const result = await api.closeControlledRun(parsed.runId, {
      approvalDecision: parsed.approvalDecision,
      reason: parsed.reason
    });

    stdout(
      json({
        runId: result.runId,
        executionId: "executionId" in result ? result.executionId : undefined,
        status: result.status,
        reason: result.reason
      })
    );

    return result.status === "not_found" || result.status === "not_closable" ? 1 : 0;
  }

  stdout(usage());
  return command ? 1 : 0;
}

function parseCloseRunArgs(args: string[]):
  | {
      ok: true;
      runId: string;
      approvalDecision?: "approved" | "rejected";
      reason?: string;
      stateFilePath?: string;
    }
  | { ok: false; reason: string } {
  const runId = args[0];

  if (!runId || runId.startsWith("--")) {
    return { ok: false, reason: "close-run requires a runId." };
  }

  const parsed: {
    ok: true;
    runId: string;
    approvalDecision?: "approved" | "rejected";
    reason?: string;
    stateFilePath?: string;
  } = { ok: true, runId };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--approve") {
      parsed.approvalDecision = "approved";
      continue;
    }

    if (arg === "--reject") {
      parsed.approvalDecision = "rejected";
      continue;
    }

    if (arg === "--reason") {
      const value = args[index + 1];

      if (!value) {
        return { ok: false, reason: "--reason requires a value." };
      }

      parsed.reason = value;
      index += 1;
      continue;
    }

    if (arg === "--state-file") {
      const value = args[index + 1];

      if (!value) {
        return { ok: false, reason: "--state-file requires a value." };
      }

      parsed.stateFilePath = value;
      index += 1;
      continue;
    }

    return { ok: false, reason: `Unknown close-run option: ${arg}.` };
  }

  if (args.includes("--approve") && args.includes("--reject")) {
    return { ok: false, reason: "Use only one of --approve or --reject." };
  }

  return parsed;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function usage(): string {
  return [
    "Usage:",
    "  quantico run \"<goal>\"",
    "  quantico close-run <runId> [--approve|--reject] [--reason \"<reason>\"] [--state-file <path>]"
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exit(exitCode);
}
