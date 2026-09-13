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
} from "../common/Icons";
import { CITY_INFO } from "../../lib/format";
import type { ViewId } from "../../App";
import type { CityKey } from "../../lib/types";

export const NAV_ICONS: Record<ViewId, ComponentType<{ className?: string }>> = {
  home: IconHome,
  alerts: IconBell,
  map: IconMap,
  whatif: IconGitBranch,
  sms: IconMessageSquare,
  history: IconHistory,
  runtime: IconRobot,
  observability: IconGauge,
  evidence: IconLayers,
  "life-safety": IconHeartPulse,
  exposure: IconDollar,
};

interface NavGroup {
  label: string;
  items: { id: ViewId; label: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { id: "home", label: "Home" },
      { id: "alerts", label: "Alerts" },
      { id: "map", label: "Map & Safe Places" },
      { id: "whatif", label: "What If" },
      { id: "sms", label: "SMS Console" },
      { id: "history", label: "History" },
    ],
  },
  {
    label: "Data & Systems",
    items: [
      { id: "runtime", label: "Agentic Runtime" },
      { id: "observability", label: "Observability" },
      { id: "evidence", label: "Evidence" },
      { id: "life-safety", label: "Life Safety" },
      { id: "exposure", label: "Insurer Exposure" },
    ],
  },
];

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
}: {
  activeView: ViewId;
  onNavigate: (v: ViewId) => void;
  city: CityKey;
  onCityChange: (c: CityKey) => void;
  cityDisabled: boolean;
}) {
  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-hairline/80 bg-canvas/80 px-4 py-6 backdrop-blur-md">
      <div className="flex items-center gap-2.5 px-1">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-green-pale to-primary shadow-[0_4px_16px_-2px_rgba(118,185,0,0.6)]">
          <span className="h-3 w-3 rounded-sm bg-on-primary/90" />
        </span>
        <div className="leading-tight">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-mute">NVIDIA GSI Hackathon</div>
          <div className="bg-gradient-to-r from-ink to-body bg-clip-text text-sm font-extrabold uppercase tracking-wide text-transparent">
            LifeShield AI
          </div>
        </div>
      </div>

      <CitySelect city={city} onChange={onCityChange} disabled={cityDisabled} />

      <nav className="flex flex-1 flex-col gap-5">
        {NAV_GROUPS.map((group) => (
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
