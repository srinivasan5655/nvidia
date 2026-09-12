import { Card, CardHeader } from "../../common/Card";
import { Badge } from "../../common/Badge";
import { EmptyState } from "../../common/States";
import type { EvacuationPlan } from "../../../lib/types";

export function EvacuationPlanCard({ plan }: { plan: EvacuationPlan | null }) {
  if (!plan) {
    return (
      <Card>
        <CardHeader eyebrow="Evacuation Planning" title="Routes & Shelters" />
        <EmptyState
          title="No evacuation plan for this run"
          body="No candidate shelter sites (OpenStreetMap community-center/social-facility nodes) were found in the event footprint."
        />
      </Card>
    );
  }

  return (
    <Card corner>
      <CardHeader
        eyebrow="Evacuation Planning"
        title={`${plan.routes.length} Candidate Route${plan.routes.length === 1 ? "" : "s"}`}
        right={
          <Badge tone={plan.routes.every((r) => r.routed_live) ? "good" : "warning"}>
            {plan.routes.every((r) => r.routed_live) ? "OSRM Live" : "Partial straight-line estimate"}
          </Badge>
        }
      />
      <p className="mb-2 text-xs text-stone">
        Origin: <span className="text-body">{plan.origin_basis}</span>
      </p>

      <div className="mb-4 flex items-start gap-2 rounded-sm border border-hairline bg-surface p-3">
        <Badge tone={plan.agent_harness === "deepagents" ? "primary" : "neutral"}>
          {plan.agent_harness === "deepagents" ? "Evacuation Agent (DeepAgents)" : "Direct calculation"}
        </Badge>
        <p className="flex-1 text-xs text-body">
          {plan.narrative || "The Evacuation Agent's DeepAgents call fell back this run — routes below are still the same deterministic OSRM routing, just without an agent-authored dispatcher summary."}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {plan.routes.map((r, i) => (
          <div key={r.shelter_item_id} className="rounded-sm border border-hairline bg-surface p-3">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary">
                  {i + 1}
                </span>
                <span className="text-sm font-bold text-ink">{r.shelter_name}</span>
              </div>
              {!r.routed_live && <Badge tone="warning">Straight-line est.</Badge>}
            </div>
            <div className="flex gap-4 text-xs text-stone">
              <span>
                <span className="font-mono font-bold text-body">{r.distance_km}</span> km
              </span>
              <span>
                <span className="font-mono font-bold text-body">{r.duration_min}</span> min
              </span>
            </div>
            {r.closure_warnings.length > 0 && (
              <div className="mt-2 rounded-sm border border-[#fab219]/40 bg-[#fab219]/10 px-2 py-1.5 text-xs text-[#fab219]">
                Route passes near {r.closure_warnings.length} reported closure(s): {r.closure_warnings[0]}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-hairline pt-3 text-[10px] text-stone">
        Shelter sites are real OpenStreetMap community-center/social-facility nodes — not an official
        designated-shelter registry. Routes never reroute around closures, only flag proximity.
      </p>
      <blockquote className="mt-3 border-l-2 border-primary pl-3 text-xs italic text-body">
        {plan.methodology}
      </blockquote>
    </Card>
  );
}
