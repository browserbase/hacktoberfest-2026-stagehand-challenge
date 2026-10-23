"use client";

import type { ToolPart } from "@/lib/tools";

export function ApprovalCard({
  part,
  onRespond,
}: {
  part: ToolPart<"tool-request_approval">;
  onRespond: (approved: boolean) => void;
}) {
  if (!part.input) return null;
  const { action, details } = part.input;

  const status =
    part.state === "approval-requested"
      ? "pending"
      : part.state === "output-denied" || (part.state === "approval-responded" && !part.approval.approved)
        ? "denied"
        : "approved";

  return (
    <div className={`approval approval-${status}`}>
      <div className="approval-label">
        {status === "pending" ? "Needs your approval" : status === "denied" ? "Denied" : "Approved"}
      </div>
      <div className="approval-action">{action}</div>
      {details && <p className="approval-details">{details}</p>}
      {status === "pending" && (
        <div className="row">
          <button className="approve" onClick={() => onRespond(true)}>Approve</button>
          <button className="deny" onClick={() => onRespond(false)}>
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
