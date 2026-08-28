import type {
  ModelCallRequest,
  ModelCallResult,
  ProviderErrorDetails,
  ProviderName
} from "../types.js";

export interface ProviderAdapter {
  readonly provider: ProviderName;
  sendMessage(request: ModelCallRequest): Promise<ModelCallResult>;
}

export class ProviderAdapterError extends Error {
  readonly provider: ProviderName;
  readonly model?: string;
  readonly code: ProviderErrorDetails["code"];
  readonly statusCode?: number;

  constructor(details: ProviderErrorDetails) {
    super(details.message);
    this.name = "ProviderAdapterError";
    this.provider = details.provider;
    this.model = details.model;
    this.code = details.code;
    this.statusCode = details.statusCode;
  }
}

export interface ProviderHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface ProviderHttpClient {
  request(url: string, init: RequestInit): Promise<ProviderHttpResponse>;
}

export class FetchProviderHttpClient implements ProviderHttpClient {
  async request(url: string, init: RequestInit): Promise<ProviderHttpResponse> {
    return fetch(url, init);
  }
}
