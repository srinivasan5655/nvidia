import { useMemo, useState } from "react";
import { Card } from "../common/Card";
import { Slider } from "../common/Slider";
import { AiBadge } from "../common/AiBadge";
import { EmptyState } from "../common/States";
import { IconGitBranch } from "../common/Icons";
import { WhatIfMap } from "./whatif/WhatIfMap";
import { WHATIF_SCENARIOS } from "../../lib/whatIf";
import { fmtCurrency } from "../../lib/format";
import type { RunState } from "../../hooks/useEventRun";
import type { CityKey } from "../../lib/types";

function StatTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "primary" | "warning" | "critical" }) {
  const toneClass =
    tone === "primary" ? "text-primary" : tone === "warning" ? "text-[#fab219]" : tone === "critical" ? "text-[#ff6b6b]" : "text-ink";
  return (
    <div className="rounded-xl border border-hairline bg-surface/80 p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-mute">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

export function WhatIfView({ state, city }: { state: RunState; city: CityKey }) {
  const scenario = WHATIF_SCENARIOS[city];
  const [params, setParams] = useState<Record<string, number>>(scenario?.defaultParams ?? {});

  // Reset the sliders whenever the scenario itself changes (switching city)
  // — carrying Chennai's params over to Bangalore's differently-named
  // sliders would silently misapply them.
  const activeScenario = scenario?.id;
  useMemo(() => {
    if (scenario) setParams(scenario.defaultParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenario]);

  const result = useMemo(() => scenario?.simulate(params), [scenario, params]);

  if (!scenario || !result) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-purple/30 to-accent-purple/10 text-accent-purple">
            <IconGitBranch className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">What If</h1>
            <p className="text-sm text-stone">A historical-scenario simulator is available for every monitored city.</p>
          </div>
        </div>
        <EmptyState
          title="No simulator for this city yet"
          body="Switch Monitoring to Houston, Chennai, or Bengaluru in the sidebar to run the historical-event simulator."
        />
        {state.counterfactual && (
          <Card>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold uppercase tracking-wide text-mute">
                Counterfactual for your last check ({state.event?.city_label})
              </div>
              <AiBadge model={state.counterfactual.model_used} services={["NIM", "Switchyard", "Relay"]} />
            </div>
            <p className="text-base leading-relaxed text-body">{state.counterfactual.narrative}</p>
          </Card>
        )}
      </div>
    );
  }

  const set = (key: string, v: number) => setParams((p) => ({ ...p, [key]: v }));
  const reset = () => setParams(scenario.defaultParams);
  const severityTone = result.severityIndex >= 1.8 ? "critical" : result.severityIndex >= 1.3 ? "warning" : "primary";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-purple/30 to-accent-purple/10 text-accent-purple">
          <IconGitBranch className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">What If — {scenario.title}</h1>
          <p className="text-sm text-stone">{scenario.subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <WhatIfMap key={scenario.id} scenario={scenario} result={result} />

        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold uppercase tracking-wide text-mute">Simulation Controls</div>
              <button onClick={reset} className="text-[11px] font-bold uppercase tracking-wide text-primary hover:underline">
                Reset
              </button>
            </div>
            {scenario.sliders.map((s) => (
              <Slider
                key={s.key}
                label={s.label}
                value={params[s.key] ?? 0}
                min={s.min}
                max={s.max}
                step={s.step}
                unit={s.unit}
                onChange={(v) => set(s.key, v)}
              />
            ))}
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Severity Index" value={result.severityIndex.toFixed(2) + "×"} tone={severityTone} />
            <StatTile
              label="Vs. historical"
              value={`${result.exposureDeltaPct >= 0 ? "+" : ""}${result.exposureDeltaPct}%`}
              tone={severityTone}
            />
            <StatTile label="Estimated exposure" value={fmtCurrency(result.estimatedExposureUsd)} />
            <StatTile label="People affected" value={result.estimatedAffectedPopulation.toLocaleString()} />
          </div>

          <Card>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-mute">Scenario summary</div>
            <p className="text-sm leading-relaxed text-body">{result.narrative}</p>
            <p className="mt-3 border-t border-hairline pt-2 text-[10px] text-stone">
              Illustrative deterministic model, not a calibrated storm-surge or hydrological simulation — every
              number above is computed from the sliders, never generated by a model.
            </p>
          </Card>
        </div>
      </div>

      {state.counterfactual && state.event?.city === city && (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-bold uppercase tracking-wide text-mute">
              Counterfactual for your last check ({state.event.city_label})
            </div>
            <AiBadge model={state.counterfactual.model_used} services={["NIM", "Switchyard", "Relay"]} />
          </div>
          <p className="text-base leading-relaxed text-body">{state.counterfactual.narrative}</p>
        </Card>
      )}
    </div>
  );
}
