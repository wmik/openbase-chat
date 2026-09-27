#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import ora from "ora";
import { classifyPrompt, selectModel } from "./router";
import { chat } from "./chat";
import { displayResult } from "./display";

const program = new Command();

program
  .name("openbase-chat")
  .description("Route prompts to the right LLM model via Openbase")
  .version("1.0.0")
  .argument("<prompt>", "The prompt to send")
  .option("-m, --model <model>", "Override model selection (e.g. anthropic/claude-sonnet-5)")
  .option("--simple", "Force routing to the simple/cheap model")
  .option("--complex", "Force routing to the complex/powerful model")
  .option("--json", "Output result as JSON")
  .action(async (prompt: string, options: { model?: string; simple?: boolean; complex?: boolean; json?: boolean }) => {
    // Validate API key
    if (!process.env.OPENBASE_API_KEY) {
      console.error(
        "Error: OPENBASE_API_KEY is not set.\n" +
        "Get your API key at https://openbase.ai and add it to your .env file.\n" +
        "See .env.example for the expected format."
      );
      process.exit(1);
    }

    // Validate prompt
    if (!prompt.trim()) {
      console.error("Error: Empty prompt. Provide a prompt to send.");
      program.help();
      process.exit(1);
    }

    // Determine model: --model > --simple > --complex > auto-classify
    let model: string;
    if (options.model) {
      model = options.model;
    } else if (options.simple) {
      model = selectModel("simple");
    } else if (options.complex) {
      model = selectModel("complex");
    } else {
      const complexity = classifyPrompt(prompt);
      model = selectModel(complexity);
    }

    // Show spinner and call API
    const spinner = ora("Thinking...").start();

    try {
      const result = await chat(prompt, model);
      spinner.succeed("Done");
      displayResult(result, options.json);
    } catch (error: any) {
      spinner.fail("Request failed");

      if (error?.status) {
        console.error(`API Error (${error.status}): ${error.message}`);
      } else if (error?.code === "ECONNABORTED" || error?.message?.includes("timeout")) {
        console.error("Request timed out. Please try again.");
      } else if (error?.message) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error("An unexpected error occurred.");
      }

      process.exit(1);
    }
  });

program.parse();
