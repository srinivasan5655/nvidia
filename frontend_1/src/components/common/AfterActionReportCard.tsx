import { useState } from "react";
import { Card, CardHeader } from "./Card";
import { Button } from "./Button";
import { AiBadge } from "./AiBadge";
import { api } from "../../lib/api";
import type { AfterActionReportResult } from "../../lib/types";

/** After-Action Report for the Government persona — the post-incident
 * compliance document FEMA/NDMA-style agencies are typically required to
 * file after a real event. Generated on demand (a real NIM call), never
 * automatically, same "don't spend a model call the operator didn't ask
 * for" discipline as the SMS draft and Executive Briefing. */
export function AfterActionReportCard({ eventId }: { eventId: string }) {
  const [result, setResult] = useState<AfterActionReportResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      setResult(await api.afterActionReport(eventId));
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.report_text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable — text is still on screen and selectable.
    }
  };

  return (
    <Card>
      <CardHeader
        eyebrow="Government · Compliance"
        title="After-Action Report"
        right={
          <Button onClick={generate} loading={generating} className="h-9 px-4 text-[11px]">
            {result ? "Regenerate" : "Generate Report"}
          </Button>
        }
      />
      {!result && !generating && (
        <p className="text-xs text-stone">
          Not generated yet — press Generate Report. Built only from this run's own gates, decisions, and outcome.
        </p>
      )}
      {result && (
        <div className="flex flex-col gap-3">
          {result.model_used !== "none" ? (
            <AiBadge model={result.model_used} services={["NIM", "Switchyard", "Relay"]} />
          ) : (
            <span className="w-fit rounded-full border border-hairline-strong bg-surface-raised px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-mute">
              Deterministic fallback
            </span>
          )}
          <pre className="whitespace-pre-wrap rounded-xl border border-hairline bg-surface/80 p-4 text-sm leading-relaxed text-body">
            {result.report_text}
          </pre>
          <Button variant="outline" onClick={copy} className="h-9 self-start px-4 text-[11px]">
            {copied ? "Copied" : "Copy report text"}
          </Button>
        </div>
      )}
    </Card>
  );
}
