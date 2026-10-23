import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * The assistant model (the one that plans and calls tools).
 *
 * - Default: Claude via the Anthropic API (ANTHROPIC_API_KEY).
 * - ASSISTANT_BASE_URL set: any OpenAI-compatible server, e.g. a local Ollama:
 *     ASSISTANT_BASE_URL=http://localhost:11434/v1
 *     ASSISTANT_MODEL=qwen3:30b-a3b
 *
 * Stagehand's own model (act/observe/extract) is configured separately, see lib/browser-session.ts.
 */
export function assistantModel(): LanguageModel {
  const baseURL = process.env.ASSISTANT_BASE_URL;
  if (baseURL) {
    const local = createOpenAICompatible({
      name: "local",
      baseURL,
      apiKey: process.env.ASSISTANT_API_KEY,
    });
    return local.chatModel(process.env.ASSISTANT_MODEL || "qwen3:30b-a3b");
  }
  return anthropic(process.env.ASSISTANT_MODEL || "claude-sonnet-5-5");
}

/**
 * Can the assistant look at screenshots? Claude can; most local models (Qwen3, gpt-oss)
 * are text-only, so the screenshot tool is hidden from them unless ASSISTANT_VISION=true.
 */
export function assistantSupportsImages(): boolean {
  if (process.env.ASSISTANT_VISION) return process.env.ASSISTANT_VISION === "true";
  return !process.env.ASSISTANT_BASE_URL;
}
