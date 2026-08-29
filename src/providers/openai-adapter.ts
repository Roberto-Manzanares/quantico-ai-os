import type { ModelCallRequest, ModelCallResult } from "../types.js";
import {
  FetchProviderHttpClient,
  ProviderAdapterError,
  type ProviderAdapter,
  type ProviderHttpClient
} from "./provider-adapter.js";

interface OpenAIAdapterOptions {
  apiKey?: string;
  apiMode?: OpenAIApiMode;
  baseUrl?: string;
  httpClient?: ProviderHttpClient;
  reasoningEffort?: OpenAIReasoningEffort;
}

type OpenAIApiMode = "chat_completions" | "responses";
type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

interface OpenAIResponse {
  status?: string;
  incomplete_details?: unknown;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  output_text?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Array<{ type?: string }> | null;
      refusal?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
      text_tokens?: number;
    };
    output_tokens?: number;
    output_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

interface OpenAIResponsesApiResponse {
  status?: string;
  incomplete_details?: unknown;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

export interface OpenAIResponseDiagnostics {
  httpStatus: number | null;
  chatCompletion: {
    finishReason: string | null;
    messageContentType: string | null;
    messageContentLength: number | null;
    refusal: unknown;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    reasoningTokens: number | null;
    textTokens: number | null;
  };
  responseStatus: string | null;
  incompleteDetails: unknown;
  usageOutputTokens: number | null;
  reasoningTokens: number | null;
  responseOutputItemCount: number | null;
  responseOutputItemTypes: string[];
  messageContentTypes: string[];
  outputTextLength: number | null;
  structuredError: unknown;
}

export class OpenAIAdapter implements ProviderAdapter {
  readonly provider = "openai" as const;
  private readonly apiKey: string | undefined;
  private readonly apiMode: OpenAIApiMode;
  private readonly baseUrl: string;
  private readonly httpClient: ProviderHttpClient;
  private readonly reasoningEffort: OpenAIReasoningEffort;
  private lastDiagnostics: OpenAIResponseDiagnostics | undefined;

  constructor(options: OpenAIAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.apiMode = options.apiMode ?? "chat_completions";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.httpClient = options.httpClient ?? new FetchProviderHttpClient();
    this.reasoningEffort = options.reasoningEffort ?? "minimal";
  }

  getLastDiagnostics(): OpenAIResponseDiagnostics | undefined {
    return this.lastDiagnostics;
  }

  async sendMessage(request: ModelCallRequest): Promise<ModelCallResult> {
    if (!this.apiKey) {
      this.lastDiagnostics = this.createDiagnostics({
        httpStatus: null,
        structuredError: {
          code: "provider_unavailable",
          message: "OPENAI_API_KEY is required to call OpenAI."
        }
      });

      throw new ProviderAdapterError({
        provider: this.provider,
        model: request.model,
        code: "provider_unavailable",
        message: "OPENAI_API_KEY is required to call OpenAI."
      });
    }

    const startedAt = Date.now();

    try {
      if (this.apiMode === "responses") {
        return await this.sendResponsesMessage(request, startedAt);
      }

      return await this.sendChatCompletionsMessage(request, startedAt);
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

  private async sendChatCompletionsMessage(
    request: ModelCallRequest,
    startedAt: number
  ): Promise<ModelCallResult> {
    const response = await this.httpClient.request(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_completion_tokens: request.maxOutputTokens
      })
    });

    if (!response.ok) {
      throw await this.toProviderError(response, request.model);
    }

    const payload = (await response.json()) as OpenAIResponse;
    this.lastDiagnostics = this.createDiagnostics({
      httpStatus: response.status,
      payload
    });

    const content = this.extractContent(payload);

    return {
      content,
      provider: this.provider,
      model: request.model,
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
      estimatedCostUsd: null,
      latencyMs: Date.now() - startedAt
    };
  }

  private async sendResponsesMessage(
    request: ModelCallRequest,
    startedAt: number
  ): Promise<ModelCallResult> {
    const response = await this.httpClient.request(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: request.model,
        input: request.messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        max_output_tokens: request.maxOutputTokens,
        reasoning: {
          effort: this.reasoningEffort
        }
      })
    });

    if (!response.ok) {
      throw await this.toProviderError(response, request.model);
    }

    const payload = (await response.json()) as OpenAIResponsesApiResponse;
    this.lastDiagnostics = this.createDiagnostics({
      httpStatus: response.status,
      payload
    });

    return {
      content: this.extractResponsesContent(payload),
      provider: this.provider,
      model: request.model,
      inputTokens: payload.usage?.input_tokens ?? 0,
      outputTokens: payload.usage?.output_tokens ?? 0,
      estimatedCostUsd: null,
      latencyMs: Date.now() - startedAt
    };
  }

  private async toProviderError(response: { status: number; text(): Promise<string> }, model: string) {
    const body = await response.text();
    const structuredError = this.parseStructuredError(body);
    this.lastDiagnostics = this.createDiagnostics({
      httpStatus: response.status,
      structuredError
    });

    return new ProviderAdapterError({
      provider: this.provider,
      model,
      code: "provider_error",
      message: this.errorMessageFromBody(structuredError, body, response.status),
      statusCode: response.status
    });
  }

  private extractContent(payload: OpenAIResponse): string {
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content === "string") {
      return content;
    }

    return "";
  }

  private extractResponsesContent(payload: OpenAIResponsesApiResponse): string {
    if (typeof payload.output_text === "string" && payload.output_text.length > 0) {
      return payload.output_text;
    }

    return (
      payload.output
        ?.filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === "output_text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("") ?? ""
    );
  }

  private createDiagnostics({
    httpStatus,
    payload,
    structuredError = null
  }: {
    httpStatus: number | null;
    payload?: OpenAIResponse | OpenAIResponsesApiResponse;
    structuredError?: unknown;
  }): OpenAIResponseDiagnostics {
    const outputItems = Array.isArray(payload?.output) ? payload.output : null;
    const responseMessageContentTypes = outputItems
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content?.map((content) => content.type ?? "unknown") ?? []);
    const chatPayload = payload as OpenAIResponse | undefined;
    const chatMessageContent = chatPayload?.choices?.[0]?.message?.content;
    const chatMessageContentTypes =
      chatMessageContent === undefined || chatMessageContent === null
        ? []
        : [Array.isArray(chatMessageContent) ? "array" : typeof chatMessageContent];
    const chatCompletion = chatPayload?.choices?.[0];
    const chatCompletionTokenDetails = chatPayload?.usage?.completion_tokens_details;

    return {
      httpStatus,
      chatCompletion: {
        finishReason: chatCompletion?.finish_reason ?? null,
        messageContentType:
          chatMessageContent === undefined || chatMessageContent === null
            ? null
            : Array.isArray(chatMessageContent)
              ? "array"
              : typeof chatMessageContent,
        messageContentLength:
          typeof chatMessageContent === "string"
            ? chatMessageContent.length
            : Array.isArray(chatMessageContent)
              ? chatMessageContent.length
              : null,
        refusal: chatCompletion?.message?.refusal ?? null,
        promptTokens: chatPayload?.usage?.prompt_tokens ?? null,
        completionTokens: chatPayload?.usage?.completion_tokens ?? null,
        totalTokens: chatPayload?.usage?.total_tokens ?? null,
        reasoningTokens: chatCompletionTokenDetails?.reasoning_tokens ?? null,
        textTokens: chatCompletionTokenDetails?.text_tokens ?? null
      },
      responseStatus: payload?.status ?? null,
      incompleteDetails: payload?.incomplete_details ?? null,
      usageOutputTokens: payload?.usage?.output_tokens ?? chatPayload?.usage?.completion_tokens ?? null,
      reasoningTokens:
        payload?.usage?.output_tokens_details?.reasoning_tokens ??
        chatPayload?.usage?.completion_tokens_details?.reasoning_tokens ??
        null,
      responseOutputItemCount: outputItems?.length ?? null,
      responseOutputItemTypes: outputItems?.map((item) => item.type ?? "unknown") ?? [],
      messageContentTypes: responseMessageContentTypes ?? chatMessageContentTypes,
      outputTextLength: typeof payload?.output_text === "string" ? payload.output_text.length : null,
      structuredError
    };
  }

  private parseStructuredError(body: string): unknown {
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

  private errorMessageFromBody(structuredError: unknown, body: string, status: number): string {
    if (structuredError && typeof structuredError === "object" && "message" in structuredError) {
      const message = (structuredError as { message?: unknown }).message;

      if (typeof message === "string" && message.length > 0) {
        return message;
      }
    }

    return body || `OpenAI request failed with status ${status}.`;
  }
}
