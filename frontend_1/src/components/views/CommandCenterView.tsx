import { Card, CardHeader } from "../common/Card";
import { Button } from "../common/Button";
import { Badge, statusTone } from "../common/Badge";
import { AiBadge } from "../common/AiBadge";
import { ReasoningTrace } from "../common/ReasoningTrace";
import { StatTile } from "../common/StatTile";
import { Spinner } from "../common/States";
import { ForwardRiskCard } from "../common/ForwardRiskCard";
import { DecisionBriefCard } from "../common/DecisionBriefCard";
import { AlertTierBadge } from "../common/AlertTierBadge";
import { CapExportButton } from "../common/CapExportButton";
import { AfterActionReportCard } from "../common/AfterActionReportCard";
import { RainOverlay } from "../common/RainOverlay";
import { IconCloudRain, IconMapPin, IconFileText } from "../common/Icons";
import { fmtCurrency, fmtDateTime, GATE_LABELS, distinctCitedSources } from "../../lib/format";
import type { RunState } from "../../hooks/useEventRun";
import type { ViewId } from "../../App";
import type { Persona } from "../../lib/types";

const GATE_ORDER = ["evidence_verifier", "confidence_gate", "openshell_supervisor", "policy_verifier"] as const;

/** The Command Center home — one screen answering the eight standing
 * questions (what/where/how bad/who/next/do/changed/attention) from data
 * the pipeline already returns, reordered and re-emphasized per persona.
 * Same underlying RunState as the guided Home flow; this is the "front
 * door" for Command and Insurance, while Field keeps the original
 * step-by-step flow — see App.tsx for which persona gets which. */
export function CommandCenterView({
  persona,
  state,
  approving,
  onRun,
  onApprove,
  onNavigate,
  cityName,
}: {
  persona: Extract<Persona, "command" | "insurance" | "executive">;
  state: RunState;
  approving: boolean;
  onRun: () => void;
  onApprove: (decision: "approved" | "rejected", note?: string) => void;
  onNavigate: (v: ViewId) => void;
  cityName: string;
}) {
  const isInsurance = persona === "insurance";
  // Executives read the same picture as Command, but never approve/reject
  // here — that decision stays with the duty officer who's actually
  // running the event. Executives get a briefing CTA instead of buttons.
  const canDecide = persona !== "executive";
  const event = state.event;
  const blocked = state.overallStatus === "blocked";
  const gatesDone = state.gates.length >= GATE_ORDER.length;
  const awaiting = state.overallStatus === "awaiting_approval";
  const decided = state.overallStatus === "approved" || state.overallStatus === "rejected";
  const sourceCount = distinctCitedSources(event?.items, state.lifeSafety?.citing_evidence);
  const nearestRoute = state.evacuationPlan?.routes[0];
  const attentionGates = state.gates.filter((g) => g.status !== "passed");

  if (state.phase === "idle") {
    return (
      <div className="mx-auto max-w-xl">
        <Card corner className="flex flex-col items-center gap-5 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green-pale to-primary text-on-primary shadow-[0_10px_24px_-6px_rgba(118,185,0,0.6)]">
            <IconCloudRain className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              {isInsurance ? `Assess ${cityName} exposure` : `Assess ${cityName}`}
            </h1>
            <p className="mt-2 max-w-sm text-sm text-stone">
              {persona === "executive"
                ? "No assessment has been run yet. Run one, or wait for a Command or Insurance operator to — this view stays read-only either way."
                : isInsurance
                  ? "Run the pipeline to see portfolio exposure, estimated loss, and the life-safety context behind it."
                  : "Run the pipeline to see severity, affected population, and a recommended response."}
            </p>
          </div>
          <Button onClick={onRun} className="h-13 px-8 text-base">
            Run Assessment
          </Button>
        </Card>
      </div>
    );
  }

  if (state.phase === "streaming" && !gatesDone) {
    return (
      <div className="relative mx-auto flex max-w-xl flex-col items-center gap-3 overflow-hidden rounded-3xl py-16 text-center">
        <RainOverlay density={34} className="opacity-40" />
        <Spinner size={22} />
        <p className="relative text-sm text-stone">
          Assessing {cityName} — {state.gates.length}/{GATE_ORDER.length} gates resolved…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* WHAT / WHERE */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight text-ink">{event?.label}</h1>
          <p className="text-sm text-stone">
            {event?.city_label} · {event && fmtDateTime(event.created_at)}
          </p>
        </div>
        <AlertTierBadge tier={state.alertTier} />
        <Badge tone={blocked ? "critical" : awaiting ? "warning" : "good"} dot={blocked ? "#d03b3b" : awaiting ? "#fab219" : "#0ca30c"}>
          {state.overallStatus?.replace("_", " ")}
        </Badge>
        <Button onClick={onRun} variant="outline" className="h-9 px-4 text-[11px]">
          Check Again
        </Button>
      </div>

      {/* HOW BAD */}
      <Card>
        <CardHeader eyebrow="How bad" title="Gate pipeline" />
        <div className="flex flex-wrap gap-2">
          {GATE_ORDER.map((name) => {
            const gate = state.gates.find((g) => g.gate_name === name);
            return (
              <span
                key={name}
                className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-surface/80 px-3 py-1.5 text-xs font-bold text-body"
                title={gate?.reasoning}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: gate ? { passed: "#0ca30c", degraded: "#fab219", blocked: "#d03b3b" }[gate.status] : "#555" }}
                />
                {GATE_LABELS[name] ?? name}
              </span>
            );
          })}
        </div>
      </Card>

      {/* WHO IS AFFECTED */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isInsurance ? (
          <>
            <StatTile
              label="Estimated Exposure"
              value={state.insurerExposure?.total_estimated_exposure ?? 0}
              format={fmtCurrency}
              tone={state.insurerExposure ? "primary" : "default"}
            />
            <StatTile label="Policies in Footprint" value={state.insurerExposure?.total_policies_in_footprint ?? 0} />
            <StatTile
              label="Total Insured Value"
              value={state.insurerExposure?.total_tiv_in_footprint ?? 0}
              format={fmtCurrency}
            />
          </>
        ) : (
          <>
            <StatTile label="Evidence Sources" value={sourceCount} tone="primary" />
            <StatTile
              label="Nearest Shelter"
              value={nearestRoute?.distance_km ?? 0}
              suffix="km"
              caption={nearestRoute?.shelter_name}
            />
            <StatTile
              label="Estimated Exposure"
              value={state.insurerExposure?.total_estimated_exposure ?? 0}
              format={fmtCurrency}
              caption="Insured properties in footprint"
            />
          </>
        )}
      </div>

      {/* WHAT WILL HAPPEN NEXT */}
      {state.lifeSafety && (
        <Card>
          <CardHeader
            eyebrow="What's next"
            title={state.lifeSafety.headline.replace("[LLM unavailable] ", "")}
            right={
              !state.lifeSafety.headline.startsWith("[LLM unavailable]") && (
                <AiBadge model={state.lifeSafety.model_used} services={["NIM", "Switchyard", "Relay"]} />
              )
            }
          />
          <ul className="mb-4 flex flex-col gap-2 text-sm text-body">
            {state.lifeSafety.guidance_points.slice(0, 4).map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {p}
              </li>
            ))}
          </ul>
          {!state.lifeSafety.headline.startsWith("[LLM unavailable]") && (
            <ReasoningTrace
              steps={[
                "Evidence",
                "Gates",
                `NIM · ${
                  state.lifeSafety.model_used && state.lifeSafety.model_used !== "none"
                    ? state.lifeSafety.model_used
                    : "unavailable"
                }`,
                "Guidance",
              ]}
            />
          )}
        </Card>
      )}

      {/* WHERE THIS IS GOING */}
      <ForwardRiskCard forecast={state.forecast} />

      {/* WHAT SHOULD I DO */}
      {!blocked && (
        <Card>
          <CardHeader eyebrow="What to do" title={isInsurance ? "Highest-exposure policies" : "Recommended response"} />
          {isInsurance ? (
            <div className="flex flex-col divide-y divide-hairline/70">
              {(state.insurerExposure?.lines ?? [])
                .slice()
                .sort((a, b) => b.gross_loss_estimate - a.gross_loss_estimate)
                .slice(0, 3)
                .map((line) => (
                  <div key={line.policy_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-mono text-body">{line.policy_id}</span>
                    <span className="font-bold text-ink">{fmtCurrency(line.gross_loss_estimate)}</span>
                  </div>
                ))}
              {!state.insurerExposure?.lines.length && <p className="text-sm text-stone">No policies in this footprint.</p>}
              <button
                onClick={() => onNavigate("exposure")}
                className="pt-3 text-left text-xs font-bold text-primary underline underline-offset-2"
              >
                Open full exposure breakdown →
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {nearestRoute ? (
                <p className="text-sm text-body">
                  Nearest safe place: <span className="font-bold text-ink">{nearestRoute.shelter_name}</span> —{" "}
                  {nearestRoute.distance_km} km, {nearestRoute.duration_min} min drive.
                </p>
              ) : (
                <p className="text-sm text-stone">No shelter route computed for this run.</p>
              )}
              <button
                onClick={() => onNavigate("map")}
                className="flex items-center gap-1.5 text-left text-xs font-bold text-primary underline underline-offset-2"
              >
                <IconMapPin className="h-3.5 w-3.5" /> Open Digital Twin map →
              </button>
            </div>
          )}
        </Card>
      )}

      {/* WHAT NEEDS MY ATTENTION */}
      {(attentionGates.length > 0 || awaiting) && (
        <Card className="border-l-2 border-l-[#fab219]">
          <CardHeader eyebrow="Needs attention" title={awaiting ? "Approval pending" : "Degraded or blocked gates"} />
          <ul className="flex flex-col gap-2 text-sm">
            {attentionGates.map((g) => (
              <li key={g.gate_name} className="flex items-start gap-2">
                <Badge tone={statusTone(g.status)} className="mt-0.5">
                  {g.status}
                </Badge>
                <span className="text-body">
                  <span className="font-bold text-ink">{GATE_LABELS[g.gate_name] ?? g.gate_name}:</span> {g.reasoning}
                </span>
              </li>
            ))}
            {awaiting && (
              <li className="text-body">
                {canDecide
                  ? "This warning has not been approved or rejected yet."
                  : "Awaiting a decision from a Command or Insurance operator — this workspace is read-only."}
              </li>
            )}
          </ul>
          {awaiting && canDecide && (
            <div className="mt-4">
              {event && <DecisionBriefCard eventId={event.event_id} />}
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => onApprove("approved")} loading={approving} className="h-11 px-6">
                  Approve
                </Button>
                <Button variant="danger" onClick={() => onApprove("rejected")} loading={approving} className="h-11 px-6">
                  Reject
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {decided && (
        <Card>
          <p className="text-sm text-body">
            This warning was <span className="font-bold text-ink">{state.overallStatus}</span>
            {state.approvalNote ? `, with the note: "${state.approvalNote}"` : "."}
          </p>
          {!isInsurance && event && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
              {state.overallStatus === "approved" && <CapExportButton eventId={event.event_id} />}
              <span className="text-[11px] text-stone">
                {state.overallStatus === "approved"
                  ? "CAP is the standard format IPAWS/national EM systems need to broadcast this warning."
                  : "CAP export is only available for an approved warning."}
              </span>
            </div>
          )}
        </Card>
      )}

      {decided && !isInsurance && event && <AfterActionReportCard eventId={event.event_id} />}

      {/* WHAT HAS CHANGED */}
      <Card>
        <CardHeader eyebrow="What changed" title="Since your last check this session" />
        {state.previous ? (
          <ul className="flex flex-col gap-1.5 text-sm text-body">
            <li>
              Status: <span className="font-mono">{state.previous.overallStatus}</span> →{" "}
              <span className="font-mono font-bold text-ink">{state.overallStatus}</span>
            </li>
            {state.previous.minGateConfidence !== null && (
              <li>
                Min gate confidence: <span className="font-mono">{(state.previous.minGateConfidence * 100).toFixed(0)}%</span> →{" "}
                <span className="font-mono font-bold text-ink">
                  {(Math.min(...state.gates.map((g) => g.confidence)) * 100).toFixed(0)}%
                </span>
              </li>
            )}
            {state.previous.totalEstimatedExposure !== null && state.insurerExposure && (
              <li>
                Estimated exposure: <span className="font-mono">{fmtCurrency(state.previous.totalEstimatedExposure)}</span> →{" "}
                <span className="font-mono font-bold text-ink">{fmtCurrency(state.insurerExposure.total_estimated_exposure)}</span>
              </li>
            )}
          </ul>
        ) : (
          <p className="text-sm text-stone">
            No prior check yet this session — run "Check Again" to see a real delta. Persisting deltas across
            sessions is on the near-term roadmap, not simulated here.
          </p>
        )}
      </Card>

      {persona === "executive" ? (
        <Card corner className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-mute">Fastest path to a decision</div>
            <p className="mt-1 text-sm text-body">Four sentences: what happened, who's affected, what it costs, what's being asked of you.</p>
          </div>
          <Button onClick={() => onNavigate("briefing")} className="h-11 px-6">
            <IconFileText className="h-4 w-4" /> Open Executive Briefing
          </Button>
        </Card>
      ) : (
        <button
          onClick={() => onNavigate("briefing")}
          className="flex items-center gap-2 self-start text-sm font-bold text-primary underline underline-offset-2"
        >
          <IconFileText className="h-4 w-4" /> Generate an executive briefing from this run
        </button>
      )}
    </div>
  );
}
