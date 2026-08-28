import type { ActionDescriptor, ApprovalPolicy, ApprovalResult } from "../types.js";

export interface HumanApprovalGate {
  evaluateAction(action: ActionDescriptor, approvalPolicy: ApprovalPolicy): Promise<ApprovalResult>;
}

export class SkeletonHumanApprovalGate implements HumanApprovalGate {
  async evaluateAction(
    action: ActionDescriptor,
    approvalPolicy: ApprovalPolicy
  ): Promise<ApprovalResult> {
    if (action.riskLevel === "LOW") {
      return {
        riskLevel: action.riskLevel,
        decisionApplied: "automatic",
        reason: "LOW risk actions run automatically."
      };
    }

    if (action.riskLevel === "MEDIUM" && !approvalPolicy.mediumRiskRequiresApproval) {
      return {
        riskLevel: action.riskLevel,
        decisionApplied: "automatic",
        reason: "MEDIUM risk action allowed by approval policy."
      };
    }

    return {
      riskLevel: action.riskLevel,
      decisionApplied: "pending",
      reason: `${action.riskLevel} risk action requires human approval.`
    };
  }
}

