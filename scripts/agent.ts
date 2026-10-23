// The same assistant as the web app, in the terminal (same model, tools, prompt, approval gate).
//   pnpm agent "What are the top 3 stories on Hacker News right now?"
//   AUTO_APPROVE=yes|no pnpm agent "..."   # answer approval requests without prompting
import { generateText, stepCountIs, type ModelMessage } from "ai";
import { createInterface } from "node:readline/promises";
import { closeSession, getSession } from "../lib/browser-session";
import { assistantModel, assistantSupportsImages } from "../lib/models";
import { assistantInstructions } from "../lib/prompt";
import { assistantTools } from "../lib/tools";

const task = process.argv.slice(2).join(" ");
if (!task) throw new Error('Usage: pnpm agent "<task>"');

const session = await getSession();
console.log(`live view: ${session.initialLiveView.url}\n`);

const vision = assistantSupportsImages();
const { screenshot, ...textTools } = assistantTools;
const tools = vision ? assistantTools : textTools;
const messages: ModelMessage[] = [{ role: "user", content: task }];
const started = Date.now();

try {
  for (;;) {
    const result = await generateText({
      model: assistantModel(),
      instructions: assistantInstructions({ usesContext: session.usesContext, vision }),
      messages,
      tools,
      toolApproval: { request_approval: "user-approval" },
      toolCallConcurrency: 1,
      stopWhen: stepCountIs(40),
      onStepEnd: ({ toolCalls, toolResults }) => {
        for (const call of toolCalls) {
          const result = toolResults.find((r) => r.toolCallId === call.toolCallId);
          const output = result ? JSON.stringify(result.output).slice(0, 160) : "";
          console.log(`→ ${call.toolName} ${JSON.stringify(call.input)}\n    ${output}`);
        }
      },
    });
    messages.push(...result.responseMessages);

    const approvals = result.content.filter((part) => part.type === "tool-approval-request");
    if (approvals.length === 0) {
      console.log(`\n${result.text}\n\n(${Math.round((Date.now() - started) / 1000)}s)`);
      break;
    }

    // Human-in-the-loop: answer each approval request, then let the loop continue.
    for (const approval of approvals) {
      const input = approval.toolCall.input as { action: string; details?: string };
      console.log(`\n⚠️  Approval needed: ${input.action}${input.details ? `\n   ${input.details}` : ""}`);
      const approved = await ask();
      messages.push({
        role: "tool",
        content: [{ type: "tool-approval-response", approvalId: approval.approvalId, approved }],
      });
    }
  }
} finally {
  await closeSession();
}

async function ask(): Promise<boolean> {
  if (process.env.AUTO_APPROVE) {
    const approved = process.env.AUTO_APPROVE === "yes";
    console.log(`   (AUTO_APPROVE) ${approved ? "approved" : "denied"}`);
    return approved;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("   Approve? [y/N] ");
  rl.close();
  return answer.trim().toLowerCase().startsWith("y");
}
