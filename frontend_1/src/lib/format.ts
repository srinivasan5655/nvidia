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

export const CITY_INFO: Record<string, { label: string; short: string }> = {
  houston: { label: "Houston, TX", short: "Houston" },
  chennai: { label: "Chennai, India", short: "Chennai" },
  bangalore: { label: "Bengaluru, India", short: "Bengaluru" },
};

// Each of these three cities is anchored to one specific real historical
// event rather than a generic "flooding event" label — Chennai and
// Bangalore's replay fixtures are already themed around these two events'
// real geography (Adyar/Cooum corridor; Bellandur/Koramangala/Silk Board).
export const HISTORICAL_EVENT_LABEL: Record<string, string> = {
  houston: "Houston Heavy-Rain Event",
  chennai: "Cyclone Vardha & December 2015 Chennai Floods",
  bangalore: "September 2022 Bengaluru Urban Floods",
};

// Same evidence sources, relabeled per city so a Chennai/Bangalore run
// reads as its own agencies (IMD, CWC, ...) instead of the US agency names
// the enum keys were originally named after — display-only, the underlying
// `source` value on each EvidenceItem never changes.
const SOURCE_LABELS_BY_CITY: Record<string, Record<string, string>> = {
  chennai: {
    nws: "IMD",
    usgs: "CWC",
    hcfcd: "GCC Stormwater",
    transtar: "Chennai Traffic Police",
    fema: "NDMA",
  },
  bangalore: {
    nws: "IMD",
    usgs: "KSNDMC",
    hcfcd: "BBMP Stormwater",
    transtar: "Bengaluru Traffic Police",
    fema: "NDMA / KSDMA",
  },
};

export function sourceLabelFor(city: string | undefined, source: string): string {
  return SOURCE_LABELS_BY_CITY[city ?? ""]?.[source] ?? SOURCE_LABELS[source] ?? source;
}

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

// Same 3 hex values as STATUS_COLORS but inverted: for an SVI score, high is
// bad (most vulnerable), unlike ConfidenceBar's colorFor where high is good —
// keep this separate rather than reusing that helper.
export function vulnerabilityColor(v: number): string {
  if (v >= 0.75) return "#d03b3b";
  if (v >= 0.5) return "#fab219";
  return "#0ca30c";
}
