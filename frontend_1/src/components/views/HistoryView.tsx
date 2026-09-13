import { Card } from "../common/Card";
import { EmptyState } from "../common/States";
import { IconHistory } from "../common/Icons";
import { fmtDateTime } from "../../lib/format";
import type { RunState } from "../../hooks/useEventRun";
import type { ViewId } from "../../App";

export function HistoryView({ state, onNavigate }: { state: RunState; onNavigate: (v: ViewId) => void }) {
  if (state.phase === "idle" || !state.event) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState title="Nothing checked yet" body='Go to Home and press "Check Now" to run your first check.' />
      </div>
    );
  }

  const decided = state.overallStatus === "approved" || state.overallStatus === "rejected";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green-pale/30 to-primary/20 text-primary">
          <IconHistory className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">History</h1>
          <p className="text-sm text-stone">What you checked and decided today.</p>
        </div>
      </div>

      <Card>
        <div className="mb-2 text-sm font-bold uppercase tracking-wide text-mute">{fmtDateTime(state.event.created_at)}</div>
        <p className="text-lg text-ink">
          You checked <span className="font-bold">{state.event.label}</span>.
        </p>

        {state.overallStatus === "blocked" && (
          <p className="mt-3 text-base text-[#ff8a8a]">
            The check could not confirm the danger well enough, so no recommendation was made.
          </p>
        )}

        {!decided && state.overallStatus === "awaiting_approval" && (
          <p className="mt-3 text-base text-stone">Still waiting on your decision — go to Home to confirm.</p>
        )}

        {decided && (
          <p className="mt-3 text-base text-body">
            You <span className="font-bold text-ink">{state.overallStatus}</span> this warning
            {state.approvalNote ? `, with the note: "${state.approvalNote}"` : "."}
          </p>
        )}
      </Card>

      <p className="text-sm text-stone">
        Looking for the full technical record?{" "}
        <button onClick={() => onNavigate("runtime")} className="font-bold text-primary underline underline-offset-2">
          Open Agentic Runtime
        </button>
        .
      </p>
    </div>
  );
}
