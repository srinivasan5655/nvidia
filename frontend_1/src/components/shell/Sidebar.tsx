import type { ComponentType } from "react";
import clsx from "clsx";
import {
  IconHome,
  IconBell,
  IconMap,
  IconGitBranch,
  IconMessageSquare,
  IconHistory,
  IconRobot,
  IconLayers,
  IconHeartPulse,
  IconDollar,
  IconGauge,
  IconFlask,
  IconFileText,
  IconBriefcase,
} from "../common/Icons";
import { CITY_INFO } from "../../lib/format";
import type { ViewId } from "../../App";
import type { CityKey, Persona } from "../../lib/types";

export const NAV_ICONS: Record<ViewId, ComponentType<{ className?: string }>> = {
  home: IconHome,
  alerts: IconBell,
  map: IconMap,
  whatif: IconGitBranch,
  sms: IconMessageSquare,
  history: IconHistory,
  runtime: IconRobot,
  observability: IconGauge,
  eval: IconFlask,
  evidence: IconLayers,
  "life-safety": IconHeartPulse,
  exposure: IconDollar,
  briefing: IconFileText,
  portfolio: IconBriefcase,
};

interface NavGroup {
  label: string;
  items: { id: ViewId; label: string }[];
}

const HOME_LABEL: Record<Persona, string> = {
  command: "Command",
  insurance: "Exposure Overview",
  field: "Home",
  executive: "Overview",
};

/** Persona-specific information architecture — same ViewIds, same
 * underlying data, reordered and regrouped toward what each world asks
 * first (see the Command OS blueprint's IA section). Field intentionally
 * gets the smallest set: a responder on a phone doesn't need Agentic
 * Runtime or the golden dataset, and hiding those isn't a limitation,
 * it's the point of a persona-scoped nav. */
export function navGroupsFor(persona: Persona): NavGroup[] {
  const home = { id: "home" as ViewId, label: HOME_LABEL[persona] };

  if (persona === "field") {
    return [
      {
        label: "Respond",
        items: [home, { id: "map", label: "Map & Safe Places" }, { id: "alerts", label: "Alerts" }, { id: "sms", label: "SMS Console" }],
      },
    ];
  }

  if (persona === "executive") {
    return [
      {
        label: "Executive",
        items: [
          home,
          { id: "briefing", label: "Executive Brief" },
          { id: "portfolio", label: "Portfolio" },
          { id: "map", label: "Living World" },
          { id: "history", label: "History" },
        ],
      },
    ];
  }

  if (persona === "insurance") {
    return [
      {
        label: "Command",
        items: [
          home,
          { id: "exposure", label: "Impact & Insurance" },
          { id: "portfolio", label: "Portfolio" },
          { id: "evidence", label: "Evidence" },
        ],
      },
      {
        label: "Response",
        items: [
          { id: "map", label: "Living World" },
          { id: "whatif", label: "Simulation Lab" },
          { id: "life-safety", label: "Life Safety" },
          { id: "alerts", label: "Alerts" },
          { id: "sms", label: "SMS Console" },
        ],
      },
      {
        label: "Reports & AI",
        items: [
          { id: "briefing", label: "Executive Brief" },
          { id: "history", label: "History" },
          { id: "runtime", label: "Agentic Runtime" },
          { id: "observability", label: "Observability" },
          { id: "eval", label: "Golden Dataset" },
        ],
      },
    ];
  }

  return [
    {
      label: "Command",
      items: [
        home,
        { id: "alerts", label: "Alerts" },
        { id: "map", label: "Living World" },
        { id: "whatif", label: "Simulation Lab" },
        { id: "portfolio", label: "Portfolio" },
      ],
    },
    {
      label: "Response",
      items: [
        { id: "sms", label: "SMS Console" },
        { id: "life-safety", label: "Life Safety" },
        { id: "exposure", label: "Impact & Insurance" },
      ],
    },
    {
      label: "Reports & AI",
      items: [
        { id: "briefing", label: "Executive Brief" },
        { id: "history", label: "History" },
        { id: "runtime", label: "Agentic Runtime" },
        { id: "observability", label: "Observability" },
        { id: "eval", label: "Golden Dataset" },
        { id: "evidence", label: "Evidence" },
      ],
    },
  ];
}

const CITIES: CityKey[] = ["houston", "chennai", "bangalore"];

function CitySelect({
  city,
  onChange,
  disabled,
}: {
  city: CityKey;
  onChange: (c: CityKey) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-hairline bg-surface-elevated/60 p-2">
      <div className="px-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-mute">Monitoring</div>
      {CITIES.map((c) => (
        <button
          key={c}
          disabled={disabled}
          onClick={() => onChange(c)}
          className={clsx(
            "flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold uppercase tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-40",
            city === c
              ? "bg-gradient-to-b from-surface-raised to-surface-elevated text-ink ring-1 ring-primary/50"
              : "text-stone hover:bg-surface-raised/60 hover:text-body",
          )}
        >
          <span
            className={clsx(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              city === c ? "bg-primary shadow-[0_0_8px_1px_rgba(118,185,0,0.8)]" : "bg-hairline-strong",
            )}
          />
          {CITY_INFO[c].short}
        </button>
      ))}
    </div>
  );
}

export function Sidebar({
  activeView,
  onNavigate,
  city,
  onCityChange,
  cityDisabled,
  persona,
}: {
  activeView: ViewId;
  onNavigate: (v: ViewId) => void;
  city: CityKey;
  onCityChange: (c: CityKey) => void;
  cityDisabled: boolean;
  persona: Persona;
}) {
  const navGroups = navGroupsFor(persona);
  return (
    <aside className="sticky top-14 flex h-[calc(100vh-56px)] w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-hairline/80 bg-canvas/80 px-4 py-6 backdrop-blur-md">
      <CitySelect city={city} onChange={onCityChange} disabled={cityDisabled} />

      <nav className="flex flex-1 flex-col gap-5">
        {navGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-mute">{group.label}</div>
            {group.items.map((item) => {
              const Icon = NAV_ICONS[item.id];
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={clsx(
                    "flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-sm font-bold transition-all duration-150",
                    active
                      ? "bg-gradient-to-b from-surface-raised to-surface-elevated text-ink shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_6px_16px_-4px_rgba(0,0,0,0.5)] ring-1 ring-primary/40"
                      : "text-stone hover:bg-surface-raised/50 hover:text-body",
                  )}
                >
                  <Icon className={clsx("h-[18px] w-[18px] shrink-0", active ? "text-primary" : "text-mute")} />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
