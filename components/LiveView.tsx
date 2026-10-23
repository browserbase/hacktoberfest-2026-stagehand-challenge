"use client";

import { useCallback, useEffect, useState } from "react";

type SessionInfo = {
  sessionId: string;
  pageId: string;
  liveViewUrl: string;
  dashboardUrl: string;
  usesContext: boolean;
};

export function LiveView({ agentBusy }: { agentBusy: boolean }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    const res = await fetch("/api/session");
    const next: SessionInfo | null = await res.json();
    // Only swap the iframe when the agent moved to another tab; a new URL for the
    // same tab would needlessly reload the live view.
    setSession((prev) =>
      prev && next && prev.sessionId === next.sessionId && prev.pageId === next.pageId ? prev : next,
    );
  }, []);

  // While the agent works, follow it: the browser launches lazily and may open new tabs.
  useEffect(() => {
    void refresh();
    if (!agentBusy) return;
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [agentBusy, refresh]);

  async function start() {
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/session", { method: "POST" });
    const body = await res.json();
    if (res.ok) setSession(body);
    else setError(body.error);
    setBusy(false);
  }

  async function release() {
    setBusy(true);
    await fetch("/api/session", { method: "DELETE" });
    setSession(null);
    setBusy(false);
  }

  return (
    <div className="liveview">
      <header className="pane-header">
        <div>
          <h2>Browser</h2>
          <p className="muted">
            {session ? (
              <>
                {agentBusy && <span className="live-dot" aria-label="Agent working" />}
                Browserbase session{" "}
                <a href={session.dashboardUrl} target="_blank" rel="noreferrer">
                  {session.sessionId.slice(0, 8)}
                </a>
                {session.usesContext ? " · signed in (context)" : " · not signed in"}
              </>
            ) : (
              "No browser running"
            )}
          </p>
        </div>
        <div className="row">
          {session ? (
            <button className="ghost" onClick={release} disabled={busy}>
              Release session
            </button>
          ) : (
            <button onClick={start} disabled={busy}>
              {busy ? "Starting…" : "Start browser"}
            </button>
          )}
        </div>
      </header>

      <div className="liveview-frame">
        {session ? (
          // The Browserbase live view is interactive: you can take over to log in or solve a prompt.
          <iframe
            key={`${session.sessionId}-${session.pageId}`}
            src={session.liveViewUrl}
            sandbox="allow-same-origin allow-scripts allow-forms"
            allow="clipboard-read; clipboard-write"
            title="Browserbase live view"
          />
        ) : (
          <div className="empty">
            {error ? <p className="error">{error}</p> : <p>The live browser appears here once the assistant starts working.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
