import { Card, CardHeader } from "../common/Card";
import { Badge } from "../common/Badge";
import { AiBadge } from "../common/AiBadge";
import { ConfidenceBar } from "../common/ConfidenceBar";
import { EmptyState } from "../common/States";
import { GATE_LABELS } from "../../lib/format";
import type { RunState } from "../../hooks/useEventRun";

/** Guidance confidence is `min(gate confidences)` on the backend (see
 * life_safety.py) — never its own number, so its explanation is always
 * "which gate set the ceiling," not a synthesized reason of its own. */
function confidenceReasoning(state: RunState): string | undefined {
  if (state.gates.length === 0) return undefined;
  const limiting = state.gates.reduce((min, g) => (g.confidence < min.confidence ? g : min));
  const label = GATE_LABELS[limiting.gate_name] ?? limiting.gate_name;
  return `Capped by the ${label} gate (${Math.round(limiting.confidence * 100)}%): ${limiting.reasoning}`;
}

export function LifeSafetyView({
  state,
  onJumpToEvidence,
}: {
  state: RunState;
  onJumpToEvidence: (ids: string[]) => void;
}) {
  const ls = state.lifeSafety;

  if (state.phase === "idle") {
    return <EmptyState title="No guidance yet" body="Life-safety guidance is synthesized after all four gates resolve." />;
  }

  if (state.overallStatus === "blocked") {
    return (
      <EmptyState
        title="Pipeline blocked before life-safety synthesis"
        body="Check the Agentic Runtime view for which agent blocked and why — no guidance is produced downstream of a block."
      />
    );
  }

  if (!ls) {
    return <EmptyState title="Awaiting life-safety synthesis…" />;
  }

  const isDegraded = ls.headline.startsWith("[LLM unavailable]");

  return (
    <div className="flex flex-col gap-4">
      {isDegraded && (
        <div className="rounded-sm border border-[#fab219]/40 bg-[#fab219]/10 px-4 py-3 text-xs text-[#fab219]">
          <strong>Model offline — evidence-only fallback.</strong> The NIM reasoning call did not succeed for this
          run, so the guidance below is the raw evidence summaries rather than a synthesized narrative. This is the
          backend's honest degraded path, not an application error.
        </div>
      )}

      <Card corner>
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-wider text-mute">Headline Guidance</div>
          {!isDegraded && ls.model_used && (
            <div className="flex flex-wrap items-center gap-1.5">
              <AiBadge />
              <Badge tone={ls.agent_harness === "deepagents" ? "primary" : "neutral"}>
                {ls.agent_harness === "deepagents" ? "Hazard Agent" : "Direct call"}
              </Badge>
              <Badge tone={ls.reasoning_effort === "high" ? "primary" : "info"}>
                {ls.reasoning_effort} effort
              </Badge>
              <span className="font-mono text-[10px] text-stone">{ls.model_used}</span>
            </div>
          )}
        </div>
        <h2 className="mb-3 text-2xl font-extrabold leading-tight text-ink">
          {isDegraded ? ls.headline.replace("[LLM unavailable] ", "") : ls.headline}
        </h2>
        <p className="mb-4 text-sm text-body">
          {isDegraded ? ls.hazard_narrative.replace(/^\[LLM unavailable:.*?\]\s*/, "") : ls.hazard_narrative}
        </p>
        <div className="max-w-sm">
          <ConfidenceBar value={ls.confidence} label="Guidance confidence" reasoning={confidenceReasoning(state)} />
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Recommended Actions" title={`${ls.guidance_points.length} guidance point(s)`} />
        <ol className="flex flex-col gap-2">
          {ls.guidance_points.map((point, i) => (
            <li key={i} className="flex gap-3 rounded-sm border border-hairline bg-surface p-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                {i + 1}
              </span>
              <span className="text-body">{point}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader eyebrow="Provenance" title="Citing Evidence" />
        <div className="flex flex-wrap gap-1.5">
          {ls.citing_evidence.map((id) => (
            <button key={id} onClick={() => onJumpToEvidence([id])}>
              <Badge tone="neutral" className="cursor-pointer hover:border-primary hover:text-primary">
                {id}
              </Badge>
            </button>
          ))}
        </div>
        <button onClick={() => onJumpToEvidence(ls.citing_evidence)} className="mt-3 text-xs text-primary hover:underline">
          View all {ls.citing_evidence.length} in evidence table →
        </button>
      </Card>
    </div>
  );
}
