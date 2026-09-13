import type { ReactNode } from "react";
import { SOURCE_COLORS, SOURCE_LABELS } from "../../lib/format";
import type { EvidenceItem, EvidenceSource } from "../../lib/types";

const SOURCE_ORDER = Object.keys(SOURCE_LABELS) as EvidenceSource[];

function DotSwatch({ color }: { color: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14">
      <circle cx={7} cy={7} r={4.5} fill={color} stroke="#000" strokeWidth={1} />
    </svg>
  );
}

function DiamondSwatch({ color }: { color: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14">
      <rect x={3.5} y={3.5} width={7} height={7} fill="none" stroke={color} strokeWidth={1.5} transform="rotate(45 7 7)" />
    </svg>
  );
}

function HaloSwatch({ color }: { color: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14">
      <circle cx={7} cy={7} r={7} fill={color} opacity={0.25} />
      <circle cx={7} cy={7} r={3} fill={color} opacity={0.7} />
    </svg>
  );
}

function SquareSwatch({ color, border }: { color: string; border: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14">
      <rect x={3.5} y={3.5} width={7} height={7} fill={color} stroke={border} strokeWidth={1} />
    </svg>
  );
}

function LineSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14">
      <line x1={1} y1={7} x2={13} y2={7} stroke={color} strokeWidth={2.5} strokeDasharray={dashed ? "3 2" : undefined} />
    </svg>
  );
}

function Row({ swatch, label, caveat }: { swatch: ReactNode; label: string; caveat?: string }) {
  return (
    <div className="flex items-center gap-2">
      {swatch}
      <span className="text-[10px] text-body">
        {label}
        {caveat && <span className="text-mute"> — {caveat}</span>}
      </span>
    </div>
  );
}

export function MapLegend({
  items,
  hasPolicies,
  hasEvacuationPlan,
  hasAlertRing,
}: {
  items: EvidenceItem[];
  hasPolicies: boolean;
  hasEvacuationPlan: boolean;
  hasAlertRing: boolean;
}) {
  const present = new Set(items.map((i) => i.source));
  const sources = SOURCE_ORDER.filter((s) => present.has(s));

  return (
    <div className="absolute bottom-3 left-3 z-10 flex max-w-[220px] flex-col gap-1.5 rounded-sm border border-hairline-strong bg-black/80 px-3 py-2 backdrop-blur-sm">
      {sources.map((source) => {
        const color = SOURCE_COLORS[source] ?? "#9a9a9a";
        if (source === "fema") {
          return <Row key={source} swatch={<DiamondSwatch color={color} />} label={SOURCE_LABELS[source]} caveat="declaration point" />;
        }
        if (source === "population_svi") {
          return <Row key={source} swatch={<HaloSwatch color={color} />} label={SOURCE_LABELS[source]} caveat="aggregate, not a boundary" />;
        }
        return <Row key={source} swatch={<DotSwatch color={color} />} label={SOURCE_LABELS[source]} />;
      })}
      {hasPolicies && <Row swatch={<SquareSwatch color="#4d4d4d" border="#9a9a9a" />} label="Insurer policy" />}
      {hasEvacuationPlan && (
        <>
          <Row swatch={<LineSwatch color="#76b900" />} label="Evacuation route" />
          <Row swatch={<LineSwatch color="#fab219" />} label="Route near closure" />
        </>
      )}
      <Row swatch={<LineSwatch color="#76b900" dashed />} label="Event footprint" />
      {hasAlertRing && <Row swatch={<LineSwatch color="#d55181" dashed />} label="NWS alert area" />}
    </div>
  );
}
