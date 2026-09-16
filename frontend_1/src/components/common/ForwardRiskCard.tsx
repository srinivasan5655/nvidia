import { Card, CardHeader } from "./Card";
import { AiBadge } from "./AiBadge";
import { FloodWave } from "./FloodWave";
import { IconGauge } from "./Icons";
import type { ForwardRiskForecast } from "../../lib/types";

/** Recommendation #2 from the jury critique this session took seriously:
 * every other AI surface in this app narrates the CURRENT instant — this
 * is the one that projects forward. `trend_basis` is real, deterministic
 * arithmetic over the same USGS gauge readings already in the evidence
 * bundle (see backend/app/decision/forecast.py); only the three horizon
 * narratives below are model-written, and the model is explicitly
 * forbidden from inventing a new number. */
export function ForwardRiskCard({ forecast }: { forecast: ForwardRiskForecast | null }) {
  if (!forecast) return null;
  const degraded = forecast.model_used === "none";
  const rising = forecast.trend_basis.some((f) => f.toLowerCase().includes("rising"));

  return (
    <Card>
      <CardHeader
        eyebrow="Where this is going"
        title="Forward risk forecast"
        right={!degraded && <AiBadge model={forecast.model_used} services={["NIM", "Switchyard"]} />}
      />
      {rising && <FloodWave height={20} tone="warning" className="-mx-6 -mt-1 mb-3" />}
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-hairline bg-surface/80 p-3 text-xs text-stone">
        <IconGauge className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="flex flex-col gap-1">
          <span className="font-bold uppercase tracking-wide text-mute">Deterministic trend (not AI)</span>
          {forecast.trend_basis.map((fact, i) => (
            <span key={i} className="font-mono text-body">
              {fact}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {forecast.horizons.map((h) => (
          <div key={h.label} className="rounded-xl border border-hairline-strong bg-surface/60 p-3">
            <div className="mb-1 font-mono text-xs font-bold text-primary">{h.label}</div>
            <p className="text-sm text-body">{h.narrative}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
