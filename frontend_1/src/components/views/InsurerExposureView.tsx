import { useMemo, useState } from "react";
import { StatTile } from "../common/StatTile";
import { Card, CardHeader } from "../common/Card";
import { Badge } from "../common/Badge";
import { AiBadge } from "../common/AiBadge";
import { EmptyState } from "../common/States";
import { fmtCurrency, fmtCurrencyFull, fmtPct } from "../../lib/format";
import type { InsurerExposureLine } from "../../lib/types";
import type { RunState } from "../../hooks/useEventRun";

type SortKey = keyof InsurerExposureLine;

function WaterfallStage({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-xs text-stone">{label}</span>
      <div className="h-6 flex-1 overflow-hidden rounded-sm bg-surface-raised">
        <div className="flex h-full items-center justify-end rounded-sm bg-[#3987e5] px-2" style={{ width: `${Math.max(pct, 3)}%` }}>
          <span className="whitespace-nowrap text-[10px] font-bold text-white">{fmtCurrency(value)}</span>
        </div>
      </div>
    </div>
  );
}

export function InsurerExposureView({ state }: { state: RunState }) {
  const ie = state.insurerExposure;
  const [sortKey, setSortKey] = useState<SortKey>("capped_at_limit");
  const [sortDesc, setSortDesc] = useState(true);

  const sortedLines = useMemo(() => {
    if (!ie) return [];
    const lines = [...ie.lines];
    lines.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDesc ? bv - av : av - bv;
    });
    return lines;
  }, [ie, sortKey, sortDesc]);

  if (state.phase === "idle") {
    return <EmptyState title="No exposure computed yet" body="Insurer exposure runs in parallel with life-safety synthesis." />;
  }
  if (state.overallStatus === "blocked") {
    return <EmptyState title="Pipeline blocked before exposure calculation" />;
  }
  if (!ie) {
    return <EmptyState title="Awaiting exposure calculation…" />;
  }

  const grossTotal = ie.lines.reduce((s, l) => s + l.gross_loss_estimate, 0);
  const netTotal = ie.lines.reduce((s, l) => s + l.net_of_deductible, 0);
  const max = Math.max(ie.total_tiv_in_footprint, grossTotal, netTotal, ie.total_estimated_exposure);

  const sortHeader = (key: SortKey, label: string) => (
    <th
      className="cursor-pointer select-none pb-2 pr-3 font-bold hover:text-ink"
      onClick={() => {
        if (sortKey === key) setSortDesc((d) => !d);
        else {
          setSortKey(key);
          setSortDesc(true);
        }
      }}
    >
      {label} {sortKey === key ? (sortDesc ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Policies in footprint" value={ie.total_policies_in_footprint} />
        <StatTile label="Total insured value" value={ie.total_tiv_in_footprint} format={fmtCurrency} />
        <StatTile label="Estimated exposure" value={ie.total_estimated_exposure} format={fmtCurrency} tone="warning" />
      </div>

      <Card corner>
        <CardHeader
          eyebrow="Exposure Agent"
          title="Underwriter Narrative"
          right={
            <Badge tone={ie.agent_harness === "deepagents" ? "primary" : "neutral"}>
              {ie.agent_harness === "deepagents" ? "DeepAgents" : "Direct calculation"}
            </Badge>
          }
        />
        {ie.narrative ? (
          <>
            <AiBadge services={["NIM", "DeepAgents", "Relay"]} className="mb-2" />
            <p className="text-sm text-body">{ie.narrative}</p>
          </>
        ) : (
          <p className="text-xs text-stone">
            The Exposure Agent's DeepAgents call fell back this run — figures below are still the same deterministic
            math (compute_insurer_exposure), just without an agent-authored narrative.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader eyebrow="Loss Waterfall" title="TIV → Gross → Net → Capped" />
        <div className="flex flex-col gap-3">
          <WaterfallStage label="Total insured value" value={ie.total_tiv_in_footprint} max={max} />
          <WaterfallStage label="Gross loss estimate" value={grossTotal} max={max} />
          <WaterfallStage label="Net of deductible" value={netTotal} max={max} />
          <WaterfallStage label="Capped at limit" value={ie.total_estimated_exposure} max={max} />
        </div>
      </Card>

      <Card>
        <CardHeader eyebrow="Per-Policy Breakdown" title={`${sortedLines.length} polic${sortedLines.length === 1 ? "y" : "ies"}`} />
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-surface-elevated text-[10px] uppercase tracking-wide text-mute">
              <tr>
                {sortHeader("policy_id", "Policy")}
                {sortHeader("total_insured_value", "TIV")}
                {sortHeader("estimated_damage_ratio", "Damage Ratio")}
                {sortHeader("gross_loss_estimate", "Gross Loss")}
                {sortHeader("deductible", "Deductible")}
                {sortHeader("capped_at_limit", "Capped Exposure")}
              </tr>
            </thead>
            <tbody>
              {sortedLines.map((l) => (
                <tr key={l.policy_id} className="border-t border-hairline">
                  <td className="py-2 pr-3 font-mono text-body">{l.policy_id}</td>
                  <td className="py-2 pr-3 font-mono text-stone">{fmtCurrencyFull(l.total_insured_value)}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-raised">
                        <div className="h-full rounded-full bg-[#fab219]" style={{ width: `${(l.estimated_damage_ratio / 0.6) * 100}%` }} />
                      </div>
                      <span className="font-mono text-stone">{fmtPct(l.estimated_damage_ratio)}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 font-mono text-stone">{fmtCurrencyFull(l.gross_loss_estimate)}</td>
                  <td className="py-2 pr-3 font-mono text-stone">{fmtCurrencyFull(l.deductible)}</td>
                  <td className="py-2 font-mono font-bold text-ink">{fmtCurrencyFull(l.capped_at_limit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card corner>
        <CardHeader eyebrow="Methodology" title="Deterministic, Not a Black Box" />
        <blockquote className="border-l-2 border-primary pl-4 text-sm italic text-body">{ie.methodology}</blockquote>
      </Card>
    </div>
  );
}
