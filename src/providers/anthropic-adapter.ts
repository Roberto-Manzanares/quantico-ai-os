import type { ModelCallRequest, ModelCallResult } from "../types.js";
import {
  FetchProviderHttpClient,
  ProviderAdapterError,
  type ProviderAdapter,
  type ProviderHttpClient
} from "./provider-adapter.js";

interface AnthropicAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  anthropicVersion?: string;
  httpClient?: ProviderHttpClient;
}

interface AnthropicResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly provider = "anthropic" as const;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly anthropicVersion: string;
  private readonly httpClient: ProviderHttpClient;

  constructor(options: AnthropicAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1";
    this.anthropicVersion = options.anthropicVersion ?? "2023-06-01";
    this.httpClient = options.httpClient ?? new FetchProviderHttpClient();
  }

  async sendMessage(request: ModelCallRequest): Promise<ModelCallResult> {
    if (!this.apiKey) {
      throw new ProviderAdapterError({
        provider: this.provider,
        model: request.model,
        code: "provider_unavailable",
        message: "ANTHROPIC_API_KEY is required to call Anthropic."
      });
    }

    const startedAt = Date.now();

    try {
      const response = await this.httpClient.request(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": this.anthropicVersion,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxOutputTokens ?? 1024,
          system: buildSystemPrompt(request.messages),
          messages: request.messages
            .filter((message) => message.role !== "system")
            .map((message) => ({ role: message.role, content: message.content }))
        })
      });

      if (!response.ok) {
        throw await this.toProviderError(response, request.model);
      }

      const payload = (await response.json()) as AnthropicResponse;
      const content =
        payload.content
          ?.filter((item) => item.type === "text" && typeof item.text === "string")
          .map((item) => item.text)
          .join("") ?? "";

      return {
        content,
        provider: this.provider,
        model: request.model,
        inputTokens: payload.usage?.input_tokens ?? 0,
        outputTokens: payload.usage?.output_tokens ?? 0,
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
        message: error instanceof Error ? error.message : "Unknown Anthropic provider error."
      });
    }
  }

  private async toProviderError(response: { status: number; text(): Promise<string> }, model: string) {
    const body = await response.text();

    return new ProviderAdapterError({
      provider: this.provider,
      model,
      code: "provider_error",
      message: body || `Anthropic request failed with status ${response.status}.`,
      statusCode: response.status
    });
  }
}

function buildSystemPrompt(messages: ModelCallRequest["messages"]): string | undefined {
  const systemMessages = messages.filter((message) => message.role === "system");

  if (systemMessages.length === 0) {
    return undefined;
  }

  return systemMessages.map((message) => message.content).join("\n\n");
}
