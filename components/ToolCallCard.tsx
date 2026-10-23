"use client";

import type { ToolPart } from "@/lib/tools";

type BrowserToolPart =
  | ToolPart<"tool-navigate">
  | ToolPart<"tool-observe">
  | ToolPart<"tool-act">
  | ToolPart<"tool-extract">
  | ToolPart<"tool-screenshot">;

/**
 * One Stagehand call. On stream, this is where viewers see the agent's plan turn
 * into Stagehand primitives: navigate → observe → act → extract.
 */
export function ToolCallCard({ part }: { part: BrowserToolPart }) {
  const name = part.type.replace("tool-", "");
  const running = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error" || (part.type === "tool-act" && part.output?.success === false);

  return (
    <details className={`tool tool-${name}`} open={name === "extract" || name === "screenshot"}>
      <summary>
        <span className="tool-name">{name}</span>
        <span className="tool-meta">{summarize(part)}</span>
        <span className={`tool-status ${running ? "running" : failed ? "failed" : "done"}`}>
          {running ? "running" : failed ? "failed" : "done"}
        </span>
      </summary>
      <div className="tool-body">{renderBody(part)}</div>
    </details>
  );
}

function summarize(part: BrowserToolPart): string {
  switch (part.type) {
    case "tool-navigate":
      return part.input?.url ?? "";
    case "tool-act":
      return part.input?.instruction ?? part.input?.action?.description ?? "";
    case "tool-observe":
    case "tool-extract":
      return part.input?.instruction ?? "";
    default:
      return "";
  }
}

function renderBody(part: BrowserToolPart) {
  if (part.state === "output-error") return <pre className="result error">{part.errorText}</pre>;
  if (part.state !== "output-available") return null;

  if (part.type === "tool-screenshot") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="shot" alt="Page screenshot" src={`data:${part.output.mimeType};base64,${part.output.data}`} />;
  }
  return <pre className="result">{truncate(JSON.stringify(part.output, null, 2), 2000)}</pre>;
}

function truncate(text: string | undefined, max: number) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more chars)` : text;
}
