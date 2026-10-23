import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type ModelMessage,
} from "ai";
import { getSession } from "@/lib/browser-session";
import { assistantModel, assistantSupportsImages } from "@/lib/models";
import { assistantInstructions } from "@/lib/prompt";
import { assistantTools, type AssistantUIMessage } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 600;

const MAX_STEPS = 40;
const NUDGE = "Continue the task from where you stopped. If the next step is irreversible, call request_approval first.";

export async function POST(req: Request) {
  const { messages }: { messages: AssistantUIMessage[] } = await req.json();

  // Make sure a browser is up before the model starts (and know whether it's logged in).
  const session = await getSession();

  // Text-only models (most local ones) don't get the screenshot tool.
  const vision = assistantSupportsImages();
  const { screenshot, ...textTools } = assistantTools;
  const tools = vision ? assistantTools : textTools;

  const run = (input: ModelMessage[], maxSteps: number) =>
    streamText({
      model: assistantModel(),
      instructions: assistantInstructions({ usesContext: session.usesContext, vision }),
      messages: input,
      tools,
      // The human-in-the-loop gate: this tool always waits for the user's click.
      toolApproval: { request_approval: "user-approval" },
      // One browser, one action at a time: run tool calls sequentially.
      toolCallConcurrency: 1,
      stopWhen: stepCountIs(maxSteps),
      abortSignal: req.signal,
      onStepEnd: ({ toolCalls, finishReason, text }) => {
        for (const call of toolCalls) console.log(`[agent] ${call.toolName}${call.invalid ? " (invalid input)" : ""}`);
        if (toolCalls.length === 0) console.log(`[agent] finished (${finishReason}): ${JSON.stringify(text.slice(0, 300))}`);
      },
    });

  const stream = createUIMessageStream<AssistantUIMessage>({
    originalMessages: messages,
    async execute({ writer }) {
      const input = await convertToModelMessages(messages, { tools });
      const first = run(input, MAX_STEPS);
      writer.merge(first.toUIMessageStream({ sendFinish: false }));

      // Some models occasionally end their turn mid-task with no answer and no tool call.
      // When that happens, nudge them once to keep going, in the same assistant message.
      const steps = await first.steps;
      const last = steps.at(-1);
      const stalled = steps.length > 1 && last && last.toolCalls.length === 0 && !last.text.trim();
      if (!stalled || steps.length >= MAX_STEPS) {
        writer.write({ type: "finish" });
        return;
      }

      console.log("[agent] stopped silently mid-task, nudging it to continue");
      const retry = run(
        [...input, ...(await first.responseMessages), { role: "user", content: NUDGE }],
        MAX_STEPS - steps.length,
      );
      writer.merge(retry.toUIMessageStream({ sendStart: false }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
