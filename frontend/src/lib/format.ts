export function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtCurrencyFull(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return iso;
  const diffMs = Date.now() - d;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export const GATE_LABELS: Record<string, string> = {
  evidence_verifier: "Evidence Verifier",
  confidence_gate: "Confidence Gate",
  openshell_supervisor: "OpenShell Supervisor",
  policy_verifier: "Policy Verifier",
};

export const SOURCE_LABELS: Record<string, string> = {
  nws: "NWS",
  usgs: "USGS",
  hcfcd: "HCFCD",
  transtar: "TranStar",
  fema: "FEMA",
  field_image: "Field Image",
  population_svi: "Population / SVI",
  osm_shelter: "OSM Shelter",
};

// Validated categorical set (dataviz skill, adjacent-pairlist, dark surface
// #0a0a0a) — see scripts/validate_palette.js. Deliberately excludes green/red
// so evidence-source identity never collides with gate-status color (below).
export const SOURCE_COLORS: Record<string, string> = {
  nws: "#3987e5",
  usgs: "#199e70",
  hcfcd: "#c98500",
  transtar: "#d55181",
  fema: "#9085e9",
  population_svi: "#d95926",
  osm_shelter: "#1c9ed1",
  field_image: "#9a9a9a",
};

// Fixed status palette (dataviz skill) — never themed, never reused for
// series identity.
export const STATUS_COLORS: Record<string, string> = {
  passed: "#0ca30c",
  degraded: "#fab219",
  blocked: "#d03b3b",
};
