import { useState } from "react";
import clsx from "clsx";
import { CommandBar } from "./components/shell/CommandBar";
import { StoryRail } from "./components/shell/StoryRail";
import { ApprovalBar } from "./components/shell/ApprovalBar";
import { ActivityFeed } from "./components/shell/ActivityFeed";
import { RuntimeGatesView } from "./components/views/RuntimeGatesView";
import { SituationEvidenceView } from "./components/views/SituationEvidenceView";
import { LifeSafetyView } from "./components/views/LifeSafetyView";
import { InsurerExposureView } from "./components/views/InsurerExposureView";
import { EvacuationView } from "./components/views/EvacuationView";
import { ErrorState } from "./components/common/States";
import { useRuntimeConfig } from "./hooks/useBackend";
import { useEventRun } from "./hooks/useEventRun";

export type ViewId = "runtime" | "evidence" | "life-safety" | "evacuation" | "exposure";

const VIEW_TABS: { id: ViewId; label: string }[] = [
  { id: "runtime", label: "NVIDIA Runtime & Gates" },
  { id: "evidence", label: "Situation & Evidence" },
  { id: "life-safety", label: "Life Safety" },
  { id: "evacuation", label: "Evacuation & Shelters" },
  { id: "exposure", label: "Insurer Exposure" },
];

export default function App() {
  const { data: config } = useRuntimeConfig();
  const { state, run, approve, approving } = useEventRun();
  const [activeView, setActiveView] = useState<ViewId>("runtime");
  const [evidenceFilter, setEvidenceFilter] = useState<string[] | null>(null);
  const [evidenceMode, setEvidenceMode] = useState<"replay" | "live">("replay");

  const jumpToEvidence = (ids: string[]) => {
    setEvidenceFilter(ids);
    setActiveView("evidence");
    requestAnimationFrame(() => {
      document.getElementById("evidence-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <CommandBar
        config={config}
        eventLabel={state.event?.label ?? null}
        windowStart={state.event?.window_start ?? null}
        windowEnd={state.event?.window_end ?? null}
        phase={state.phase}
        evidenceMode={evidenceMode}
        onEvidenceModeChange={setEvidenceMode}
        onRun={() =>
          run(
            evidenceMode === "live" ? "Houston heavy-rain event (live)" : "Houston heavy-rain event (replayed)",
            evidenceMode,
          )
        }
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-4 px-6 py-4">
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-20">
            <StoryRail state={state} activeView={activeView} onNavigate={setActiveView} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-hairline">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={clsx(
                  "whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors",
                  activeView === tab.id
                    ? "border-primary text-ink"
                    : "border-transparent text-stone hover:text-body",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {state.phase === "error" && (
            <div className="mb-4">
              <ErrorState title="Run failed" body={state.error ?? undefined} />
            </div>
          )}

          {activeView === "runtime" && (
            <RuntimeGatesView state={state} config={config} onJumpToEvidence={jumpToEvidence} />
          )}
          {activeView === "evidence" && (
            <SituationEvidenceView
              state={state}
              evidenceFilter={evidenceFilter}
              onClearFilter={() => setEvidenceFilter(null)}
            />
          )}
          {activeView === "life-safety" && <LifeSafetyView state={state} onJumpToEvidence={jumpToEvidence} />}
          {activeView === "evacuation" && <EvacuationView state={state} />}
          {activeView === "exposure" && <InsurerExposureView state={state} />}
        </main>

        <aside className="hidden w-80 shrink-0 xl:block">
          <div className="sticky top-20">
            <ActivityFeed state={state} />
          </div>
        </aside>
      </div>

      <ApprovalBar state={state} approving={approving} onApprove={approve} />

      <footer className="border-t border-hairline px-6 py-3 text-center text-[10px] uppercase tracking-wide text-stone">
        Human judgment, supported by evidence. NVIDIA GSI Open Hackathon demo — Team Cognitive Core.
      </footer>
    </div>
  );
}
