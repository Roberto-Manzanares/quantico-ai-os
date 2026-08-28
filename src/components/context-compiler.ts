import type { CompiledContext, ExecutionRequest } from "../types.js";

export interface ContextCompiler {
  compile(request: ExecutionRequest): Promise<CompiledContext>;
}

export class SkeletonContextCompiler implements ContextCompiler {
  async compile(request: ExecutionRequest): Promise<CompiledContext> {
    return {
      compiledContextId: "context_skeleton",
      messages: [{ role: "user", content: request.goal }],
      sourceRefs: request.contextRefs ?? [],
      estimatedTokens: 0,
      omittedContext: []
    };
  }
}

