import { TacticalMap } from "../map/TacticalMap";
import { EvacuationPlanCard } from "./evacuation/EvacuationPlanCard";
import { ResourceDispatchCard } from "../common/ResourceDispatchCard";
import { Card } from "../common/Card";
import { EmptyState } from "../common/States";
import { IconMapPin } from "../common/Icons";
import { deriveAlertRing } from "../../lib/geo";
import type { RunState } from "../../hooks/useEventRun";

export function SafePlacesView({ state }: { state: RunState }) {
  if (!state.event) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          title="No map to show yet"
          body='Go to Home and press "Check Now" first — the map will show danger areas and safe places afterward.'
        />
      </div>
    );
  }

  const nearest = state.evacuationPlan?.routes[0];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green-pale/30 to-primary/20 text-primary">
          <IconMapPin className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Map &amp; Safe Places</h1>
          <p className="text-sm text-stone">Where the danger is, and the nearest place to go for safety.</p>
        </div>
      </div>

      {nearest ? (
        <Card corner className="ring-1 ring-primary/40">
          <div className="text-sm font-bold uppercase tracking-wide text-mute">Nearest safe place</div>
          <p className="mt-1 text-xl font-extrabold text-ink">{nearest.shelter_name}</p>
          <p className="mt-1 text-base text-body">
            About <span className="font-bold text-ink">{nearest.distance_km} km</span> away — roughly{" "}
            <span className="font-bold text-ink">{nearest.duration_min} minutes</span> by car.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-stone">
            {state.phase !== "complete" ? "Looking for the nearest shelter…" : "No shelter found nearby."}
          </p>
        </Card>
      )}

      <div className="overflow-hidden rounded-2xl border border-hairline shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]">
        <TacticalMap
          polygon={state.event.polygon}
          items={state.event.items}
          policies={state.insurerExposure?.lines ?? []}
          alertRing={deriveAlertRing(state.event.items)}
          evacuationPlan={state.evacuationPlan}
        />
      </div>

      <EvacuationPlanCard plan={state.evacuationPlan} />
      <ResourceDispatchCard plan={state.resourceDispatch} />
    </div>
  );
}
