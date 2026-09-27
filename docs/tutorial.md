# Building openbase-chat: A Cost-Aware CLI with Model Routing

## Introduction

In this tutorial, we'll build **openbase-chat** — a TypeScript CLI tool that sends prompts to different LLM models based on task complexity, all through a single [Openbase](https://openbase.ai) API key. You'll learn how to use Openbase as a drop-in replacement for direct provider APIs, implement heuristic model routing, and display per-request metadata like tokens, latency, and cost.

**What you'll need:**
- [Node.js](https://nodejs.org/) 18+
- An [Openbase](https://openbase.ai) account and API key
- Basic familiarity with TypeScript and the command line

**What we'll build:**
- A CLI that accepts a prompt and routes it to the right model
- Simple queries go to a fast, cheap model (`openai/gpt-4o-mini`)
- Complex queries go to a more powerful model (`anthropic/claude-sonnet-5`)
- Every response includes metadata: model used, tokens consumed, latency, and estimated cost

---

## 1. Project Setup

### Initialize the project

```bash
mkdir openbase-chat
cd openbase-chat
npm init -y
```

### Install dependencies

```bash
npm install openai commander ora chalk dotenv
npm install -D typescript tsx tsup @types/node
```

| Dependency | Purpose |
|---|---|
| `openai` | OpenAI-compatible SDK — works with Openbase by swapping `baseURL` |
| `commander` | CLI argument and flag parsing |
| `ora` | Terminal spinner for loading state |
| `chalk` | Terminal color output |
| `dotenv` | Load environment variables from `.env` |
| `typescript` | Type safety |
| `tsx` | Run TypeScript directly in development |
| `tsup` | Bundle for distribution |

### Configure TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Configure the bundler

Create `tsup.config.ts`:

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  shims: true,
  clean: true,
});
```

### Set up environment variables

Create `.env.example`:

```
OPENBASE_API_KEY=your_openbase_api_key_here
```

Create `.gitignore`:

```
node_modules/
dist/
env
*.log
```

### Add npm scripts

In `package.json`, add:

```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsup src/index.ts --format cjs --dts",
    "start": "node dist/index.js"
  }
}
```

### Final project structure

```
openbase-chat/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── client.ts         # Openbase client setup
│   ├── router.ts         # Complexity classifier and model routing
│   ├── chat.ts           # Sends prompt, returns response + metadata
│   └── display.ts        # Formats and prints output
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## 2. Connecting to Openbase

The core idea behind Openbase is simple: it's an **OpenAI-compatible gateway**. You use the same `openai` npm package you already know, but point it at Openbase's base URL instead of Openai's. All OpenAI-compatible methods work as-is.

### Get an API key

1. Sign up at [openbase.ai](https://openbase.ai)
2. Navigate to your account settings and generate an API key
3. Copy the key — it will look like `sk-ob-...`

### Set up the client

Create `src/client.ts`:

```typescript
import OpenAI from "openai";

export const client = new OpenAI({
  baseURL: "https://api.openbase.ai/v1",
  apiKey: process.env.OPENBASE_API_KEY,
});
```

That's it. No other SDK changes needed. Every method on `client` — chat completions, embeddings, etc. — now routes through Openbase's gateway.

> **Tip:** The `openai` SDK automatically reads `OPENAI_API_KEY` from the environment. By explicitly passing `apiKey`, we make it clear we're using Openbase's key, not OpenAI's.

---

## 3. Building the Model Router

The router is the brain of the tool. It decides which model handles a given prompt based on simple heuristics.

### The routing concept

Not every prompt needs a powerful model. A short factual question like "what is the capital of France?" can be handled by a fast, cheap model. A complex request like "analyze the tradeoffs between RAG and fine-tuning" benefits from a more capable model. By routing intelligently, we save cost without sacrificing quality.

### Heuristic classification

Create `src/router.ts`:

```typescript
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
```

### How it works

1. **Word count check** — if the prompt has more than 50 words, it's classified as complex
2. **Keyword check** — if the prompt contains any complexity keyword (explain, analyze, compare, etc.), it's classified as complex
3. **Default** — everything else is simple

### Testing the classifier

```typescript
classifyPrompt("what is a vector database");                         // → "simple"
classifyPrompt("explain how vector databases work");                 // → "complex" (keyword)
classifyPrompt("analyze the tradeoffs between RAG and fine-tuning");  // → "complex" (keyword)
classifyPrompt("write a function to sort an array");                // → "complex" (keyword)
```

---

## 4. Making the Chat Request

Now we send the prompt to Openbase and capture rich metadata about the response.

Create `src/chat.ts`:

```typescript
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
```

### What we capture

| Field | Source |
|---|---|
| `content` | `response.choices[0].message.content` |
| `model` | The model string we sent |
| `provider` | Extracted from model string (e.g. `anthropic` from `anthropic/claude-sonnet-5`) |
| `inputTokens` | `response.usage.prompt_tokens` |
| `outputTokens` | `response.usage.completion_tokens` |
| `latencyMs` | `Date.now()` before and after the request |
| `estimatedCostUsd` | Computed from token counts and the cost table |

> **Note:** The cost table uses approximate pricing. For production use, fetch live pricing from Openbase's API or pricing page.

---

## 5. Displaying Results

A good CLI tool presents output clearly. We'll use `chalk` to colorize the metadata footer.

Create `src/display.ts`:

```typescript
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
```

### Example output

```
Vector databases are specialized storage systems designed for high-dimensional
vector data...

─────────────────────────────────────────────
Model:    openai/gpt-4o-mini
Tokens:   12 in / 87 out
Latency:  1,243ms
Cost:     ~$0.000055
─────────────────────────────────────────────
```

### JSON mode

With `--json`, the output is machine-readable:

```json
{
  "content": "Vector databases are...",
  "model": "openai/gpt-4o-mini",
  "provider": "openai",
  "inputTokens": 12,
  "outputTokens": 87,
  "latencyMs": 1243,
  "estimatedCostUsd": 0.000055
}
```

---

## 6. Wiring Up the CLI

The CLI entry point ties everything together: argument parsing, model selection, the spinner, and error handling.

Create `src/index.ts`:

```typescript
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
  .option("-m, --model <model>", "Override model selection")
  .option("--simple", "Force routing to the simple/cheap model")
  .option("--complex", "Force routing to the complex/powerful model")
  .option("--json", "Output result as JSON")
  .action(async (prompt, options) => {
    // Validate API key
    if (!process.env.OPENBASE_API_KEY) {
      console.error(
        "Error: OPENBASE_API_KEY is not set.\n" +
        "Get your API key at https://openbase.ai and add it to your .env file."
      );
      process.exit(1);
    }

    // Validate prompt
    if (!prompt.trim()) {
      console.error("Error: Empty prompt. Provide a prompt to send.");
      process.exit(1);
    }

    // Determine model: --model > --simple > --complex > auto-classify
    let model;
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
    } catch (error) {
      spinner.fail("Request failed");

      if (error?.status) {
        console.error(`API Error (${error.status}): ${error.message}`);
      } else if (error?.code === "ECONNABORTED") {
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
```

### Routing precedence

The model selection follows this order:

1. `--model <model>` — use the specified model directly, skip classification
2. `--simple` — force `openai/gpt-4o-mini`
3. `--complex` — force `anthropic/claude-sonnet-5`
4. Auto-classify — run the heuristic classifier

### Error handling

| Case | Behavior |
|---|---|
| Missing `OPENBASE_API_KEY` | Clear error message with link to openbase.ai, exit 1 |
| API error (4xx/5xx) | Status code and message, exit 1 |
| Network timeout | Retry suggestion, exit 1 |
| Empty prompt | Usage hint, exit 1 |

---

## 7. The Full Picture

Here's how all the modules connect:

```
User prompt
    │
    ▼
┌─────────────┐
│  index.ts   │  Parse args, validate, select model
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  router.ts  │  classifyPrompt() → selectModel()
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  chat.ts    │  client.chat.completions.create()
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ display.ts  │  Format and print result
└─────────────┘
```

### Running the CLI

```bash
# Development mode
npm run dev -- "what is a vector database"

# Production build
npm run build
npm start -- "analyze the tradeoffs between RAG and fine-tuning"
```

---

## 8. Recommended Next Steps

Now that you have a working CLI, here are ways to extend it:

### Add more models

Extend the model map in `src/router.ts`:

```typescript
const MODEL_MAP: Record<ComplexityLevel, string> = {
  simple: "openai/gpt-4o-mini",
  complex: "anthropic/claude-sonnet-5",
  // Add more tiers:
  medium: "google/gemini-2.0-flash",
};
```

### Improve classification

Replace the heuristic classifier with a more sophisticated approach:
- Use embeddings to measure semantic complexity
- Integrate a lightweight NLP library
- Let users define custom routing rules

### Add streaming

Stream responses token-by-token for better UX:

```typescript
const stream = await client.chat.completions.create({
  model,
  messages: [{ role: "user", content: prompt }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

### Add conversation history

Support multi-turn conversations by maintaining a message array that could potentially be persisted to a database like sqlite:

```typescript
const messages: ChatCompletionMessageParam[] = [];

function addMessage(role: "user" | "assistant", content: string) {
  messages.push({ role, content });
}
```

### Add a configuration file

Allow users to customize routing rules via a `.openbase-chat.json` config:

```json
{
  "models": {
    "simple": "openai/gpt-4o-mini",
    "complex": "anthropic/claude-sonnet-5"
  },
  "keywords": ["explain", "analyze", "compare"],
  "wordThreshold": 50
}
```

### Add tests

Write unit tests for the classifier and integration tests for the API:

```typescript
import { classifyPrompt } from "./router";

test("short factual query is simple", () => {
  expect(classifyPrompt("what is 2+2")).toBe("simple");
});

test("keyword triggers complex", () => {
  expect(classifyPrompt("explain quantum computing")).toBe("complex");
});
```

### Publish to npm

Make the tool available to everyone:

```bash
npm login
npm publish --access public
```

Users can then run:

```bash
npx openbase-chat "your prompt here"
```

### Add CI/CD

Set up GitHub Actions for automated testing and publishing:

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npm run build
```

### Build a web UI

Wrap the routing logic in a simple web interface using Next.js or Vite, letting users interact with the models through a browser instead of the terminal.
