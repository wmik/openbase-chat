import { client } from "./client";

export interface ChatResult {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
}

// Approximate cost per million tokens
const COST_TABLE: Record<string, { input: number; output: number }> = {
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "anthropic/claude-sonnet-5": { input: 3.0, output: 15.0 },
};

// Default cost for models not in the table (use complex pricing as conservative default)
const DEFAULT_COST = { input: 3.0, output: 15.0 };

export async function chat(prompt: string, model: string): Promise<ChatResult> {
  const start = Date.now();

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
  });

  const latencyMs = Date.now() - start;

  const content = response.choices[0]?.message?.content ?? "";
  const usage = response.usage;
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;

  const costEntry = COST_TABLE[model] ?? DEFAULT_COST;
  const estimatedCostUsd =
    (inputTokens / 1_000_000) * costEntry.input +
    (outputTokens / 1_000_000) * costEntry.output;

  // Extract provider from model string (e.g. "anthropic/claude-sonnet-5" -> "anthropic")
  const provider = model.includes("/") ? model.split("/")[0] : model;

  return {
    content,
    model,
    provider,
    inputTokens,
    outputTokens,
    latencyMs,
    estimatedCostUsd,
  };
}
