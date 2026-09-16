import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { IconBell, IconCommand, IconChevronUpDown, IconLogOut } from "../common/Icons";
import { PERSONA_META } from "../../lib/personas";
import type { RunState } from "../../hooks/useEventRun";
import type { MockUser, Persona } from "../../lib/types";

type MenuId = "persona" | "notifications" | "user" | null;

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** The one bar every workspace shares — brand, current workspace, a
 * search shortcut into the real command palette, real attention-count
 * notifications (gates that aren't "passed" plus a pending approval — the
 * same data CommandCenterView reads, not a decorative badge number), and
 * the signed-in user. Persona switching lives here now, not in the
 * sidebar, so the sidebar can stay pure navigation. */
export function TopBar({
  persona,
  onPersonaChange,
  user,
  onSignOut,
  onOpenPalette,
  state,
}: {
  persona: Persona;
  onPersonaChange: (p: Persona) => void;
  user: MockUser;
  onSignOut: () => void;
  onOpenPalette: () => void;
  state: RunState;
}) {
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = PERSONA_META.find((p) => p.id === persona) ?? PERSONA_META[0];

  const attentionCount = state.gates.filter((g) => g.status !== "passed").length + (state.overallStatus === "awaiting_approval" ? 1 : 0);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b border-hairline/80 bg-canvas/90 px-5 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-green-pale to-primary shadow-[0_4px_16px_-2px_rgba(118,185,0,0.6)]">
          <span className="h-2.5 w-2.5 rounded-sm bg-on-primary/90" />
        </span>
        <div className="bg-gradient-to-r from-ink to-body bg-clip-text text-sm font-extrabold uppercase tracking-wide text-transparent">
          LifeShield AI
        </div>
      </div>

      <div ref={rootRef} className="flex flex-1 items-center gap-3">
        {/* Workspace / persona switcher */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu((m) => (m === "persona" ? null : "persona"))}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-hairline-strong bg-surface-raised/60 px-3 text-xs font-bold uppercase tracking-wide text-body hover:border-primary/50"
          >
            {current.label}
            <IconChevronUpDown className="h-3.5 w-3.5 text-mute" />
          </button>
          {openMenu === "persona" && (
            <div className="absolute left-0 top-11 z-40 w-72 rounded-2xl border border-hairline-strong bg-surface-elevated p-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)]">
              {PERSONA_META.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onPersonaChange(p.id);
                    setOpenMenu(null);
                  }}
                  className={clsx(
                    "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                    p.id === persona ? "bg-primary/15" : "hover:bg-surface-raised/70",
                  )}
                >
                  <span className="text-sm font-bold text-ink">{p.label}</span>
                  <span className="text-[11px] text-stone">{p.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search -> real command palette */}
        <button
          onClick={onOpenPalette}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-hairline-strong bg-surface-raised/40 px-3 text-left text-xs text-stone hover:border-hairline-strong/80 hover:text-mute sm:max-w-sm"
        >
          <IconCommand className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Search events, locations, assets…</span>
          <kbd className="ml-auto hidden rounded-md border border-hairline-strong px-1.5 py-0.5 font-mono text-[10px] text-mute sm:inline">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-2">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu((m) => (m === "notifications" ? null : "notifications"))}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-hairline-strong bg-surface-raised/40 text-mute hover:text-body"
              title="Attention items"
            >
              <IconBell className="h-4 w-4" />
              {attentionCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d03b3b] px-1 font-mono text-[10px] font-bold text-white">
                  {attentionCount}
                </span>
              )}
            </button>
            {openMenu === "notifications" && (
              <div className="absolute right-0 top-11 z-40 w-80 rounded-2xl border border-hairline-strong bg-surface-elevated p-3 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)]">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-mute">Needs attention</div>
                {attentionCount === 0 ? (
                  <p className="text-sm text-stone">Nothing needs attention right now.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {state.gates
                      .filter((g) => g.status !== "passed")
                      .map((g) => (
                        <li key={g.gate_name} className="text-xs text-body">
                          <span className="font-bold text-ink">{g.gate_name.replace(/_/g, " ")}:</span> {g.reasoning}
                        </li>
                      ))}
                    {state.overallStatus === "awaiting_approval" && (
                      <li className="text-xs text-body">
                        <span className="font-bold text-ink">Approval pending</span> on {state.event?.label}.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu((m) => (m === "user" ? null : "user"))}
              className="flex items-center gap-2 rounded-xl border border-hairline-strong bg-surface-raised/40 px-2 py-1.5 hover:border-primary/40"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-accent-green-pale to-primary text-[10px] font-bold text-on-primary">
                {initialsOf(user.name)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-xs font-bold text-ink">{user.name}</span>
                <span className="block text-[10px] text-mute">{user.org}</span>
              </span>
            </button>
            {openMenu === "user" && (
              <div className="absolute right-0 top-11 z-40 w-56 rounded-2xl border border-hairline-strong bg-surface-elevated p-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)]">
                <div className="px-3 py-2 text-xs text-stone">{user.email}</div>
                <button
                  onClick={onSignOut}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-body hover:bg-surface-raised/70"
                >
                  <IconLogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
