import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Execution, ExecutionEvent } from "../types.js";

export interface StateMemory {
  saveExecution(execution: Execution): Promise<void>;
  getExecution(id: string): Promise<Execution | undefined>;
  appendEvent(event: ExecutionEvent): Promise<void>;
  listEvents(executionId: string): Promise<ExecutionEvent[]>;
}

export class InMemoryStateMemory implements StateMemory {
  private readonly executions = new Map<string, Execution>();
  private readonly events: ExecutionEvent[] = [];

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
}

interface StateFileData {
  executions: Execution[];
  events: ExecutionEvent[];
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

  private async readState(): Promise<StateFileData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw, reviveDates) as StateFileData;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return { executions: [], events: [] };
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
  if ((key === "createdAt" || key === "updatedAt") && typeof value === "string") {
    return new Date(value);
  }

  return value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
