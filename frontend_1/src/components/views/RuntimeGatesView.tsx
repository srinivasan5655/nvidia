import { useEffect, useState } from "react";
import clsx from "clsx";
import { GatePipeline } from "./runtime/GatePipeline";
import { GateDetailPanel } from "./runtime/GateDetailPanel";
import { RuntimePanel } from "./runtime/RuntimePanel";
import { VisionSpecialistCard } from "./runtime/VisionSpecialistCard";
import { EmptyState } from "../common/States";
import { Badge } from "../common/Badge";
import { useRelayTrace } from "../../hooks/useBackend";
import type { RunState } from "../../hooks/useEventRun";
import type { RuntimeConfig } from "../../lib/types";

function EvidenceModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: "replay" | "live";
  onChange: (mode: "replay" | "live") => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center rounded-xl border border-hairline-strong p-0.5">
      {(["replay", "live"] as const).map((mode) => (
        <button
          key={mode}
          disabled={disabled}
          onClick={() => onChange(mode)}
          className={clsx(
            "rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            value === mode ? "bg-primary text-on-primary" : "bg-transparent text-mute hover:text-body",
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

export function RuntimeGatesView({
  state,
  config,
  evidenceMode,
  onEvidenceModeChange,
  onJumpToEvidence,
}: {
  state: RunState;
  config: RuntimeConfig | undefined;
  evidenceMode: "replay" | "live";
  onEvidenceModeChange: (mode: "replay" | "live") => void;
  onJumpToEvidence: (filterEvidenceIds: string[]) => void;
}) {
  const [selectedGate, setSelectedGate] = useState<string | null>(null);
  const relayEnabled = !!config?.relay_enabled;
  const { data: relayTrace } = useRelayTrace(relayEnabled && state.phase === "complete");

  useEffect(() => {
    if (state.gates.length > 0 && !selectedGate) {
      setSelectedGate(state.gates[state.gates.length - 1].gate_name);
    }
  }, [state.gates, selectedGate]);

  const active = state.gates.find((g) => g.gate_name === selectedGate) ?? state.gates[state.gates.length - 1];
  const openshellGate = state.gates.find((g) => g.gate_name === "openshell_supervisor");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Agentic Runtime</h1>
          <p className="text-sm text-stone">
            Four agents every event passes through — three deterministic checks, plus one AI-powered vision
            specialist (Agent 3).
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-mute">Evidence source</span>
          <EvidenceModeToggle value={evidenceMode} onChange={onEvidenceModeChange} disabled={state.phase === "streaming"} />
          {config && (
            <>
              <Badge tone="info">{config.runtime_target}</Badge>
              <Badge tone={config.relay_enabled ? "good" : "neutral"} dot={config.relay_enabled ? "#0ca30c" : undefined}>
                Relay {config.relay_enabled ? "On" : "Off"}
              </Badge>
              <Badge tone={config.openshell_enabled ? "primary" : "neutral"}>
                {config.openshell_enabled ? "Sandboxed" : "In-process"}
              </Badge>
            </>
          )}
        </div>
      </div>

      {state.phase === "idle" ? (
        <EmptyState
          title="No event running"
          body='Go to Home and press "Check Now" to execute the evidence-to-decision pipeline and watch each gate resolve live.'
        />
      ) : (
        <>
          <GatePipeline
            gates={state.gates}
            streaming={state.phase === "streaming"}
            onSelectGate={setSelectedGate}
            activeGate={selectedGate}
          />

          {active && (
            <GateDetailPanel
              gate={active}
              evidenceCountLabel={`View ${active.evidence_used.length} cited evidence item(s)`}
              onViewEvidence={() => onJumpToEvidence(active.evidence_used)}
            />
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <RuntimePanel
              config={config}
              currentEventId={state.event?.event_id ?? null}
              relayRecords={relayTrace}
              lifeSafety={state.lifeSafety}
            />
            <VisionSpecialistCard gate={openshellGate} />
          </div>
        </>
      )}
    </div>
  );
}
