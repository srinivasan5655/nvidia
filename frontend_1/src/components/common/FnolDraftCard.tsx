import { useState } from "react";
import { Card, CardHeader } from "./Card";
import { Button } from "./Button";
import { AiBadge } from "./AiBadge";
import { fmtCurrencyFull } from "../../lib/format";
import { api } from "../../lib/api";
import type { FnolDraft, InsurerExposureLine } from "../../lib/types";

/** FNOL (First Notice of Loss) draft for the Insurance persona — auto-
 * fills the slowest part of a real claims pipeline (manual intake) for one
 * policy already inside this event's footprint. Every numeric field below
 * is copied verbatim from this run's own InsurerExposureLine; only the
 * incident description is model-written. Always "draft_pending_review" —
 * intake support for a human adjuster, never an automated payment. */
export function FnolDraftCard({ eventId, lines }: { eventId: string; lines: InsurerExposureLine[] }) {
  const [policyId, setPolicyId] = useState(lines[0]?.policy_id ?? "");
  const [result, setResult] = useState<FnolDraft | null>(null);
  const [generating, setGenerating] = useState(false);

  if (lines.length === 0) return null;

  const draft = async () => {
    if (!policyId) return;
    setGenerating(true);
    try {
      setResult(await api.fnolDraft(eventId, policyId));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader eyebrow="Insurance · Claims Intake" title="FNOL Draft" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={policyId}
          onChange={(e) => {
            setPolicyId(e.target.value);
            setResult(null);
          }}
          className="rounded-lg border border-hairline-strong bg-surface px-2.5 py-1.5 text-xs font-bold text-ink outline-none focus:border-primary"
        >
          {lines.map((l) => (
            <option key={l.policy_id} value={l.policy_id}>
              {l.policy_id} — {fmtCurrencyFull(l.capped_at_limit)}
            </option>
          ))}
        </select>
        <Button onClick={draft} loading={generating} className="h-9 px-4 text-[11px]">
          Draft FNOL
        </Button>
      </div>
      {result && (
        <div className="flex flex-col gap-2 rounded-xl border border-hairline bg-surface/80 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full border border-hairline-strong bg-surface-raised px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mute">
              {result.status.replace("_", " ")}
            </span>
            {result.model_used !== "none" && <AiBadge model={result.model_used} />}
          </div>
          <p className="text-sm text-body">{result.incident_description}</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-[10px] uppercase text-mute">Est. loss</div>
              <div className="font-mono font-bold text-ink">{fmtCurrencyFull(result.estimated_loss)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-mute">Net of deductible</div>
              <div className="font-mono font-bold text-ink">{fmtCurrencyFull(result.net_of_deductible)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-mute">Capped at limit</div>
              <div className="font-mono font-bold text-ink">{fmtCurrencyFull(result.capped_at_limit)}</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
