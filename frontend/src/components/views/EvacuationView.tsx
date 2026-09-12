import { TacticalMap } from "../map/TacticalMap";
import { EvacuationPlanCard } from "./evacuation/EvacuationPlanCard";
import { EmptyState } from "../common/States";
import type { RunState } from "../../hooks/useEventRun";

export function EvacuationView({ state }: { state: RunState }) {
  const event = state.event;

  if (!event) {
    return (
      <EmptyState
        title="No event loaded"
        body='Click "Run Houston Event" to assemble evidence and compute an evacuation plan.'
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TacticalMap
        polygon={event.polygon}
        items={event.items}
        policies={[]}
        alertRing={null}
        evacuationPlan={state.evacuationPlan}
      />
      <EvacuationPlanCard plan={state.evacuationPlan} />
    </div>
  );
}
