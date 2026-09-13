import { useMemo, useState } from "react";
import { Card, CardHeader } from "../../common/Card";
import { Badge } from "../../common/Badge";
import { EmptyState } from "../../common/States";
import { fmtTime } from "../../../lib/format";
import { dedupeRelayRecords } from "../../../lib/relay";
import type { RelayRecord, RelayStatus } from "../../../lib/types";

const CATEGORY_TONE: Record<string, "primary" | "info" | "warning" | "neutral"> = {
  llm: "primary",
  agent: "info",
  guardrail: "warning",
  tool: "neutral",
};

function measurement(r: RelayRecord, name: string): number {
  return r.data?.measurements?.find((m) => m.name === name)?.value ?? 0;
}

function StatTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "primary" }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface/80 p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-mute">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${tone === "primary" ? "text-primary" : "text-ink"}`}>
        {value}
      </div>
    </div>
  );
}

/** The NeMo Relay observability surface: every LLM call in this app records
 * its real token usage as a relay `scope.metric()` mark (see
 * nvidia_runtime/relay_governance.py's `record_token_usage` — verified
 * against the installed 0.8.4 SDK, not estimated), and every gate/tool/agent
 * call is a relay scope. This aggregates those two record shapes into
 * token totals + a per-model breakdown + a chronological activity log,
 * instead of the flat raw-record table this replaced. */
export function RelayObservability({
  status,
  records: rawRecords,
}: {
  status: RelayStatus | undefined;
  records: RelayRecord[] | undefined;
}) {
  const [expanded, setExpanded] = useState(false);

  const { totals, byModel, activity } = useMemo(() => {
    const records = rawRecords ? dedupeRelayRecords(rawRecords) : [];
    let prompt = 0;
    let completion = 0;
    let total = 0;
    let llmCalls = 0;
    const byModel = new Map<string, { prompt: number; completion: number; total: number; calls: number }>();

    for (const r of records) {
      if (r.kind === "mark" && r.name === "llm.tokens") {
        const p = measurement(r, "prompt_tokens");
        const c = measurement(r, "completion_tokens");
        const t = measurement(r, "total_tokens");
        prompt += p;
        completion += c;
        total += t;
        llmCalls += 1;
        const model = (r.metadata?.model as string | undefined) ?? "unknown";
        const entry = byModel.get(model) ?? { prompt: 0, completion: 0, total: 0, calls: 0 };
        entry.prompt += p;
        entry.completion += c;
        entry.total += t;
        entry.calls += 1;
        byModel.set(model, entry);
      }
    }

    const activity = records
      .filter((r) => r.kind === "scope")
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return { totals: { prompt, completion, total, llmCalls }, byModel, activity };
  }, [rawRecords]);

  if (!status?.enabled) {
    return (
      <Card corner>
        <CardHeader eyebrow="Observability" title="NeMo Relay" />
        <EmptyState
          title="Relay is disabled"
          body="Set RELAY_ENABLED=true on the backend to record token usage and agent activity."
        />
      </Card>
    );
  }

  if (!status.exists || activity.length === 0) {
    return (
      <Card corner>
        <CardHeader eyebrow="Observability" title="NeMo Relay" />
        <EmptyState title="No activity recorded yet" body="Go to Home and run a check to populate this dashboard." />
      </Card>
    );
  }

  const visibleActivity = expanded ? activity : activity.slice(0, 12);

  return (
    <Card corner>
      <CardHeader
        eyebrow="Observability"
        title="NeMo Relay"
        right={<Badge tone="good">{status.record_count} records</Badge>}
      />
      <p className="mb-4 text-xs text-stone">
        Real token counts and agent activity across the last {activity.length} recorded scopes — a rolling ledger,
        not just this run.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total tokens" value={totals.total.toLocaleString()} tone="primary" />
        <StatTile label="Prompt tokens" value={totals.prompt.toLocaleString()} />
        <StatTile label="Completion tokens" value={totals.completion.toLocaleString()} />
        <StatTile label="LLM calls" value={String(totals.llmCalls)} />
      </div>

      {byModel.size > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-mute">Tokens by model</div>
          <div className="flex flex-col gap-1.5">
            {Array.from(byModel.entries()).map(([model, m]) => (
              <div
                key={model}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-surface p-2.5 text-xs"
              >
                <span className="font-mono text-body">{model}</span>
                <span className="flex gap-3 text-stone">
                  <span>
                    <span className="font-mono font-bold text-ink">{m.calls}</span> calls
                  </span>
                  <span>
                    <span className="font-mono font-bold text-ink">{m.total.toLocaleString()}</span> tokens
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wider text-mute">Agent Activity Log</div>
        {activity.length > 12 && (
          <button onClick={() => setExpanded((e) => !e)} className="text-[11px] font-bold text-primary hover:underline">
            {expanded ? "Show less" : `Show all ${activity.length}`}
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-surface-elevated text-[10px] uppercase tracking-wide text-mute">
            <tr>
              <th className="pb-2 pr-2 font-bold">Time</th>
              <th className="pb-2 pr-2 font-bold">Category</th>
              <th className="pb-2 pr-2 font-bold">Agent / Scope</th>
              <th className="pb-2 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleActivity.map((r) => (
              <tr key={r.uuid} className="border-t border-hairline">
                <td className="py-1.5 pr-2 font-mono text-stone">{fmtTime(r.timestamp)}</td>
                <td className="py-1.5 pr-2">
                  <Badge tone={CATEGORY_TONE[r.category ?? ""] ?? "neutral"}>{r.category ?? "custom"}</Badge>
                </td>
                <td className="py-1.5 pr-2 font-mono text-body">{r.name}</td>
                <td className="py-1.5 text-stone">{r.scope_category === "end" ? "Complete" : "Started"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 border-t border-hairline pt-2 text-[10px] text-stone">{status.export_path}</p>
    </Card>
  );
}
