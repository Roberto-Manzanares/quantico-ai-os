import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileStateMemory,
  InMemoryStateMemory,
  ShadowRoutingEvaluationLogV09,
  summarizeShadowRoutingEvaluationLogEntries,
  type ProviderName,
  type ShadowAdvisorMetricsUsed,
  type ShadowRoutingAdvice,
  type ShadowRoutingEvaluationLogEntry
} from "../src/index.js";

test("Shadow Routing Evaluation Log persists complete match advice", async () => {
  const memory = new InMemoryStateMemory();
  const log = new ShadowRoutingEvaluationLogV09(memory);

  const entry = await log.record({
    id: "shadow_match",
    executionId: "exec_match",
    advice: advice({ actualProvider: "openai", shadowProvider: "openai", matches: true }),
    timestamp: new Date("2026-08-30T12:00:00.000Z")
  });

  assert.equal(entry.id, "shadow_match");
  assert.equal(entry.executionId, "exec_match");
  assert.equal(entry.actualSelection.provider, "openai");
  assert.equal(entry.shadowRecommendation?.provider, "openai");
  assert.equal(entry.matchesActualSelection, true);
  assert.equal(entry.differenceReason, undefined);
  assert.equal(entry.metricsUsed?.evaluationPassRate, 1);
  assert.equal(entry.advisorAuthority, "none");

  const [persisted] = await log.listEntries("exec_match");
  assert.deepEqual(persisted, entry);
});

test("Shadow Routing Evaluation Log persists divergence with auditable reason", async () => {
  const log = new ShadowRoutingEvaluationLogV09(new InMemoryStateMemory());

  const entry = await log.record({
    id: "shadow_divergence",
    executionId: "exec_divergence",
    advice: advice({
      actualProvider: "openai",
      shadowProvider: "anthropic",
      shadowModel: "claude-haiku-4-5-20251001",
      matches: false,
      differenceReason:
        "COST-FIRST selected openai/gpt-5-nano; shadow advisor recommended anthropic/claude-haiku-4-5-20251001."
    })
  });

  assert.equal(entry.matchesActualSelection, false);
  assert.match(entry.differenceReason ?? "", /COST-FIRST selected openai\/gpt-5-nano/);
  assert.equal(entry.shadowRecommendation?.model, "claude-haiku-4-5-20251001");
  assert.equal(entry.advisorAuthority, "none");
});

test("Shadow Routing Evaluation Log records insufficient data without invented recommendation", async () => {
  const log = new ShadowRoutingEvaluationLogV09(new InMemoryStateMemory());

  const entry = await log.record({
    id: "shadow_insufficient",
    executionId: "exec_insufficient",
    advice: insufficientAdvice()
  });

  assert.equal(entry.shadowRecommendation, null);
  assert.equal(entry.metricsUsed, null);
  assert.equal(entry.matchesActualSelection, false);
  assert.equal(entry.dataQuality, "insufficient_data");
  assert.equal(entry.advisorAuthority, "none");
});

test("Shadow Routing Evaluation Log lists history and filters by executionId", async () => {
  const log = new ShadowRoutingEvaluationLogV09(new InMemoryStateMemory());
  await log.record({
    id: "shadow_a",
    executionId: "exec_a",
    advice: advice({ actualProvider: "openai", shadowProvider: "openai", matches: true })
  });
  await log.record({
    id: "shadow_b",
    executionId: "exec_b",
    advice: advice({ actualProvider: "openai", shadowProvider: "anthropic", matches: false })
  });

  assert.equal((await log.listEntries()).length, 2);
  assert.equal((await log.listEntries("exec_a")).length, 1);
  assert.equal((await log.listEntries("exec_missing")).length, 0);
});

test("Shadow Routing Evaluation Log summarizes match, divergence, insufficient data and rates", () => {
  const summary = summarizeShadowRoutingEvaluationLogEntries([
    logEntry({ id: "match", matchesActualSelection: true, dataQuality: "complete" }),
    logEntry({
      id: "divergence",
      matchesActualSelection: false,
      dataQuality: "complete",
      differenceReason: "Different provider/model."
    }),
    logEntry({
      id: "insufficient",
      matchesActualSelection: false,
      dataQuality: "insufficient_data",
      shadowRecommendation: null,
      metricsUsed: null
    })
  ]);

  assert.equal(summary.totalEvaluations, 3);
  assert.equal(summary.matchCount, 1);
  assert.equal(summary.divergenceCount, 1);
  assert.equal(summary.insufficientDataCount, 1);
  assert.equal(summary.matchRate, 0.333333);
  assert.equal(summary.divergenceRate, 0.333333);
});

test("Shadow Routing Evaluation Log empty summary returns zero counts", () => {
  const summary = summarizeShadowRoutingEvaluationLogEntries([]);

  assert.deepEqual(summary, {
    totalEvaluations: 0,
    matchCount: 0,
    divergenceCount: 0,
    insufficientDataCount: 0,
    matchRate: 0,
    divergenceRate: 0
  });
});

test("Shadow Routing Evaluation Log persists through FileStateMemory", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "quantico-shadow-log-"));
  const stateFilePath = join(stateDir, "state.json");
  const firstLog = new ShadowRoutingEvaluationLogV09(new FileStateMemory(stateFilePath));
  await firstLog.record({
    id: "shadow_file",
    executionId: "exec_file",
    advice: advice({ actualProvider: "openai", shadowProvider: "openai", matches: true }),
    timestamp: new Date("2026-08-30T12:00:00.000Z")
  });

  const secondLog = new ShadowRoutingEvaluationLogV09(new FileStateMemory(stateFilePath));
  const [entry] = await secondLog.listEntries("exec_file");
  const rawState = await readFile(stateFilePath, "utf8");

  assert.equal(entry?.id, "shadow_file");
  assert.equal(entry?.advisorAuthority, "none");
  assert.match(rawState, /shadowRoutingEvaluations/);
  assert.doesNotMatch(rawState, new RegExp("s" + "k-"));
  assert.doesNotMatch(rawState, /OPENAI_API_KEY|ANTHROPIC_API_KEY|ANTHROPIC_WORKSPACE_ID/);

  await rm(stateDir, { recursive: true, force: true });
});

test("Shadow Routing Evaluation Log does not modify COST-FIRST selections", async () => {
  const log = new ShadowRoutingEvaluationLogV09(new InMemoryStateMemory());
  const inputAdvice = advice({
    actualProvider: "openai",
    shadowProvider: "anthropic",
    matches: false
  });

  await log.record({
    id: "shadow_router_intact",
    executionId: "exec_router_intact",
    advice: inputAdvice
  });

  assert.equal(inputAdvice.actualSelection.provider, "openai");
  assert.equal(inputAdvice.actualSelection.model, "gpt-5-nano");
  assert.equal(inputAdvice.advisorAuthority, "none");
});

function advice(options: {
  actualProvider: ProviderName;
  shadowProvider: ProviderName;
  shadowModel?: string;
  matches: boolean;
  differenceReason?: string;
}): ShadowRoutingAdvice {
  const shadowModel =
    options.shadowModel ??
    (options.shadowProvider === "openai" ? "gpt-5-nano" : "claude-haiku-4-5-20251001");

  return {
    actualSelection: {
      provider: options.actualProvider,
      model: options.actualProvider === "openai" ? "gpt-5-nano" : "claude-haiku-4-5-20251001",
      estimatedCostUsd: 0.000018,
      reason: "COST-FIRST selected lowest estimated compatible cost."
    },
    shadowRecommendation: {
      provider: options.shadowProvider,
      model: shadowModel,
      reason: "Recommended by deterministic scorecard history.",
      metricsUsed: metrics()
    },
    comparison: {
      matchesActualSelection: options.matches,
      differenceReason: options.differenceReason
    },
    dataQuality: "complete",
    advisorAuthority: "none",
    reason: options.matches
      ? "Shadow recommendation matches the COST-FIRST selection."
      : "Shadow recommendation differs from the COST-FIRST selection; this is observational only."
  };
}

function insufficientAdvice(): ShadowRoutingAdvice {
  return {
    actualSelection: {
      provider: "openai",
      model: "gpt-5-nano",
      estimatedCostUsd: 0.000018,
      reason: "COST-FIRST selected lowest estimated compatible cost."
    },
    shadowRecommendation: null,
    comparison: {
      matchesActualSelection: false
    },
    dataQuality: "insufficient_data",
    advisorAuthority: "none",
    reason: "Shadow advisor has no provider/model scorecard with sufficient evaluation data."
  };
}

function logEntry(overrides: Partial<ShadowRoutingEvaluationLogEntry> = {}): ShadowRoutingEvaluationLogEntry {
  return {
    id: "shadow_entry",
    executionId: "exec_shadow",
    timestamp: new Date("2026-08-30T12:00:00.000Z"),
    actualSelection: {
      provider: "openai",
      model: "gpt-5-nano",
      estimatedCostUsd: 0.000018,
      reason: "COST-FIRST selected lowest estimated compatible cost."
    },
    shadowRecommendation: {
      provider: "openai",
      model: "gpt-5-nano",
      reason: "Recommended by deterministic scorecard history.",
      metricsUsed: metrics()
    },
    matchesActualSelection: true,
    metricsUsed: metrics(),
    dataQuality: "complete",
    advisorAuthority: "none",
    ...overrides
  };
}

function metrics(): ShadowAdvisorMetricsUsed {
  return {
    executionCount: 2,
    evaluationPassCount: 2,
    evaluationPassRate: 1,
    successCount: 2,
    successRate: 1,
    averageActualCostUsd: 0.000016,
    averageLatencyMs: 2240,
    scorecardDataQuality: "complete"
  };
}
