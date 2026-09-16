import type { AlertTier } from "../../lib/types";

/** NWS/IMD-style public-alerting vocabulary, computed server-side from the
 * real CAP severity/urgency fields already in the NWS/IMD evidence item
 * (backend/app/decision/alert_tiers.py) — a display-only addition next to
 * the existing overall_status badge, never a replacement for it. Both a
 * duty officer and an underwriter already have muscle memory for
 * Watch/Warning/Emergency; this maps onto that vocabulary instead of
 * asking them to learn this app's internal status names. */
const TIER_STYLE: Record<AlertTier, { label: string; dot: string; className: string }> = {
  watch: { label: "Watch", dot: "#fab219", className: "border-[#fab219]/40 bg-[#fab219]/10 text-[#fab219]" },
  warning: { label: "Warning", dot: "#ff9d3d", className: "border-[#ff9d3d]/40 bg-[#ff9d3d]/10 text-[#ff9d3d]" },
  emergency: { label: "Emergency", dot: "#ff6b6b", className: "border-[#ff6b6b]/50 bg-[#ff6b6b]/10 text-[#ff6b6b]" },
};

export function AlertTierBadge({ tier, className = "" }: { tier: AlertTier; className?: string }) {
  const s = TIER_STYLE[tier];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${s.className} ${className}`}
      title="NWS/IMD-style tier, computed from the real severity/urgency fields on this event's hazard alert"
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot, boxShadow: `0 0 6px 1px ${s.dot}99` }} />
      {s.label}
    </span>
  );
}
