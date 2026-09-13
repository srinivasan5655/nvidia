import { useMemo } from "react";
import { Card, CardHeader } from "../common/Card";
import { Badge, statusTone } from "../common/Badge";
import { fmtTime } from "../../lib/format";
import { GATE_LABELS, SOURCE_LABELS } from "../../lib/format";
import type { RunState } from "../../hooks/useEventRun";

interface Entry {
  ts: string;
  epoch: number;
  kind: "evidence" | "gate" | "approval";
  text: string;
  tone: "neutral" | "good" | "warning" | "critical";
}

/** Every row here comes from a real backend timestamp (item.retrieved_at,
 * gate.ran_at) or a client-captured moment (the approval click) — never an
 * invented entry, per the plan's honesty rule. */
export function ActivityFeed({ state }: { state: RunState }) {
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];
    state.event?.items.forEach((item) => {
      list.push({
        ts: item.retrieved_at,
        epoch: new Date(item.retrieved_at).getTime(),
        kind: "evidence",
        text: `${SOURCE_LABELS[item.source] ?? item.source} evidence retrieved — ${item.summary}`,
        tone: "neutral",
      });
    });
    state.gates.forEach((g) => {
      list.push({
        ts: g.ran_at,
        epoch: new Date(g.ran_at).getTime(),
        kind: "gate",
        text: `${GATE_LABELS[g.gate_name] ?? g.gate_name} → ${g.status}`,
        tone: g.status === "passed" ? "good" : g.status === "degraded" ? "warning" : "critical",
      });
    });
    if (state.approvalRecordedAt && state.approvalStatus) {
      const iso = new Date(state.approvalRecordedAt).toISOString();
      list.push({
        ts: iso,
        epoch: state.approvalRecordedAt,
        kind: "approval",
        text: `Human decision recorded: ${state.approvalStatus}`,
        tone: state.approvalStatus === "approved" ? "good" : "critical",
      });
    }
    return list.sort((a, b) => a.epoch - b.epoch);
  }, [state]);

  return (
    <Card>
      <CardHeader eyebrow="Response Activity" title="Live Feed" />
      {entries.length === 0 ? (
        <div className="text-xs text-stone">No activity yet — go to Home and run a check to populate this feed.</div>
      ) : (
        <ol className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
          {entries.map((e, i) => (
            <li key={i} className="flex items-start gap-2 border-b border-hairline pb-2 last:border-0">
              <span className="mt-0.5 shrink-0 font-mono text-[10px] text-stone">{fmtTime(e.ts)}</span>
              <span className="flex-1 text-xs text-body">{e.text}</span>
              {e.kind === "gate" && (
                <Badge tone={statusTone(e.tone === "good" ? "passed" : e.tone === "warning" ? "degraded" : "blocked")}>
                  {e.tone}
                </Badge>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
