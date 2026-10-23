"use client";

import { useState } from "react";
import { Chat } from "@/components/Chat";
import { LiveView } from "@/components/LiveView";

export default function Home() {
  // The live view follows the agent while it works (new session, new tabs).
  const [agentBusy, setAgentBusy] = useState(false);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="wordmark">
          ERRAND<span className="wordmark-badge">26</span>
        </div>
        <nav className="topbar-meta">
          <span>Stagehand v4</span>
          <span>×</span>
          <span>Browserbase</span>
          <span className="topbar-tag">Hacktoberfest</span>
        </nav>
      </header>
      <main className="app">
        <section className="pane chat-pane">
          <Chat onBusyChange={setAgentBusy} />
        </section>
        <section className="pane browser-pane">
          <LiveView agentBusy={agentBusy} />
        </section>
      </main>
    </div>
  );
}
