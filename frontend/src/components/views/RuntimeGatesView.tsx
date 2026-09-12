import { useEffect, useState } from "react";
import { GatePipeline } from "./runtime/GatePipeline";
import { GateDetailPanel } from "./runtime/GateDetailPanel";
import { RuntimePanel } from "./runtime/RuntimePanel";
import { VisionSpecialistCard } from "./runtime/VisionSpecialistCard";
import { AuditTrail } from "./runtime/AuditTrail";
import { EmptyState } from "../common/States";
import { useRelayStatus, useRelayTrace } from "../../hooks/useBackend";
import type { RunState } from "../../hooks/useEventRun";
import type { RuntimeConfig } from "../../lib/types";

export function RuntimeGatesView({
  state,
  config,
  onJumpToEvidence,
}: {
  state: RunState;
  config: RuntimeConfig | undefined;
  onJumpToEvidence: (filterEvidenceIds: string[]) => void;
}) {
  const [selectedGate, setSelectedGate] = useState<string | null>(null);
  const relayEnabled = !!config?.relay_enabled;
  const { data: relayStatus } = useRelayStatus(relayEnabled && state.phase === "complete");
  const { data: relayTrace } = useRelayTrace(relayEnabled && state.phase === "complete");

  useEffect(() => {
    if (state.gates.length > 0 && !selectedGate) {
      setSelectedGate(state.gates[state.gates.length - 1].gate_name);
    }
  }, [state.gates, selectedGate]);

  if (state.phase === "idle") {
    return (
      <EmptyState
        title="No event running"
        body='Click "Run Houston Event" to execute the evidence-to-decision pipeline and watch each gate resolve live.'
      />
    );
  }

  const active = state.gates.find((g) => g.gate_name === selectedGate) ?? state.gates[state.gates.length - 1];
  const openshellGate = state.gates.find((g) => g.gate_name === "openshell_supervisor");

  return (
    <div className="flex flex-col gap-4">
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

      <AuditTrail status={relayStatus} records={relayTrace} />
    </div>
  );
}
