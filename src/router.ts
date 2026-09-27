export type ComplexityLevel = "simple" | "complex";

const COMPLEXITY_KEYWORDS = [
  "explain",
  "analyze",
  "compare",
  "summarize",
  "write",
  "debug",
  "reason",
  "refactor",
  "review",
];

const MODEL_MAP: Record<ComplexityLevel, string> = {
  simple: "openai/gpt-4o-mini",
  complex: "anthropic/claude-sonnet-5",
};

export function classifyPrompt(prompt: string): ComplexityLevel {
  const words = prompt.trim().split(/\s+/);

  if (words.length > 50) {
    return "complex";
  }

  const lower = prompt.toLowerCase();
  for (const keyword of COMPLEXITY_KEYWORDS) {
    if (lower.includes(keyword)) {
      return "complex";
    }
  }

  return "simple";
}

export function selectModel(complexity: ComplexityLevel): string {
  return MODEL_MAP[complexity];
}
