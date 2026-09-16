import { useState } from "react";
import { Sidebar } from "./components/shell/Sidebar";
import { TopBar } from "./components/shell/TopBar";
import { Footer } from "./components/shell/Footer";
import { AssistantPanel } from "./components/shell/AssistantPanel";
import { ProactiveAlertsBanner } from "./components/shell/ProactiveAlertsBanner";
import { CommandPalette, type PaletteCommand } from "./components/shell/CommandPalette";
import { LoginView } from "./components/auth/LoginView";
import { WorkspaceSelectView } from "./components/auth/WorkspaceSelectView";
import { HomeGuidedView } from "./components/views/HomeGuidedView";
import { CommandCenterView } from "./components/views/CommandCenterView";
import { AlertsView } from "./components/views/AlertsView";
import { SafePlacesView } from "./components/views/SafePlacesView";
import { WhatIfView } from "./components/views/WhatIfView";
import { SmsConsoleView } from "./components/views/SmsConsoleView";
import { HistoryView } from "./components/views/HistoryView";
import { RuntimeGatesView } from "./components/views/RuntimeGatesView";
import { ObservabilityView } from "./components/views/ObservabilityView";
import { EvalSuiteView } from "./components/views/EvalSuiteView";
import { SituationEvidenceView } from "./components/views/SituationEvidenceView";
import { LifeSafetyView } from "./components/views/LifeSafetyView";
import { InsurerExposureView } from "./components/views/InsurerExposureView";
import { BriefingView } from "./components/views/BriefingView";
import { PortfolioView } from "./components/views/PortfolioView";
import { ErrorState } from "./components/common/States";
import { CITY_INFO, HISTORICAL_EVENT_LABEL } from "./lib/format";
import { PERSONA_META } from "./lib/personas";
import { useRuntimeConfig } from "./hooks/useBackend";
import { useEventRun } from "./hooks/useEventRun";
import type { CityKey, MockUser, Persona } from "./lib/types";

export type ViewId =
  | "home"
  | "alerts"
  | "map"
  | "whatif"
  | "sms"
  | "history"
  | "runtime"
  | "observability"
  | "eval"
  | "evidence"
  | "life-safety"
  | "exposure"
  | "briefing"
  | "portfolio";

// Aligned to the finals UI prototype's IA where a real screen matches
// (Living World, Simulation Lab, Impact & Insurance, Executive Brief) —
// same underlying view, just the name the prototype uses for it.
const VIEW_LABELS: Record<ViewId, string> = {
  home: "Home",
  alerts: "Alerts",
  map: "Living World",
  whatif: "Simulation Lab",
  sms: "SMS Console",
  history: "History",
  runtime: "Agentic Runtime",
  observability: "Observability",
  eval: "Golden Dataset",
  evidence: "Evidence",
  "life-safety": "Life Safety",
  exposure: "Impact & Insurance",
  briefing: "Executive Brief",
  portfolio: "Portfolio",
};

/** you.name@org.com -> "You Name" — a plausible display name for the demo
 * sign-in, not a real identity lookup (there's no user directory behind
 * this). Used only to greet the workspace-selection screen and label the
 * top bar's user menu. */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ") || "Operator";
}

type AuthStage = "login" | "workspace" | "app";

export default function App() {
  const { data: config } = useRuntimeConfig();
  const { state, run, approve, approving, reset } = useEventRun();
  const [authStage, setAuthStage] = useState<AuthStage>("login");
  const [user, setUser] = useState<MockUser | null>(null);
  const [activeView, setActiveView] = useState<ViewId>("home");
  const [persona, setPersona] = useState<Persona>("command");
  const [evidenceMode, setEvidenceMode] = useState<"replay" | "live">("replay");
  const [city, setCity] = useState<CityKey>("houston");
  const [evidenceFilter, setEvidenceFilter] = useState<string[] | null>(null);
  const [assistantOpenSignal, setAssistantOpenSignal] = useState(0);
  const [paletteOpenSignal, setPaletteOpenSignal] = useState(0);

  const onSignIn = (email: string) => {
    setUser({ name: nameFromEmail(email), email, org: PERSONA_META[0].org, workspace: "command" });
    setAuthStage("workspace");
  };

  const onSelectWorkspace = (p: Persona) => {
    setPersona(p);
    setActiveView("home");
    setUser((u) => (u ? { ...u, workspace: p, org: PERSONA_META.find((m) => m.id === p)?.org ?? u.org } : u));
    setAuthStage("app");
  };

  // One click from the login screen: sign in as that persona's demo
  // identity and land directly in its workspace, skipping both the
  // manual form and the separate workspace-select screen — there's no
  // real credential to ask for, so this is the actually-fast path.
  const onQuickAccess = (p: Persona) => {
    const meta = PERSONA_META.find((m) => m.id === p) ?? PERSONA_META[0];
    setUser({ name: meta.demoName, email: meta.demoEmail, org: meta.org, workspace: p });
    setPersona(p);
    setActiveView("home");
    setAuthStage("app");
  };

  const onSignOut = () => {
    reset();
    setUser(null);
    setActiveView("home");
    setAuthStage("login");
  };

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

  if (authStage === "login") return <LoginView onSignIn={onSignIn} onQuickAccess={onQuickAccess} />;
  if (authStage === "workspace" && user) {
    return <WorkspaceSelectView firstName={user.name.split(" ")[0]} onSelect={onSelectWorkspace} />;
  }
  if (!user) return <LoginView onSignIn={onSignIn} onQuickAccess={onQuickAccess} />;

  // Every entry here dispatches to a handler or nav change that already
  // exists above — the command palette is a faster front door onto real
  // capabilities, not a parallel implementation of them.
  const paletteCommands: PaletteCommand[] = [
    {
      id: "run",
      group: "Actions",
      label: state.phase === "idle" ? `Run assessment — ${CITY_INFO[city].short}` : `Check ${CITY_INFO[city].short} again`,
      disabled: state.phase === "streaming",
      run: onRun,
    },
    {
      id: "red-team",
      group: "Actions",
      label: "Simulate Contradiction (red-team)",
      hint: "Runs the real evidence/confidence gates against deliberately collapsed evidence",
      disabled: state.phase === "streaming",
      run: onRunRedTeam,
    },
    {
      id: "assistant",
      group: "Actions",
      label: "Open Assistant",
      disabled: state.phase === "idle",
      run: () => setAssistantOpenSignal((n) => n + 1),
    },
    ...PERSONA_META.map((p) => ({
      id: `persona-${p.id}`,
      group: "Switch workspace",
      label: `View as ${p.label}`,
      disabled: persona === p.id,
      run: () => setPersona(p.id),
    })),
    ...(Object.keys(VIEW_LABELS) as ViewId[]).map((id) => ({
      id: `nav-${id}`,
      group: "Go to",
      label: `Open ${VIEW_LABELS[id]}`,
      disabled: activeView === id,
      run: () => setActiveView(id),
    })),
  ];

  const isProPersona = persona !== "field";

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopBar
        persona={persona}
        onPersonaChange={setPersona}
        user={user}
        onSignOut={onSignOut}
        onOpenPalette={() => setPaletteOpenSignal((n) => n + 1)}
        state={state}
      />
      <ProactiveAlertsBanner />
      <div className="flex flex-1">
        <Sidebar
          activeView={activeView}
          onNavigate={setActiveView}
          city={city}
          onCityChange={setCity}
          cityDisabled={state.phase === "streaming"}
          persona={persona}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 sm:px-10">
            {state.phase === "error" && (
              <div className="mx-auto mb-4 max-w-2xl">
                <ErrorState title="Run failed" body={state.error ?? undefined} />
              </div>
            )}

            {activeView === "home" &&
              (isProPersona ? (
                <CommandCenterView
                  persona={persona as Exclude<Persona, "field">}
                  state={state}
                  approving={approving}
                  onRun={onRun}
                  onApprove={approve}
                  onNavigate={setActiveView}
                  cityName={CITY_INFO[city].short}
                />
              ) : (
                <HomeGuidedView
                  state={state}
                  approving={approving}
                  onRun={onRun}
                  onApprove={approve}
                  onNavigate={setActiveView}
                  cityName={CITY_INFO[city].short}
                  city={city}
                />
              ))}
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
            {activeView === "eval" && <EvalSuiteView />}
            {activeView === "evidence" && (
              <SituationEvidenceView
                state={state}
                evidenceFilter={evidenceFilter}
                onClearFilter={() => setEvidenceFilter(null)}
              />
            )}
            {activeView === "life-safety" && <LifeSafetyView state={state} onJumpToEvidence={jumpToEvidence} />}
            {activeView === "exposure" && <InsurerExposureView state={state} />}
            {activeView === "briefing" && <BriefingView state={state} />}
            {activeView === "portfolio" && <PortfolioView />}
          </main>

          <Footer />
        </div>

        <AssistantPanel state={state} openSignal={assistantOpenSignal} />
      </div>
      <CommandPalette commands={paletteCommands} openSignal={paletteOpenSignal} />
    </div>
  );
}
