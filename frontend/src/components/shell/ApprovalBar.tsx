import { useState } from "react";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import type { RunState } from "../../hooks/useEventRun";

export function ApprovalBar({
  state,
  approving,
  onApprove,
}: {
  state: RunState;
  approving: boolean;
  onApprove: (decision: "approved" | "rejected", note?: string) => void;
}) {
  const [note, setNote] = useState("");

  if (state.phase !== "complete") return null;

  if (state.overallStatus === "blocked") {
    return (
      <div className="sticky bottom-0 z-30 border-t border-[#d03b3b]/40 bg-[#1a0808] px-6 py-3">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3">
          <Badge tone="critical">Blocked</Badge>
          <span className="text-xs text-body">
            The pipeline blocked before producing outputs — no human approval is required because there is
            nothing to approve. Check the gate reasoning on the Runtime &amp; Gates view.
          </span>
        </div>
      </div>
    );
  }

  if (state.overallStatus === "approved" || state.overallStatus === "rejected") {
    return (
      <div className="sticky bottom-0 z-30 border-t border-hairline bg-surface-elevated px-6 py-3">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3">
          <Badge tone={state.overallStatus === "approved" ? "good" : "critical"}>{state.overallStatus}</Badge>
          <span className="text-xs text-body">
            Decision recorded{state.approvalNote ? `: "${state.approvalNote}"` : "."}
          </span>
        </div>
      </div>
    );
  }

  if (state.overallStatus === "awaiting_approval") {
    return (
      <div className="sticky bottom-0 z-30 border-t border-primary/40 bg-surface-elevated px-6 py-3 shadow-[0_0_5px_0_rgba(0,0,0,0.3)]">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
          <Badge tone="warning">Awaiting Approval</Badge>
          <span className="text-xs font-semibold text-body">
            Nothing is final until a human signs off — approve or reject this run.
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note…"
            className="ml-auto h-9 min-w-[220px] flex-1 rounded-sm border border-hairline-strong bg-surface px-3 text-xs text-ink placeholder:text-stone focus:border-primary focus:outline-none"
          />
          <Button variant="danger" onClick={() => onApprove("rejected", note || undefined)} loading={approving}>
            Reject
          </Button>
          <Button onClick={() => onApprove("approved", note || undefined)} loading={approving}>
            Approve
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
