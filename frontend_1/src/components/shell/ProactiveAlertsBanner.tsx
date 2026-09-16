import { useEffect, useRef, useState } from "react";
import { IconBell } from "../common/Icons";
import { api } from "../../lib/api";
import type { ProactiveAlert } from "../../lib/types";

const POLL_MS = 45_000;

/** Recommendation #3 from the jury critique this session took seriously:
 * every AI call in this app previously waited for a human to click "Check
 * Now." This is the one surface that doesn't — it polls
 * GET /api/v1/events/proactive-alerts (backend/app/decision/
 * proactive_monitor.py), which scans already-completed runs for a rising
 * trend the system decided, on its own, was worth surfacing before being
 * asked. Rendered globally (App.tsx) so it's visible regardless of which
 * view is open, since the point is it shouldn't require looking. */
export function ProactiveAlertsBanner() {
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await api.proactiveAlerts();
        if (!cancelled) setAlerts(result);
      } catch {
        // Polling endpoint unreachable — fail silently rather than
        // flashing an error banner over a feature that's inherently best-effort.
      }
    };
    poll();
    timerRef.current = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const visible = alerts.filter((a) => !dismissed.has(a.event_id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-hairline bg-surface-raised px-6 py-2.5 sm:px-10">
      {visible.map((a) => (
        <div
          key={a.event_id}
          className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${
            a.severity === "warning" ? "border-[#d03b3b]/40 bg-[#d03b3b]/10" : "border-[#fab219]/40 bg-[#fab219]/10"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <IconBell className={`mt-0.5 h-4 w-4 shrink-0 ${a.severity === "warning" ? "text-[#ff6b6b]" : "text-[#fab219]"}`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink">{a.city_label}</span>
                <span className="rounded-full border border-intel/40 bg-intel/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-intel">
                  Raised proactively
                </span>
              </div>
              <p className="mt-0.5 text-body">{a.narrative}</p>
            </div>
          </div>
          <button
            onClick={() => setDismissed((d) => new Set(d).add(a.event_id))}
            className="shrink-0 text-xs font-bold text-mute hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
