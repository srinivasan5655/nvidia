import { motion } from "framer-motion";
import { Card } from "../../common/Card";
import { Badge, statusTone } from "../../common/Badge";
import { ConfidenceBar } from "../../common/ConfidenceBar";
import { GATE_LABELS, fmtTime } from "../../../lib/format";
import type { GateResult } from "../../../lib/types";

const PIPELINE_ORDER = ["evidence_verifier", "confidence_gate", "openshell_supervisor", "policy_verifier"];

export function GatePipeline({
  gates,
  streaming,
  onSelectGate,
  activeGate,
}: {
  gates: GateResult[];
  streaming: boolean;
  onSelectGate: (name: string) => void;
  activeGate: string | null;
}) {
  const byName = new Map(gates.map((g) => [g.gate_name, g]));

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {PIPELINE_ORDER.map((name, i) => {
        const gate = byName.get(name);
        const pending = !gate;
        return (
          <motion.div
            key={name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: gate ? 1 : 0.4, y: 0 }}
            transition={{ duration: 0.35, delay: pending ? 0 : 0.05 }}
          >
            <Card
              corner
              onClick={() => gate && onSelectGate(name)}
              className={`h-full cursor-pointer transition-colors ${
                activeGate === name ? "border-primary" : "hover:border-hairline-strong"
              } ${pending ? "border-dashed" : ""}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-mute">Gate {i + 1}</span>
                {gate ? (
                  <Badge tone={statusTone(gate.status)}>{gate.status}</Badge>
                ) : streaming ? (
                  <Badge tone="neutral" className="animate-pulse-live">
                    Running
                  </Badge>
                ) : (
                  <Badge tone="neutral">Pending</Badge>
                )}
              </div>
              <div className="mb-3 text-sm font-bold text-ink">{GATE_LABELS[name] ?? name}</div>
              {gate ? (
                <>
                  <ConfidenceBar value={gate.confidence} label="Confidence" />
                  <p className="mt-3 line-clamp-3 text-xs text-stone">{gate.reasoning}</p>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-stone">
                    <span>{fmtTime(gate.ran_at)}</span>
                    <span>{gate.evidence_used.length} evidence</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-stone">Awaiting upstream result…</p>
              )}
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
