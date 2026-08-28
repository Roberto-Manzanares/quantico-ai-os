export type TaskType =
  | "research"
  | "analysis"
  | "coding"
  | "generation"
  | "evaluation"
  | "general";

export type ProviderName = "openai" | "anthropic";

export type ExecutionStatus =
  | "created"
  | "compiling_context"
  | "routing_model"
  | "awaiting_approval"
  | "running"
  | "evaluating"
  | "succeeded"
  | "failed"
  | "needs_human"
  | "cancelled";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type ApprovalDecision = "automatic" | "approved" | "rejected" | "pending";

export type EvaluationStatus = "pass" | "fail" | "needs_review";

export type TokenDecisionStatus = "allow" | "trim_required" | "deny";

export interface ExecutionConstraints {
  preferredProvider?: ProviderName;
  blockedProviders?: ProviderName[];
  maxCostUsd?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface ApprovalPolicy {
  mediumRiskRequiresApproval?: boolean;
  maxAutomaticCostUsd?: number;
}

export interface ExecutionRequest {
  goal: string;
  constraints?: ExecutionConstraints;
  approvalPolicy?: ApprovalPolicy;
  contextRefs?: string[];
}

export interface ExecutionMetrics {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

export interface Execution {
  id: string;
  goal: string;
  taskType: TaskType;
  constraints: ExecutionConstraints;
  approvalPolicy: ApprovalPolicy;
  status: ExecutionStatus;
  createdAt: Date;
  updatedAt: Date;
  finalResult?: string;
  metrics: ExecutionMetrics;
}

export interface ExecutionResultMetrics {
  executionId: string;
  status: ExecutionStatus;
  finalResult?: string;
  metrics: ExecutionMetrics;
}

export interface ApprovalCommand {
  executionId: string;
  reason?: string;
}

export interface ApprovalCommandResult {
  executionId: string;
  status: ExecutionStatus;
  decisionApplied: ApprovalDecision;
  reason: string;
}

export interface ExecutionEvent {
  id: string;
  executionId: string;
  type: string;
  riskLevel?: RiskLevel;
  decisionApplied?: ApprovalDecision;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface CompiledContext {
  compiledContextId: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  sourceRefs: string[];
  estimatedTokens: number;
  omittedContext: string[];
}

export interface RoutingDecision {
  provider: ProviderName;
  model: string;
  taskType: TaskType;
  reason: string;
  estimatedCostUsd: number;
  estimatedLatencyClass: "low" | "medium" | "high" | "unknown";
}

export interface TokenDecision {
  status: TokenDecisionStatus;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  reason: string;
}

export interface ActionDescriptor {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface ApprovalResult {
  riskLevel: RiskLevel;
  decisionApplied: ApprovalDecision;
  reason: string;
}

export interface ModelCallRequest {
  executionId: string;
  messages: CompiledContext["messages"];
  model: string;
  maxOutputTokens?: number;
}

export interface ModelCallResult {
  content: string;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd?: number | null;
  latencyMs: number;
}

export type ProviderErrorCode = "provider_unavailable" | "provider_error";

export interface ProviderErrorDetails {
  provider: ProviderName;
  model?: string;
  code: ProviderErrorCode;
  message: string;
  statusCode?: number;
}

export interface EvaluationResult {
  status: EvaluationStatus;
  reason: string;
  criteria: string[];
  recommendedNextAction?: string;
}
