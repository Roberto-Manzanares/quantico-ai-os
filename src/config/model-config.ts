import type { ModelCapability, ProviderName, TaskType } from "../types.js";

export interface ModelConfig {
  provider: ProviderName;
  model: string;
  taskTypes: TaskType[];
  capabilities: ModelCapability[];
  latencyClass: "low" | "medium" | "high" | "unknown";
  priority: number;
  defaultExpectedOutputTokens?: number;
}

export interface ModelPricing {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

export type ModelPricingTable = Record<ProviderName, Record<string, ModelPricing>>;

export const DEFAULT_MODEL_CONFIGS: ModelConfig[] = [
  {
    provider: "openai",
    model: "gpt-5-nano",
    taskTypes: ["coding", "generation", "general", "evaluation"],
    capabilities: ["text_generation"],
    latencyClass: "low",
    priority: 10,
    defaultExpectedOutputTokens: 256
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    taskTypes: ["research", "analysis", "general", "evaluation"],
    capabilities: ["text_generation", "long_context"],
    latencyClass: "low",
    priority: 20,
    defaultExpectedOutputTokens: 256
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

export const DEFAULT_MODEL_PRICING_TABLE: ModelPricingTable = {
  openai: {
    "gpt-5-nano": {
      inputUsdPerMillionTokens: 0.05,
      outputUsdPerMillionTokens: 0.4
    }
  },
  anthropic: {
    "claude-haiku-4-5-20251001": {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 5
    }
  }
};
