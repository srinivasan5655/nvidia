import { useState } from "react";
import { Button } from "../common/Button";
import { RainOverlay } from "../common/RainOverlay";
import { FloodWave } from "../common/FloodWave";
import { IconCloudRain } from "../common/Icons";
import { PERSONA_ICON } from "./personaVisuals";
import { PERSONA_META } from "../../lib/personas";
import type { Persona } from "../../lib/types";

/** Front door of the app. There is no real backend auth behind this (the
 * API has none either — see the Command OS blueprint's audit) — this is a
 * demo-mode gate that accepts any non-empty email/password and moves on
 * to workspace selection, same honesty rule as everywhere else: it looks
 * like a real sign-in because that's the product vision, but nothing
 * here pretends a credential was actually checked.
 *
 * The quick-access row below exists because there IS no real credential
 * to hand out — one click signs in as that persona's demo identity and
 * drops straight into its workspace, skipping the manual form entirely. */
export function LoginView({
  onSignIn,
  onQuickAccess,
}: {
  onSignIn: (email: string) => void;
  onQuickAccess: (persona: Persona) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    onSignIn(email.trim());
  };

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="relative hidden flex-1 flex-col items-center justify-center overflow-hidden border-r border-hairline/60 px-12 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_36rem_at_30%_20%,rgba(118,185,0,0.18),transparent_60%),radial-gradient(40rem_30rem_at_80%_80%,rgba(191,242,48,0.10),transparent_55%)]"
        />
        <RainOverlay density={60} className="opacity-70" />
        <FloodWave height={64} className="absolute inset-x-0 bottom-0" />
        <div className="relative flex flex-col items-center gap-7 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <span className="animate-radar-ping absolute inset-0 rounded-full bg-primary/25" />
            <span className="animate-radar-ping absolute inset-0 rounded-full bg-primary/25 [animation-delay:0.8s]" />
            <span className="absolute inset-2 rounded-full border border-primary/30" />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green-pale to-primary shadow-[0_10px_30px_-6px_rgba(118,185,0,0.65)]">
              <IconCloudRain className="h-7 w-7 text-on-primary" />
            </span>
          </div>
          <div>
            <h1 className="bg-gradient-to-b from-ink to-body bg-clip-text text-3xl font-extrabold uppercase tracking-wide text-transparent">
              LifeShield AI
            </h1>
            <p className="mt-2 text-sm font-bold uppercase tracking-wider text-mute">
              Global Disaster Intelligence Platform
            </p>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-stone">
            Observe. Understand. Predict. Decide. Act. — one pipeline, gated by human approval, shared by
            government, insurance and response teams.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="lg:hidden">
            <h1 className="text-xl font-extrabold uppercase tracking-wide text-ink">LifeShield AI</h1>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-ink">Sign in</h2>
            <p className="mt-1 text-sm text-stone">
              Prototype build — no account system behind this yet. Jump straight into a workspace, or sign in
              manually below (any email/password is accepted).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {PERSONA_META.map((p) => {
              const Icon = PERSONA_ICON[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onQuickAccess(p.id)}
                  className="group flex flex-col items-start gap-2 rounded-xl border border-hairline-strong bg-surface-raised/60 p-3.5 text-left transition-colors hover:border-primary/50 hover:bg-surface-raised"
                  title={`Quick access as ${p.demoName} — ${p.demoEmail}`}
                >
                  <Icon className="h-4 w-4 text-mute group-hover:text-primary" />
                  <span className="text-xs font-bold text-ink">{p.label}</span>
                  <span className="font-mono text-[10px] text-stone">{p.demoEmail}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-stone">
            <span className="h-px flex-1 bg-hairline-strong" />
            or sign in manually
            <span className="h-px flex-1 bg-hairline-strong" />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-mute">Work email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@organization.com"
                className="h-11 rounded-xl border border-hairline-strong bg-surface px-3.5 text-sm text-ink placeholder:text-stone focus:border-primary focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-mute">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="any password"
                className="h-11 rounded-xl border border-hairline-strong bg-surface px-3.5 text-sm text-ink placeholder:text-stone focus:border-primary focus:outline-none"
              />
            </label>

            <Button type="submit" disabled={!email.trim() || !password} className="h-12 text-base">
              Sign In
            </Button>
          </form>

          <p className="text-center text-[11px] font-bold uppercase tracking-wider text-stone">
            Secure · Trusted · Global · Impactful
          </p>
        </div>
      </div>
    </div>
  );
}
