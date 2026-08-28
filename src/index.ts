export * from "./types.js";
export * from "./api.js";
export * from "./orchestrator.js";
export * from "./components/context-compiler.js";
export * from "./components/evaluator.js";
export * from "./components/human-approval-gate.js";
export * from "./components/model-router.js";
export * from "./components/state-memory.js";
export * from "./components/token-governor.js";
export * from "./providers/anthropic-adapter.js";
export * from "./providers/openai-adapter.js";
export * from "./providers/provider-adapter.js";

import { SkeletonContextCompiler } from "./components/context-compiler.js";
import { SkeletonEvaluator } from "./components/evaluator.js";
import { SkeletonHumanApprovalGate } from "./components/human-approval-gate.js";
import { SkeletonModelRouter } from "./components/model-router.js";
import { FileStateMemory } from "./components/state-memory.js";
import { SkeletonTokenGovernor } from "./components/token-governor.js";
import { Orchestrator } from "./orchestrator.js";

export interface QuanticoSystemOptions {
  stateFilePath?: string;
}

export function createQuanticoSystem(options: QuanticoSystemOptions = {}) {
  const stateMemory = new FileStateMemory(options.stateFilePath);

  return {
    stateMemory,
    contextCompiler: new SkeletonContextCompiler(),
    modelRouter: new SkeletonModelRouter(),
    tokenGovernor: new SkeletonTokenGovernor(),
    humanApprovalGate: new SkeletonHumanApprovalGate(),
    evaluator: new SkeletonEvaluator(),
    orchestrator: new Orchestrator({
      contextCompiler: new SkeletonContextCompiler(),
      modelRouter: new SkeletonModelRouter(),
      tokenGovernor: new SkeletonTokenGovernor(),
      stateMemory,
      humanApprovalGate: new SkeletonHumanApprovalGate(),
      evaluator: new SkeletonEvaluator()
    })
  };
}
