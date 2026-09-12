import { Card, CardHeader } from "../../common/Card";
import { Badge } from "../../common/Badge";
import { SOURCE_COLORS, SOURCE_LABELS, timeAgo } from "../../../lib/format";
import type { EvidenceItem, EvidenceSource } from "../../../lib/types";

const ADAPTERS: EvidenceSource[] = [
  "nws",
  "usgs",
  "hcfcd",
  "transtar",
  "fema",
  "population_svi",
  "osm_shelter",
  "field_image",
];

export function SourceHealthStrip({ items, hasFieldImage }: { items: EvidenceItem[]; hasFieldImage: boolean }) {
  return (
    <Card>
      <CardHeader eyebrow="Evidence Health" title="Source Adapters" />
      {/* grid-cols-3, not a wider viewport tier: this card's actual width
          tracks the main content column (viewport minus two fixed-width
          sidebars), which stays well under six comfortable columns even at
          large viewports — a lg:/xl: breakpoint here was sizing off the
          viewport instead of the container and cramming 6 badges into a
          ~600px column at 1280px viewports. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ADAPTERS.map((source) => {
          const sourceItems = items.filter((i) => i.source === source);
          const present = source === "field_image" ? hasFieldImage : sourceItems.length > 0;
          const latest = sourceItems.reduce<string | null>(
            (acc, i) => (!acc || i.retrieved_at > acc ? i.retrieved_at : acc),
            null,
          );
          return (
            <div
              key={source}
              className="flex flex-col gap-1 rounded-sm border border-hairline bg-surface p-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-body">
                  <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_COLORS[source] }} />
                  {SOURCE_LABELS[source]}
                </span>
                <Badge tone={present ? "good" : "neutral"}>{present ? "Live" : "Absent"}</Badge>
              </div>
              <span className="text-[10px] text-stone">
                {source === "field_image"
                  ? present
                    ? "1 image"
                    : "no image"
                  : `${sourceItems.length} item${sourceItems.length === 1 ? "" : "s"}`}
                {latest && ` · ${timeAgo(latest)}`}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
