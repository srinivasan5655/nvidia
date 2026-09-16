import { useState } from "react";
import { Card, CardHeader } from "../common/Card";
import { Button } from "../common/Button";
import { AiBadge } from "../common/AiBadge";
import { EmptyState } from "../common/States";
import { IconFileText } from "../common/Icons";
import { api } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import type { RunState } from "../../hooks/useEventRun";
import type { BriefingResult } from "../../lib/types";

/** Executive Briefing — one more narrative composed over a completed run's
 * own output (see backend/app/decision/briefing.py), for a reader who
 * wasn't watching the pipeline execute. Deliberately generated on demand,
 * not auto-run: it's a real NIM call, same "don't spend a model call the
 * operator didn't ask for" discipline as the SMS draft and eval suite. */
export function BriefingView({ state }: { state: RunState }) {
  const [result, setResult] = useState<BriefingResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const eventId = state.event?.event_id ?? null;
  const canGenerate = !!eventId && (state.phase === "complete" || state.overallStatus === "blocked");

  const generate = async () => {
    if (!eventId) return;
    setGenerating(true);
    setCopied(false);
    try {
      setResult(await api.briefing(eventId));
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.briefing);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable (permissions, non-HTTPS context) — the
      // text is still on screen and selectable; nothing to degrade to.
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-green-pale/30 to-primary/20 text-primary">
          <IconFileText className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Executive Briefing</h1>
          <p className="text-sm text-stone">
            Four sentences, built only from this run's own gates, life-safety, exposure and evacuation output.
          </p>
        </div>
      </div>

      {!eventId ? (
        <EmptyState title="No run loaded" body='Go to Command and press "Check Now" first — the briefing summarizes that run, not a blank event.' />
      ) : (
        <Card>
          <CardHeader
            eyebrow={state.event?.city_label}
            title={state.event?.label ?? ""}
            right={
              <Button onClick={generate} loading={generating} disabled={!canGenerate} className="h-9 px-4 text-[11px]">
                {result ? "Regenerate" : "Generate Briefing"}
              </Button>
            }
          />

          {!result && !generating && (
            <p className="text-sm text-stone">
              {canGenerate
                ? "Not generated yet this session — press Generate Briefing."
                : "Waiting for the pipeline to finish before a briefing can be composed."}
            </p>
          )}

          {result && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {result.model_used !== "none" ? (
                  <AiBadge model={result.model_used} services={["NIM", "Switchyard", "Relay"]} />
                ) : (
                  <span className="rounded-full border border-hairline-strong bg-surface-raised px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-mute">
                    Deterministic fallback — reasoning model unavailable
                  </span>
                )}
                <span className="text-[11px] text-stone">Generated {fmtDateTime(result.generated_at)}</span>
              </div>
              <p className="rounded-xl border border-hairline bg-surface/80 p-4 text-lg leading-relaxed text-ink">
                {result.briefing}
              </p>
              <Button variant="outline" onClick={copy} className="h-9 self-start px-4 text-[11px]">
                {copied ? "Copied" : "Copy briefing text"}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
