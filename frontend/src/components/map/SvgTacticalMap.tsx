import { useMemo, useState } from "react";
import { boundsOf, makeProjector } from "../../lib/geo";
import { SOURCE_COLORS, SOURCE_LABELS } from "../../lib/format";
import type { EvacuationPlan, EvidenceItem, InsurerExposureLine } from "../../lib/types";

const WIDTH = 800;
const HEIGHT = 520;

export function SvgTacticalMap({
  polygon,
  items,
  policies,
  alertRing,
  evacuationPlan,
}: {
  polygon: [number, number][];
  items: EvidenceItem[];
  policies: InsurerExposureLine[];
  alertRing: [number, number][] | null;
  evacuationPlan?: EvacuationPlan | null;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const project = useMemo(() => {
    const points = [
      ...polygon.map(([lon, lat]) => ({ lon, lat })),
      ...items.map((i) => ({ lon: i.longitude, lat: i.latitude })),
    ];
    const b = boundsOf(points, 0.12);
    return makeProjector(b, WIDTH, HEIGHT);
  }, [polygon, items]);

  const polygonPts = polygon.map(([lon, lat]) => project({ lon, lat }));
  const alertPts = alertRing?.map(([lon, lat]) => project({ lon, lat }));

  const gridLines = 8;

  return (
    <div className="relative overflow-hidden rounded-sm border border-hairline bg-[#07100a]">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[420px] w-full">
        <defs>
          <pattern id="grid" width={WIDTH / gridLines} height={WIDTH / gridLines} patternUnits="userSpaceOnUse">
            <path d={`M ${WIDTH / gridLines} 0 L 0 0 0 ${WIDTH / gridLines}`} fill="none" stroke="#1a2e20" strokeWidth="1" />
          </pattern>
          <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
            <stop offset="60%" stopColor="black" stopOpacity="0" />
            <stop offset="100%" stopColor="black" stopOpacity="0.55" />
          </radialGradient>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#grid)" />

        {/* Event footprint polygon */}
        <polygon
          points={polygonPts.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgba(118,185,0,0.06)"
          stroke="#76b900"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />

        {alertPts && (
          <polygon
            points={alertPts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(213,81,129,0.08)"
            stroke="#d55181"
            strokeWidth={1.5}
            strokeDasharray="2 2"
          />
        )}

        {/* Evacuation routes */}
        {evacuationPlan?.routes.map((route, i) => {
          const pts = route.route_geometry.map(([lon, lat]) => project({ lon, lat }));
          return (
            <polyline
              key={i}
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={route.closure_warnings.length > 0 ? "#fab219" : "#76b900"}
              strokeWidth={2.5}
              strokeDasharray={route.routed_live ? undefined : "3 3"}
              opacity={0.85}
            />
          );
        })}
        {evacuationPlan && (
          <circle
            cx={project({ lon: evacuationPlan.origin_longitude, lat: evacuationPlan.origin_latitude }).x}
            cy={project({ lon: evacuationPlan.origin_longitude, lat: evacuationPlan.origin_latitude }).y}
            r={6}
            fill="#76b900"
            stroke="#000"
            strokeWidth={1.5}
          />
        )}

        {/* Insurer policy markers (squares) */}
        {policies.map((p) => {
          const pt = project({ lon: p.longitude, lat: p.latitude });
          return (
            <rect
              key={p.policy_id}
              x={pt.x - 3.5}
              y={pt.y - 3.5}
              width={7}
              height={7}
              fill="#4d4d4d"
              stroke="#9a9a9a"
              strokeWidth={1}
              onMouseEnter={() => setHover(`${p.policy_id} — TIV ${p.total_insured_value.toLocaleString()}`)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {/* Evidence points */}
        {items.map((item) => {
          const pt = project({ lon: item.longitude, lat: item.latitude });
          const color = SOURCE_COLORS[item.source] ?? "#9a9a9a";
          return (
            <g key={item.item_id}>
              <circle cx={pt.x} cy={pt.y} r={9} fill={color} opacity={0.15} />
              <circle
                cx={pt.x}
                cy={pt.y}
                r={4.5}
                fill={color}
                stroke="#000"
                strokeWidth={1}
                onMouseEnter={() => setHover(`${SOURCE_LABELS[item.source]} — ${item.summary}`)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer"
              />
            </g>
          );
        })}

        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="url(#vignette)" pointerEvents="none" />
      </svg>

      <div className="absolute left-3 top-3 rounded-sm border border-hairline-strong bg-black/70 px-2 py-1 text-[10px] uppercase tracking-wide text-mute">
        Tactical view · illustrative geography · synthetic layout
      </div>
      <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-hairline-strong bg-black/70 text-[10px] font-bold text-mute">
        N↑
      </div>
      {hover && (
        <div className="absolute bottom-3 left-3 max-w-[70%] rounded-sm border border-hairline-strong bg-black/85 px-3 py-1.5 text-xs text-body">
          {hover}
        </div>
      )}
    </div>
  );
}
