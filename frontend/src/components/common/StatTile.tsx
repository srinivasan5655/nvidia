import { useEffect, useRef, useState } from "react";
import { Card } from "./Card";

/** Animates a numeric readout from 0 to `value` — a restrained count-up, not
 * a decorative effect: it draws the eye to the number the instant new
 * evidence lands, which is the whole point of a mission-control tile. */
function useCountUp(value: number, durationMs = 700) {
  const [display, setDisplay] = useState(0);
  const start = useRef<number | null>(null);
  const from = useRef(0);

  useEffect(() => {
    from.current = display;
    start.current = null;
    let raf = 0;
    const step = (t: number) => {
      if (start.current === null) start.current = t;
      const progress = Math.min(1, (t - start.current) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from.current + (value - from.current) * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return display;
}

export function StatTile({
  label,
  value,
  suffix,
  format,
  tone = "default",
  caption,
}: {
  label: string;
  value: number;
  suffix?: string;
  format?: (n: number) => string;
  tone?: "default" | "primary" | "warning" | "critical";
  caption?: string;
}) {
  const animated = useCountUp(value);
  const display = format ? format(animated) : Math.round(animated).toLocaleString();
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "warning"
        ? "text-[#fab219]"
        : tone === "critical"
          ? "text-[#ff6b6b]"
          : "text-ink";

  return (
    <Card>
      <div className="text-[11px] font-bold uppercase tracking-wider text-mute">{label}</div>
      <div className={`mt-2 font-mono text-3xl font-bold tabular-nums ${toneClass}`}>
        {display}
        {suffix && <span className="ml-1 text-lg text-mute">{suffix}</span>}
      </div>
      {caption && <div className="mt-1 text-xs text-stone">{caption}</div>}
    </Card>
  );
}
