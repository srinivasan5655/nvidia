import { Card, CardHeader } from "./Card";
import type { ResourceDispatchPlan } from "../../lib/types";

/** Resource Dispatch Priority — a different question from the Evacuation
 * Plan above it: not "where should someone evacuate to" but "which
 * shelter should a duty officer staff/resupply FIRST." Deterministic math
 * only (backend/app/decision/resource_dispatch.py) — no model involved,
 * and capacity is explicitly labeled illustrative, never presented as a
 * measured figure. */
export function ResourceDispatchCard({ plan }: { plan: ResourceDispatchPlan | null }) {
  if (!plan || plan.shelters.length === 0) return null;
  return (
    <Card>
      <CardHeader eyebrow="Government · Dispatch" title="Resource Dispatch Priority" />
      <p className="mb-3 text-xs text-stone">
        Which shelter to staff/resupply first — ranked by illustrative capacity × local vulnerability ÷ distance, not
        by nearest-first like the evacuation routes above. No model involved; see methodology below.
      </p>
      <div className="flex flex-col gap-2">
        {plan.shelters.map((s) => (
          <div
            key={s.shelter_item_id}
            className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface/80 p-3"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-bold text-primary">
                {s.rank}
              </span>
              <div>
                <div className="text-sm font-bold text-ink">{s.shelter_name}</div>
                <div className="text-[11px] text-stone">
                  {s.distance_km} km · capacity ~{s.capacity_illustrative} (illustrative)
                </div>
              </div>
            </div>
            <span className="font-mono text-sm font-bold text-primary">{s.priority_score}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-hairline pt-2 text-[10px] text-stone">{plan.methodology}</p>
    </Card>
  );
}
