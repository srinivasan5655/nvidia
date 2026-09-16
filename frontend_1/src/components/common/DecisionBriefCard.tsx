import { useEffect, useState } from "react";
import { AiBadge } from "./AiBadge";
import { IconSparkle } from "./Icons";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { api } from "../../lib/api";

/** Recommendation #4 from the jury critique this session took seriously:
 * the highest-leverage AI feature this app was missing wasn't more AI
 * elsewhere — it was decision support AT the moment of the approve/reject
 * click, which previously was a bare button with no context attached.
 * This fetches a short brief (backend/app/decision/briefing.py's
 * generate_decision_brief) the moment the approval card renders and shows
 * it directly above the Approve/Reject buttons, not on a separate screen. */
export function DecisionBriefCard({ eventId }: { eventId: string }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "done"; summary: string; modelUsed: string } | { status: "error" }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    api
      .decisionBrief(eventId)
      .then((res) => {
        if (!cancelled) setState({ status: "done", summary: res.summary, modelUsed: res.model_used });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (state.status === "error") return null;

  return (
    <div className="mb-4 rounded-xl border border-intel/30 bg-gradient-to-r from-intel/5 to-intel-violet/5 p-3.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-intel">
          <IconSparkle className="h-3.5 w-3.5" /> Before you decide
        </span>
        {state.status === "done" && state.modelUsed !== "none" && <AiBadge model={state.modelUsed} />}
      </div>
      {state.status === "loading" ? (
        <ThinkingIndicator label="Preparing a decision brief…" />
      ) : (
        <p className="text-sm text-body">{state.summary}</p>
      )}
    </div>
  );
}
