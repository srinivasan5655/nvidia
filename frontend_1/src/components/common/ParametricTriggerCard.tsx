import { Card, CardHeader } from "./Card";
import { Badge } from "./Badge";
import type { ParametricTriggerResult } from "../../lib/types";

/** Deterministic parametric (index-insurance) trigger status — the
 * objective, auditable trigger a parametric flood policy needs instead of
 * a claims adjuster's opinion. peak_rate/basis are real, measured numbers
 * (the same USGS gauge trend the Forward Risk Forecast uses); tiers and
 * payout percentages are explicitly illustrative — no real contract exists
 * yet (backend/app/decision/parametric_trigger.py). */
export function ParametricTriggerCard({ trigger }: { trigger: ParametricTriggerResult | null }) {
  if (!trigger) return null;
  return (
    <Card corner className={trigger.triggered ? "ring-1 ring-[#fab219]/40" : undefined}>
      <CardHeader
        eyebrow="Insurance · Parametric"
        title="Parametric Trigger Status"
        right={
          <Badge tone={trigger.triggered ? "warning" : "neutral"}>
            {trigger.triggered ? trigger.tier ?? "Triggered" : "Not triggered"}
          </Badge>
        }
      />
      <p className="mb-2 text-sm text-body">
        Peak measured gauge rate: <span className="font-mono font-bold text-ink">{trigger.peak_rate} ft/hr</span>
        {trigger.triggered && trigger.payout_pct_illustrative != null && (
          <>
            {" "}— illustrative payout tier: <span className="font-bold text-ink">{trigger.payout_pct_illustrative}%</span>
          </>
        )}
      </p>
      <ul className="mb-2 flex flex-col gap-1 text-xs text-stone">
        {trigger.basis.map((b, i) => (
          <li key={i} className="font-mono">
            {b}
          </li>
        ))}
      </ul>
      <p className="border-t border-hairline pt-2 text-[10px] text-stone">
        Tiers/payouts are illustrative — no real parametric contract exists yet. peak_rate is a real, measured number
        from the same gauge trend the Forward Risk Forecast uses; nothing here is model-generated.
      </p>
    </Card>
  );
}
