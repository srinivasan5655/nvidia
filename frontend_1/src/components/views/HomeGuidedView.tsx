import { useEffect, useState } from "react";
import type { ReactNode, ComponentType } from "react";
import clsx from "clsx";
import { Card } from "../common/Card";
import { Button } from "../common/Button";
import { AiBadge } from "../common/AiBadge";
import { Spinner } from "../common/States";
import { IconCloudRain, IconShieldCheck, IconClipboardCheck, IconHandRaised, IconMapPin, IconArrowRight } from "../common/Icons";
import { fmtCurrency, distinctCitedSources } from "../../lib/format";
import type { RunState } from "../../hooks/useEventRun";
import type { GateName } from "../../lib/types";
import type { ViewId } from "../../App";

/** Every technical gate, translated into one plain sentence — no
 * "confidence", "OpenShell", or "policy verifier" anywhere in this view.
 * The real names still live in the Advanced tab for anyone who needs them. */
const GATE_PLAIN: Record<GateName, string> = {
  evidence_verifier: "Making sure the weather and flood reports agree with each other",
  confidence_gate: "Making sure we have enough good information to be sure",
  openshell_supervisor: "Having a second AI double-check with photos and other clues",
  policy_verifier: "Making sure this follows official safety rules",
};
const GATE_ORDER: GateName[] = ["evidence_verifier", "confidence_gate", "openshell_supervisor", "policy_verifier"];

type StepStatus = "pending" | "active" | "done" | "problem";

const NODE_STYLES: Record<StepStatus, string> = {
  done: "bg-gradient-to-b from-accent-green-pale to-primary text-on-primary shadow-[0_0_0_4px_rgba(118,185,0,0.15),0_8px_20px_-6px_rgba(118,185,0,0.6)]",
  active: "bg-surface-elevated text-primary ring-2 ring-primary shadow-[0_0_24px_-4px_rgba(118,185,0,0.55)]",
  problem: "bg-gradient-to-b from-[#ff8a8a] to-[#d03b3b] text-white shadow-[0_0_20px_-4px_rgba(208,59,59,0.7)]",
  pending: "bg-surface-raised text-stone ring-1 ring-hairline",
};

/** A left-hand timeline node + connecting line, wrapping each step's Card —
 * this is the single visual device that turns a stack of boxes into a
 * guided journey the eye can follow top to bottom. */
function TimelineStep({
  status,
  icon: Icon,
  title,
  isLast,
  children,
}: {
  status: StepStatus;
  icon: ComponentType<{ className?: string }>;
  title: string;
  isLast?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="relative flex animate-in gap-5">
      <div className="flex shrink-0 flex-col items-center">
        <span className={clsx("flex h-12 w-12 items-center justify-center rounded-2xl transition-all", NODE_STYLES[status])}>
          {status === "active" ? <Spinner size={20} /> : status === "problem" ? "!" : <Icon className="h-5 w-5" />}
        </span>
        {!isLast && (
          <span
            className={clsx(
              "mt-2 w-px flex-1 rounded-full",
              status === "done" ? "bg-gradient-to-b from-primary/60 to-hairline-strong" : "bg-hairline-strong",
            )}
          />
        )}
      </div>
      <Card
        className={clsx(
          "mb-2 flex-1",
          status === "active" && "ring-1 ring-primary/40",
          status === "problem" && "ring-1 ring-[#d03b3b]/50",
        )}
      >
        <h2 className="text-xl font-extrabold tracking-tight text-ink">{title}</h2>
        {children && <div className="mt-3 text-base leading-relaxed text-body">{children}</div>}
      </Card>
    </div>
  );
}

const TELEMETRY = ["SATELLITE LINK", "SENSOR MESH", "NVIDIA NIM RUNTIME", "NEMO RELAY"];

function StartCard({
  onRun,
  running,
  cityName,
}: {
  onRun: () => void;
  running: boolean;
  cityName: string;
}) {
  return (
    <Card corner className="relative flex flex-col items-center gap-7 overflow-hidden py-16 text-center">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-r from-transparent via-primary/25 to-transparent" />

      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="absolute inset-0 animate-radar-ping rounded-full bg-primary/30" />
        <span className="absolute inset-0 animate-radar-ping rounded-full bg-primary/30 [animation-delay:0.8s]" />
        <span className="absolute inset-3 rounded-full border border-primary/30" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green-pale to-primary shadow-[0_10px_30px_-6px_rgba(118,185,0,0.65)]">
          <IconCloudRain className="h-8 w-8 text-on-primary" />
        </span>
      </div>

      <div className="relative flex flex-col gap-3">
        <h1 className="max-w-lg bg-gradient-to-b from-ink to-body bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
          Check {cityName} for flooding danger
        </h1>
        <p className="max-w-md text-base text-stone">
          Press the button below. We will gather the latest weather and flood reports and tell you, in plain
          language, whether anyone is in danger and what to do next.
        </p>
      </div>

      <Button onClick={onRun} loading={running} className="relative h-16 gap-3 px-10 text-xl">
        {running ? "Checking…" : "Check Now"}
        {!running && <IconArrowRight className="h-5 w-5" />}
      </Button>

      <div className="relative flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
        {TELEMETRY.map((label) => (
          <span key={label} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_1px_rgba(118,185,0,0.8)]" />
            {label}
          </span>
        ))}
      </div>
    </Card>
  );
}

export function HomeGuidedView({
  state,
  approving,
  onRun,
  onApprove,
  onNavigate,
  cityName,
}: {
  state: RunState;
  approving: boolean;
  onRun: () => void;
  onApprove: (decision: "approved" | "rejected", note?: string) => void;
  onNavigate: (v: ViewId) => void;
  cityName: string;
}) {
  const [note, setNote] = useState("");

  /** The real pipeline calls live NIM models and can easily run 60-90s
   * (confirmed against the running backend) — with no cue, a spinner that
   * sits still that long reads as frozen. Surface a plain reassurance once
   * it's been running a while instead of leaving the screen looking stuck. */
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (state.phase !== "streaming" || !state.startedAt) {
      setElapsedSec(0);
      return;
    }
    const id = setInterval(() => setElapsedSec(Math.round((Date.now() - state.startedAt!) / 1000)), 1000);
    return () => clearInterval(id);
  }, [state.phase, state.startedAt]);

  if (state.phase === "idle") {
    return (
      <div className="mx-auto max-w-2xl">
        <StartCard onRun={onRun} running={false} cityName={cityName} />
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <TimelineStep status="problem" icon={IconCloudRain} title="Something went wrong" isLast>
          We could not finish checking {cityName}. Please try again, or check the Agentic Runtime page for
          details.
        </TimelineStep>
        <Button onClick={onRun} className="h-14 self-start px-8 text-lg">
          Try Again
        </Button>
      </div>
    );
  }

  const event = state.event;
  const gatesDone = state.gates.length >= GATE_ORDER.length;
  const blocked = state.overallStatus === "blocked";
  const isDegraded = state.lifeSafety?.headline.startsWith("[LLM unavailable]") ?? false;
  const headline = state.lifeSafety?.headline.replace("[LLM unavailable] ", "");
  const sourceCount = distinctCitedSources(state.event?.items, state.lifeSafety?.citing_evidence);
  const nearestRoute = state.evacuationPlan?.routes[0];
  const showRecommendation = event && !blocked && gatesDone;
  const showConfirm = state.phase === "complete" && !blocked && state.overallStatus === "awaiting_approval";
  const decided = state.overallStatus === "approved" || state.overallStatus === "rejected";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-2 pb-8">
      {state.phase === "streaming" && elapsedSec > 8 && (
        <div className="mb-2 flex items-center gap-3 rounded-2xl border border-hairline-strong bg-surface-elevated/80 p-4 backdrop-blur">
          <Spinner size={18} />
          <p className="text-sm text-body">
            Still checking — this can take up to a minute while we double-check everything carefully. Please
            don't close this page.
          </p>
        </div>
      )}

      <TimelineStep status={event ? "done" : "active"} icon={IconCloudRain} title="Step 1 — Gather the reports">
        {event ? (
          <p>
            We found <span className="font-bold text-ink">{event.items.length} reports</span> about weather and
            flooding for {event.city_label}.
          </p>
        ) : (
          <p>Gathering the latest weather and flood reports for {cityName}…</p>
        )}
      </TimelineStep>

      {event && (
        <TimelineStep
          status={blocked ? "problem" : gatesDone ? "done" : "active"}
          icon={IconShieldCheck}
          title="Step 2 — Make sure it's reliable"
          isLast={!showRecommendation && !blocked}
        >
          <ul className="flex flex-col gap-2.5">
            {GATE_ORDER.map((name, i) => {
              const result = state.gates.find((g) => g.gate_name === name);
              const isBad = result && result.status === "blocked";
              return (
                <li key={name} className="flex items-center gap-2.5">
                  <span
                    className={clsx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      isBad
                        ? "bg-[#d03b3b] text-white"
                        : result
                          ? "bg-primary text-on-primary"
                          : "bg-surface-raised text-stone",
                    )}
                  >
                    {result ? (isBad ? "!" : "✓") : i + 1}
                  </span>
                  <span className={result ? "text-body" : "text-stone"}>{GATE_PLAIN[name]}</span>
                </li>
              );
            })}
          </ul>
          {blocked && (
            <p className="mt-3 rounded-xl border border-[#d03b3b]/50 bg-[#d03b3b]/10 p-3 font-bold text-[#ff8a8a]">
              We could not confirm this well enough to give a recommendation. Please ask a supervisor to check
              the Advanced tab before doing anything.
            </p>
          )}
        </TimelineStep>
      )}

      {showRecommendation && (
        <TimelineStep
          status={state.lifeSafety ? "done" : "active"}
          icon={IconClipboardCheck}
          title="Step 3 — What should you do?"
          isLast={!showConfirm && !decided}
        >
          {!state.lifeSafety ? (
            <p>Working out the safest thing to do…</p>
          ) : (
            <div className="flex flex-col gap-4">
              {!isDegraded && (
                <AiBadge
                  model={state.lifeSafety.model_used}
                  services={["NIM", "Switchyard", "Relay"]}
                  className="self-start"
                />
              )}
              {!isDegraded && sourceCount > 1 && (
                <p className="text-xs text-stone">
                  This combines what <span className="font-bold text-body">{sourceCount} different</span> weather
                  and flood reports are saying — even where they don't fully agree — into one clear answer.
                </p>
              )}
              <p className="text-xl font-extrabold text-ink">{headline}</p>
              {state.lifeSafety.guidance_points.slice(0, 4).length > 0 && (
                <ul className="flex flex-col gap-2">
                  {state.lifeSafety.guidance_points.slice(0, 4).map((point, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="rounded-xl border border-hairline bg-surface/80 p-4">
                <div className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-mute">
                  <IconMapPin className="h-4 w-4 text-primary" /> Nearest safe place
                </div>
                {!state.evacuationPlan || !nearestRoute ? (
                  <p className="text-stone">
                    {state.phase !== "complete" ? "Looking for the nearest shelter…" : "No shelter found nearby."}
                  </p>
                ) : (
                  <p>
                    <span className="font-bold text-ink">{nearestRoute.shelter_name}</span> — about{" "}
                    <span className="font-bold text-ink">{nearestRoute.distance_km} km</span> away (
                    {nearestRoute.duration_min} min drive).{" "}
                    <button
                      onClick={() => onNavigate("map")}
                      className="font-bold text-primary underline underline-offset-2"
                    >
                      See it on the map
                    </button>
                  </p>
                )}
              </div>

              {state.insurerExposure && (
                <div className="rounded-xl border border-hairline bg-surface/80 p-4">
                  <div className="mb-1 text-sm font-bold uppercase tracking-wide text-mute">
                    Estimated cost impact
                  </div>
                  <p>
                    About{" "}
                    <span className="font-bold text-ink">
                      {fmtCurrency(state.insurerExposure.total_estimated_exposure)}
                    </span>{" "}
                    across {state.insurerExposure.total_policies_in_footprint} insured properties in the area.
                  </p>
                </div>
              )}
            </div>
          )}
        </TimelineStep>
      )}

      {showConfirm && (
        <TimelineStep status="active" icon={IconHandRaised} title="Step 4 — Confirm your decision" isLast>
          <p className="mb-4">Nothing is sent until you decide. Do you want to approve this warning and share it?</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)…"
            className="mb-4 h-20 w-full rounded-xl border border-hairline-strong bg-surface p-3 text-base text-ink placeholder:text-stone focus:border-primary focus:outline-none"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => onApprove("approved", note || undefined)}
              loading={approving}
              className="h-16 flex-1 px-6 text-lg"
            >
              Yes — Send This Warning
            </Button>
            <Button
              variant="danger"
              onClick={() => onApprove("rejected", note || undefined)}
              loading={approving}
              className="h-16 flex-1 px-6 text-lg"
            >
              No — Don't Send
            </Button>
          </div>
        </TimelineStep>
      )}

      {decided && (
        <TimelineStep status="done" icon={IconHandRaised} title="Decision recorded" isLast>
          <p>
            You <span className="font-bold text-ink">{state.overallStatus}</span> this warning
            {state.approvalNote ? `, with the note: "${state.approvalNote}"` : "."}
          </p>
        </TimelineStep>
      )}

      {state.phase === "complete" && (
        <Button onClick={onRun} variant="outline" className="mt-4 h-14 self-center px-8 text-lg">
          Check {cityName} Again
        </Button>
      )}
    </div>
  );
}
