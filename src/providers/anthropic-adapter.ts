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
  workspaceId?: string;
}

interface AnthropicResponse {
  stop_reason?: string | null;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface AnthropicResponseDiagnostics {
  httpStatus: number | null;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  contentBlockTypes: string[];
  textLength: number;
  structuredError: unknown;
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly provider = "anthropic" as const;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly anthropicVersion: string;
  private readonly httpClient: ProviderHttpClient;
  private readonly workspaceId: string | undefined;
  private lastDiagnostics: AnthropicResponseDiagnostics | undefined;

  constructor(options: AnthropicAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1";
    this.anthropicVersion = options.anthropicVersion ?? "2023-06-01";
    this.httpClient = options.httpClient ?? new FetchProviderHttpClient();
    this.workspaceId = options.workspaceId ?? process.env.ANTHROPIC_WORKSPACE_ID;
  }

  getLastDiagnostics(): AnthropicResponseDiagnostics | undefined {
    return this.lastDiagnostics;
  }

  async sendMessage(request: ModelCallRequest): Promise<ModelCallResult> {
    if (!this.apiKey) {
      this.lastDiagnostics = this.createDiagnostics({
        httpStatus: null,
        structuredError: {
          code: "provider_unavailable",
          message: "ANTHROPIC_API_KEY is required to call Anthropic."
        }
      });

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
        headers: buildHeaders(this.apiKey, this.anthropicVersion, this.workspaceId),
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
      this.lastDiagnostics = this.createDiagnostics({
        httpStatus: response.status,
        payload
      });
      const content = extractTextContent(payload);

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
    const structuredError = parseStructuredError(body);
    this.lastDiagnostics = this.createDiagnostics({
      httpStatus: response.status,
      structuredError
    });

    return new ProviderAdapterError({
      provider: this.provider,
      model,
      code: "provider_error",
      message: errorMessageFromBody(structuredError, body, response.status),
      statusCode: response.status
    });
  }

  private createDiagnostics({
    httpStatus,
    payload,
    structuredError = null
  }: {
    httpStatus: number | null;
    payload?: AnthropicResponse;
    structuredError?: unknown;
  }): AnthropicResponseDiagnostics {
    return {
      httpStatus,
      stopReason: payload?.stop_reason ?? null,
      inputTokens: payload?.usage?.input_tokens ?? null,
      outputTokens: payload?.usage?.output_tokens ?? null,
      contentBlockTypes: payload?.content?.map((item) => item.type ?? "unknown") ?? [],
      textLength: extractTextContent(payload).length,
      structuredError
    };
  }
}

function extractTextContent(payload: AnthropicResponse | undefined): string {
  return (
    payload?.content
      ?.filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("") ?? ""
  );
}

function parseStructuredError(body: string): unknown {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return parsed.error ?? parsed;
  } catch {
    return null;
  }
}

function errorMessageFromBody(structuredError: unknown, body: string, status: number): string {
  if (structuredError && typeof structuredError === "object" && "message" in structuredError) {
    const message = (structuredError as { message?: unknown }).message;

    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return body || `Anthropic request failed with status ${status}.`;
}

function buildHeaders(
  apiKey: string,
  anthropicVersion: string,
  workspaceId: string | undefined
): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": anthropicVersion,
    "Content-Type": "application/json",
    ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {})
  };
}

function buildSystemPrompt(messages: ModelCallRequest["messages"]): string | undefined {
  const systemMessages = messages.filter((message) => message.role === "system");

  if (systemMessages.length === 0) {
    return undefined;
  }

  return systemMessages.map((message) => message.content).join("\n\n");
}
