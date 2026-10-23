# Errand: an open-source web assistant built on Stagehand v4

An AI assistant that **does things on the web for you**. You chat on the left, and on the right you watch a real Browserbase browser do the work, live. Before anything irreversible, like placing an order, it stops and asks you.

It runs on an open-weights model, **DeepSeek V4.1 Flash** (MIT license), through OpenRouter. Stagehand turns each of its steps into reliable browser actions.

```
┌──────────────── Next.js app ─────────────────┐        ┌──────── Browserbase ────────┐
│  Chat UI (useChat)            Live view      │◄───────│  Chrome + Stagehand ext.    │
│        │                       iframe        │        │   ▲                         │
│        ▼                                     │        │   │ act / observe / extract │
│  /api/chat  streamText(DeepSeek V4.1 Flash)  │        │   │                         │
│        │  tools: navigate · observe · act ·  │──CDP──►│   │  Model Gateway          │
│        │   extract · screenshot ·            │        │   │  (claude-haiku-4-5)     │
│        │   request_approval                  │        └───┴─────────────────────────┘
│        ▼                                     │
│  Stagehand v4 (act/observe/extract)          │
└──────────────────────────────────────────────┘
```

## Quick start

You need Node.js 22.18+, pnpm, a [Browserbase](https://browserbase.com) API key and an [OpenRouter](https://openrouter.ai/keys) API key.

```sh
pnpm install
cp .env.example .env         # set BROWSERBASE_API_KEY and ASSISTANT_API_KEY (your OpenRouter key)
pnpm smoke                   # Stagehand sanity check: navigate → observe → act → extract
pnpm dev                     # http://localhost:3000
```

Then try a suggestion, for example: *"On saucedemo.com (user standard_user, password secret_sauce), buy the Sauce Labs Backpack and ship it to Ada Lovelace, 94107."* The agent logs in, adds the item to the cart, fills in the checkout, and asks for your approval before **Finish**.

Other commands:

| Command | What it does |
| --- | --- |
| `pnpm agent "<task>"` | Runs the same assistant in the terminal. Set `AUTO_APPROVE=yes` or `no` to answer approvals automatically. |
| `pnpm login` | Creates a Browserbase context and opens a live view so you can sign in to your accounts (see [Acting as you](#6-acting-as-you-browserbase-contexts)). |
| `pnpm typecheck`, `pnpm build` | Type checking and a production build. |

> **Local demo only.** `/api/chat` and `/api/session` have no authentication. If you deploy this as-is, anyone who can reach it can drive a browser with your Browserbase and model keys. Add authentication before deploying.

## Choosing the assistant model

The assistant talks to any OpenAI-compatible endpoint, so switching models is a `.env` change (see `lib/models.ts`):

| Setup | `.env` |
| --- | --- |
| **DeepSeek V4.1 Flash via OpenRouter** (default) | `ASSISTANT_BASE_URL=https://openrouter.ai/api/v1`, `ASSISTANT_API_KEY`, `ASSISTANT_MODEL=deepseek/deepseek-v4.1-flash`, `ASSISTANT_VISION=true` |
| Any other OpenRouter model | Same as above, with another `ASSISTANT_MODEL` |
| Claude | Remove `ASSISTANT_BASE_URL`, then set `ANTHROPIC_API_KEY` and `ASSISTANT_MODEL=claude-sonnet-5-5` |
| A local model on Ollama (experimental) | `ASSISTANT_BASE_URL=http://localhost:11434/v1`, `ASSISTANT_MODEL=qwen3:30b-a3b` |

Pick a model that is good at tool calling. The [Stagehand evals](https://www.stagehand.dev/evals) benchmark models on hard browser tasks. DeepSeek V4.1 Flash scores 61–63% there, at $0.23–0.56 per task. In our testing, `qwen3:30b-a3b` on Ollama handled read-only tasks but couldn't finish the checkout.

`ASSISTANT_VISION` controls whether the assistant gets the `screenshot` tool. Turn it off for text-only models.

---

## How it works

### 1. Two models, two jobs

| | Model | Job |
| --- | --- | --- |
| **The assistant** | DeepSeek V4.1 Flash, or any model above (`ASSISTANT_MODEL`), via the AI SDK | Understands the request, plans, decides the next step, asks for approval, and writes the answer. |
| **Stagehand** | A fast model (`STAGEHAND_MODEL`, default `anthropic/claude-haiku-4-5`) | Turns one natural-language step ("click the Add to cart button") into the right element and action on the page. |

This split is the key idea: the assistant never deals with selectors, and Stagehand never has to understand the whole task.

### 2. Launching a browser: `lib/browser-session.ts`

```ts
const browser = await browserbase.launch({ apiKey, keepAlive: true, browserSettings: { ... } });
const stagehand = await Stagehand.create({ browser, model: { modelName: "anthropic/claude-haiku-4-5" } });
```

With no model API key, Stagehand routes its calls through the **Browserbase Model Gateway**, so your Browserbase key is the only key Stagehand needs. Set `STAGEHAND_MODEL_API_KEY` to use your own provider key instead.

Stagehand doesn't expose a live view URL, so we ask the Browserbase API with `sessions.debug(sessionId)`. Browserbase returns one URL per tab, so `currentLiveView()` follows the most recent real tab, including tabs the agent opens.

### 3. Stagehand primitives as tools: `lib/tools.ts`

| Tool | Stagehand call | Example |
| --- | --- | --- |
| `navigate` | `page.goto(url)` | open `https://www.saucedemo.com` |
| `observe` | `stagehand.observe(instruction)` | "find the login form fields". Returns `{ selector, description, method }[]` |
| `act` | `stagehand.act(instruction, { variables })` or `stagehand.act(observedAction)` | "type %user% into the username field" |
| `extract` | `stagehand.extract(instruction)` | "names and prices of the first 3 products, as JSON" |
| `screenshot` | `page.screenshot()` | a visual check before reporting success |

- **`observe` → `act(action)`** replays the observed action exactly, without a second LLM call.
- **`variables`**: `%pass%` is filled in the browser, so the secret never reaches either model.
- `screenshot` uses `toModelOutput` to send an **image part** to the model, not a base64 string.

### 4. The agent loop: `app/api/chat/route.ts`

`streamText({ tools, stopWhen: stepCountIs(40) })` runs the loop, and `useChat` streams each tool call into the UI (`components/ToolCallCard.tsx`).

Two guards make the agent robust with any model:
- **Verify before submitting.** The prompt (`lib/prompt.ts`) tells the agent to extract a form's values before the click that submits it, and refill any that didn't stick.
- **Nudge silent stops.** Some models occasionally end their turn mid-task with no answer and no tool call. The route detects that and sends one "continue" message, streamed into the same chat message.

### 5. Human in the loop: `request_approval`

```ts
streamText({ ..., toolApproval: { request_approval: "user-approval" } })
```

The prompt tells the agent to call `request_approval` before anything that sends, buys, books, posts, deletes, or changes account settings. The AI SDK pauses the loop, `ApprovalCard` shows Approve and Deny, and `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` resumes the loop.

> This gate is enforced **by the prompt**, so a model could still `act` without asking. For real products, enforce it server-side, for example by requiring approval in `act` itself for instructions that look like submit/buy/send, or with a domain allow-list.

### 6. Acting as you: Browserbase contexts

```sh
pnpm login   # creates a context, prints a live view URL; sign in to GitHub/Gmail/... then press Enter
```

The context stores cookies. Every session launched with `BROWSERBASE_CONTEXT_ID` starts signed in (`browserSettings.context = { id, persist: true }`), and the agent never sees your password. Only one session should write to a context at a time.

### 7. Cleanup

`keepAlive: true` sessions survive disconnects, so **Release session** (`DELETE /api/session`) calls `stagehand.close()` and `browser.close()`, then `sessions.update(id, { status: "REQUEST_RELEASE" })`. Releasing is also what saves the context's cookies.

---

## Tips

- Click into the live view to take over, e.g. for 2FA or a CAPTCHA.
- Set `STAGEHAND_BROWSERBASE_EXTENSION_ID` to skip uploading the Stagehand extension on each session launch.
- Want more? [Browsie](https://github.com/browserbase/cookbook/tree/main/projects/browsie#readme) is a more advanced reference assistant, with durable conversations, a credential vault, Live View handoff and messaging channels.

## Files

```
app/api/chat/route.ts      agent loop (streamText + tools + approval + silent-stop nudge)
app/api/session/route.ts   start / inspect / release the browser
lib/browser-session.ts     Browserbase + Stagehand setup, live view
lib/tools.ts               navigate / observe / act / extract / screenshot (+ request_approval)
lib/prompt.ts              assistant instructions
lib/models.ts              assistant model: any OpenAI-compatible endpoint, or Anthropic
components/                Chat, ToolCallCard, ApprovalCard, LiveView
scripts/                   smoke, login, agent (terminal version of the assistant)
```

## Built with

[Stagehand](https://github.com/browserbase/stagehand) · [Browserbase](https://www.browserbase.com) · [Vercel AI SDK](https://ai-sdk.dev) · [Next.js](https://nextjs.org) · [DeepSeek V4.1 Flash](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash) via [OpenRouter](https://openrouter.ai)

## License

[MIT](LICENSE)
