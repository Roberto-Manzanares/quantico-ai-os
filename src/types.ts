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

export type TokenDecisionStatus = "allow" | "reject";

export type TokenGovernorErrorCode = "token_budget_exceeded";

export type ModelCapability = "text_generation" | "tool_use" | "long_context";

export interface ExecutionConstraints {
  preferredProvider?: ProviderName;
  preferredModel?: string;
  blockedProviders?: ProviderName[];
  blockedModels?: string[];
  maxCostUsd?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxTotalTokens?: number;
  expectedOutputTokens?: number;
  evaluationCriteria?: EvaluationCriterion[];
  timeoutMs?: number;
}

export type EvaluationCriterion =
  | {
      type: "contains_text";
      value: string;
      description?: string;
    }
  | {
      type: "not_contains_text";
      value: string;
      description?: string;
    }
  | {
      type: "min_length";
      value: number;
      description?: string;
    }
  | {
      type: "max_length";
      value: number;
      description?: string;
    }
  | {
      type: "requires_review";
      description: string;
    };

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

export interface ContextSourceRef {
  ref: string;
  label: string;
  type: "goal" | "constraints" | "text" | "file" | "memory";
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
  sourceRefs: ContextSourceRef[];
  estimatedTokens: number;
  omittedContext: string[];
}

export interface RoutingDecision {
  provider: ProviderName;
  model: string;
  taskType: TaskType;
  reason: string;
  estimatedCostUsd?: number | null;
  estimatedLatencyClass: "low" | "medium" | "high" | "unknown";
}

export interface TokenDecision {
  status: TokenDecisionStatus;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number | null;
  reason: string;
  errorCode?: TokenGovernorErrorCode;
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
