import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContextCompilerV01, FileStateMemory } from "../src/index.js";

test("Context Compiler includes goal and applicable constraints", async () => {
  const compiler = new ContextCompilerV01();
  const context = await compiler.compile({
    goal: "Analyze revenue risk",
    constraints: { preferredProvider: "openai", maxInputTokens: 200 }
  });

  assert.match(context.messages[0]?.content ?? "", /Analyze revenue risk/);
  assert.match(context.messages[0]?.content ?? "", /preferredProvider/);
  assert.deepEqual(
    context.sourceRefs.map((source) => source.ref),
    ["goal", "constraints"]
  );
});

test("Context Compiler resolves supported text and file references with source labels", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quantico-context-"));
  const filePath = join(tempDir, "context.txt");
  await writeFile(filePath, "Repository architecture notes", "utf8");

  const compiler = new ContextCompilerV01();
  const context = await compiler.compile({
    goal: "Analyze architecture",
    contextRefs: ["text:notes:Architecture risk notes", `file:${filePath}`],
    constraints: { maxInputTokens: 300 }
  });

  assert.ok(context.sourceRefs.some((source) => source.type === "text" && source.label === "notes"));
  assert.ok(context.sourceRefs.some((source) => source.type === "file" && source.label === filePath));
  assert.match(context.messages[0]?.content ?? "", /Architecture risk notes/);
  assert.match(context.messages[0]?.content ?? "", /Repository architecture notes/);

  await rm(tempDir, { recursive: true, force: true });
});

test("Context Compiler resolves supported memory execution references", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quantico-memory-"));
  const stateMemory = new FileStateMemory(join(tempDir, "state.json"));
  await stateMemory.saveExecution({
    id: "exec_previous",
    goal: "Previous goal",
    taskType: "analysis",
    constraints: {},
    approvalPolicy: {},
    status: "succeeded",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    finalResult: "Previous result",
    metrics: {
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: 0,
      latencyMs: 1
    }
  });

  const compiler = new ContextCompilerV01();
  const context = await compiler.compile({
    goal: "Use previous result",
    contextRefs: ["memory:execution:exec_previous"],
    stateMemory,
    constraints: { maxInputTokens: 300 }
  });

  assert.ok(context.sourceRefs.some((source) => source.type === "memory"));
  assert.match(context.messages[0]?.content ?? "", /Previous result/);

  await rm(tempDir, { recursive: true, force: true });
});

test("Context Compiler respects context budget and reports omitted context", async () => {
  const compiler = new ContextCompilerV01();
  const context = await compiler.compile({
    goal: "Analyze alpha",
    constraints: { maxInputTokens: 60 },
    contextRefs: [
      "text:relevant:alpha alpha alpha",
      "text:large:This source is intentionally too large to fit inside the remaining budget after the required goal and constraints are preserved."
    ]
  });

  assert.match(context.messages[0]?.content ?? "", /Analyze alpha/);
  assert.ok(context.estimatedTokens <= 60);
  assert.ok(context.sourceRefs.some((source) => source.label === "relevant"));
  assert.ok(context.omittedContext.some((item) => item.includes("text:large:")));
});

test("Context Compiler reports unsupported references as omitted context", async () => {
  const compiler = new ContextCompilerV01();
  const context = await compiler.compile({
    goal: "Analyze input",
    contextRefs: ["url:https://example.com"],
    constraints: { maxInputTokens: 100 }
  });

  assert.ok(context.omittedContext.some((item) => item.includes("url:https://example.com")));
});

test("Context Compiler output is deterministic for the same input", async () => {
  const compiler = new ContextCompilerV01();
  const input = {
    goal: "Analyze deterministic context",
    constraints: { maxInputTokens: 200 },
    contextRefs: ["text:first:deterministic context", "text:second:other notes"]
  };

  const first = await compiler.compile(input);
  const second = await compiler.compile(input);

  assert.deepEqual(first, second);
});

test("Context Compiler does not depend on provider adapters", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile("src/components/context-compiler.ts", "utf8")
  );

  assert.equal(source.includes("OpenAIAdapter"), false);
  assert.equal(source.includes("AnthropicAdapter"), false);
  assert.equal(source.includes("../providers"), false);
});

