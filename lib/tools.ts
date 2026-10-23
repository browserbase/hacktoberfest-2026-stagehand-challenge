import { tool, type InferUITools, type UIMessage } from "ai";
import { z } from "zod";
import { activePage, getSession } from "./browser-session";

/**
 * The browser tools map 1:1 to Stagehand v4 primitives:
 *
 *   navigate   -> page.goto(url)
 *   observe    -> stagehand.observe(instruction): "what can I do here?" (candidate actions)
 *   act        -> stagehand.act(instruction | observed action): do one thing on the page
 *   extract    -> stagehand.extract(instruction): pull data out of the page
 *   screenshot -> page.screenshot(): look at the page
 *
 * Our agent (Claude, via the AI SDK) plans the task; Stagehand turns each
 * natural-language step into reliable browser actions.
 */

const observedAction = z.object({
  selector: z.string(),
  description: z.string(),
  method: z.string().optional(),
  arguments: z.array(z.string()).optional(),
});

export const browserTools = {
  navigate: tool({
    description: "Open a URL in the current tab. Prefer specific URLs (search results, filtered listings) over home pages.",
    inputSchema: z.object({ url: z.string().describe("Absolute URL, e.g. https://news.ycombinator.com") }),
    async execute({ url }) {
      const page = await activePage(await getSession());
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return { url: await page.url(), title: await page.title() };
    },
  }),

  observe: tool({
    description:
      "List the actions available on the current page that match an instruction, e.g. 'find the search box and the submit button'. " +
      "Returns candidate actions (selector + description + method) that you can pass to `act` as `action` to execute them exactly, with no extra inference.",
    inputSchema: z.object({ instruction: z.string() }),
    async execute({ instruction }) {
      const { stagehand } = await getSession();
      const { data } = await stagehand.observe(instruction);
      return { actions: data };
    },
  }),

  act: tool({
    description:
      "Perform ONE action on the current page, described in plain language, e.g. 'click the Add to cart button' or " +
      "'type %city% into the destination field'. Pass `action` instead to replay an action returned by `observe`. " +
      "Use `variables` for sensitive values: they fill %name% placeholders in the browser and are never sent to the model.",
    inputSchema: z.object({
      instruction: z.string().optional().describe("One atomic action in plain language."),
      action: observedAction.optional().describe("An action returned by observe, executed as-is."),
      variables: z.record(z.string(), z.string()).optional().describe("Values for %name% placeholders in the instruction."),
    }),
    async execute({ instruction, action, variables }) {
      const { stagehand } = await getSession();
      if (!instruction && !action) throw new Error("Provide either `instruction` or `action`.");
      const { data } = action
        ? await stagehand.act(action)
        : await stagehand.act(instruction!, variables ? { variables } : undefined);
      return { success: data.success, message: data.message, performed: data.actionDescription };
    },
  }),

  extract: tool({
    description:
      "Extract information from the current page, e.g. 'the title, price and rating of the first 5 products'. " +
      "Ask for exactly the fields you need. Asking for JSON in the instruction gives structured text back.",
    inputSchema: z.object({ instruction: z.string() }),
    async execute({ instruction }) {
      const { stagehand } = await getSession();
      const { data } = await stagehand.extract(instruction);
      return data;
    },
  }),

  screenshot: tool({
    description: "Take a screenshot of the current tab to check what the page looks like.",
    inputSchema: z.object({
      fullPage: z.boolean().optional().describe("Capture the whole scrollable page (default: viewport only)."),
    }),
    async execute({ fullPage = false }) {
      const page = await activePage(await getSession());
      // A small viewport JPEG keeps the chat history (and token bill) light.
      const bytes = await page.screenshot({ fullPage, type: "jpeg", quality: 60 });
      return { data: Buffer.from(bytes).toString("base64"), mimeType: "image/jpeg" as const };
    },
    // Send the image to the model as an image, not as a giant base64 JSON string.
    toModelOutput: ({ output }) => ({
      type: "content",
      value: [
        { type: "text", text: "Screenshot captured." },
        { type: "file", mediaType: output.mimeType, data: { type: "data", data: output.data } },
      ],
    }),
  }),
};

/**
 * Human-in-the-loop. This tool does nothing by itself: `streamText` is configured
 * with `toolApproval: { request_approval: "user-approval" }`, so the agent loop
 * pauses until the user clicks Approve / Deny in the chat.
 */
export const approvalTool = {
  request_approval: tool({
    description:
      "Ask the user to approve a consequential action BEFORE doing it (submitting a form, " +
      "sending a message, posting, purchasing, booking, deleting, or changing account settings). " +
      "If the result says the user denied it, do not perform the action.",
    inputSchema: z.object({
      action: z.string().describe("Short imperative description, e.g. 'Submit the order for $24.99'"),
      details: z
        .string()
        .optional()
        .describe("What will happen and anything the user should double-check (recipient, amount, date...)"),
    }),
    async execute({ action }) {
      return { approved: true, action };
    },
  }),
};

export const assistantTools = { ...browserTools, ...approvalTool };

export type AssistantUIMessage = UIMessage<never, never, InferUITools<typeof assistantTools>>;

/** A typed tool part from a chat message, e.g. ToolPart<"tool-act">. */
export type ToolPart<T extends string> = Extract<AssistantUIMessage["parts"][number], { type: T }>;
