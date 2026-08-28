import type { ModelCapability, ProviderName, TaskType } from "../types.js";

export interface ModelConfig {
  provider: ProviderName;
  model: string;
  taskTypes: TaskType[];
  capabilities: ModelCapability[];
  latencyClass: "low" | "medium" | "high" | "unknown";
  priority: number;
}

export interface ModelPricing {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

export type ModelPricingTable = Record<ProviderName, Record<string, ModelPricing>>;

export const DEFAULT_MODEL_CONFIGS: ModelConfig[] = [
  {
    provider: "openai",
    model: "gpt-4.1-mini",
    taskTypes: ["coding", "generation", "general", "evaluation"],
    capabilities: ["text_generation", "tool_use"],
    latencyClass: "low",
    priority: 10
  },
  {
    provider: "anthropic",
    model: "claude-3-5-haiku-latest",
    taskTypes: ["research", "analysis", "general", "evaluation"],
    capabilities: ["text_generation", "long_context"],
    latencyClass: "low",
    priority: 20
  },
  {
    provider: "openai",
    model: "gpt-4.1",
    taskTypes: ["research", "analysis", "coding", "generation", "evaluation", "general"],
    capabilities: ["text_generation", "tool_use", "long_context"],
    latencyClass: "medium",
    priority: 30
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    taskTypes: ["research", "analysis", "coding", "generation", "evaluation", "general"],
    capabilities: ["text_generation", "tool_use", "long_context"],
    latencyClass: "medium",
    priority: 40
  }
];

export const EMPTY_PRICING_TABLE: ModelPricingTable = {
  openai: {},
  anthropic: {}
};
