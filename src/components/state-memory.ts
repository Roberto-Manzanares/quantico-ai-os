import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  BudgetLedgerEntry,
  Execution,
  ExecutionEvent,
  PendingApprovalStep,
  ShadowRoutingEvaluationLogEntry
} from "../types.js";

export interface StateMemory {
  saveExecution(execution: Execution): Promise<void>;
  getExecution(id: string): Promise<Execution | undefined>;
  appendEvent(event: ExecutionEvent): Promise<void>;
  listEvents(executionId: string): Promise<ExecutionEvent[]>;
  savePendingApprovalStep(step: PendingApprovalStep): Promise<void>;
  getPendingApprovalStep(executionId: string): Promise<PendingApprovalStep | undefined>;
  clearPendingApprovalStep(executionId: string): Promise<void>;
  saveBudgetLedgerEntry(entry: BudgetLedgerEntry): Promise<void>;
  listBudgetLedgerEntries(executionId?: string): Promise<BudgetLedgerEntry[]>;
  saveShadowRoutingEvaluation(entry: ShadowRoutingEvaluationLogEntry): Promise<void>;
  listShadowRoutingEvaluations(executionId?: string): Promise<ShadowRoutingEvaluationLogEntry[]>;
}

export class InMemoryStateMemory implements StateMemory {
  private readonly executions = new Map<string, Execution>();
  private readonly events: ExecutionEvent[] = [];
  private readonly pendingApprovalSteps = new Map<string, PendingApprovalStep>();
  private readonly budgetLedgerEntries: BudgetLedgerEntry[] = [];
  private readonly shadowRoutingEvaluations: ShadowRoutingEvaluationLogEntry[] = [];

  async saveExecution(execution: Execution): Promise<void> {
    this.executions.set(execution.id, execution);
  }

  async getExecution(id: string): Promise<Execution | undefined> {
    return this.executions.get(id);
  }

  async appendEvent(event: ExecutionEvent): Promise<void> {
    this.events.push(event);
  }

  async listEvents(executionId: string): Promise<ExecutionEvent[]> {
    return this.events.filter((event) => event.executionId === executionId);
  }

  async savePendingApprovalStep(step: PendingApprovalStep): Promise<void> {
    this.pendingApprovalSteps.set(step.executionId, step);
  }

  async getPendingApprovalStep(executionId: string): Promise<PendingApprovalStep | undefined> {
    return this.pendingApprovalSteps.get(executionId);
  }

  async clearPendingApprovalStep(executionId: string): Promise<void> {
    this.pendingApprovalSteps.delete(executionId);
  }

  async saveBudgetLedgerEntry(entry: BudgetLedgerEntry): Promise<void> {
    const existingIndex = this.budgetLedgerEntries.findIndex((item) => isSameLedgerEntry(item, entry));

    if (existingIndex >= 0) {
      this.budgetLedgerEntries[existingIndex] = entry;
    } else {
      this.budgetLedgerEntries.push(entry);
    }
  }

  async listBudgetLedgerEntries(executionId?: string): Promise<BudgetLedgerEntry[]> {
    if (!executionId) {
      return [...this.budgetLedgerEntries];
    }

    return this.budgetLedgerEntries.filter((entry) => entry.executionId === executionId);
  }

  async saveShadowRoutingEvaluation(entry: ShadowRoutingEvaluationLogEntry): Promise<void> {
    const existingIndex = this.shadowRoutingEvaluations.findIndex((item) => item.id === entry.id);

    if (existingIndex >= 0) {
      this.shadowRoutingEvaluations[existingIndex] = entry;
    } else {
      this.shadowRoutingEvaluations.push(entry);
    }
  }

  async listShadowRoutingEvaluations(
    executionId?: string
  ): Promise<ShadowRoutingEvaluationLogEntry[]> {
    if (!executionId) {
      return [...this.shadowRoutingEvaluations];
    }

    return this.shadowRoutingEvaluations.filter((entry) => entry.executionId === executionId);
  }
}

interface StateFileData {
  executions: Execution[];
  events: ExecutionEvent[];
  pendingApprovalSteps: PendingApprovalStep[];
  budgetLedgerEntries: BudgetLedgerEntry[];
  shadowRoutingEvaluations: ShadowRoutingEvaluationLogEntry[];
}

export class FileStateMemory implements StateMemory {
  constructor(private readonly filePath = ".quantico/state.json") {}

  async saveExecution(execution: Execution): Promise<void> {
    const state = await this.readState();
    const existingIndex = state.executions.findIndex((item) => item.id === execution.id);

    if (existingIndex >= 0) {
      state.executions[existingIndex] = execution;
    } else {
      state.executions.push(execution);
    }

    await this.writeState(state);
  }

  async getExecution(id: string): Promise<Execution | undefined> {
    const state = await this.readState();
    return state.executions.find((execution) => execution.id === id);
  }

  async appendEvent(event: ExecutionEvent): Promise<void> {
    const state = await this.readState();
    state.events.push(event);
    await this.writeState(state);
  }

  async listEvents(executionId: string): Promise<ExecutionEvent[]> {
    const state = await this.readState();
    return state.events.filter((event) => event.executionId === executionId);
  }

  async savePendingApprovalStep(step: PendingApprovalStep): Promise<void> {
    const state = await this.readState();
    const existingIndex = state.pendingApprovalSteps.findIndex(
      (item) => item.executionId === step.executionId
    );

    if (existingIndex >= 0) {
      state.pendingApprovalSteps[existingIndex] = step;
    } else {
      state.pendingApprovalSteps.push(step);
    }

    await this.writeState(state);
  }

  async getPendingApprovalStep(executionId: string): Promise<PendingApprovalStep | undefined> {
    const state = await this.readState();
    return state.pendingApprovalSteps.find((step) => step.executionId === executionId);
  }

  async clearPendingApprovalStep(executionId: string): Promise<void> {
    const state = await this.readState();
    state.pendingApprovalSteps = state.pendingApprovalSteps.filter(
      (step) => step.executionId !== executionId
    );
    await this.writeState(state);
  }

  async saveBudgetLedgerEntry(entry: BudgetLedgerEntry): Promise<void> {
    const state = await this.readState();
    const existingIndex = state.budgetLedgerEntries.findIndex((item) => isSameLedgerEntry(item, entry));

    if (existingIndex >= 0) {
      state.budgetLedgerEntries[existingIndex] = entry;
    } else {
      state.budgetLedgerEntries.push(entry);
    }

    await this.writeState(state);
  }

  async listBudgetLedgerEntries(executionId?: string): Promise<BudgetLedgerEntry[]> {
    const state = await this.readState();

    if (!executionId) {
      return state.budgetLedgerEntries;
    }

    return state.budgetLedgerEntries.filter((entry) => entry.executionId === executionId);
  }

  async saveShadowRoutingEvaluation(entry: ShadowRoutingEvaluationLogEntry): Promise<void> {
    const state = await this.readState();
    const existingIndex = state.shadowRoutingEvaluations.findIndex((item) => item.id === entry.id);

    if (existingIndex >= 0) {
      state.shadowRoutingEvaluations[existingIndex] = entry;
    } else {
      state.shadowRoutingEvaluations.push(entry);
    }

    await this.writeState(state);
  }

  async listShadowRoutingEvaluations(
    executionId?: string
  ): Promise<ShadowRoutingEvaluationLogEntry[]> {
    const state = await this.readState();

    if (!executionId) {
      return state.shadowRoutingEvaluations;
    }

    return state.shadowRoutingEvaluations.filter((entry) => entry.executionId === executionId);
  }

  private async readState(): Promise<StateFileData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return normalizeState(JSON.parse(raw, reviveDates) as Partial<StateFileData>);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {
          executions: [],
          events: [],
          pendingApprovalSteps: [],
          budgetLedgerEntries: [],
          shadowRoutingEvaluations: []
        };
      }

      throw error;
    }
  }

  private async writeState(state: StateFileData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
}

function reviveDates(key: string, value: unknown): unknown {
  if ((key === "createdAt" || key === "updatedAt" || key === "timestamp") && typeof value === "string") {
    return new Date(value);
  }

  return value;
}

function normalizeState(state: Partial<StateFileData>): StateFileData {
  return {
    executions: state.executions ?? [],
    events: state.events ?? [],
    pendingApprovalSteps: state.pendingApprovalSteps ?? [],
    budgetLedgerEntries: state.budgetLedgerEntries ?? [],
    shadowRoutingEvaluations: state.shadowRoutingEvaluations ?? []
  };
}

function isSameLedgerEntry(left: BudgetLedgerEntry, right: BudgetLedgerEntry): boolean {
  return (
    left.executionId === right.executionId &&
    left.provider === right.provider &&
    left.model === right.model &&
    left.timestamp.getTime() === right.timestamp.getTime()
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
