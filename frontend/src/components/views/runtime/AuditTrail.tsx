import { useMemo } from "react";
import { Card, CardHeader } from "../../common/Card";
import { Badge } from "../../common/Badge";
import { EmptyState } from "../../common/States";
import { fmtTime } from "../../../lib/format";
import { dedupeRelayRecords } from "../../../lib/relay";
import type { RelayRecord, RelayStatus } from "../../../lib/types";

export function AuditTrail({ status, records: rawRecords }: { status: RelayStatus | undefined; records: RelayRecord[] | undefined }) {
  const records = useMemo(() => (rawRecords ? dedupeRelayRecords(rawRecords) : rawRecords), [rawRecords]);
  return (
    <Card corner>
      <CardHeader
        eyebrow="Audit Trail"
        title="NeMo Relay Export"
        right={
          status && (
            <Badge tone={status.enabled ? "good" : "neutral"}>
              {status.record_count} record{status.record_count === 1 ? "" : "s"}
            </Badge>
          )
        }
      />
      {!status?.enabled ? (
        <EmptyState
          title="Relay is disabled"
          body="Set RELAY_ENABLED=true on the backend to record and inspect the audit trail."
        />
      ) : !status.exists || (records?.length ?? 0) === 0 ? (
        <EmptyState title="No trace records yet" body="Run the Houston event to populate the ATOF export." />
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-elevated text-[10px] uppercase tracking-wide text-mute">
              <tr>
                <th className="pb-2 pr-2 font-bold">Time</th>
                <th className="pb-2 pr-2 font-bold">Category</th>
                <th className="pb-2 pr-2 font-bold">Scope</th>
                <th className="pb-2 font-bold">UUID</th>
              </tr>
            </thead>
            <tbody>
              {[...records!]
                .reverse()
                .slice(0, 100)
                .map((r) => (
                  <tr key={r.uuid} className="border-t border-hairline">
                    <td className="py-1.5 pr-2 font-mono text-stone">{fmtTime(r.timestamp)}</td>
                    <td className="py-1.5 pr-2">
                      <Badge tone="neutral">{r.category}</Badge>
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-body">{r.name}</td>
                    <td className="py-1.5 font-mono text-[10px] text-stone">{r.uuid.slice(0, 13)}…</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 border-t border-hairline pt-2 text-[10px] text-stone">{status?.export_path}</p>
    </Card>
  );
}
