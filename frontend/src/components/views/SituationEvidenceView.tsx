import { useMemo, useState } from "react";
import { TacticalMap } from "../map/TacticalMap";
import { EvidenceTable } from "./evidence/EvidenceTable";
import { SourceHealthStrip } from "./evidence/SourceHealthStrip";
import { GaugeChart } from "./evidence/GaugeChart";
import { Card, CardHeader } from "../common/Card";
import { Badge } from "../common/Badge";
import { EmptyState } from "../common/States";
import { fmtDateTime } from "../../lib/format";
import type { RunState } from "../../hooks/useEventRun";

export function SituationEvidenceView({
  state,
  evidenceFilter,
  onClearFilter,
}: {
  state: RunState;
  evidenceFilter: string[] | null;
  onClearFilter: () => void;
}) {
  const [showAllOnMap] = useState(true);
  const event = state.event;

  const alertRing = useMemo<[number, number][] | null>(() => {
    const nws = event?.items.find((i) => i.source === "nws");
    const geom = (nws?.raw as { geometry?: { coordinates?: [number, number][][] } } | undefined)?.geometry;
    return geom?.coordinates?.[0] ?? null;
  }, [event]);

  if (!event) {
    return (
      <EmptyState
        title="No event loaded"
        body='Click "Run Houston Event" to assemble evidence from NWS, USGS, HCFCD, TranStar and FEMA.'
      />
    );
  }

  const policies = state.insurerExposure?.lines ?? [];

  return (
    <div className="flex flex-col gap-4" id="situation">
      <Card>
        <CardHeader
          eyebrow="Event Bundle"
          title={event.label}
          right={<Badge tone={event.evidence_mode === "replay" ? "neutral" : "primary"}>{event.evidence_mode}</Badge>}
        />
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-mute">Window start</div>
            <div className="mt-0.5 font-mono text-body">{fmtDateTime(event.window_start)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-mute">Window end</div>
            <div className="mt-0.5 font-mono text-body">{fmtDateTime(event.window_end)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-mute">Evidence items</div>
            <div className="mt-0.5 font-mono text-body">{event.items.length}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-mute">Event ID</div>
            <div className="mt-0.5 font-mono text-body">{event.event_id}</div>
          </div>
        </div>
      </Card>

      <TacticalMap
        polygon={event.polygon}
        items={showAllOnMap ? event.items : []}
        policies={policies}
        alertRing={alertRing}
        evacuationPlan={state.evacuationPlan}
      />

      <SourceHealthStrip items={event.items} hasFieldImage={!!event.field_image_path} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        <EvidenceTable items={event.items} filterIds={evidenceFilter} onClearFilter={onClearFilter} />
        <GaugeChart items={event.items} />
      </div>
    </div>
  );
}
