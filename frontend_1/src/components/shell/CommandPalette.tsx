import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { IconCommand } from "../common/Icons";

export interface PaletteCommand {
  id: string;
  group: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
}

/** Global ⌘K / Ctrl+K command interface. Every entry here dispatches to an
 * action that already exists elsewhere in the app (a nav change, the real
 * onRun/onRunRedTeam handlers, opening the assistant) — this is a faster
 * front door onto real capabilities, not a new surface pretending to do
 * something the app can't already do. Owns its own open/query/selection
 * state so mounting it at the shell root is the only wiring App.tsx needs. */
export function CommandPalette({ commands, openSignal }: { commands: PaletteCommand[]; openSignal?: number }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);

  // Lets an external trigger (the top bar's search field) open the same
  // palette instead of duplicating a second search implementation. Skips
  // the mount-time call so a caller can init the counter at 0 safely.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (openSignal !== undefined) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      // Let the panel mount before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const usable = commands.filter((c) => !c.disabled);
    if (!q) return usable;
    return usable.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => setSelected(0), [query]);

  const runSelected = (cmd?: PaletteCommand) => {
    const target = cmd ?? filtered[selected];
    if (!target) return;
    target.run();
    setOpen(false);
  };

  // The top bar's search field is the visible trigger now (plus ⌘K/Ctrl+K
  // anywhere); nothing to render while closed.
  if (!open) return null;

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[14vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-hairline-strong bg-surface-elevated shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3.5">
          <IconCommand className="h-4 w-4 shrink-0 text-mute" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runSelected();
              }
            }}
            placeholder="Run a command or jump to a screen…"
            className="h-6 flex-1 bg-transparent text-sm text-ink placeholder:text-stone focus:outline-none"
          />
          <kbd className="rounded-md border border-hairline-strong bg-surface px-1.5 py-0.5 font-mono text-[10px] text-mute">
            esc
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-stone">No matching command.</p>}
          {filtered.map((cmd, i) => {
            const showGroup = cmd.group !== lastGroup;
            lastGroup = cmd.group;
            return (
              <div key={cmd.id}>
                {showGroup && (
                  <div className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-mute first:pt-1.5">
                    {cmd.group}
                  </div>
                )}
                <button
                  onClick={() => runSelected(cmd)}
                  onMouseEnter={() => setSelected(i)}
                  className={clsx(
                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                    i === selected ? "bg-primary/15 text-ink" : "text-body hover:bg-surface-raised/70",
                  )}
                >
                  <span>{cmd.label}</span>
                  {cmd.hint && <span className="text-[11px] font-normal text-mute">{cmd.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
