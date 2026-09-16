import { PERSONA_META } from "../../lib/personas";
import { PERSONA_ICON, PERSONA_TONE } from "./personaVisuals";
import type { Persona } from "../../lib/types";

/** Second step of the demo auth gate — picks which real, distinct
 * experience this session gets (see App.tsx's Persona type). Four tiles,
 * not five: every tile here corresponds to a workspace this app actually
 * builds a different screen for. A generic "Enterprise" tile with no
 * distinct workflow behind it would be exactly the fake-functionality
 * pattern this app avoids everywhere else, so it isn't here. */
export function WorkspaceSelectView({
  firstName,
  onSelect,
}: {
  firstName: string;
  onSelect: (persona: Persona) => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-16">
      <div className="mb-10 text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-mute">Welcome, {firstName}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">Select your workspace</h1>
        <p className="mt-2 text-sm text-stone">Choose the environment you operate in.</p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {PERSONA_META.map((p) => {
          const Icon = PERSONA_ICON[p.id];
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="group flex flex-col gap-4 rounded-2xl border border-hairline-strong bg-gradient-to-b from-surface-raised to-surface-elevated p-6 text-left shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_12px_24px_-12px_rgba(0,0,0,0.6)] transition-all hover:border-primary/50 hover:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_16px_32px_-12px_rgba(118,185,0,0.35)]"
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${PERSONA_TONE[p.id]}`}>
                <Icon className="h-6 w-6" />
              </span>
              <div>
                <div className="text-lg font-extrabold tracking-tight text-ink">{p.label}</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-mute">{p.org}</div>
              </div>
              <p className="text-sm text-stone">{p.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
