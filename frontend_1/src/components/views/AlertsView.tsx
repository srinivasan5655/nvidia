import clsx from "clsx";
import { Card } from "../common/Card";
import { Badge } from "../common/Badge";
import type { Tone } from "../common/Badge";
import { EmptyState } from "../common/States";
import { IconBell, IconCloudRain, IconGauge, IconMap, IconShieldCheck, IconMapPin, IconLayers } from "../common/Icons";
import { timeAgo, fmtDateTime, sourceLabelFor, SOURCE_COLORS } from "../../lib/format";
import type { RunState } from "../../hooks/useEventRun";
import type { EvidenceItem } from "../../lib/types";

const WARNING_SOURCES = new Set(["nws"]);
const GAUGE_SOURCES = new Set(["hcfcd"]);

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

const SOURCE_ICONS: Record<string, typeof IconBell> = {
  nws: IconCloudRain,
  hcfcd: IconGauge,
  usgs: IconGauge,
  transtar: IconMap,
  fema: IconShieldCheck,
  osm_shelter: IconMapPin,
};

const SEVERITY_TONE: Record<string, Tone> = {
  extreme: "critical",
  severe: "critical",
  moderate: "warning",
  minor: "neutral",
  unknown: "neutral",
};

/** The rich card for an official NWS-style warning — pulls severity/urgency/
 * certainty/instruction/expiry straight out of the untouched raw payload
 * (raw.properties, same shape api.weather.gov returns) instead of the
 * flattened one-line `summary` string every other source falls back to,
 * since this is the one source with enough structure to earn its own
 * layout. "Extreme" gets a pulsing glow so it reads as materially more
 * urgent than "Severe" at a glance, not just a different word. */
function WarningCard({ item, city }: { item: EvidenceItem; city: string }) {
  const props = asRecord(item.raw)?.properties ? asRecord(asRecord(item.raw)!.properties) : undefined;
  const severity = (asString(props?.severity) ?? "Unknown").toLowerCase();
  const urgency = asString(props?.urgency);
  const certainty = asString(props?.certainty);
  const instruction = asString(props?.instruction);
  const expires = asString(props?.expires);
  const isExtreme = severity === "extreme";

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border p-4",
        isExtreme ? "border-[#d03b3b]/70 bg-[#d03b3b]/10" : "border-hairline-strong bg-surface/80",
      )}
      style={isExtreme ? { boxShadow: "0 0 24px -6px rgba(208,59,59,0.55)" } : undefined}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[severity] ?? "neutral"}>{severity}</Badge>
        {urgency && <Badge tone="neutral">{urgency}</Badge>}
        {certainty && <Badge tone="neutral">{certainty}</Badge>}
        <span className="ml-auto text-[11px] font-bold uppercase tracking-wide text-mute">
          {sourceLabelFor(city, item.source)} · {timeAgo(item.retrieved_at)}
        </span>
      </div>
      <p className="text-base font-bold leading-snug text-ink">{item.summary}</p>
      {instruction && (
        <div className="mt-3 rounded-xl border border-[#ff8a8a]/30 bg-[#d03b3b]/10 px-3 py-2 text-sm font-bold text-[#ff8a8a]">
          {instruction}
        </div>
      )}
      {expires && (
        <div className="mt-2 text-[11px] uppercase tracking-wide text-stone">Expires {fmtDateTime(expires)}</div>
      )}
    </div>
  );
}

/** Gauge-style reading (HCFCD/USGS) — a status pill instead of a severity
 * word, since these sources report a sensor state, not a declared hazard. */
function GaugeCard({ item, city }: { item: EvidenceItem; city: string }) {
  const attrs = asRecord(asRecord(item.raw)?.attributes);
  const status = (asString(attrs?.SensorStatus) ?? "normal").toLowerCase();
  const tone: Tone = status === "high" ? "critical" : status === "elevated" ? "warning" : "good";
  return (
    <div className="flex items-start gap-3 border-b border-hairline/70 py-4 last:border-0">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${SOURCE_COLORS.hcfcd}22`, color: SOURCE_COLORS.hcfcd }}>
        <IconGauge className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-mute">
          {sourceLabelFor(city, item.source)} · {timeAgo(item.retrieved_at)}
          <Badge tone={tone} className="ml-auto">
            {status}
          </Badge>
        </div>
        <p className="text-base text-ink">{item.summary}</p>
      </div>
    </div>
  );
}

function OtherRow({ item, city }: { item: EvidenceItem; city: string }) {
  const Icon = SOURCE_ICONS[item.source] ?? IconLayers;
  const color = SOURCE_COLORS[item.source] ?? "#9a9a9a";
  const flat = asRecord(item.raw);
  const trailingBadge =
    asString(flat?.status) ?? asString(flat?.declarationType) ?? asString(flat?.incidentType) ?? undefined;

  return (
    <div className="flex items-start gap-3 border-b border-hairline/70 py-3.5 last:border-0">
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${color}22`, color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-mute">
          {sourceLabelFor(city, item.source)} · {timeAgo(item.retrieved_at)}
          {trailingBadge && (
            <Badge tone="neutral" className="ml-auto">
              {trailingBadge}
            </Badge>
          )}
        </div>
        <p className="text-sm text-body">{item.summary}</p>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "critical" }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface/80 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-mute">{label}</div>
      <div className={clsx("mt-0.5 font-mono text-xl font-bold tabular-nums", tone === "critical" ? "text-[#ff6b6b]" : "text-ink")}>
        {value}
      </div>
    </div>
  );
}

export function AlertsView({ state }: { state: RunState }) {
  if (!state.event) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          title="No alerts yet"
          body='Go to Home and press "Check Now" to gather the latest weather and flood reports.'
        />
      </div>
    );
  }

  const city = state.event.city;
  const warnings = state.event.items.filter((i) => WARNING_SOURCES.has(i.source));
  const gauges = state.event.items.filter((i) => GAUGE_SOURCES.has(i.source));
  const other = state.event.items.filter((i) => !WARNING_SOURCES.has(i.source) && !GAUGE_SOURCES.has(i.source));

  const severities = warnings
    .map((w) => asString(asRecord(asRecord(w.raw)?.properties)?.severity)?.toLowerCase())
    .filter((s): s is string => !!s);
  const worstSeverity =
    ["extreme", "severe", "moderate", "minor"].find((s) => severities.includes(s)) ?? (warnings.length ? "unknown" : null);
  const mostRecent = state.event.items.reduce<string | null>(
    (latest, i) => (!latest || i.retrieved_at > latest ? i.retrieved_at : latest),
    null,
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff8a8a]/30 to-[#d03b3b]/20 text-[#ff8a8a]">
          <IconBell className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Active Alerts</h1>
          <p className="text-sm text-stone">Official weather and flood warnings for {state.event.city_label}.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Active warnings" value={String(warnings.length)} tone={warnings.length > 0 ? "critical" : "default"} />
        <StatTile label="Highest severity" value={worstSeverity ?? "None"} tone={worstSeverity === "extreme" || worstSeverity === "severe" ? "critical" : "default"} />
        <StatTile label="Last updated" value={mostRecent ? timeAgo(mostRecent) : "—"} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-mute">Official Warnings</h2>
        {warnings.length === 0 ? (
          <Card>
            <p className="py-4 text-center text-stone">No official warnings right now.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {warnings.map((item) => (
              <WarningCard key={item.item_id} item={item} city={city} />
            ))}
          </div>
        )}
      </div>

      {gauges.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-mute">Gauge Status</h2>
          <Card>
            {gauges.map((item) => (
              <GaugeCard key={item.item_id} item={item} city={city} />
            ))}
          </Card>
        </div>
      )}

      {other.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-mute">Other Information</h2>
          <Card padded={false} className="px-5">
            {other.map((item) => (
              <OtherRow key={item.item_id} item={item} city={city} />
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
