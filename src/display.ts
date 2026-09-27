import chalk from "chalk";
import type { ChatResult } from "./chat";

export function displayResult(result: ChatResult, jsonMode = false): void {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Response content
  console.log(result.content);
  console.log();

  // Metadata footer
  const separator = "─".repeat(45);
  console.log(chalk.gray(separator));
  console.log(`${chalk.cyan("Model:")}    ${result.model}`);
  console.log(
    `${chalk.white("Tokens:")}   ${result.inputTokens} in / ${result.outputTokens} out`
  );
  console.log(`${chalk.yellow("Latency:")}  ${result.latencyMs.toLocaleString()}ms`);
  console.log(
    `${chalk.green("Cost:")}     ~$${result.estimatedCostUsd.toFixed(6)}`
  );
  console.log(chalk.gray(separator));
}
