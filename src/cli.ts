#!/usr/bin/env node
import { createQuanticoSystem } from "./index.js";

const [, , command, ...args] = process.argv;

if (command !== "run" || args.length === 0) {
  console.log("Usage: quantico run \"<goal>\"");
  process.exit(command ? 1 : 0);
}

const system = createQuanticoSystem();
const result = await system.orchestrator.run({ goal: args.join(" ") });

console.log(
  JSON.stringify(
    {
      executionId: result.execution.id,
      status: result.execution.status,
      taskType: result.execution.taskType,
      metrics: result.execution.metrics,
      evaluation: result.evaluation
    },
    null,
    2
  )
);

