import { RelayObservability } from "./runtime/RelayObservability";
import { EmptyState } from "../common/States";
import { Badge } from "../common/Badge";
import { useRelayStatus, useRelayTrace } from "../../hooks/useBackend";
import type { RunState } from "../../hooks/useEventRun";
import type { RuntimeConfig } from "../../lib/types";

/** Dedicated top-level page for NeMo Relay observability — total tokens,
 * per-model breakdown, and the chronological agent activity log. Was
 * previously buried at the bottom of the Agentic Runtime page; promoted to
 * its own sidebar tab since the whole point of the dashboard is that an
 * operator can check it independent of walking the gate pipeline. */
export function ObservabilityView({ state, config }: { state: RunState; config: RuntimeConfig | undefined }) {
  const relayEnabled = !!config?.relay_enabled;
  const ready = relayEnabled && state.phase === "complete";
  const { data: relayStatus } = useRelayStatus(ready);
  const { data: relayTrace } = useRelayTrace(ready);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Observability</h1>
          <p className="text-sm text-stone">
            NeMo Relay's governed-scope trace for the current event — real token usage per LLM call and every
            agent/tool/guardrail invocation, in order.
          </p>
        </div>
        <div className="ml-auto">
          <Badge
            tone={relayEnabled ? "good" : "neutral"}
            dot={relayEnabled ? "#0ca30c" : undefined}
            className={relayEnabled ? "animate-nvidia-glow" : undefined}
          >
            Relay {relayEnabled ? "On" : "Off"}
          </Badge>
        </div>
      </div>

      {state.phase === "idle" || state.phase === "streaming" ? (
        <EmptyState
          title={state.phase === "idle" ? "No event running" : "Event in progress"}
          body={
            state.phase === "idle"
              ? 'Go to Home and press "Check Now" to execute the pipeline — this dashboard populates once it completes.'
              : "This dashboard populates once the pipeline finishes running."
          }
        />
      ) : (
        <RelayObservability status={relayStatus} records={relayTrace} />
      )}
    </div>
  );
}
