import clsx from "clsx";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import type { RuntimeConfig } from "../../lib/types";
import type { RunPhase } from "../../hooks/useEventRun";

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
    <div
      className="flex items-center rounded-sm border border-hairline-strong"
      title={
        value === "live"
          ? "Live mode calls real public APIs (NWS/USGS/HCFCD/CDC-SVI/Overpass). TranStar is typically unreachable without coordinated access and falls back to its fixture — honestly labeled either way."
          : "Replay mode reads committed fixture data for every source."
      }
    >
      {(["replay", "live"] as const).map((mode) => (
        <button
          key={mode}
          disabled={disabled}
          onClick={() => onChange(mode)}
          className={clsx(
            "px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            value === mode ? "bg-primary text-on-primary" : "bg-transparent text-mute hover:text-body",
            mode === "replay" ? "rounded-l-sm" : "rounded-r-sm",
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

export function CommandBar({
  config,
  eventLabel,
  windowStart,
  windowEnd,
  phase,
  evidenceMode,
  onEvidenceModeChange,
  onRun,
}: {
  config: RuntimeConfig | undefined;
  eventLabel: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  phase: RunPhase;
  evidenceMode: "replay" | "live";
  onEvidenceModeChange: (mode: "replay" | "live") => void;
  onRun: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 bg-primary" />
            <span className="text-lg font-extrabold tracking-tight text-ink">LifeShield AI</span>
          </div>
          <div className="hidden h-6 w-px bg-hairline-strong sm:block" />
          <div className="hidden flex-col sm:flex">
            <span className="text-[10px] font-bold uppercase tracking-widest text-mute">
              Operations / Houston, TX
            </span>
            <span className="text-xs font-semibold text-body">
              {eventLabel ?? "No event loaded"}
              {windowStart && windowEnd && (
                <span className="ml-2 font-mono text-stone">
                  {new Date(windowStart).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {" → "}
                  {new Date(windowEnd).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EvidenceModeToggle value={evidenceMode} onChange={onEvidenceModeChange} disabled={phase === "streaming"} />
          {config && (
            <>
              <Badge tone="info">{config.runtime_target}</Badge>
              <Badge tone={config.relay_enabled ? "good" : "neutral"} dot={config.relay_enabled ? "#0ca30c" : undefined}>
                Relay {config.relay_enabled ? "On" : "Off"}
              </Badge>
              <Badge tone={config.openshell_enabled ? "primary" : "neutral"}>
                {config.openshell_enabled ? "Sandboxed" : "In-process"}
              </Badge>
              <Badge tone="neutral">Gate min {config.confidence_gate_min.toFixed(2)}</Badge>
            </>
          )}
          <Button onClick={onRun} loading={phase === "streaming"} className="ml-1">
            {phase === "streaming" ? "Running…" : `Run Houston Event${evidenceMode === "live" ? " (Live)" : ""}`}
          </Button>
        </div>
      </div>
    </header>
  );
}
