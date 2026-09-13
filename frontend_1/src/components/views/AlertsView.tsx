import { Card } from "../common/Card";
import { EmptyState } from "../common/States";
import { IconBell } from "../common/Icons";
import { timeAgo, sourceLabelFor } from "../../lib/format";
import type { RunState } from "../../hooks/useEventRun";
import type { EvidenceItem } from "../../lib/types";

/** Official warning sources vs. everything else — the operator needs to
 * see the two flood/weather warning agencies first and clearly, with the
 * remaining sensor/context readings demoted to a quieter secondary list
 * rather than mixed in as equally-weighted rows. */
const WARNING_SOURCES = new Set(["nws", "hcfcd"]);

function AlertRow({ item, city, tone = "warning" }: { item: EvidenceItem; city: string; tone?: "warning" | "neutral" }) {
  return (
    <div className="flex items-start gap-3 border-b border-hairline/70 py-4 last:border-0">
      <span
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
          tone === "warning" ? "bg-[#ff6b6b] shadow-[0_0_10px_2px_rgba(208,59,59,0.5)]" : "bg-mute"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-mute">
          {sourceLabelFor(city, item.source)} · {timeAgo(item.retrieved_at)}
        </div>
        <p className="text-base text-ink">{item.summary}</p>
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
  const other = state.event.items.filter((i) => !WARNING_SOURCES.has(i.source));

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

      <Card>
        {warnings.length === 0 ? (
          <p className="py-4 text-center text-stone">No official warnings right now.</p>
        ) : (
          warnings.map((item) => <AlertRow key={item.item_id} item={item} city={city} />)
        )}
      </Card>

      {other.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-mute">Other Information</h2>
          <Card>
            {other.map((item) => (
              <AlertRow key={item.item_id} item={item} city={city} tone="neutral" />
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
