import type { ModelCallRequest, ModelCallResult } from "../types.js";
import {
  FetchProviderHttpClient,
  ProviderAdapterError,
  type ProviderAdapter,
  type ProviderHttpClient
} from "./provider-adapter.js";

interface OpenAIAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  httpClient?: ProviderHttpClient;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export class OpenAIAdapter implements ProviderAdapter {
  readonly provider = "openai" as const;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly httpClient: ProviderHttpClient;

  constructor(options: OpenAIAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.httpClient = options.httpClient ?? new FetchProviderHttpClient();
  }

  async sendMessage(request: ModelCallRequest): Promise<ModelCallResult> {
    if (!this.apiKey) {
      throw new ProviderAdapterError({
        provider: this.provider,
        model: request.model,
        code: "provider_unavailable",
        message: "OPENAI_API_KEY is required to call OpenAI."
      });
    }

    const startedAt = Date.now();

    try {
      const response = await this.httpClient.request(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          max_tokens: request.maxOutputTokens
        })
      });

      if (!response.ok) {
        throw await this.toProviderError(response, request.model);
      }

      const payload = (await response.json()) as OpenAIResponse;
      const content = payload.choices?.[0]?.message?.content ?? "";

      return {
        content,
        provider: this.provider,
        model: request.model,
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
        estimatedCostUsd: null,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      if (error instanceof ProviderAdapterError) {
        throw error;
      }

      throw new ProviderAdapterError({
        provider: this.provider,
        model: request.model,
        code: "provider_error",
        message: error instanceof Error ? error.message : "Unknown OpenAI provider error."
      });
    }
  }

  private async toProviderError(response: { status: number; text(): Promise<string> }, model: string) {
    const body = await response.text();

    return new ProviderAdapterError({
      provider: this.provider,
      model,
      code: "provider_error",
      message: body || `OpenAI request failed with status ${response.status}.`,
      statusCode: response.status
    });
  }
}
