import type { ModelCallRequest, ModelCallResult, ProviderName } from "../types.js";

export interface ProviderAdapter {
  readonly provider: ProviderName;
  sendMessage(request: ModelCallRequest): Promise<ModelCallResult>;
}

