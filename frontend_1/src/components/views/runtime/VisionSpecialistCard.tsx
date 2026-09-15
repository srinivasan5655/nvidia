import { Card, CardHeader } from "../../common/Card";
import { Badge } from "../../common/Badge";
import { AiBadge } from "../../common/AiBadge";
import { EmptyState } from "../../common/States";
import { apiUrl } from "../../../lib/api";
import type { GateResult, OpenshellSupervisorDetails } from "../../../lib/types";

const HARNESS_LABELS: Record<string, string> = {
  deepagents: "DeepAgents",
  openshell_sandbox: "OpenShell Sandbox",
  direct_nim_call: "Direct NIM call (DeepAgents fell back)",
};

export function VisionSpecialistCard({ gate }: { gate: GateResult | undefined }) {
  const details = gate?.details as OpenshellSupervisorDetails | undefined;
  const ev = details?.damage_evidence;
  const harness = details?.vision_harness;

  return (
    <Card corner>
      <CardHeader
        eyebrow="Specialist"
        title="Flood Vision — Damage Evidence"
        right={
          harness && (
            <Badge tone={harness === "direct_nim_call" ? "warning" : "primary"}>{HARNESS_LABELS[harness]}</Badge>
          )
        }
      />
      {!gate ? (
        <EmptyState title="Awaiting openshell_supervisor gate" />
      ) : !ev ? (
        <EmptyState
          title="No structured damage evidence on this run"
          body={gate.reasoning}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
          <img
            src={apiUrl("/static/fixtures/field_image_flood.jpg")}
            alt="Field image analyzed by the vision specialist"
            className="h-40 w-full rounded-sm border border-hairline object-cover sm:h-full"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {ev.flooding_observed && <Badge tone="critical">Flooding observed</Badge>}
              {ev.structural_damage_observed && <Badge tone="warning">Structural damage</Badge>}
              {ev.road_blocked && <Badge tone="warning">Road blocked</Badge>}
              {!details?.sandboxed && <Badge tone="neutral">Not sandboxed</Badge>}
            </div>
            {ev.estimated_water_depth_ft !== null && (
              <div className="mb-2 text-sm">
                Estimated water depth:{" "}
                <span className="font-mono font-bold text-ink">{ev.estimated_water_depth_ft} ft</span>
              </div>
            )}
            <div className="mb-1.5">
              <AiBadge services={details?.sandboxed ? ["NIM Vision", "OpenShell", "Relay"] : ["NIM Vision", "Relay"]} />
            </div>
            <p className="text-xs text-body">{ev.narrative}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
