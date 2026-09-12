import type {
  EventRunResult,
  ProgressComplete,
  ProgressEvidenceAssembled,
  ProgressGate,
  ProgressOutputsReady,
  RelayRecord,
  RelayStatus,
  RuntimeConfig,
} from "./types";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ? JSON.stringify(body.detail) : detail;
    } catch {
      // body wasn't JSON — keep statusText
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export const api = {
  health: () => fetch("/health").then((r) => jsonOrThrow<{ status: string; service: string }>(r)),

  config: () => fetch("/api/v1/config").then((r) => jsonOrThrow<RuntimeConfig>(r)),

  listEvents: () => fetch("/api/v1/events").then((r) => jsonOrThrow<EventRunResult[]>(r)),

  getEvent: (eventId: string) => fetch(`/api/v1/events/${eventId}`).then((r) => jsonOrThrow<EventRunResult>(r)),

  replay: (body: { label?: string; evidence_mode?: "replay" | "live" | null }) =>
    fetch("/api/v1/events/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => jsonOrThrow<EventRunResult>(r)),

  approve: (eventId: string, decision: "approved" | "rejected", note?: string) =>
    fetch(`/api/v1/events/${eventId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: note ?? null }),
    }).then((r) => jsonOrThrow<EventRunResult>(r)),

  relayStatus: () => fetch("/api/v1/relay/status").then((r) => jsonOrThrow<RelayStatus>(r)),

  relayTrace: (limit = 200) =>
    fetch(`/api/v1/relay/trace?limit=${limit}`).then((r) => jsonOrThrow<RelayRecord[]>(r)),
};

export interface ReplayProgressHandlers {
  onEvidenceAssembled?: (payload: ProgressEvidenceAssembled) => void;
  onGate?: (payload: ProgressGate) => void;
  onOutputsReady?: (payload: ProgressOutputsReady) => void;
  onComplete?: (payload: ProgressComplete) => void;
  onError?: (err: unknown) => void;
}

/**
 * Streams a replay via SSE so the gate pipeline lights up incrementally.
 * Falls back to the plain blocking POST /replay if the stream can't be
 * opened or errors before completion — the demo must never hang on a dead
 * EventSource. Returns a cleanup function.
 */
export function streamReplay(
  label: string,
  handlers: ReplayProgressHandlers,
  evidenceMode: "replay" | "live" = "replay",
): () => void {
  let settled = false;
  let es: EventSource | null = null;

  const fallback = async (reason: unknown) => {
    if (settled) return;
    settled = true;
    es?.close();
    try {
      const result = await api.replay({ label, evidence_mode: evidenceMode });
      handlers.onComplete?.({ result });
    } catch (err) {
      handlers.onError?.(err ?? reason);
    }
  };

  try {
    const url = `/api/v1/events/replay/stream?label=${encodeURIComponent(label)}&evidence_mode=${evidenceMode}`;
    es = new EventSource(url);

    // 220s: worst case runs 4 sequential DeepAgents attempts (vision,
    // hazard, exposure, evacuation), each with its own ~10s fail-fast
    // timeout plus a fallback call, before OSRM routing and the reasoning
    // narrative — observed 45-101s in replay mode. Live mode stacks real
    // external evidence-source calls on top of that (NWS/USGS/HCFCD/FEMA/
    // CDC-SVI/Overpass/TranStar, several of which are slow-to-fail rather
    // than fast, e.g. Overpass/TranStar rejecting live requests) and picks
    // up more variance from NVIDIA's shared serverless inference layer
    // (transient 500s, socket timeouts) — observed 88s on one live run and
    // >150s on another. This margin is deliberately generous: the backend
    // pipeline keeps running to completion in the background regardless of
    // whether the client is still attached (see events.py's
    // replay_event_stream), so watchdog firing early just means a wasted
    // duplicate POST /replay run, not a data-loss risk — but it's still
    // wasted GPU time and a confusing double-run, so it's worth avoiding.
    const watchdog = window.setTimeout(() => fallback(new Error("SSE stream timed out")), 220000);

    es.addEventListener("evidence_assembled", (ev) => {
      handlers.onEvidenceAssembled?.(JSON.parse((ev as MessageEvent).data));
    });
    es.addEventListener("gate", (ev) => {
      handlers.onGate?.(JSON.parse((ev as MessageEvent).data));
    });
    es.addEventListener("outputs_ready", (ev) => {
      handlers.onOutputsReady?.(JSON.parse((ev as MessageEvent).data));
    });
    es.addEventListener("complete", (ev) => {
      settled = true;
      window.clearTimeout(watchdog);
      handlers.onComplete?.(JSON.parse((ev as MessageEvent).data));
      es?.close();
    });
    es.onerror = (err) => {
      window.clearTimeout(watchdog);
      fallback(err);
    };

    return () => {
      window.clearTimeout(watchdog);
      es?.close();
    };
  } catch (err) {
    fallback(err);
    return () => {};
  }
}
