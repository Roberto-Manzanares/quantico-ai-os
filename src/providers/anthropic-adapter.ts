import type { ModelCallRequest, ModelCallResult } from "../types.js";
import type { ProviderAdapter } from "./provider-adapter.js";

export class AnthropicAdapter implements ProviderAdapter {
  readonly provider = "anthropic" as const;

  async sendMessage(_request: ModelCallRequest): Promise<ModelCallResult> {
    throw new Error("Anthropic provider logic is not implemented in the V0.1 skeleton.");
  }
}

