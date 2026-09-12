import { fmtPct } from "../../lib/format";

function colorFor(v: number): string {
  if (v >= 0.75) return "#0ca30c";
  if (v >= 0.5) return "#fab219";
  return "#d03b3b";
}

export function ConfidenceBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const color = colorFor(pct);
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-mute">
          <span>{label}</span>
          <span className="font-mono font-bold" style={{ color }}>
            {fmtPct(pct, 0)}
          </span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}
