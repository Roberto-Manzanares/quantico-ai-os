import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ControlledOperationalExecutionV018 } from "./controlled-operational-execution.js";
import type { BudgetLedger } from "./budget-ledger.js";
import type { HumanApprovalGate } from "./human-approval-gate.js";
import type { StateMemory } from "./state-memory.js";
import type { ControlledExecutionProfile, ExecutionEvent, ProviderName } from "../types.js";

export type OperatorStepStatus =
  | "pending"
  | "awaiting_approval"
  | "running"
  | "succeeded"
  | "failed"
  | "rejected";

export interface OperatorStep {
  id: string;
  title: string;
  tool: "fetch_http" | "write_file";
  risk: "LOW" | "HIGH";
  status: OperatorStepStatus;
  result?: string;
  error?: string;
}

export interface OperatorPlan {
  id: string;
  runId: string;
  executionId: string;
  goal: string;
  understood: string;
  expectedResult: string;
  tools: Array<"fetch_http" | "write_file">;
  risks: string[];
  provider: ProviderName;
  model: string;
  estimatedCostUsd: number | null;
  steps: OperatorStep[];
}

export interface OperatorExecutionResult {
  plan: OperatorPlan;
  outputPath?: string;
  sources: string[];
  auditEventCount: number;
}

export interface LocalOperatorOptions {
  state: StateMemory;
  controlledExecution: ControlledOperationalExecutionV018;
  humanApprovalGate: HumanApprovalGate;
  budgetLedger: BudgetLedger;
  workspaceRoot?: string;
  fetchFn?: typeof fetch;
}

/**
 * Local, deterministic operator for the first supported task: research a topic
 * and write the verified source extract to a local Markdown file.  It delegates
 * model selection, token/cost control and approval persistence to the kernel.
 */
export class LocalOperator {
  private readonly workspaceRoot: string;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: LocalOperatorOptions) {
    this.workspaceRoot = resolve(options.workspaceRoot ?? process.cwd(), "artifacts");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async prepare(goal: string): Promise<OperatorPlan> {
    const normalizedGoal = goal.trim();

    if (!normalizedGoal) {
      throw new Error("An operator goal is required.");
    }

    const id = `operator_${Date.now().toString(36)}`;
    const profile = operatorProfile(normalizedGoal, id);
    const estimate = await this.options.controlledExecution.runControlledExecution({
      ...profile,
      runId: `${id}_estimate`,
      mode: "dry_run"
    });

    if (estimate.status !== "dry_run_ready" || !estimate.provider || !estimate.model) {
      throw new Error(`Cost estimation was not available: ${estimate.reason}`);
    }
    const dryRun = estimate.dryRun;
    if (!dryRun) {
      throw new Error("Cost estimation did not return its token and routing evidence.");
    }

    // This live controlled run stops at the existing HIGH-risk Human Gate; no
    // provider request is issued until a user explicitly approves it.
    const controlled = await this.options.controlledExecution.runControlledExecution({
      ...profile,
      runId: id,
      mode: "live"
    });

    if (controlled.status !== "execution_pending_approval" || !controlled.executionId) {
      throw new Error(`Human approval could not be prepared: ${controlled.reason}`);
    }

    const topic = extractTopic(normalizedGoal);
    const plan: OperatorPlan = {
      id,
      runId: id,
      executionId: controlled.executionId,
      goal: normalizedGoal,
      understood: `Research “${topic}” from a supplied HTTP source and save a Markdown summary locally.`,
      expectedResult: `A Markdown summary of ${topic} with its source link.`,
      tools: ["fetch_http", "write_file"],
      risks: [
        "The supplied external URL will be fetched.",
        "A local Markdown file will be written under the artifacts directory."
      ],
      provider: estimate.provider,
      model: estimate.model,
      estimatedCostUsd: estimate.estimatedCostUsd ?? null,
      steps: [
        { id: "fetch", title: `Fetch a research source for ${topic}`, tool: "fetch_http", risk: "LOW", status: "pending" },
        { id: "write", title: "Write the local Markdown summary", tool: "write_file", risk: "HIGH", status: "awaiting_approval" }
      ]
    };

    await this.options.budgetLedger.record({
      executionId: plan.executionId,
      routingDecision: {
        provider: plan.provider,
        model: plan.model,
        taskType: dryRun.taskType,
        reason: dryRun.routingReason,
        estimatedCostUsd: plan.estimatedCostUsd,
        estimatedLatencyClass: "low"
      },
      tokenDecision: {
        status: "allow",
        estimatedInputTokens: dryRun.estimatedInputTokens,
        estimatedOutputTokens: dryRun.expectedOutputTokens,
        estimatedTotalTokens: dryRun.estimatedInputTokens + dryRun.expectedOutputTokens,
        estimatedCostUsd: plan.estimatedCostUsd,
        reason: dryRun.tokenDecisionReason
      },
      providerCalled: false
    });
    await this.record(plan, "plan_created");
    return plan;
  }

  async load(executionId: string): Promise<OperatorPlan> {
    const event = (await this.options.state.listEvents(executionId))
      .slice()
      .reverse()
      .find((item) => item.type.startsWith("operator_") && isOperatorPlan(item.payload.plan));
    if (!event || !isOperatorPlan(event.payload.plan)) {
      throw new Error(`Operator plan not found for execution: ${executionId}`);
    }
    return event.payload.plan;
  }

  async approve(plan: OperatorPlan, reason = "User approved the local research and file-writing plan."): Promise<OperatorPlan> {
    await this.options.humanApprovalGate.approvePendingStep(
      { executionId: plan.executionId, reason },
      this.options.state
    );
    const step = requireWriteStep(plan);
    step.status = "pending";
    await this.record(plan, "plan_approved");
    return plan;
  }

  async reject(plan: OperatorPlan, reason = "User rejected the local research and file-writing plan."): Promise<OperatorPlan> {
    await this.options.humanApprovalGate.rejectPendingStep(
      { executionId: plan.executionId, reason },
      this.options.state
    );
    requireWriteStep(plan).status = "rejected";
    await this.record(plan, "plan_rejected");
    return plan;
  }

  async execute(plan: OperatorPlan, sourceUrl: string, outputPath: string): Promise<OperatorExecutionResult> {
    const writeStep = requireWriteStep(plan);
    if (writeStep.status === "awaiting_approval" || writeStep.status === "rejected") {
      throw new Error("The plan must be approved before it can execute.");
    }

    const source = requireHttpUrl(sourceUrl);
    const target = this.resolveOutputPath(outputPath);
    const fetchStep = plan.steps[0];

    try {
      fetchStep.status = "running";
      await this.record(plan, "step_running");
      const response = await this.fetchFn(source);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      fetchStep.status = "succeeded";
      fetchStep.result = `Fetched ${text.length} characters from ${source}`;
      await this.record(plan, "source_fetched");

      writeStep.status = "running";
      await this.record(plan, "step_running");
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, renderSummary(plan, source, text), "utf8");
      writeStep.status = "succeeded";
      writeStep.result = target;
      await this.complete(plan, target);

      return {
        plan,
        outputPath: target,
        sources: [source],
        auditEventCount: (await this.options.state.listEvents(plan.executionId)).length
      };
    } catch (error) {
      const runningStep = plan.steps.find((step) => step.status === "running");
      if (runningStep) {
        runningStep.status = "failed";
        runningStep.error = error instanceof Error ? error.message : "Unknown operator error.";
      }
      await this.fail(plan, runningStep?.error ?? "Unknown operator error.");
      throw error;
    }
  }

  private resolveOutputPath(outputPath: string): string {
    const target = resolve(this.workspaceRoot, outputPath);
    const pathFromRoot = relative(this.workspaceRoot, target);

    if (pathFromRoot === "" || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
      throw new Error("Output path must be a file inside the local artifacts directory.");
    }

    return target;
  }

  private async complete(plan: OperatorPlan, outputPath: string): Promise<void> {
    const execution = await this.options.state.getExecution(plan.executionId);
    if (execution) {
      execution.status = "succeeded";
      execution.finalResult = `Research summary written to ${outputPath}. Source: ${plan.steps[0].result ?? "unknown"}`;
      execution.metrics.actualCostUsd = 0;
      execution.metrics.costDeltaUsd = -(execution.metrics.estimatedCostUsd ?? 0);
      execution.updatedAt = new Date();
      await this.options.state.saveExecution(execution);
    }
    await this.record(plan, "completed", { outputPath });
  }

  private async fail(plan: OperatorPlan, message: string): Promise<void> {
    const execution = await this.options.state.getExecution(plan.executionId);
    if (execution) {
      execution.status = "failed";
      execution.error = { code: "operator_tool_failed", message };
      execution.updatedAt = new Date();
      await this.options.state.saveExecution(execution);
    }
    await this.record(plan, "failed", { message });
  }

  private async record(plan: OperatorPlan, type: string, payload: Record<string, unknown> = {}): Promise<void> {
    const event: ExecutionEvent = {
      id: `${plan.id}_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      executionId: plan.executionId,
      type: `operator_${type}`,
      payload: { plan, ...payload },
      createdAt: new Date()
    };
    await this.options.state.appendEvent(event);
  }
}

function operatorProfile(goal: string, profileId: string): ControlledExecutionProfile {
  return {
    profileId,
    goal,
    constraints: {
      maxCostUsd: 0.001,
      maxInputTokens: 800,
      maxOutputTokens: 64,
      maxTotalTokens: 864,
      expectedOutputTokens: 64,
      modelCallRiskLevel: "HIGH"
    },
    evaluationCriteria: [{ type: "min_length", value: 1, description: "A local research summary is produced." }],
    approvalPolicy: { mediumRiskRequiresApproval: true, maxAutomaticCostUsd: 0 },
    budgets: { maxCostUsd: 0.001, maxInputTokens: 800, maxOutputTokens: 64, maxTotalTokens: 864, expectedOutputTokens: 64 },
    auditRequirements: { requireTimeline: true, requireAuditSummary: true },
    mode: "live"
  };
}

function extractTopic(goal: string): string {
  return goal
    .replace(/^.*?(investiga|research)\s+/i, "")
    .replace(/\s+(y|and)\s+(guarda|save).*$/i, "")
    .trim() || goal;
}

function requireWriteStep(plan: OperatorPlan): OperatorStep {
  const step = plan.steps.find((item) => item.id === "write");
  if (!step) throw new Error("Operator plan is missing its local-write step.");
  return step;
}

function requireHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Research source must use HTTP or HTTPS.");
  }
  return url.toString();
}

function renderSummary(plan: OperatorPlan, source: string, text: string): string {
  return `# Research summary\n\n## Goal\n${plan.goal}\n\n## Source\n${source}\n\n## Summary extract\n${text.slice(0, 4000)}\n`;
}

function isOperatorPlan(value: unknown): value is OperatorPlan {
  return Boolean(
    value && typeof value === "object" &&
    "executionId" in value && typeof value.executionId === "string" &&
    "steps" in value && Array.isArray(value.steps)
  );
}
