// Sign in to your accounts once, inside a Browserbase *context*. The context keeps
// the cookies, so later assistant sessions launched with BROWSERBASE_CONTEXT_ID are
// already logged in, and you never hand the agent your password.
//   pnpm login
import Browserbase from "@browserbasehq/sdk";
import { createInterface } from "node:readline/promises";

const apiKey = process.env.BROWSERBASE_API_KEY;
if (!apiKey) throw new Error("Missing BROWSERBASE_API_KEY (.env.local)");
const bb = new Browserbase({ apiKey });

let contextId = process.env.BROWSERBASE_CONTEXT_ID;
if (!contextId) {
  const context = await bb.contexts.create({ name: "errand-demo", projectId: process.env.BROWSERBASE_PROJECT_ID });
  contextId = context.id;
  console.log(`Created context ${contextId}. Add this to .env.local:\n\n  BROWSERBASE_CONTEXT_ID=${contextId}\n`);
}

const session = await bb.sessions.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  keepAlive: true,
  browserSettings: { context: { id: contextId, persist: true }, viewport: { width: 1280, height: 800 } },
});
const { debuggerFullscreenUrl } = await bb.sessions.debug(session.id);

console.log("Open this live view and sign in to the sites you want the assistant to use (GitHub, Gmail, …):\n");
console.log(`  ${debuggerFullscreenUrl}\n`);
console.log("Tip: open a new tab in the live view toolbar and go to e.g. https://github.com/login");

const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question("Press Enter when you're done to save the cookies… ");
rl.close();

// Releasing the session is what persists the context.
await bb.sessions.update(session.id, { status: "REQUEST_RELEASE" });
console.log(`Saved. Sessions launched with BROWSERBASE_CONTEXT_ID=${contextId} are now signed in.`);
