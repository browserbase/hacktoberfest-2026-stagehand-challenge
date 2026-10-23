import Browserbase from "@browserbasehq/sdk";
import { browserbase, Stagehand, type Page, type StagehandBrowser } from "@browserbasehq/stagehand";

/**
 * One live Browserbase browser, driven with Stagehand v4.
 *
 *   browserbase.launch()  -> a remote Chrome on Browserbase (+ the Stagehand extension)
 *   Stagehand.create()    -> the Stagehand v4 client: act / observe / extract
 *
 * This is a single-user demo, so there is exactly one session per server process.
 */
export type BrowserSession = {
  browser: StagehandBrowser;
  stagehand: Stagehand;
  sessionId: string;
  /** The tab the live view showed at launch (the agent's first page). */
  initialLiveView: LiveView;
  usesContext: boolean;
};

export type LiveView = { pageId: string; url: string };

// Cached on globalThis so `next dev` hot reloads don't leak browsers.
const state = globalThis as typeof globalThis & {
  __browserSession?: BrowserSession;
  __browserSessionPending?: Promise<BrowserSession>;
};

const bb = () => new Browserbase({ apiKey: requireEnv("BROWSERBASE_API_KEY") });

export async function getSession(): Promise<BrowserSession> {
  const current = state.__browserSession;
  if (current && !current.browser.closed) return current;
  state.__browserSession = undefined;

  state.__browserSessionPending ??= launchSession().finally(() => {
    state.__browserSessionPending = undefined;
  });
  state.__browserSession = await state.__browserSessionPending;
  return state.__browserSession;
}

/** The current session, without launching one. */
export function peekSession(): BrowserSession | undefined {
  return state.__browserSession;
}

async function launchSession(): Promise<BrowserSession> {
  const contextId = process.env.BROWSERBASE_CONTEXT_ID || undefined;

  // 1. A remote browser on Browserbase. The context (if any) carries the user's cookies,
  //    which is what lets the assistant act "as you" on logged-in sites.
  const browser = await browserbase.launch({
    apiKey: requireEnv("BROWSERBASE_API_KEY"),
    projectId: process.env.BROWSERBASE_PROJECT_ID || undefined,
    keepAlive: true,
    api_timeout: 30 * 60, // seconds
    browserSettings: {
      viewport: { width: 1280, height: 800 },
      ...(contextId ? { context: { id: contextId, persist: true } } : {}),
    },
    ...(process.env.STAGEHAND_BROWSERBASE_EXTENSION_ID
      ? { extensionId: process.env.STAGEHAND_BROWSERBASE_EXTENSION_ID }
      : {}),
  });

  try {
    // 2. The Stagehand v4 client. act/observe/extract turn natural language into
    //    browser actions and data, so Stagehand needs its own (fast) model.
    const stagehand = await Stagehand.create({ browser, model: stagehandModel() });

    const sessionId = browser.sessionId!;
    // 3. Stagehand doesn't expose a live view, so we ask the Browserbase API for one.
    const { pages } = await bb().sessions.debug(sessionId);

    console.log(`[stagehand] session ${sessionId} ready`);
    return {
      browser,
      stagehand,
      sessionId,
      initialLiveView: { pageId: pages[0].id, url: pages[0].debuggerFullscreenUrl },
      usesContext: Boolean(contextId),
    };
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}

/** The tab the agent is working in (Stagehand acts on the active page by default). */
export async function activePage(session: BrowserSession): Promise<Page> {
  const context = session.browser.context;
  const page = (await context.activePage()) ?? (await context.pages())[0] ?? (await context.newPage());
  await context.setActivePage(page);
  return page;
}

/**
 * The model behind act/observe/extract. With no API key, Stagehand routes calls through
 * the Browserbase Model Gateway, so your Browserbase key is the only key you need.
 * Set STAGEHAND_MODEL_API_KEY to use your own provider key instead.
 */
function stagehandModel() {
  const modelName = (process.env.STAGEHAND_MODEL || "anthropic/claude-haiku-4-5") as `anthropic/${string}`;
  const apiKey = process.env.STAGEHAND_MODEL_API_KEY;
  if (!apiKey) return { modelName };
  return {
    modelName,
    apiKey,
    // With your own key, calls go from the browser extension straight to the provider; Anthropic requires opting in to that.
    ...(modelName.startsWith("anthropic/")
      ? { headers: { "anthropic-dangerous-direct-browser-access": "true" } }
      : {}),
  };
}

/**
 * Live view of the tab the agent is working in. Browserbase gives one URL per tab.
 * The default URL is pinned to one tab, so we follow the most recent real page instead,
 * including tabs the agent opens.
 */
export async function currentLiveView(session: BrowserSession): Promise<LiveView> {
  const { pages } = await bb().sessions.debug(session.sessionId);
  const active = pages.filter((page) => page.url && page.url !== "about:blank").at(-1);
  return active
    ? { pageId: active.id, url: active.debuggerFullscreenUrl }
    : session.initialLiveView;
}

export async function closeSession(): Promise<void> {
  await state.__browserSessionPending?.catch(() => undefined);
  const current = state.__browserSession;
  state.__browserSession = undefined;
  if (!current) return;

  await current.stagehand.close().catch(() => undefined);
  await current.browser.close().catch(() => undefined);
  // keepAlive sessions outlive the CDP connection: release explicitly so we
  // don't pay for an idle browser (and so the context's cookies get persisted).
  await bb()
    .sessions.update(current.sessionId, { status: "REQUEST_RELEASE" })
    .catch(() => undefined);
  console.log(`[stagehand] session ${current.sessionId} released`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env.local and fill it in.`);
  return value;
}
