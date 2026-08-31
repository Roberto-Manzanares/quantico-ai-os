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

export type HumanApprovalGateStatus = "allow" | "needs_approval" | "rejected";

export type EvaluationStatus = "pass" | "fail" | "needs_review";

export type TokenDecisionStatus = "allow" | "reject";

export type TokenGovernorErrorCode = "token_budget_exceeded";

export type ModelCapability = "text_generation" | "tool_use" | "long_context";

export interface ExecutionConstraints {
  preferredProvider?: ProviderName;
  preferredModel?: string;
  blockedProviders?: ProviderName[];
  blockedModels?: string[];
  authorityPolicy?: LimitedShadowAuthorityPolicyConfig;
  maxCostUsd?: number;
  maxExecutionCostUsd?: number;
  maxProjectCostUsd?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxTotalTokens?: number;
  expectedOutputTokens?: number;
  evaluationCriteria?: EvaluationCriterion[];
  modelCallRiskLevel?: RiskLevel;
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
  projectId?: string;
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
  actualCostUsd?: number | null;
  costDeltaUsd?: number | null;
  latencyMs: number;
}

export interface Execution {
  id: string;
  projectId?: string;
  goal: string;
  taskType: TaskType;
  constraints: ExecutionConstraints;
  approvalPolicy: ApprovalPolicy;
  status: ExecutionStatus;
  createdAt: Date;
  updatedAt: Date;
  finalResult?: string;
  evaluation?: EvaluationResult;
  error?: {
    code: string;
    message: string;
  };
  metrics: ExecutionMetrics;
}

export interface ExecutionResultMetrics {
  executionId: string;
  status: ExecutionStatus;
  finalResult?: string;
  evaluation?: EvaluationResult;
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
  pendingStep?: PendingApprovalStep;
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

export interface PendingApprovalStep {
  id: string;
  executionId: string;
  action: ActionDescriptor;
  riskLevel: RiskLevel;
  reason: string;
  createdAt: Date;
  metadata: Record<string, unknown>;
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
  id?: string;
  name: string;
  description: string;
  riskLevel: RiskLevel;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface ApprovalResult {
  status: HumanApprovalGateStatus;
  executionId?: string;
  pendingStepId?: string;
  action: ActionDescriptor;
  riskLevel: RiskLevel;
  decisionApplied: ApprovalDecision;
  reason: string;
  createdAt: Date;
  metadata: Record<string, unknown>;
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

export type BudgetLedgerCalculationStatus =
  | "calculated"
  | "missing_usage"
  | "missing_pricing"
  | "not_applicable";

export interface BudgetLedgerEntry {
  executionId: string;
  projectId?: string;
  provider: ProviderName;
  model: string;
  estimatedInputTokens: number;
  expectedOutputTokens: number;
  actualInputTokens: number | null;
  actualOutputTokens: number | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  costDeltaUsd: number | null;
  latencyMs: number;
  timestamp: Date;
  calculationStatus: BudgetLedgerCalculationStatus;
  calculationReason?: string;
}

export interface BudgetLedgerTotals {
  entryCount: number;
  actualCostUsd: number;
  actualInputTokens: number;
  actualOutputTokens: number;
  latencyMs: number;
}

export interface BudgetLedgerSummary {
  byExecution: Record<string, BudgetLedgerTotals>;
  byProject: Record<string, BudgetLedgerTotals>;
  byProvider: Record<ProviderName, BudgetLedgerTotals>;
  byModel: Record<string, BudgetLedgerTotals>;
}

export type BudgetEnforcementDecision =
  | "allowed"
  | "blocked_execution_budget"
  | "blocked_project_budget"
  | "budget_unknown";

export interface BudgetEnforcementResult {
  decision: BudgetEnforcementDecision;
  executionId: string;
  projectId?: string;
  accumulatedActualCostUsd: number | null;
  estimatedNextCallCostUsd: number | null;
  applicableBudgetUsd: number | null;
  projectedCostUsd: number | null;
  reason: string;
}

export type ProviderScorecardDataQuality = "complete" | "partial";

export interface ProviderScorecardAggregate {
  provider: ProviderName;
  model: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
  needsHumanCount: number;
  evaluationPassCount: number;
  evaluationFailCount: number;
  evaluationNeedsReviewCount: number;
  totalActualCostUsd: number;
  averageActualCostUsd: number | null;
  averageLatencyMs: number | null;
  lastUpdatedAt?: Date;
  dataQuality: ProviderScorecardDataQuality;
  reason?: string;
}

export interface ProviderScorecardSummary {
  byModel: Record<string, ProviderScorecardAggregate>;
}

export type ProviderScorecardLookupResult =
  | {
      status: "found";
      scorecard: ProviderScorecardAggregate;
    }
  | {
      status: "not_found";
      provider: ProviderName;
      model: string;
      reason: string;
    };

export type ShadowAdvisorDataQuality = ProviderScorecardDataQuality | "insufficient_data";

export interface ShadowAdvisorSelection {
  provider: ProviderName;
  model: string;
  estimatedCostUsd: number | null;
  reason: string;
}

export interface ShadowAdvisorMetricsUsed {
  executionCount: number;
  evaluationPassCount: number;
  evaluationPassRate: number;
  successCount: number;
  successRate: number;
  averageActualCostUsd: number | null;
  averageLatencyMs: number | null;
  scorecardDataQuality: ProviderScorecardDataQuality;
}

export interface ShadowAdvisorRecommendation {
  provider: ProviderName;
  model: string;
  reason: string;
  metricsUsed: ShadowAdvisorMetricsUsed;
}

export interface ShadowAdvisorComparison {
  matchesActualSelection: boolean;
  differenceReason?: string;
}

export interface ShadowRoutingAdvice {
  actualSelection: ShadowAdvisorSelection;
  shadowRecommendation: ShadowAdvisorRecommendation | null;
  comparison: ShadowAdvisorComparison;
  dataQuality: ShadowAdvisorDataQuality;
  advisorAuthority: "none";
  reason: string;
}

export interface ShadowRoutingEvaluationLogEntry {
  id: string;
  executionId: string;
  timestamp: Date;
  actualSelection: ShadowAdvisorSelection;
  shadowRecommendation: ShadowAdvisorRecommendation | null;
  matchesActualSelection: boolean;
  differenceReason?: string;
  metricsUsed: ShadowAdvisorMetricsUsed | null;
  dataQuality: ShadowAdvisorDataQuality;
  advisorAuthority: "none";
}

export interface ShadowRoutingEvaluationLogSummary {
  totalEvaluations: number;
  matchCount: number;
  divergenceCount: number;
  insufficientDataCount: number;
  matchRate: number;
  divergenceRate: number;
}

export type ShadowRoutingEvidenceStatus = "sufficient" | "insufficient";

export interface ShadowRoutingDivergencePattern {
  actualProvider: ProviderName;
  actualModel: string;
  shadowProvider: ProviderName;
  shadowModel: string;
  count: number;
  averageShadowEvaluationPassRate: number | null;
  averageShadowSuccessRate: number | null;
  averageShadowActualCostUsd: number | null;
  averageShadowLatencyMs: number | null;
  dataQuality: ShadowAdvisorDataQuality;
  reasons: string[];
}

export interface ShadowRoutingAnalysisReport {
  generatedAt: Date;
  totalEvaluations: number;
  matchCount: number;
  divergenceCount: number;
  insufficientDataCount: number;
  matchRate: number;
  divergenceRate: number;
  observedDivergencePatterns: ShadowRoutingDivergencePattern[];
  evidenceStatus: ShadowRoutingEvidenceStatus;
  evidenceReason: string;
  metricsUsed: {
    minimumEvaluationsRequired: number;
    matchCount: number;
    divergenceCount: number;
    insufficientDataRate: number;
    divergencesWithAuditableReasonAndMetrics: number;
  };
  advisorAuthority: "none";
}

export type LimitedShadowAdvisorAuthority = "none" | "limited";

export type LimitedShadowAuthorityDecision =
  | "allow_shadow_influence"
  | "blocked"
  | "fallback_cost_first";

export interface LimitedShadowAuthorityPolicyConfig {
  advisorAuthority: LimitedShadowAdvisorAuthority;
  allowedModels: Array<{ provider: ProviderName; model: string }>;
  maxAdditionalCostUsdPerIntervention?: number;
  maxEstimatedCostUsdPerIntervention?: number;
  minimumShadowEvaluationPassRate?: number;
  minimumShadowSuccessRate?: number;
  minimumEvaluationPassRateAdvantage?: number;
  minimumSuccessRateAdvantage?: number;
  maxAdditionalCostRatio?: number;
}

export interface LimitedShadowAuthorityAuditRecord {
  executionId: string;
  advisorAuthority: LimitedShadowAdvisorAuthority;
  authorityDecision: LimitedShadowAuthorityDecision;
  actualSelection: ShadowAdvisorSelection;
  shadowRecommendation: ShadowAdvisorRecommendation | null;
  appliedSelection: ShadowAdvisorSelection;
  evidenceStatus: ShadowRoutingEvidenceStatus;
  dataQuality: ShadowAdvisorDataQuality;
  conditionsChecked: Array<{ condition: string; passed: boolean; reason: string }>;
  budgetChecked: {
    costFirstEstimatedCostUsd: number | null;
    shadowEstimatedCostUsd: number | null;
    maxAdditionalCostRatio: number;
    maxAdditionalCostUsdPerIntervention: number | null;
    maxEstimatedCostUsdPerIntervention: number | null;
  };
  thresholdsApplied: {
    minimumShadowEvaluationPassRate: number;
    minimumShadowSuccessRate: number;
    minimumEvaluationPassRateAdvantage: number;
    minimumSuccessRateAdvantage: number;
    maxAdditionalCostRatio: number;
  };
  costFirstMetrics: ShadowAdvisorMetricsUsed | null;
  shadowMetrics: ShadowAdvisorMetricsUsed | null;
  costDeltaUsd: number | null;
  costDeltaRatio: number | null;
  reason: string;
  timestamp: Date;
}

export interface LimitedShadowAuthorityResult {
  advisorAuthority: LimitedShadowAdvisorAuthority;
  authorityDecision: LimitedShadowAuthorityDecision;
  actualSelection: ShadowAdvisorSelection;
  shadowRecommendation: ShadowAdvisorRecommendation | null;
  appliedSelection: ShadowAdvisorSelection;
  reason: string;
  rollbackAvailable: boolean;
  auditRecordRequired: true;
  auditRecord: LimitedShadowAuthorityAuditRecord;
}

export type AuthorityDecisionAuditLogDecision = "allowed" | "blocked";

export interface AuthorityDecisionAuditLogEntry {
  id: string;
  executionId: string;
  actualSelection: ShadowAdvisorSelection;
  shadowRecommendation: ShadowAdvisorRecommendation | null;
  authorityDecision: AuthorityDecisionAuditLogDecision;
  effectiveSelection: ShadowAdvisorSelection;
  advisorAuthority: LimitedShadowAdvisorAuthority;
  evidenceStatus: ShadowRoutingEvidenceStatus;
  dataQuality: ShadowAdvisorDataQuality;
  metricsEvaluated: {
    costFirstMetrics: ShadowAdvisorMetricsUsed | null;
    shadowMetrics: ShadowAdvisorMetricsUsed | null;
  };
  thresholdsEvaluated: LimitedShadowAuthorityAuditRecord["thresholdsApplied"];
  pricingUsed: {
    costFirstEstimatedCostUsd: number | null;
    shadowEstimatedCostUsd: number | null;
  };
  budgetsUsed: {
    maxAdditionalCostRatio: number;
    maxAdditionalCostUsdPerIntervention: number | null;
    maxEstimatedCostUsdPerIntervention: number | null;
  };
  costDelta: {
    costDeltaUsd: number | null;
    costDeltaRatio: number | null;
  };
  reason: string;
  timestamp: Date;
}

export interface AuthorityDecisionAuditLogSummary {
  totalDecisions: number;
  allowedCount: number;
  blockedCount: number;
  allowedRate: number;
  blockedRate: number;
  blockedByReason: Record<string, number>;
}

export type AuthorityRuntimeSafetyDataQuality = "complete" | "partial" | "insufficient";

export type AuthorityRuntimeOutcomeComparisonStatus = "comparable" | "insufficient_data";

export interface AuthorityRuntimeObservedOutcome {
  provider: ProviderName;
  model: string;
  executionStatus: ExecutionStatus;
  evaluationStatus: EvaluationStatus;
}

export interface AuthorityRuntimeOutcomeComparison {
  executionId: string;
  authorityDecision: AuthorityDecisionAuditLogDecision;
  actualSelection: ShadowAdvisorSelection;
  shadowRecommendation: ShadowAdvisorRecommendation | null;
  effectiveSelection: ShadowAdvisorSelection;
  actualOutcome: AuthorityRuntimeObservedOutcome | null;
  counterfactualOutcome: "unavailable";
  comparisonStatus: AuthorityRuntimeOutcomeComparisonStatus;
  reason: string;
}

export interface AuthorityRuntimeOutcomeAggregate {
  executionCount: number;
  byExecutionStatus: Partial<Record<ExecutionStatus, number>>;
  byEvaluationStatus: Partial<Record<EvaluationStatus, number>>;
}

export interface AuthorityRuntimeSafetyMetricsReport {
  generatedAt: Date;
  totalAuthorityEvaluations: number;
  allowedInterventions: number;
  blockedInterventions: number;
  allowedRate: number;
  blockedRate: number;
  failClosedCount: number;
  failClosedByReason: Record<string, number>;
  totalAdditionalCostUsdAuthorized: number;
  averageAdditionalCostUsdAuthorized: number;
  maxAdditionalCostUsdObserved: number;
  outcomeComparisons: AuthorityRuntimeOutcomeComparison[];
  outcomesByAuthorityDecision: {
    allowed: AuthorityRuntimeOutcomeAggregate;
    blocked: AuthorityRuntimeOutcomeAggregate;
  };
  dataQuality: AuthorityRuntimeSafetyDataQuality;
  reasons: string[];
}

export interface AuthorityRuntimeSafetyMetricsReadResult {
  status: "found";
  report: AuthorityRuntimeSafetyMetricsReport;
  reason: string;
}

export type AuthorityRuntimeSafetyMetricsExecutionReadResult =
  | {
      status: "found";
      executionId: string;
      report: AuthorityRuntimeSafetyMetricsReport;
      outcomeComparisons: AuthorityRuntimeOutcomeComparison[];
      dataQuality: AuthorityRuntimeSafetyDataQuality;
      reason: string;
    }
  | {
      status: "not_found";
      executionId: string;
      reason: string;
    };

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
