import { useCallback, useReducer, useRef } from "react";
import { api, streamReplay } from "../lib/api";
import type {
  AlertTier,
  ApprovalStatus,
  CounterfactualAnalysis,
  EvacuationPlan,
  EventBundle,
  EventRunResult,
  ForwardRiskForecast,
  GateResult,
  InsurerExposureOutput,
  LifeSafetyGuidance,
  OverallStatus,
  ParametricTriggerResult,
  ResourceDispatchPlan,
} from "../lib/types";

export type RunPhase = "idle" | "streaming" | "complete" | "error";

export interface SourceStatus {
  status: "started" | "done" | "failed";
  itemCount?: number;
}

/** A minimal snapshot of the last COMPLETED run, kept across "Check Again"
 * within the same browser session — there's no server-side run history yet
 * (see the Command OS blueprint's Tier 2 roadmap item on real persistence),
 * so this is deliberately the one honest delta this session can show:
 * "what changed since the last time you ran this," not a claim about
 * anything before the app was opened. */
export interface PreviousRunSnapshot {
  label: string;
  overallStatus: OverallStatus;
  minGateConfidence: number | null;
  totalEstimatedExposure: number | null;
  completedAt: number;
}

export interface RunState {
  phase: RunPhase;
  event: EventBundle | null;
  sourceStatus: Record<string, SourceStatus>;
  gates: GateResult[];
  lifeSafety: LifeSafetyGuidance | null;
  insurerExposure: InsurerExposureOutput | null;
  evacuationPlan: EvacuationPlan | null;
  counterfactual: CounterfactualAnalysis | null;
  forecast: ForwardRiskForecast | null;
  resourceDispatch: ResourceDispatchPlan | null;
  parametricTrigger: ParametricTriggerResult | null;
  alertTier: AlertTier;
  overallStatus: OverallStatus | null;
  approvalStatus: ApprovalStatus | null;
  approvalNote: string | null;
  error: string | null;
  startedAt: number | null;
  approvalRecordedAt: number | null;
  previous: PreviousRunSnapshot | null;
}

const initialState: RunState = {
  phase: "idle",
  event: null,
  sourceStatus: {},
  gates: [],
  lifeSafety: null,
  insurerExposure: null,
  evacuationPlan: null,
  counterfactual: null,
  forecast: null,
  resourceDispatch: null,
  parametricTrigger: null,
  alertTier: "watch",
  overallStatus: null,
  approvalStatus: null,
  approvalNote: null,
  error: null,
  startedAt: null,
  approvalRecordedAt: null,
  previous: null,
};

function snapshotOf(state: RunState): PreviousRunSnapshot | null {
  if (!state.event || !state.overallStatus) return null;
  const confidences = state.gates.map((g) => g.confidence);
  return {
    label: state.event.label,
    overallStatus: state.overallStatus,
    minGateConfidence: confidences.length ? Math.min(...confidences) : null,
    totalEstimatedExposure: state.insurerExposure?.total_estimated_exposure ?? null,
    completedAt: Date.now(),
  };
}

type Action =
  | { type: "START" }
  | { type: "SOURCE_STATUS"; source: string; status: "started" | "done" | "failed"; itemCount?: number }
  | { type: "EVIDENCE"; event: EventBundle }
  | { type: "GATE"; gate: GateResult }
  | {
      type: "OUTPUTS";
      lifeSafety: LifeSafetyGuidance | null;
      insurerExposure: InsurerExposureOutput | null;
      evacuationPlan: EvacuationPlan | null;
    }
  | { type: "COUNTERFACTUAL"; counterfactual: CounterfactualAnalysis }
  | { type: "FORECAST"; forecast: ForwardRiskForecast | null }
  | { type: "COMPLETE"; result: EventRunResult }
  | { type: "ERROR"; message: string }
  | { type: "APPROVAL"; result: EventRunResult }
  | { type: "RESET" };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case "START": {
      const previous = state.phase === "complete" ? snapshotOf(state) : state.previous;
      return { ...initialState, phase: "streaming", startedAt: Date.now(), previous };
    }
    case "SOURCE_STATUS":
      return {
        ...state,
        sourceStatus: {
          ...state.sourceStatus,
          [action.source]: { status: action.status, itemCount: action.itemCount },
        },
      };
    case "EVIDENCE":
      return { ...state, event: action.event };
    case "GATE":
      return { ...state, gates: [...state.gates, action.gate] };
    case "OUTPUTS":
      return {
        ...state,
        lifeSafety: action.lifeSafety,
        insurerExposure: action.insurerExposure,
        evacuationPlan: action.evacuationPlan,
      };
    case "COUNTERFACTUAL":
      return { ...state, counterfactual: action.counterfactual };
    case "FORECAST":
      return { ...state, forecast: action.forecast };
    case "COMPLETE":
      return {
        ...state,
        phase: "complete",
        event: action.result.event,
        gates: action.result.gates,
        lifeSafety: action.result.life_safety,
        insurerExposure: action.result.insurer_exposure,
        evacuationPlan: action.result.evacuation_plan,
        counterfactual: action.result.counterfactual,
        forecast: action.result.forward_risk_forecast,
        resourceDispatch: action.result.resource_dispatch,
        parametricTrigger: action.result.parametric_trigger,
        alertTier: action.result.alert_tier,
        overallStatus: action.result.overall_status,
        approvalStatus: action.result.approval_status,
        approvalNote: action.result.approval_note,
      };
    case "ERROR":
      return { ...state, phase: "error", error: action.message };
    case "APPROVAL":
      return {
        ...state,
        overallStatus: action.result.overall_status,
        approvalStatus: action.result.approval_status,
        approvalNote: action.result.approval_note,
        alertTier: action.result.alert_tier,
        approvalRecordedAt: Date.now(),
      };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export function useEventRun() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const cleanupRef = useRef<() => void>(() => {});
  const [approving, setApproving] = useReducer((_: boolean, v: boolean) => v, false);

  const run = useCallback(
    (
      label: string,
      evidenceMode: "replay" | "live" = "replay",
      city: string = "houston",
      injectContradiction: boolean = false,
    ) => {
      cleanupRef.current();
      dispatch({ type: "START" });
      cleanupRef.current = streamReplay(
        label,
        {
          onSourceFetching: (p) =>
            dispatch({ type: "SOURCE_STATUS", source: p.source, status: p.status, itemCount: p.item_count }),
          onEvidenceAssembled: (p) => dispatch({ type: "EVIDENCE", event: p.event }),
          onGate: (p) => dispatch({ type: "GATE", gate: p.gate }),
          onOutputsReady: (p) =>
            dispatch({
              type: "OUTPUTS",
              lifeSafety: p.life_safety,
              insurerExposure: p.insurer_exposure,
              evacuationPlan: p.evacuation_plan,
            }),
          onCounterfactualReady: (p) => dispatch({ type: "COUNTERFACTUAL", counterfactual: p.counterfactual }),
          onForecastReady: (p) => dispatch({ type: "FORECAST", forecast: p.forecast }),
          onComplete: (p) => dispatch({ type: "COMPLETE", result: p.result }),
          onError: (err) => dispatch({ type: "ERROR", message: err instanceof Error ? err.message : String(err) }),
        },
        evidenceMode,
        city,
        injectContradiction,
      );
    },
    [],
  );

  const approve = useCallback(
    async (decision: "approved" | "rejected", note?: string) => {
      if (!state.event) return;
      setApproving(true);
      try {
        const result = await api.approve(state.event.event_id, decision, note);
        dispatch({ type: "APPROVAL", result });
      } finally {
        setApproving(false);
      }
    },
    [state.event],
  );

  const reset = useCallback(() => {
    cleanupRef.current();
    dispatch({ type: "RESET" });
  }, []);

  return { state, run, approve, approving, reset };
}
