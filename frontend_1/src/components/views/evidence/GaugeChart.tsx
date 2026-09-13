import { useMemo, useState } from "react";
import { Card, CardHeader } from "../../common/Card";
import { EmptyState } from "../../common/States";
import { fmtTime } from "../../../lib/format";
import type { EvidenceItem } from "../../../lib/types";

interface Reading {
  value: number;
  dateTime: string;
}

const W = 560;
const H = 160;
const PAD = 28;

export function GaugeChart({ items }: { items: EvidenceItem[] }) {
  const brays = items.find((i) => i.source === "usgs" && i.source_record_id.startsWith("08074500"));

  const readings: Reading[] = useMemo(() => {
    if (!brays) return [];
    try {
      const raw = brays.raw as { values?: { value?: { value: string; dateTime: string }[] }[] };
      const arr = raw.values?.[0]?.value ?? [];
      return arr.map((v) => ({ value: parseFloat(v.value), dateTime: v.dateTime }));
    } catch {
      return [];
    }
  }, [brays]);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!brays || readings.length === 0) {
    return (
      <Card>
        <CardHeader eyebrow="Time Series" title="Brays Bayou Gauge Height" />
        <EmptyState title="No time-series evidence in this run" />
      </Card>
    );
  }

  const values = readings.map((r) => r.value);
  const min = Math.min(...values) - 1;
  const max = Math.max(...values) + 1;
  const x = (i: number) => PAD + (i / Math.max(1, readings.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);

  const path = readings.map((r, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(r.value)}`).join(" ");
  const last = readings[readings.length - 1];

  return (
    <Card>
      <CardHeader
        eyebrow="Time Series · The Only Real Sequence In This Bundle"
        title="Brays Bayou Gauge Height (ft)"
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={PAD + f * (H - PAD * 2)}
            y2={PAD + f * (H - PAD * 2)}
            stroke="#2c2c2c"
            strokeWidth={1}
          />
        ))}
        <path d={path} fill="none" stroke="#3987e5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {readings.map((r, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(r.value)}
            r={hoverIdx === i ? 6 : 4}
            fill="#3987e5"
            stroke="#000"
            strokeWidth={1.5}
            className="cursor-pointer"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}
        <text x={x(readings.length - 1)} y={y(last.value) - 12} textAnchor="end" fill="#e4e4e4" fontSize="12" fontWeight="700">
          {last.value.toFixed(1)} ft
        </text>
      </svg>
      <div className="flex items-center justify-between text-[10px] text-stone">
        <span>{fmtTime(readings[0].dateTime)}</span>
        <span>{fmtTime(readings[readings.length - 1].dateTime)}</span>
      </div>
      {hoverIdx !== null && (
        <div className="mt-1 text-xs text-body">
          {fmtTime(readings[hoverIdx].dateTime)} — <span className="font-mono font-bold">{readings[hoverIdx].value} ft</span>
        </div>
      )}
    </Card>
  );
}
