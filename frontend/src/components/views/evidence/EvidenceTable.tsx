import { Fragment, useMemo, useState } from "react";
import { Card, CardHeader } from "../../common/Card";
import { Badge } from "../../common/Badge";
import { EmptyState } from "../../common/States";
import { SOURCE_COLORS, SOURCE_LABELS, fmtDateTime } from "../../../lib/format";
import type { EvidenceItem } from "../../../lib/types";

export function EvidenceTable({
  items,
  filterIds,
  onClearFilter,
}: {
  items: EvidenceItem[];
  filterIds: string[] | null;
  onClearFilter: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(
    () => (filterIds ? items.filter((i) => filterIds.includes(i.item_id)) : items),
    [items, filterIds],
  );

  return (
    <Card corner id="evidence-table">
      <CardHeader
        eyebrow="Evidence Lineage"
        title={`${visible.length} record${visible.length === 1 ? "" : "s"}`}
        right={
          filterIds && (
            <button onClick={onClearFilter} className="text-xs text-primary hover:underline">
              Clear filter ({filterIds.length})
            </button>
          )
        }
      />
      {visible.length === 0 ? (
        <EmptyState title="No evidence yet" body="Run the event to fan out the five evidence adapters." />
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-surface-elevated text-[10px] uppercase tracking-wide text-mute">
              <tr>
                <th className="pb-2 pr-3 font-bold">Source</th>
                <th className="pb-2 pr-3 font-bold">Record</th>
                <th className="pb-2 pr-3 font-bold">Observed</th>
                <th className="pb-2 pr-3 font-bold">Retrieved</th>
                <th className="pb-2 pr-3 font-bold">Summary</th>
                <th className="pb-2 font-bold">Mode</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <Fragment key={item.item_id}>
                  <tr
                    className="cursor-pointer border-t border-hairline hover:bg-surface-raised"
                    onClick={() => setExpanded(expanded === item.item_id ? null : item.item_id)}
                  >
                    <td className="py-2 pr-3">
                      <Badge dot={SOURCE_COLORS[item.source]} tone="neutral">
                        {SOURCE_LABELS[item.source] ?? item.source}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 font-mono text-stone">{item.source_record_id}</td>
                    <td className="py-2 pr-3 font-mono text-stone">{fmtDateTime(item.observed_at)}</td>
                    <td className="py-2 pr-3 font-mono text-stone">{fmtDateTime(item.retrieved_at)}</td>
                    <td className="max-w-[280px] truncate py-2 pr-3 text-body">{item.summary}</td>
                    <td className="py-2">
                      <Badge tone={item.is_replay ? "neutral" : "primary"}>{item.is_replay ? "Replay" : "Live"}</Badge>
                    </td>
                  </tr>
                  {expanded === item.item_id && (
                    <tr className="border-t border-hairline bg-surface">
                      <td colSpan={6} className="p-3">
                        <pre className="max-h-52 overflow-auto rounded-sm bg-black/40 p-3 font-mono text-[10px] text-stone">
                          {JSON.stringify(item.raw, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
