import clsx from "clsx";
import type { RunState } from "../../hooks/useEventRun";
import type { ViewId } from "../../App";

interface Step {
  key: string;
  label: string;
  view: ViewId;
  reached: (s: RunState) => boolean;
}

const STEPS: Step[] = [
  { key: "situation", label: "Situation", view: "evidence", reached: (s) => s.phase !== "idle" },
  { key: "evidence", label: "Evidence", view: "evidence", reached: (s) => s.event !== null },
  { key: "risk", label: "Risk", view: "runtime", reached: (s) => s.gates.length >= 2 },
  { key: "ai", label: "AI Analysis", view: "runtime", reached: (s) => s.gates.length >= 3 },
  { key: "recommendation", label: "Recommendation", view: "life-safety", reached: (s) => s.lifeSafety !== null },
  {
    key: "review",
    label: "Human Review",
    view: "life-safety",
    reached: (s) => s.phase === "complete" && s.overallStatus !== "blocked",
  },
  {
    key: "action",
    label: "Action",
    view: "life-safety",
    reached: (s) => s.approvalStatus === "approved" || s.approvalStatus === "rejected",
  },
  {
    key: "outcome",
    label: "Outcome",
    view: "exposure",
    reached: (s) => (s.approvalStatus === "approved" || s.approvalStatus === "rejected") && s.insurerExposure !== null,
  },
];

export function StoryRail({
  state,
  activeView,
  onNavigate,
}: {
  state: RunState;
  activeView: ViewId;
  onNavigate: (v: ViewId) => void;
}) {
  const reachedFlags = STEPS.map((s) => s.reached(state));
  const lastReachedIdx = reachedFlags.lastIndexOf(true);

  return (
    <nav className="flex flex-col gap-0.5">
      {STEPS.map((step, i) => {
        const reached = reachedFlags[i];
        const isCurrent = i === lastReachedIdx && reached;
        const isViewActive = activeView === step.view;
        return (
          <button
            key={step.key}
            onClick={() => onNavigate(step.view)}
            className={clsx(
              "group flex items-center gap-3 rounded-sm px-3 py-2.5 text-left transition-colors",
              isViewActive ? "bg-surface-raised" : "hover:bg-surface-elevated",
            )}
          >
            <span
              className={clsx(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                reached
                  ? "border-primary bg-primary text-on-primary"
                  : "border-hairline-strong text-stone",
                isCurrent && "animate-pulse-live",
              )}
            >
              {reached ? "✓" : i + 1}
            </span>
            <span
              className={clsx(
                "text-xs font-semibold uppercase tracking-wide",
                reached ? "text-ink" : "text-stone",
              )}
            >
              {step.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
