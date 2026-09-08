#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  createQuanticoApi,
  createQuanticoSystem,
  type ControlledExecutionProfile,
  type ExecutionAuditSummaryOptions,
  type ProviderName,
  type QuanticoApi
} from "./index.js";
import { startDashboard, type DashboardOptions } from "./dashboard.js";

export interface CliDependencies {
  createApi?: (options?: { stateFilePath?: string }) => QuanticoApi;
  readTextFile?: (path: string) => Promise<string>;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  startDashboard?: (options: DashboardOptions) => Promise<{ url: string }>;
}

export async function runCli(
  argv: string[],
  dependencies: CliDependencies = {}
): Promise<number> {
  const [command, ...args] = argv;
  const stdout = dependencies.stdout ?? console.log;
  const stderr = dependencies.stderr ?? console.error;

  if (command === "dashboard") {
    const parsed = parseDashboardArgs(args);

    if (!parsed.ok) {
      stderr(parsed.reason);
      stderr(usage());
      return 1;
    }

    const dashboard = await (dependencies.startDashboard ?? startDashboard)({
      port: parsed.port,
      stateFilePath: parsed.stateFilePath
    });
    stdout(`Quantico dashboard available at ${dashboard.url}`);
    return 0;
  }

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

  if (command === "approval") {
    const parsed = parseApprovalArgs(args);

    if (!parsed.ok) {
      stderr(parsed.reason);
      stderr(usage());
      return 1;
    }

    const api = (dependencies.createApi ?? createQuanticoApi)({
      stateFilePath: parsed.stateFilePath
    });
    const result =
      parsed.decision === "approved"
        ? await api.approvePendingStep({ executionId: parsed.executionId, reason: parsed.reason })
        : await api.rejectPendingStep({ executionId: parsed.executionId, reason: parsed.reason });

    stdout(
      json({
        executionId: result.executionId,
        status: result.status,
        decisionApplied: result.decisionApplied,
        pendingStepId: result.pendingStep?.id,
        riskLevel: result.pendingStep?.riskLevel,
        actionName: result.pendingStep?.action.name,
        reason: result.reason
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

  if (command === "execution-summaries") {
    const parsed = parseExecutionSummariesArgs(args);

    if (!parsed.ok) {
      stderr(parsed.reason);
      stderr(usage());
      return 1;
    }

    const api = (dependencies.createApi ?? createQuanticoApi)({
      stateFilePath: parsed.stateFilePath
    });
    const result = await api.listExecutionAuditSummaries(parsed.options);

    stdout(
      json({
        status: result.status,
        totalExecutions: result.totalExecutions,
        filtersApplied: result.filtersApplied,
        dataQuality: result.dataQuality,
        summaries: result.summaries,
        reason: result.reason
      })
    );

    return 0;
  }

  if (command === "execution-summary") {
    const parsed = parseExecutionSummaryArgs(args);

    if (!parsed.ok) {
      stderr(parsed.reason);
      stderr(usage());
      return 1;
    }

    const api = (dependencies.createApi ?? createQuanticoApi)({
      stateFilePath: parsed.stateFilePath
    });
    const result = await api.getExecutionAuditSummary(parsed.executionId);

    stdout(json(result));
    return result.status === "not_found" ? 1 : 0;
  }

  if (command === "execution-result") {
    const parsed = parseExecutionResultArgs(args);

    if (!parsed.ok) {
      stderr(parsed.reason);
      stderr(usage());
      return 1;
    }

    const api = (dependencies.createApi ?? createQuanticoApi)({
      stateFilePath: parsed.stateFilePath
    });
    const result = await api.getResultAndMetrics(parsed.executionId);

    stdout(
      json(
        result
          ? {
              status: "found",
              executionId: result.executionId,
              executionStatus: result.status,
              finalResult: result.finalResult,
              evaluation: result.evaluation,
              metrics: result.metrics
            }
          : {
              status: "not_found",
              executionId: parsed.executionId,
              reason: `Execution result and metrics not found for ${parsed.executionId}.`
            }
      )
    );

    return result ? 0 : 1;
  }

  if (command === "provider-scorecards") {
    const parsed = parseProviderScorecardsArgs(args);

    if (!parsed.ok) {
      stderr(parsed.reason);
      stderr(usage());
      return 1;
    }

    const api = (dependencies.createApi ?? createQuanticoApi)({
      stateFilePath: parsed.stateFilePath
    });

    if (parsed.provider && parsed.model) {
      const result = await api.getProviderScorecard(parsed.provider, parsed.model);

      stdout(json(result));
      return result.status === "not_found" ? 1 : 0;
    }

    const result = await api.listProviderScorecards();

    stdout(
      json({
        status: "found",
        scorecards: Object.values(result.byModel)
      })
    );

    return 0;
  }

  if (command === "authority-safety") {
    const parsed = parseAuthoritySafetyArgs(args);

    if (!parsed.ok) {
      stderr(parsed.reason);
      stderr(usage());
      return 1;
    }

    const api = (dependencies.createApi ?? createQuanticoApi)({
      stateFilePath: parsed.stateFilePath
    });
    const result = parsed.executionId
      ? await api.getAuthorityRuntimeSafetyMetricsForExecution(parsed.executionId)
      : await api.getAuthorityRuntimeSafetyMetrics();

    stdout(json(result));
    return result.status === "not_found" ? 1 : 0;
  }

  stdout(usage());
  return command ? 1 : 0;
}

function parseApprovalArgs(args: string[]):
  | {
      ok: true;
      executionId: string;
      decision: "approved" | "rejected";
      reason?: string;
      stateFilePath?: string;
    }
  | { ok: false; reason: string } {
  const executionId = args[0];

  if (!executionId || executionId.startsWith("--")) {
    return { ok: false, reason: "approval requires an executionId." };
  }

  const parsed: {
    ok: true;
    executionId: string;
    decision?: "approved" | "rejected";
    reason?: string;
    stateFilePath?: string;
  } = { ok: true, executionId };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--approve") {
      parsed.decision = "approved";
      continue;
    }

    if (arg === "--reject") {
      parsed.decision = "rejected";
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

    return { ok: false, reason: `Unknown approval option: ${arg}.` };
  }

  if (args.includes("--approve") && args.includes("--reject")) {
    return { ok: false, reason: "Use only one of --approve or --reject." };
  }

  if (!parsed.decision) {
    return { ok: false, reason: "approval requires --approve or --reject." };
  }

  return {
    ok: true,
    executionId: parsed.executionId,
    decision: parsed.decision,
    reason: parsed.reason,
    stateFilePath: parsed.stateFilePath
  };
}

function parseDashboardArgs(args: string[]):
  | { ok: true; port?: number; stateFilePath?: string }
  | { ok: false; reason: string } {
  const parsed: { ok: true; port?: number; stateFilePath?: string } = { ok: true };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--port") {
      const port = Number(value);

      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { ok: false, reason: "--port must be an integer from 1 to 65535." };
      }

      parsed.port = port;
      index += 1;
      continue;
    }

    if (arg === "--state-file") {
      if (!value) {
        return { ok: false, reason: "--state-file requires a value." };
      }

      parsed.stateFilePath = value;
      index += 1;
      continue;
    }

    return { ok: false, reason: `Unknown dashboard option: ${arg}.` };
  }

  return parsed;
}

function parseExecutionResultArgs(args: string[]):
  | {
      ok: true;
      executionId: string;
      stateFilePath?: string;
    }
  | { ok: false; reason: string } {
  const executionId = args[0];

  if (!executionId || executionId.startsWith("--")) {
    return { ok: false, reason: "execution-result requires an executionId." };
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

    return { ok: false, reason: `Unknown execution-result option: ${arg}.` };
  }

  return parsed;
}

function parseExecutionSummaryArgs(args: string[]):
  | {
      ok: true;
      executionId: string;
      stateFilePath?: string;
    }
  | { ok: false; reason: string } {
  const executionId = args[0];

  if (!executionId || executionId.startsWith("--")) {
    return { ok: false, reason: "execution-summary requires an executionId." };
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

    return { ok: false, reason: `Unknown execution-summary option: ${arg}.` };
  }

  return parsed;
}

function parseAuthoritySafetyArgs(args: string[]):
  | {
      ok: true;
      executionId?: string;
      stateFilePath?: string;
    }
  | { ok: false; reason: string } {
  const parsed: { ok: true; executionId?: string; stateFilePath?: string } = { ok: true };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--execution-id") {
      if (!value) {
        return { ok: false, reason: "--execution-id requires a value." };
      }

      parsed.executionId = value;
      index += 1;
      continue;
    }

    if (arg === "--state-file") {
      if (!value) {
        return { ok: false, reason: "--state-file requires a value." };
      }

      parsed.stateFilePath = value;
      index += 1;
      continue;
    }

    return { ok: false, reason: `Unknown authority-safety option: ${arg}.` };
  }

  return parsed;
}

function parseProviderScorecardsArgs(args: string[]):
  | {
      ok: true;
      provider?: ProviderName;
      model?: string;
      stateFilePath?: string;
    }
  | { ok: false; reason: string } {
  const parsed: { ok: true; provider?: ProviderName; model?: string; stateFilePath?: string } = {
    ok: true
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--provider") {
      if (!value) {
        return { ok: false, reason: "--provider requires a value." };
      }

      if (value !== "openai" && value !== "anthropic") {
        return { ok: false, reason: "--provider must be openai or anthropic." };
      }

      parsed.provider = value;
      index += 1;
      continue;
    }

    if (arg === "--model") {
      if (!value) {
        return { ok: false, reason: "--model requires a value." };
      }

      parsed.model = value;
      index += 1;
      continue;
    }

    if (arg === "--state-file") {
      if (!value) {
        return { ok: false, reason: "--state-file requires a value." };
      }

      parsed.stateFilePath = value;
      index += 1;
      continue;
    }

    return { ok: false, reason: `Unknown provider-scorecards option: ${arg}.` };
  }

  if ((parsed.provider && !parsed.model) || (!parsed.provider && parsed.model)) {
    return { ok: false, reason: "Use --provider and --model together for a single scorecard lookup." };
  }

  return parsed;
}

function parseExecutionSummariesArgs(args: string[]):
  | {
      ok: true;
      options: ExecutionAuditSummaryOptions;
      stateFilePath?: string;
    }
  | { ok: false; reason: string } {
  const parsed: {
    ok: true;
    options: ExecutionAuditSummaryOptions;
    stateFilePath?: string;
  } = { ok: true, options: {} };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === "--status") {
      if (!value) {
        return { ok: false, reason: "--status requires a value." };
      }

      parsed.options.executionStatus = value as ExecutionAuditSummaryOptions["executionStatus"];
      index += 1;
      continue;
    }

    if (arg === "--project-id") {
      if (!value) {
        return { ok: false, reason: "--project-id requires a value." };
      }

      parsed.options.projectId = value;
      index += 1;
      continue;
    }

    if (arg === "--data-quality") {
      if (!value) {
        return { ok: false, reason: "--data-quality requires a value." };
      }

      parsed.options.dataQuality = value as ExecutionAuditSummaryOptions["dataQuality"];
      index += 1;
      continue;
    }

    if (arg === "--requires-attention") {
      if (value !== "true" && value !== "false") {
        return { ok: false, reason: "--requires-attention requires true or false." };
      }

      parsed.options.requiresAttention = value === "true";
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      if (!value) {
        return { ok: false, reason: "--limit requires a value." };
      }

      const limit = Number(value);

      if (!Number.isInteger(limit) || limit < 1) {
        return { ok: false, reason: "--limit must be a positive integer." };
      }

      parsed.options.limit = limit;
      index += 1;
      continue;
    }

    if (arg === "--state-file") {
      if (!value) {
        return { ok: false, reason: "--state-file requires a value." };
      }

      parsed.stateFilePath = value;
      index += 1;
      continue;
    }

    return { ok: false, reason: `Unknown execution-summaries option: ${arg}.` };
  }

  return parsed;
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
    "  quantico dashboard [--port <port>] [--state-file <path>]",
    "  quantico approval <executionId> --approve|--reject [--reason \"<reason>\"] [--state-file <path>]",
    "  quantico controlled-run <profile.json> [--state-file <path>]",
    "  quantico controlled-status <runId> [--state-file <path>]",
    "  quantico execution-timeline <executionId> [--state-file <path>]",
    "  quantico execution-summary <executionId> [--state-file <path>]",
    "  quantico execution-result <executionId> [--state-file <path>]",
    "  quantico execution-summaries [--status <status>] [--project-id <id>] [--data-quality <quality>] [--requires-attention true|false] [--limit <n>] [--state-file <path>]",
    "  quantico provider-scorecards [--provider openai|anthropic --model <model>] [--state-file <path>]",
    "  quantico authority-safety [--execution-id <executionId>] [--state-file <path>]",
    "  quantico close-run <runId> [--approve|--reject] [--reason \"<reason>\"] [--state-file <path>]"
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exit(exitCode);
}
