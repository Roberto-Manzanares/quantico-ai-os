export * from "./types.js";
export * from "./api.js";
export * from "./orchestrator.js";
export * from "./components/context-compiler.js";
export * from "./components/evaluator.js";
export * from "./components/human-approval-gate.js";
export * from "./components/model-router.js";
export * from "./components/state-memory.js";
export * from "./components/token-governor.js";
export * from "./config/model-config.js";
export * from "./providers/anthropic-adapter.js";
export * from "./providers/openai-adapter.js";
export * from "./providers/provider-adapter.js";

import { SkeletonContextCompiler } from "./components/context-compiler.js";
import { SkeletonEvaluator } from "./components/evaluator.js";
import { SkeletonHumanApprovalGate } from "./components/human-approval-gate.js";
import { SkeletonModelRouter } from "./components/model-router.js";
import { FileStateMemory } from "./components/state-memory.js";
import { SkeletonTokenGovernor } from "./components/token-governor.js";
import type { ModelConfig, ModelPricingTable } from "./config/model-config.js";
import { Orchestrator } from "./orchestrator.js";
import { AnthropicAdapter } from "./providers/anthropic-adapter.js";
import { OpenAIAdapter } from "./providers/openai-adapter.js";
import type { ProviderAdapter } from "./providers/provider-adapter.js";
import type { ProviderName } from "./types.js";

export interface QuanticoSystemOptions {
  stateFilePath?: string;
  modelConfigs?: ModelConfig[];
  pricingTable?: ModelPricingTable;
  providers?: Partial<Record<ProviderName, ProviderAdapter>>;
}

export function createQuanticoSystem(options: QuanticoSystemOptions = {}) {
  const stateMemory = new FileStateMemory(options.stateFilePath);
  const contextCompiler = new SkeletonContextCompiler();
  const modelRouter = new SkeletonModelRouter(options.modelConfigs);
  const tokenGovernor = new SkeletonTokenGovernor(options.pricingTable);
  const humanApprovalGate = new SkeletonHumanApprovalGate();
  const evaluator = new SkeletonEvaluator();
  const providers = options.providers ?? {
    openai: new OpenAIAdapter(),
    anthropic: new AnthropicAdapter()
  };

  return {
    stateMemory,
    contextCompiler,
    modelRouter,
    tokenGovernor,
    humanApprovalGate,
    evaluator,
    providers,
    orchestrator: new Orchestrator({
      contextCompiler,
      modelRouter,
      tokenGovernor,
      stateMemory,
      humanApprovalGate,
      evaluator,
      providers
    })
  };
}
