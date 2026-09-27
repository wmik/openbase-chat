# openbase-chat

A cost-aware CLI chat tool that automatically routes prompts to the right LLM model via [Openbase](https://openbase.ai) — one API key, one bill, per-request observability.

## What this is

`openbase-chat` is a TypeScript CLI tool that demonstrates Openbase's unified model gateway. It takes a prompt, classifies its complexity, routes it to an appropriate LLM (cheap model for simple queries, powerful model for complex ones), and displays the response with full metadata — model used, tokens consumed, latency, and estimated cost.

## Why Openbase

Openbase acts as a drop-in replacement for direct provider APIs. Instead of managing separate API keys for OpenAI, Anthropic, Google, and others, you use a single Openbase key. You get one bill, automatic failover, and per-request observability — all through an OpenAI-compatible API.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- An [Openbase](https://openbase.ai) account and API key

## Installation

```bash
git clone https://github.com/wmik/openbase-chat.git
cd openbase-chat
npm install
npm run build
```

## Setup

1. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Add your Openbase API key to `.env`:

   ```
   OPENBASE_API_KEY=sk-ob-...
   ```

## Usage

```bash
# Auto-route based on complexity
npm run dev -- "what is a vector database"

# Force complex model
npm run dev -- --complex "analyze the tradeoffs between RAG and fine-tuning"

# Override model directly
npm run dev -- --model "google/gemini-2.0-flash" "explain recursion"

# Force simple/cheap model
npm run dev -- --simple "what is the capital of France"

# JSON output (useful for piping)
npm run dev -- --json "summarize the history of the internet"
```

### Flags

| Flag | Description |
|---|---|
| `-m, --model <model>` | Override model selection (e.g. `anthropic/claude-sonnet-5`) |
| `--simple` | Force routing to the simple/cheap model |
| `--complex` | Force routing to the complex/powerful model |
| `--json` | Output result as JSON |

## How routing works

When no model override is provided, the tool classifies the prompt using simple heuristics:

1. **Word count** — prompts with more than 50 words are classified as complex
2. **Keywords** — prompts containing any of these words are classified as complex:
   `explain`, `analyze`, `compare`, `summarize`, `write`, `debug`, `reason`, `refactor`, `review`
3. **Default** — everything else is classified as simple

The classified complexity maps to a model:

| Complexity | Model | Best for |
|---|---|---|
| Simple | `openai/gpt-4o-mini` | Short factual queries |
| Complex | `anthropic/claude-sonnet-5` | Analysis, writing, debugging |

You can override routing at any time with `--model`, `--simple`, or `--complex`.

## Model cost table

Approximate cost per million tokens:

| Model | Input $/1M | Output $/1M |
|---|---|---|
| `openai/gpt-4o-mini` | $0.15 | $0.60 |
| `anthropic/claude-sonnet-5` | $3.00 | $15.00 |

Simple queries cost roughly **20x less** than complex ones — that's the power of intelligent routing.

## Extending it

### Add more models

Edit `src/router.ts` to add models to the `MODEL_MAP`:

```typescript
const MODEL_MAP: Record<ComplexityLevel, string> = {
  simple: "openai/gpt-4o-mini",
  complex: "anthropic/claude-sonnet-5",
  // Add a third tier:
  // medium: "google/gemini-2.0-flash",
};
```

### Change routing logic

Edit `classifyPrompt()` in `src/router.ts`. You could add more keyword patterns, adjust the word count threshold, or integrate a proper NLP classifier.

### Add cost for new models

Edit the `COST_TABLE` in `src/chat.ts` with pricing for any new models you add.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE)
