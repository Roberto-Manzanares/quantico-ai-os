import type { ModelCallRequest, ModelCallResult } from "../types.js";
import type { ProviderAdapter } from "./provider-adapter.js";

export class OpenAIAdapter implements ProviderAdapter {
  readonly provider = "openai" as const;

  async sendMessage(_request: ModelCallRequest): Promise<ModelCallResult> {
    throw new Error("OpenAI provider logic is not implemented in the V0.1 skeleton.");
  }
}

