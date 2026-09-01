export * from "./types.js";
export * from "./api.js";
export * from "./orchestrator.js";
export * from "./components/authority-decision-audit-log.js";
export * from "./components/authority-runtime-safety-metrics.js";
export * from "./components/budget-enforcement.js";
export * from "./components/budget-ledger.js";
export * from "./components/context-compiler.js";
export * from "./components/controlled-operational-execution.js";
export * from "./components/evaluator.js";
export * from "./components/execution-audit-index.js";
export * from "./components/execution-audit-timeline.js";
export * from "./components/human-approval-gate.js";
export * from "./components/limited-shadow-authority-policy.js";
export * from "./components/model-router.js";
export * from "./components/provider-scorecard.js";
export * from "./components/shadow-routing-advisor.js";
export * from "./components/shadow-routing-analysis-report.js";
export * from "./components/shadow-routing-evaluation-log.js";
export * from "./components/state-memory.js";
export * from "./components/token-governor.js";
export * from "./config/model-config.js";
export * from "./providers/anthropic-adapter.js";
export * from "./providers/openai-adapter.js";
export * from "./providers/provider-adapter.js";

import { SkeletonContextCompiler } from "./components/context-compiler.js";
import { SkeletonAuthorityDecisionAuditLog } from "./components/authority-decision-audit-log.js";
import { SkeletonAuthorityRuntimeSafetyMetrics } from "./components/authority-runtime-safety-metrics.js";
import { SkeletonBudgetEnforcementGate } from "./components/budget-enforcement.js";
import { SkeletonBudgetLedger } from "./components/budget-ledger.js";
import { SkeletonEvaluator } from "./components/evaluator.js";
import { SkeletonControlledOperationalExecution } from "./components/controlled-operational-execution.js";
import { SkeletonExecutionAuditIndex } from "./components/execution-audit-index.js";
import { SkeletonExecutionAuditTimeline } from "./components/execution-audit-timeline.js";
import { SkeletonHumanApprovalGate } from "./components/human-approval-gate.js";
import { SkeletonLimitedShadowAuthorityPolicy } from "./components/limited-shadow-authority-policy.js";
import { SkeletonModelRouter } from "./components/model-router.js";
import { SkeletonProviderScorecard } from "./components/provider-scorecard.js";
import { SkeletonShadowRoutingAdvisor } from "./components/shadow-routing-advisor.js";
import { SkeletonShadowRoutingAnalysisReporter } from "./components/shadow-routing-analysis-report.js";
import { SkeletonShadowRoutingEvaluationLog } from "./components/shadow-routing-evaluation-log.js";
import { FileStateMemory } from "./components/state-memory.js";
import { SkeletonTokenGovernor } from "./components/token-governor.js";
import { DEFAULT_MODEL_PRICING_TABLE, type ModelConfig, type ModelPricingTable } from "./config/model-config.js";
import { Orchestrator } from "./orchestrator.js";
import { AnthropicAdapter } from "./providers/anthropic-adapter.js";
import { OpenAIAdapter } from "./providers/openai-adapter.js";
import type { ProviderAdapter } from "./providers/provider-adapter.js";
import type { ProviderName } from "./types.js";

export interface QuanticoSystemOptions {
  stateFilePath?: string;
  modelConfigs?: ModelConfig[];
  pricingTable?: ModelPricingTable;
  providers?: Partial<Record<ProviderName, ProviderAdapter>>;
}

export function createQuanticoSystem(options: QuanticoSystemOptions = {}) {
  const stateMemory = new FileStateMemory(options.stateFilePath);
  const contextCompiler = new SkeletonContextCompiler();
  const pricingTable = options.pricingTable ?? DEFAULT_MODEL_PRICING_TABLE;
  const modelRouter = new SkeletonModelRouter(options.modelConfigs, pricingTable);
  const tokenGovernor = new SkeletonTokenGovernor(pricingTable);
  const budgetEnforcementGate = new SkeletonBudgetEnforcementGate(stateMemory);
  const budgetLedger = new SkeletonBudgetLedger(stateMemory, pricingTable);
  const providerScorecard = new SkeletonProviderScorecard(stateMemory);
  const shadowRoutingAdvisor = new SkeletonShadowRoutingAdvisor();
  const shadowRoutingEvaluationLog = new SkeletonShadowRoutingEvaluationLog(stateMemory);
  const shadowRoutingAnalysisReporter = new SkeletonShadowRoutingAnalysisReporter(
    shadowRoutingEvaluationLog
  );
  const limitedShadowAuthorityPolicy = new SkeletonLimitedShadowAuthorityPolicy();
  const authorityDecisionAuditLog = new SkeletonAuthorityDecisionAuditLog(stateMemory);
  const authorityRuntimeSafetyMetrics = new SkeletonAuthorityRuntimeSafetyMetrics(stateMemory);
  const executionAuditTimeline = new SkeletonExecutionAuditTimeline(stateMemory);
  const executionAuditIndex = new SkeletonExecutionAuditIndex(stateMemory, executionAuditTimeline);
  const humanApprovalGate = new SkeletonHumanApprovalGate();
  const evaluator = new SkeletonEvaluator();
  const providers = options.providers ?? {
    openai: new OpenAIAdapter(),
    anthropic: new AnthropicAdapter()
  };

  const orchestrator = new Orchestrator({
    contextCompiler,
    modelRouter,
    tokenGovernor,
    budgetEnforcementGate,
    budgetLedger,
    providerScorecard,
    shadowRoutingAdvisor,
    shadowRoutingAnalysisReporter,
    limitedShadowAuthorityPolicy,
    authorityDecisionAuditLog,
    costTable: pricingTable,
    stateMemory,
    humanApprovalGate,
    evaluator,
    providers
  });
  const controlledOperationalExecution = new SkeletonControlledOperationalExecution({
    stateMemory,
    contextCompiler,
    modelRouter,
    tokenGovernor,
    orchestrator,
    executionAuditTimeline,
    executionAuditIndex,
    humanApprovalGate
  });

  return {
    stateMemory,
    contextCompiler,
    modelRouter,
    tokenGovernor,
    budgetEnforcementGate,
    budgetLedger,
    providerScorecard,
    shadowRoutingAdvisor,
    shadowRoutingEvaluationLog,
    shadowRoutingAnalysisReporter,
    limitedShadowAuthorityPolicy,
    authorityDecisionAuditLog,
    authorityRuntimeSafetyMetrics,
    executionAuditTimeline,
    executionAuditIndex,
    controlledOperationalExecution,
    humanApprovalGate,
    evaluator,
    providers,
    orchestrator
  };
}
