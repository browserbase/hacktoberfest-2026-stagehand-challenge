import {
  closeSession,
  currentLiveView,
  getSession,
  peekSession,
  type BrowserSession,
} from "@/lib/browser-session";

export const runtime = "nodejs";

/** Current session (if any), so the UI can show the live view after a reload. */
export async function GET() {
  const session = peekSession();
  return Response.json(session ? await describe(session) : null);
}

/** Start (or reuse) the browser and return its live view URL. */
export async function POST() {
  try {
    return Response.json(await describe(await getSession()));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** Release the Browserbase session. */
export async function DELETE() {
  await closeSession();
  return Response.json({ ok: true });
}

async function describe(session: BrowserSession) {
  const liveView = await currentLiveView(session).catch(() => session.initialLiveView);
  return {
    sessionId: session.sessionId,
    pageId: liveView.pageId,
    liveViewUrl: liveView.url,
    usesContext: session.usesContext,
    dashboardUrl: `https://browserbase.com/sessions/${session.sessionId}`,
  };
}
