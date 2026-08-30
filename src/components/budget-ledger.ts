import type {
  BudgetLedgerEntry,
  BudgetLedgerSummary,
  BudgetLedgerTotals,
  ModelCallResult,
  ProviderName,
  RoutingDecision,
  TokenDecision
} from "../types.js";
import { EMPTY_PRICING_TABLE, type ModelPricingTable } from "../config/model-config.js";
import type { StateMemory } from "./state-memory.js";

export interface BudgetLedgerInput {
  executionId: string;
  routingDecision: RoutingDecision;
  tokenDecision: TokenDecision;
  modelCall?: ModelCallResult;
  providerCalled: boolean;
  latencyMs?: number;
  timestamp?: Date;
}

export interface BudgetLedger {
  record(input: BudgetLedgerInput): Promise<BudgetLedgerEntry>;
  listEntries(executionId?: string): Promise<BudgetLedgerEntry[]>;
  summarize(): Promise<BudgetLedgerSummary>;
}

export class BudgetLedgerV04 implements BudgetLedger {
  constructor(
    private readonly stateMemory: StateMemory,
    private readonly pricingTable: ModelPricingTable = EMPTY_PRICING_TABLE
  ) {}

  async record(input: BudgetLedgerInput): Promise<BudgetLedgerEntry> {
    const entry = this.createEntry(input);
    await this.stateMemory.saveBudgetLedgerEntry(entry);
    return entry;
  }

  async listEntries(executionId?: string): Promise<BudgetLedgerEntry[]> {
    return this.stateMemory.listBudgetLedgerEntries(executionId);
  }

  async summarize(): Promise<BudgetLedgerSummary> {
    return summarizeBudgetLedgerEntries(await this.listEntries());
  }

  private createEntry(input: BudgetLedgerInput): BudgetLedgerEntry {
    const pricing = this.pricingTable[input.routingDecision.provider]?.[input.routingDecision.model];
    const actualInputTokens =
      typeof input.modelCall?.inputTokens === "number" ? input.modelCall.inputTokens : null;
    const actualOutputTokens =
      typeof input.modelCall?.outputTokens === "number" ? input.modelCall.outputTokens : null;
    const estimatedCostUsd = input.tokenDecision.estimatedCostUsd ?? input.routingDecision.estimatedCostUsd ?? null;
    const base = {
      executionId: input.executionId,
      provider: input.routingDecision.provider,
      model: input.routingDecision.model,
      estimatedInputTokens: input.tokenDecision.estimatedInputTokens,
      expectedOutputTokens: input.tokenDecision.estimatedOutputTokens,
      actualInputTokens,
      actualOutputTokens,
      inputPricePerMillion: pricing?.inputUsdPerMillionTokens ?? null,
      outputPricePerMillion: pricing?.outputUsdPerMillionTokens ?? null,
      estimatedCostUsd,
      latencyMs: input.latencyMs ?? input.modelCall?.latencyMs ?? 0,
      timestamp: input.timestamp ?? new Date()
    };

    if (!input.providerCalled) {
      return {
        ...base,
        actualCostUsd: null,
        costDeltaUsd: null,
        calculationStatus: "not_applicable",
        calculationReason: "Provider call was not executed."
      };
    }

    if (actualInputTokens === null || actualOutputTokens === null) {
      return {
        ...base,
        actualCostUsd: null,
        costDeltaUsd: null,
        calculationStatus: "missing_usage",
        calculationReason: "Provider response did not include complete actual token usage."
      };
    }

    if (!pricing) {
      return {
        ...base,
        actualCostUsd: null,
        costDeltaUsd: null,
        calculationStatus: "missing_pricing",
        calculationReason: `Missing pricing for ${input.routingDecision.provider}/${input.routingDecision.model}.`
      };
    }

    const rawActualCostUsd =
      (actualInputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens +
      (actualOutputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens;
    const rawCostDeltaUsd = estimatedCostUsd === null ? null : rawActualCostUsd - estimatedCostUsd;

    return {
      ...base,
      actualCostUsd: roundUsd(rawActualCostUsd),
      costDeltaUsd: rawCostDeltaUsd === null ? null : roundUsd(rawCostDeltaUsd),
      calculationStatus: "calculated"
    };
  }
}

export function summarizeBudgetLedgerEntries(entries: BudgetLedgerEntry[]): BudgetLedgerSummary {
  const summary: BudgetLedgerSummary = {
    byExecution: {},
    byProvider: emptyProviderTotals(),
    byModel: {}
  };

  for (const entry of entries) {
    if (entry.actualCostUsd === null || entry.calculationStatus !== "calculated") {
      continue;
    }

    addToTotals(summary.byExecution, entry.executionId, entry);
    addToTotals(summary.byProvider, entry.provider, entry);
    addToTotals(summary.byModel, `${entry.provider}:${entry.model}`, entry);
  }

  return summary;
}

export { BudgetLedgerV04 as SkeletonBudgetLedger };

function addToTotals(
  target: Record<string, BudgetLedgerTotals>,
  key: string,
  entry: BudgetLedgerEntry
): void {
  const current = target[key] ?? zeroTotals();
  target[key] = {
    entryCount: current.entryCount + 1,
    actualCostUsd: roundUsd(current.actualCostUsd + (entry.actualCostUsd ?? 0)),
    actualInputTokens: current.actualInputTokens + (entry.actualInputTokens ?? 0),
    actualOutputTokens: current.actualOutputTokens + (entry.actualOutputTokens ?? 0),
    latencyMs: current.latencyMs + entry.latencyMs
  };
}

function emptyProviderTotals(): Record<ProviderName, BudgetLedgerTotals> {
  return {
    openai: zeroTotals(),
    anthropic: zeroTotals()
  };
}

function zeroTotals(): BudgetLedgerTotals {
  return {
    entryCount: 0,
    actualCostUsd: 0,
    actualInputTokens: 0,
    actualOutputTokens: 0,
    latencyMs: 0
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
