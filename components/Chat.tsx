"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useEffect, useRef, useState } from "react";
import type { AssistantUIMessage } from "@/lib/tools";
import { ApprovalCard } from "./ApprovalCard";
import { ToolCallCard } from "./ToolCallCard";

const SUGGESTIONS = [
  "What are the top 3 stories on Hacker News right now, and what's the vibe in their comments?",
  "Find a round-trip flight SFO → JFK leaving next Friday, back Sunday, under $400 on Google Flights. Give me the 3 best options.",
  "On saucedemo.com (user standard_user, password secret_sauce), buy the Sauce Labs Backpack and ship it to Ada Lovelace, 94107.",
  "Star the browserbase/stagehand repository on GitHub for me.",
];

export function Chat({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, stop, error, addToolApprovalResponse } =
    useChat<AssistantUIMessage>({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
      // After the user answers an approval card, automatically resume the agent loop.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    onBusyChange(busy);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  function submit(text: string) {
    if (!text.trim() || busy) return;
    void sendMessage({ text });
    setInput("");
  }

  return (
    <div className="chat">
      <header className="pane-header">
        <div>
          <h2>Assistant</h2>
          <p className="muted">Asks before anything irreversible</p>
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="welcome">
            <p className="eyebrow">Your web assistant · Live browser · Human in the loop</p>
            <h1>
              Your errands. <em>Done on the web.</em>
            </h1>
            <p className="lede">Tell me what to get done. Watch me do it on the right, and approve before anything irreversible.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggestion" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.parts.map((part, i) => {
              const key = `${message.id}-${i}`;
              switch (part.type) {
                case "text":
                  return (
                    <div key={key} className="bubble">
                      {part.text}
                    </div>
                  );
                case "tool-request_approval":
                  return (
                    <ApprovalCard
                      key={key}
                      part={part}
                      onRespond={(approved) =>
                        part.approval && addToolApprovalResponse({ id: part.approval.id, approved })
                      }
                    />
                  );
                case "tool-navigate":
                case "tool-observe":
                case "tool-act":
                case "tool-extract":
                case "tool-screenshot":
                  return <ToolCallCard key={key} part={part} />;
                default:
                  return null;
              }
            })}
          </div>
        ))}

        {status === "submitted" && <div className="thinking">Thinking…</div>}
        {error && <div className="error">Something went wrong: {error.message}</div>}
        <div ref={bottomRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <textarea
          value={input}
          placeholder="Book, buy, find, compare… what should I do?"
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
        />
        {busy ? (
          <button type="button" className="ghost" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}
