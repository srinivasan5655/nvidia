import { useState } from "react";
import { Sidebar } from "./components/shell/Sidebar";
import { Footer } from "./components/shell/Footer";
import { HomeGuidedView } from "./components/views/HomeGuidedView";
import { AlertsView } from "./components/views/AlertsView";
import { SafePlacesView } from "./components/views/SafePlacesView";
import { WhatIfView } from "./components/views/WhatIfView";
import { SmsConsoleView } from "./components/views/SmsConsoleView";
import { HistoryView } from "./components/views/HistoryView";
import { RuntimeGatesView } from "./components/views/RuntimeGatesView";
import { ObservabilityView } from "./components/views/ObservabilityView";
import { SituationEvidenceView } from "./components/views/SituationEvidenceView";
import { LifeSafetyView } from "./components/views/LifeSafetyView";
import { InsurerExposureView } from "./components/views/InsurerExposureView";
import { ErrorState } from "./components/common/States";
import { CITY_INFO, HISTORICAL_EVENT_LABEL } from "./lib/format";
import { useRuntimeConfig } from "./hooks/useBackend";
import { useEventRun } from "./hooks/useEventRun";
import type { CityKey } from "./lib/types";

export type ViewId =
  | "home"
  | "alerts"
  | "map"
  | "whatif"
  | "sms"
  | "history"
  | "runtime"
  | "observability"
  | "evidence"
  | "life-safety"
  | "exposure";

export default function App() {
  const { data: config } = useRuntimeConfig();
  const { state, run, approve, approving } = useEventRun();
  const [activeView, setActiveView] = useState<ViewId>("home");
  const [evidenceMode, setEvidenceMode] = useState<"replay" | "live">("replay");
  const [city, setCity] = useState<CityKey>("houston");
  const [evidenceFilter, setEvidenceFilter] = useState<string[] | null>(null);

  const onRun = () => {
    const eventName = HISTORICAL_EVENT_LABEL[city];
    run(
      evidenceMode === "live" ? `${eventName} (live)` : `${eventName} (replayed)`,
      evidenceMode,
      city,
    );
  };

  const onRunRedTeam = () => {
    const eventName = HISTORICAL_EVENT_LABEL[city];
    run(`${eventName} (simulated contradiction)`, evidenceMode, city, true);
  };

  const jumpToEvidence = (ids: string[]) => {
    setEvidenceFilter(ids);
    setActiveView("evidence");
  };

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        city={city}
        onCityChange={setCity}
        cityDisabled={state.phase === "streaming"}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 sm:px-10">
          {state.phase === "error" && (
            <div className="mx-auto mb-4 max-w-2xl">
              <ErrorState title="Run failed" body={state.error ?? undefined} />
            </div>
          )}

          {activeView === "home" && (
            <HomeGuidedView
              state={state}
              approving={approving}
              onRun={onRun}
              onApprove={approve}
              onNavigate={setActiveView}
              cityName={CITY_INFO[city].short}
            />
          )}
          {activeView === "alerts" && <AlertsView state={state} />}
          {activeView === "map" && <SafePlacesView state={state} />}
          {activeView === "whatif" && <WhatIfView state={state} city={city} />}
          {activeView === "sms" && <SmsConsoleView state={state} />}
          {activeView === "history" && <HistoryView state={state} onNavigate={setActiveView} />}
          {activeView === "runtime" && (
            <RuntimeGatesView
              state={state}
              config={config}
              evidenceMode={evidenceMode}
              onEvidenceModeChange={setEvidenceMode}
              onJumpToEvidence={jumpToEvidence}
              onRunRedTeam={onRunRedTeam}
            />
          )}
          {activeView === "observability" && <ObservabilityView state={state} config={config} />}
          {activeView === "evidence" && (
            <SituationEvidenceView
              state={state}
              evidenceFilter={evidenceFilter}
              onClearFilter={() => setEvidenceFilter(null)}
            />
          )}
          {activeView === "life-safety" && <LifeSafetyView state={state} onJumpToEvidence={jumpToEvidence} />}
          {activeView === "exposure" && <InsurerExposureView state={state} />}
        </main>

        <Footer />
      </div>
    </div>
  );
}
