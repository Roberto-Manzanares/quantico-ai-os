#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  createQuanticoApi,
  createQuanticoSystem,
  type ControlledExecutionProfile,
  type QuanticoApi
} from "./index.js";

export interface CliDependencies {
  createApi?: (options?: { stateFilePath?: string }) => QuanticoApi;
  readTextFile?: (path: string) => Promise<string>;
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

  if (command === "controlled-run") {
    const parsed = parseControlledRunArgs(args);

    if (!parsed.ok) {
      stderr(parsed.reason);
      stderr(usage());
      return 1;
    }

    const profileResult = await readProfile(parsed.profilePath, dependencies.readTextFile ?? readFileText);

    if (!profileResult.ok) {
      stderr(profileResult.reason);
      return 1;
    }

    const api = (dependencies.createApi ?? createQuanticoApi)({
      stateFilePath: parsed.stateFilePath
    });
    const result = await api.runControlledExecution(profileResult.profile);

    stdout(
      json({
        runId: result.runId,
        executionId: result.executionId,
        status: result.status,
        profileValidationStatus: result.profileValidationStatus,
        provider: result.provider,
        model: result.model,
        estimatedCostUsd: result.estimatedCostUsd,
        actualCostUsd: result.actualCostUsd,
        evaluationStatus: result.evaluationStatus,
        reason: result.reason
      })
    );

    return result.status === "profile_rejected" || result.manifestRecordingStatus === "manifest_record_failed"
      ? 1
      : 0;
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

  if (command === "controlled-status") {
    const parsed = parseControlledStatusArgs(args);

    if (!parsed.ok) {
      stderr(parsed.reason);
      stderr(usage());
      return 1;
    }

    const api = (dependencies.createApi ?? createQuanticoApi)({
      stateFilePath: parsed.stateFilePath
    });
    const result = await api.getControlledRunStatus(parsed.runId);

    stdout(
      json(
        result.status === "found"
          ? {
              status: result.status,
              runId: result.runId,
              executionId: result.executionId,
              mode: result.mode,
              lifecycleStatus: result.lifecycleStatus,
              persistenceOutcome: result.persistenceOutcome,
              profileValidationStatus: result.profileValidationStatus,
              controlledStatus: result.controlledStatus,
              provider: result.provider,
              model: result.model,
              estimatedCostUsd: result.estimatedCostUsd,
              actualCostUsd: result.actualCostUsd,
              evaluationStatus: result.evaluationStatus,
              requiresHumanApproval: result.requiresHumanApproval,
              approvalResolutionEligible: result.approvalResolutionEligible,
              dataQuality: result.dataQuality,
              reason: result.reason
            }
          : {
              status: result.status,
              runId: result.runId,
              reason: result.reason
            }
      )
    );

    return result.status === "not_found" ? 1 : 0;
  }

  if (command === "execution-timeline") {
    const parsed = parseExecutionTimelineArgs(args);

    if (!parsed.ok) {
      stderr(parsed.reason);
      stderr(usage());
      return 1;
    }

    const api = (dependencies.createApi ?? createQuanticoApi)({
      stateFilePath: parsed.stateFilePath
    });
    const result = await api.getExecutionAuditTimeline(parsed.executionId);

    stdout(
      json(
        result.status === "found"
          ? {
              status: result.status,
              executionId: result.executionId,
              executionStatus: result.executionStatus,
              dataQuality: result.dataQuality,
              timeline: result.timeline,
              reason: result.reason
            }
          : {
              status: result.status,
              executionId: result.executionId,
              reason: result.reason
            }
      )
    );

    return result.status === "not_found" ? 1 : 0;
  }

  stdout(usage());
  return command ? 1 : 0;
}

function parseExecutionTimelineArgs(args: string[]):
  | {
      ok: true;
      executionId: string;
      stateFilePath?: string;
    }
  | { ok: false; reason: string } {
  const executionId = args[0];

  if (!executionId || executionId.startsWith("--")) {
    return { ok: false, reason: "execution-timeline requires an executionId." };
  }

  const parsed: { ok: true; executionId: string; stateFilePath?: string } = {
    ok: true,
    executionId
  };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--state-file") {
      const value = args[index + 1];

      if (!value) {
        return { ok: false, reason: "--state-file requires a value." };
      }

      parsed.stateFilePath = value;
      index += 1;
      continue;
    }

    return { ok: false, reason: `Unknown execution-timeline option: ${arg}.` };
  }

  return parsed;
}

function parseControlledStatusArgs(args: string[]):
  | {
      ok: true;
      runId: string;
      stateFilePath?: string;
    }
  | { ok: false; reason: string } {
  const runId = args[0];

  if (!runId || runId.startsWith("--")) {
    return { ok: false, reason: "controlled-status requires a runId." };
  }

  const parsed: { ok: true; runId: string; stateFilePath?: string } = {
    ok: true,
    runId
  };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--state-file") {
      const value = args[index + 1];

      if (!value) {
        return { ok: false, reason: "--state-file requires a value." };
      }

      parsed.stateFilePath = value;
      index += 1;
      continue;
    }

    return { ok: false, reason: `Unknown controlled-status option: ${arg}.` };
  }

  return parsed;
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

function parseControlledRunArgs(args: string[]):
  | {
      ok: true;
      profilePath: string;
      stateFilePath?: string;
    }
  | { ok: false; reason: string } {
  const profilePath = args[0];

  if (!profilePath || profilePath.startsWith("--")) {
    return { ok: false, reason: "controlled-run requires a profile JSON file path." };
  }

  const parsed: { ok: true; profilePath: string; stateFilePath?: string } = {
    ok: true,
    profilePath
  };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--state-file") {
      const value = args[index + 1];

      if (!value) {
        return { ok: false, reason: "--state-file requires a value." };
      }

      parsed.stateFilePath = value;
      index += 1;
      continue;
    }

    return { ok: false, reason: `Unknown controlled-run option: ${arg}.` };
  }

  return parsed;
}

async function readProfile(
  profilePath: string,
  readTextFile: (path: string) => Promise<string>
): Promise<{ ok: true; profile: ControlledExecutionProfile } | { ok: false; reason: string }> {
  try {
    const raw = await readTextFile(profilePath);
    const value = JSON.parse(raw) as unknown;

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, reason: "Controlled run profile JSON must be an object." };
    }

    return { ok: true, profile: value as ControlledExecutionProfile };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof SyntaxError
        ? `Controlled run profile JSON is invalid: ${error.message}`
        : `Unable to read controlled run profile: ${error instanceof Error ? error.message : "unknown error"}`
    };
  }
}

async function readFileText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function usage(): string {
  return [
    "Usage:",
    "  quantico run \"<goal>\"",
    "  quantico controlled-run <profile.json> [--state-file <path>]",
    "  quantico controlled-status <runId> [--state-file <path>]",
    "  quantico execution-timeline <executionId> [--state-file <path>]",
    "  quantico close-run <runId> [--approve|--reject] [--reason \"<reason>\"] [--state-file <path>]"
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exit(exitCode);
}
