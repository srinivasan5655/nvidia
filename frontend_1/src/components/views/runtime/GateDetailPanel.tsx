import { useState } from "react";
import { Card, CardHeader } from "../../common/Card";
import { Badge, statusTone } from "../../common/Badge";
import { AiBadge } from "../../common/AiBadge";
import { GATE_LABELS, fmtDateTime } from "../../../lib/format";
import type { EvidenceVerifierDetails, GateResult, OpenshellSupervisorDetails, PolicyVerifierDetails } from "../../../lib/types";

function EvidenceVerifierBreakdown({ d, onViewIds }: { d: EvidenceVerifierDetails; onViewIds?: (ids: string[]) => void }) {
  const rows: [string, number][] = [
    ["Source score × 0.4", d.source_score],
    ["Freshness score × 0.3", d.freshness_score],
    ["Agreement score × 0.3", d.agreement_score],
  ];
  return (
    <div className="mt-3 space-y-2">
      <div className="text-xs text-stone">
        Sources present:{" "}
        {d.sources_present.map((s) => (
          <span key={s} className="mr-1.5 font-mono text-body">
            {s}
          </span>
        ))}
      </div>
      {rows.map(([label, v]) => (
        <div key={label} className="flex items-center gap-2 text-xs">
          <span className="w-40 shrink-0 text-stone">{label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
            <div className="h-full rounded-full bg-primary" style={{ width: `${v * 100}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-body">{v.toFixed(2)}</span>
        </div>
      ))}
      {d.stale_items.length > 0 &&
        (onViewIds ? (
          <button
            onClick={() => onViewIds(d.stale_items)}
            className="text-xs text-[#fab219] underline underline-offset-2 hover:text-[#ffcf6b]"
          >
            {d.stale_items.length} stale item(s) excluded from full trust →
          </button>
        ) : (
          <div className="text-xs text-[#fab219]">{d.stale_items.length} stale item(s) excluded from full trust</div>
        ))}
      {d.out_of_area_items.length > 0 &&
        (onViewIds ? (
          <button
            onClick={() => onViewIds(d.out_of_area_items)}
            className="block text-xs text-[#fab219] underline underline-offset-2 hover:text-[#ffcf6b]"
          >
            {d.out_of_area_items.length} item(s) outside the event footprint →
          </button>
        ) : (
          <div className="text-xs text-[#fab219]">{d.out_of_area_items.length} item(s) outside the event footprint</div>
        ))}
    </div>
  );
}

function OpenshellBreakdown({ d }: { d: OpenshellSupervisorDetails }) {
  if (!d.damage_evidence) {
    return <p className="mt-3 text-xs text-stone">No vision damage-evidence payload on this run.</p>;
  }
  const ev = d.damage_evidence;
  return (
    <div className="mt-3 space-y-2 text-xs">
      <div className="flex flex-wrap gap-1.5">
        {ev.flooding_observed && <Badge tone="critical">Flooding observed</Badge>}
        {ev.structural_damage_observed && <Badge tone="warning">Structural damage</Badge>}
        {ev.road_blocked && <Badge tone="warning">Road blocked</Badge>}
        {ev.visible_hazards.map((h) => (
          <Badge key={h} tone="neutral">
            {h.replaceAll("_", " ")}
          </Badge>
        ))}
      </div>
      {ev.estimated_water_depth_ft !== null && (
        <div className="text-stone">
          Estimated water depth: <span className="font-mono text-body">{ev.estimated_water_depth_ft} ft</span>
        </div>
      )}
      <AiBadge services={d.sandboxed ? ["NIM Vision", "OpenShell", "Relay"] : ["NIM Vision", "Relay"]} />
      <p className="text-stone">{ev.narrative}</p>
      <div className="text-[10px] uppercase tracking-wide text-stone">
        Sandboxed: {d.sandboxed ? "Yes (OpenShell)" : "No (in-process)"}
      </div>
    </div>
  );
}

function PolicyBreakdown({ d }: { d: PolicyVerifierDetails }) {
  if (d.violations && d.violations.length > 0) {
    return (
      <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-[#ff6b6b]">
        {d.violations.map((v) => (
          <li key={v}>{v}</li>
        ))}
      </ul>
    );
  }
  return (
    <p className="mt-3 text-xs text-stone">
      No violations found.{" "}
      {d.degraded_upstream && d.degraded_upstream.length > 0 && `Degraded upstream: ${d.degraded_upstream.join(", ")}`}
    </p>
  );
}

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(id).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="rounded-sm border border-hairline-strong bg-surface px-2 py-1 font-mono text-[10px] text-stone hover:border-primary hover:text-primary"
      title="Copy Relay scope id"
    >
      {copied ? "Copied" : id.slice(0, 8)}
    </button>
  );
}

export function GateDetailPanel({
  gate,
  evidenceCountLabel,
  onViewEvidence,
  onViewIds,
}: {
  gate: GateResult;
  evidenceCountLabel: string;
  onViewEvidence: () => void;
  onViewIds?: (ids: string[]) => void;
}) {
  return (
    <Card corner>
      <CardHeader
        eyebrow="Agent Detail"
        title={GATE_LABELS[gate.gate_name] ?? gate.gate_name}
        right={<Badge tone={statusTone(gate.status)}>{gate.status}</Badge>}
      />
      <p className="text-sm text-body">{gate.reasoning}</p>

      {gate.gate_name === "evidence_verifier" && (
        <EvidenceVerifierBreakdown d={gate.details as EvidenceVerifierDetails} onViewIds={onViewIds} />
      )}
      {gate.gate_name === "openshell_supervisor" && <OpenshellBreakdown d={gate.details as OpenshellSupervisorDetails} />}
      {gate.gate_name === "policy_verifier" && <PolicyBreakdown d={gate.details as PolicyVerifierDetails} />}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 text-xs">
        <button onClick={onViewEvidence} className="text-primary hover:underline">
          {evidenceCountLabel} →
        </button>
        <div className="flex items-center gap-2 text-stone">
          <span>{fmtDateTime(gate.ran_at)}</span>
          {gate.relay_scope_id && <CopyableId id={gate.relay_scope_id} />}
        </div>
      </div>
    </Card>
  );
}
