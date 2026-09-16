import { useEffect, useState } from "react";
import { Card, CardHeader } from "../common/Card";
import { Badge } from "../common/Badge";
import type { Tone } from "../common/Badge";
import { AlertTierBadge } from "../common/AlertTierBadge";
import { Button } from "../common/Button";
import { StatTile } from "../common/StatTile";
import { EmptyState, Spinner } from "../common/States";
import { IconLayers } from "../common/Icons";
import { fmtCurrency, fmtDateTime } from "../../lib/format";
import { api } from "../../lib/api";
import type { EventRunResult, OverallStatus, PortfolioPmlResult } from "../../lib/types";

const OVERALL_STATUS_TONE: Record<OverallStatus, Tone> = {
  blocked: "critical",
  awaiting_approval: "warning",
  approved: "good",
  rejected: "neutral",
};

/** Multi-Event Portfolio — the dashboard a real EOC or a real underwriting
 * desk actually needs: several concurrent incidents at a glance, not just
 * the one this browser tab happens to be watching. Deliberately read-only
 * and purely additive: it reuses the same GET /api/v1/events and
 * GET /api/v1/events/portfolio/pml endpoints every other screen could
 * already call, and touches no part of the single-active-run state
 * (useEventRun) the rest of the app is built on — a duty officer still
 * runs and approves events from Command exactly as before; this is a
 * second, independent window onto the same server-held run history. */
export function PortfolioView() {
  const [runs, setRuns] = useState<EventRunResult[] | null>(null);
  const [pml, setPml] = useState<PortfolioPmlResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventsResult, pmlResult] = await Promise.all([api.listEvents(), api.portfolioPml()]);
      setRuns(eventsResult);
      setPml(pmlResult);
    } catch {
      setError("Could not load the portfolio — try refreshing.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green-pale/30 to-primary/20 text-primary">
            <IconLayers className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">Portfolio</h1>
            <p className="text-sm text-stone">Every event this server holds, at a glance — not just the one loaded in this tab.</p>
          </div>
        </div>
        <Button variant="outline" onClick={refresh} loading={loading} className="h-9 px-4 text-[11px]">
          Refresh
        </Button>
      </div>

      {pml && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Events held" value={pml.total_events} tone="primary" />
          <StatTile label="Aggregate exposure" value={pml.aggregate_estimated_exposure} format={fmtCurrency} tone="warning" />
          <StatTile label="Aggregate TIV" value={pml.aggregate_tiv} format={fmtCurrency} />
          <StatTile label="Cities represented" value={Object.keys(pml.by_city).length} />
        </div>
      )}

      {error && (
        <Card>
          <p className="text-sm text-[#ff6b6b]">{error}</p>
        </Card>
      )}

      {loading && !runs ? (
        <div className="flex items-center gap-2 py-8 text-sm text-stone">
          <Spinner size={16} /> Loading portfolio…
        </div>
      ) : !runs || runs.length === 0 ? (
        <EmptyState title="No events yet" body="Runs from any persona appear here the moment they complete." />
      ) : (
        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardHeader eyebrow="Cross-Event View" title={`${runs.length} event${runs.length === 1 ? "" : "s"}`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-t border-hairline text-[10px] uppercase tracking-wide text-mute">
                <tr>
                  <th className="px-4 py-2 font-bold">City / Label</th>
                  <th className="px-4 py-2 font-bold">Started</th>
                  <th className="px-4 py-2 font-bold">Tier</th>
                  <th className="px-4 py-2 font-bold">Status</th>
                  <th className="px-4 py-2 font-bold">Min confidence</th>
                  <th className="px-4 py-2 font-bold">Est. exposure</th>
                </tr>
              </thead>
              <tbody>
                {runs
                  .slice()
                  .sort((a, b) => new Date(b.event.created_at).getTime() - new Date(a.event.created_at).getTime())
                  .map((run) => {
                    const minConf = run.gates.length ? Math.min(...run.gates.map((g) => g.confidence)) : null;
                    return (
                      <tr key={run.event.event_id} className="border-t border-hairline/70">
                        <td className="px-4 py-2.5">
                          <div className="font-bold text-ink">{run.event.city_label}</div>
                          <div className="text-stone">{run.event.label}</div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-stone">{fmtDateTime(run.event.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <AlertTierBadge tier={run.alert_tier} />
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={OVERALL_STATUS_TONE[run.overall_status]}>
                            {run.overall_status.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-stone">
                          {minConf != null ? `${(minConf * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-ink">
                          {run.insurer_exposure ? fmtCurrency(run.insurer_exposure.total_estimated_exposure) : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
