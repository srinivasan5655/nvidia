import { useCallback, useReducer, useRef } from "react";
import { api, streamReplay } from "../lib/api";
import type {
  ApprovalStatus,
  CounterfactualAnalysis,
  EvacuationPlan,
  EventBundle,
  EventRunResult,
  GateResult,
  InsurerExposureOutput,
  LifeSafetyGuidance,
  OverallStatus,
} from "../lib/types";

export type RunPhase = "idle" | "streaming" | "complete" | "error";

export interface SourceStatus {
  status: "started" | "done" | "failed";
  itemCount?: number;
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
  overallStatus: OverallStatus | null;
  approvalStatus: ApprovalStatus | null;
  approvalNote: string | null;
  error: string | null;
  startedAt: number | null;
  approvalRecordedAt: number | null;
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
  overallStatus: null,
  approvalStatus: null,
  approvalNote: null,
  error: null,
  startedAt: null,
  approvalRecordedAt: null,
};

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
  | { type: "COMPLETE"; result: EventRunResult }
  | { type: "ERROR"; message: string }
  | { type: "APPROVAL"; result: EventRunResult }
  | { type: "RESET" };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case "START":
      return { ...initialState, phase: "streaming", startedAt: Date.now() };
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
