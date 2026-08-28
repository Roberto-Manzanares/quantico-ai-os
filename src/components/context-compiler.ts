import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { StateMemory } from "./state-memory.js";
import type { CompiledContext, ContextSourceRef, ExecutionRequest } from "../types.js";

export interface ContextCompilerInput extends ExecutionRequest {
  maxContextTokens?: number;
  stateMemory?: StateMemory;
}

export interface ContextCompiler {
  compile(input: ContextCompilerInput): Promise<CompiledContext>;
}

interface CandidateContextSource {
  ref: string;
  label: string;
  type: ContextSourceRef["type"];
  content: string;
  originalIndex: number;
}

const DEFAULT_MAX_CONTEXT_TOKENS = 4096;

export class ContextCompilerV01 implements ContextCompiler {
  async compile(input: ContextCompilerInput): Promise<CompiledContext> {
    const maxContextTokens = input.maxContextTokens ?? input.constraints?.maxInputTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
    const coreSources = buildCoreSources(input);
    const resolvedSources = await resolveContextRefs(input);
    const omittedContext: string[] = [];
    const selectedSources = [...coreSources];
    const relevantSources = rankByRelevance(
      input.goal,
      resolvedSources.filter((source) => source.content.length > 0)
    );

    for (const source of relevantSources) {
      const candidateTokens = estimateTokens(renderSources([...selectedSources, source]));

      if (candidateTokens > maxContextTokens) {
        omittedContext.push(`${source.ref}: omitted because it exceeds the context token budget.`);
        continue;
      }

      selectedSources.push(source);
    }

    for (const source of resolvedSources) {
      if (source.content === "") {
        omittedContext.push(`${source.ref}: omitted because it could not be resolved.`);
      }
    }

    const content = renderSources(selectedSources);

    return {
      compiledContextId: createCompiledContextId(input, selectedSources, omittedContext),
      messages: [{ role: "user", content }],
      sourceRefs: selectedSources.map(({ ref, label, type }) => ({ ref, label, type })),
      estimatedTokens: estimateTokens(content),
      omittedContext
    };
  }
}

export { ContextCompilerV01 as SkeletonContextCompiler };

function buildCoreSources(input: ContextCompilerInput): CandidateContextSource[] {
  return [
    {
      ref: "goal",
      label: "Human goal",
      type: "goal",
      content: input.goal,
      originalIndex: -2
    },
    {
      ref: "constraints",
      label: "Applicable constraints",
      type: "constraints",
      content: JSON.stringify(input.constraints ?? {}, Object.keys(input.constraints ?? {}).sort(), 2),
      originalIndex: -1
    }
  ];
}

async function resolveContextRefs(input: ContextCompilerInput): Promise<CandidateContextSource[]> {
  const refs = input.contextRefs ?? [];
  const resolvedSources = await Promise.all(
    refs.map(async (ref, originalIndex): Promise<CandidateContextSource> => {
      if (ref.startsWith("text:")) {
        return resolveTextRef(ref, originalIndex);
      }

      if (ref.startsWith("file:")) {
        return resolveFileRef(ref, originalIndex);
      }

      if (ref.startsWith("memory:execution:")) {
        return resolveMemoryExecutionRef(ref, originalIndex, input.stateMemory);
      }

      return {
        ref,
        label: "Unsupported context reference",
        type: "text",
        content: "",
        originalIndex
      };
    })
  );

    return resolvedSources;
}

function resolveTextRef(ref: string, originalIndex: number): CandidateContextSource {
  const withoutScheme = ref.slice("text:".length);
  const separatorIndex = withoutScheme.indexOf(":");
  const label = separatorIndex >= 0 ? withoutScheme.slice(0, separatorIndex) : "Inline text";
  const content = separatorIndex >= 0 ? withoutScheme.slice(separatorIndex + 1) : withoutScheme;

  return {
    ref,
    label,
    type: "text",
    content,
    originalIndex
  };
}

async function resolveFileRef(ref: string, originalIndex: number): Promise<CandidateContextSource> {
  const filePath = ref.slice("file:".length);

  try {
    const content = await readFile(resolve(filePath), "utf8");

    return {
      ref,
      label: filePath,
      type: "file",
      content,
      originalIndex
    };
  } catch {
    return {
      ref,
      label: filePath,
      type: "file",
      content: "",
      originalIndex
    };
  }
}

async function resolveMemoryExecutionRef(
  ref: string,
  originalIndex: number,
  stateMemory: StateMemory | undefined
): Promise<CandidateContextSource> {
  const executionId = ref.slice("memory:execution:".length);
  const execution = await stateMemory?.getExecution(executionId);

  if (!execution) {
    return {
      ref,
      label: `Execution ${executionId}`,
      type: "memory",
      content: "",
      originalIndex
    };
  }

  return {
    ref,
    label: `Execution ${executionId}`,
    type: "memory",
    content: JSON.stringify(
      {
        id: execution.id,
        goal: execution.goal,
        taskType: execution.taskType,
        status: execution.status,
        finalResult: execution.finalResult,
        metrics: execution.metrics
      },
      null,
      2
    ),
    originalIndex
  };
}

function rankByRelevance(goal: string, sources: CandidateContextSource[]): CandidateContextSource[] {
  const terms = tokenize(goal);

  return [...sources].sort((left, right) => {
    const scoreDelta = scoreSource(right.content, terms) - scoreSource(left.content, terms);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.originalIndex - right.originalIndex;
  });
}

function scoreSource(content: string, terms: string[]): number {
  const normalized = content.toLowerCase();
  return terms.reduce((score, term) => score + countOccurrences(normalized, term), 0);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9áéíóúüñ]+/i)
    .filter((term) => term.length >= 3);
}

function countOccurrences(value: string, term: string): number {
  let count = 0;
  let index = value.indexOf(term);

  while (index >= 0) {
    count += 1;
    index = value.indexOf(term, index + term.length);
  }

  return count;
}

function renderSources(sources: CandidateContextSource[]): string {
  return sources.map(formatSource).join("\n\n");
}

function formatSource(source: CandidateContextSource): string {
  return `[source:${source.type}:${source.label}]\n${source.content}`;
}

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function createCompiledContextId(
  input: ContextCompilerInput,
  selectedSources: CandidateContextSource[],
  omittedContext: string[]
): string {
  const signature = JSON.stringify({
    goal: input.goal,
    constraints: input.constraints ?? {},
    sources: selectedSources.map((source) => source.ref),
    omittedContext
  });
  let hash = 0;

  for (const char of signature) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return `context_${hash.toString(36)}`;
}
