import type {
  BudgetEnforcementResult,
  BudgetLedgerEntry
} from "../types.js";
import type { StateMemory } from "./state-memory.js";

export interface BudgetEnforcementInput {
  executionId: string;
  projectId?: string;
  estimatedNextCallCostUsd: number | null;
  maxExecutionCostUsd?: number;
  maxProjectCostUsd?: number;
}

export interface BudgetEnforcementGate {
  evaluate(input: BudgetEnforcementInput): Promise<BudgetEnforcementResult>;
}

export class BudgetEnforcementGateV05 implements BudgetEnforcementGate {
  constructor(private readonly stateMemory: StateMemory) {}

  async evaluate(input: BudgetEnforcementInput): Promise<BudgetEnforcementResult> {
    if (input.estimatedNextCallCostUsd === null) {
      return budgetUnknown(input, "Estimated next call cost is unknown.");
    }

    if (input.maxProjectCostUsd !== undefined && !input.projectId) {
      return budgetUnknown(input, "Project budget requires an explicit projectId.");
    }

    const entries = await this.stateMemory.listBudgetLedgerEntries();
    let allowedAccumulatedActualCostUsd: number | null = 0;
    let allowedApplicableBudgetUsd: number | null = null;
    let allowedProjectedCostUsd = input.estimatedNextCallCostUsd;

    if (input.maxExecutionCostUsd !== undefined) {
      const executionEntries = entries.filter((entry) => entry.executionId === input.executionId);
      const executionAccumulated = accumulatedActualCost(executionEntries);

      if (executionAccumulated === null) {
        return budgetUnknown(input, "Execution ledger contains unknown actual cost.");
      }

      const projectedCostUsd = roundUsd(executionAccumulated + input.estimatedNextCallCostUsd);

      if (projectedCostUsd > input.maxExecutionCostUsd) {
        return {
          decision: "blocked_execution_budget",
          executionId: input.executionId,
          projectId: input.projectId,
          accumulatedActualCostUsd: executionAccumulated,
          estimatedNextCallCostUsd: input.estimatedNextCallCostUsd,
          applicableBudgetUsd: input.maxExecutionCostUsd,
          projectedCostUsd,
          reason: `Projected execution cost USD ${projectedCostUsd} exceeds max execution cost USD ${input.maxExecutionCostUsd}.`
        };
      }

      allowedAccumulatedActualCostUsd = executionAccumulated;
      allowedApplicableBudgetUsd = input.maxExecutionCostUsd;
      allowedProjectedCostUsd = projectedCostUsd;
    }

    if (input.maxProjectCostUsd !== undefined) {
      const projectEntries = entries.filter((entry) => entry.projectId === input.projectId);
      const projectAccumulated = accumulatedActualCost(projectEntries);

      if (projectAccumulated === null) {
        return budgetUnknown(input, "Project ledger contains unknown actual cost.");
      }

      const projectedCostUsd = roundUsd(projectAccumulated + input.estimatedNextCallCostUsd);

      if (projectedCostUsd > input.maxProjectCostUsd) {
        return {
          decision: "blocked_project_budget",
          executionId: input.executionId,
          projectId: input.projectId,
          accumulatedActualCostUsd: projectAccumulated,
          estimatedNextCallCostUsd: input.estimatedNextCallCostUsd,
          applicableBudgetUsd: input.maxProjectCostUsd,
          projectedCostUsd,
          reason: `Projected project cost USD ${projectedCostUsd} exceeds max project cost USD ${input.maxProjectCostUsd}.`
        };
      }

      allowedAccumulatedActualCostUsd = projectAccumulated;
      allowedApplicableBudgetUsd = input.maxProjectCostUsd;
      allowedProjectedCostUsd = projectedCostUsd;
    }

    return {
      decision: "allowed",
      executionId: input.executionId,
      projectId: input.projectId,
      accumulatedActualCostUsd: allowedAccumulatedActualCostUsd,
      estimatedNextCallCostUsd: input.estimatedNextCallCostUsd,
      applicableBudgetUsd: allowedApplicableBudgetUsd,
      projectedCostUsd: allowedProjectedCostUsd,
      reason: "Projected accumulated cost is within configured budget limits."
    };
  }
}

export { BudgetEnforcementGateV05 as SkeletonBudgetEnforcementGate };

function accumulatedActualCost(entries: BudgetLedgerEntry[]): number | null {
  let total = 0;

  for (const entry of entries) {
    if (entry.calculationStatus === "not_applicable") {
      continue;
    }

    if (entry.calculationStatus !== "calculated" || entry.actualCostUsd === null) {
      return null;
    }

    total += entry.actualCostUsd;
  }

  return roundUsd(total);
}

function budgetUnknown(
  input: BudgetEnforcementInput,
  reason: string
): BudgetEnforcementResult {
  return {
    decision: "budget_unknown",
    executionId: input.executionId,
    projectId: input.projectId,
    accumulatedActualCostUsd: null,
    estimatedNextCallCostUsd: input.estimatedNextCallCostUsd,
    applicableBudgetUsd: input.maxExecutionCostUsd ?? input.maxProjectCostUsd ?? null,
    projectedCostUsd: null,
    reason
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
