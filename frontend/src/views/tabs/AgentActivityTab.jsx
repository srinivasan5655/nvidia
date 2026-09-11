import { motion } from 'framer-motion';
import StatusBadge from '../../components/StatusBadge.jsx';
import TiltCard from '../../components/TiltCard.jsx';

const GATE_META = {
  evidence_verifier: {
    title: '1 · Evidence Verifier',
    desc: 'Scores freshness, location agreement, and independent-source agreement. Deterministic — no LLM decides trust.',
  },
  confidence_gate: {
    title: '2 · Confidence Gate',
    desc: 'Deterministic threshold check. Blocks low-confidence events before any NIM call is spent.',
  },
  openshell_supervisor: {
    title: '3 · OpenShell Supervisor',
    desc: 'Supervises the vision specialist\u2019s execution and validates its structured output before trust.',
  },
  policy_verifier: {
    title: '4 · Policy Verifier',
    desc: 'Confirms no upstream gate is blocked and no disallowed identifier-shaped fields entered the evidence bundle.',
  },
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 26, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 240, damping: 22 } },
};

/** The openshell_supervisor gate's `details.damage_evidence`, when present, is
 * either a real build.nvidia.com vision-model response (un-sandboxed path) or
 * a dependency-free byte-statistics heuristic (sandboxed path — see
 * backend/app/specialists/flood_vision.py). Neither path is hidden here: we
 * show the gate's own reasoning verbatim and flag the vision step as a
 * placeholder pending the model/runtime decision, rather than imply a
 * finished NIM vision integration either way. */
function VisionNote({ gate }) {
  if (!gate) return null;
  const evidence = gate.details?.damage_evidence;
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="badge badge-pending">Vision: Placeholder / pending model-runtime integration</span>
        <span className="caption">
          {gate.details?.sandboxed === true
            ? 'Currently: OpenShell-sandboxed heuristic (no NIM network egress from inside the sandbox yet)'
            : 'Currently: un-sandboxed path, lower-trust'}
        </span>
      </div>
      {evidence && (
        <div className="body-sm" style={{ marginTop: 10 }}>{evidence.narrative}</div>
      )}
    </div>
  );
}

export default function AgentActivityTab({ run }) {
  return (
    <motion.div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} variants={containerVariants} initial="hidden" animate="show">
      <motion.div variants={itemVariants} className="card">
        <div className="label-upper" style={{ color: 'var(--accent)' }}>NVIDIA runtime</div>
        <div className="body-sm" style={{ marginTop: 8 }}>
          Every gate below runs inside its own NeMo Relay-governed scope (exported trace in Audit Trail). NIM calls are
          routed through NeMo Switchyard to build.nvidia.com or self-hosted NIM on Curiosity v2, chosen by
          <span className="mono"> runtime_target</span>. The OpenShell Supervisor gate (3) governs sandboxed specialist
          execution — see the note on that gate for its current, honest status.
        </div>
      </motion.div>

      {run.gates.map((gate, idx) => {
        const meta = GATE_META[gate.gate_name] || { title: gate.gate_name, desc: '' };
        return (
          <motion.div key={gate.gate_name} variants={itemVariants}>
            <TiltCard maxTilt={3}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div className="title-md">{meta.title}</div>
                    <div className="caption" style={{ marginTop: 4 }}>{meta.desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div className="spec-cell__value" style={{ fontSize: 22 }}>{(gate.confidence * 100).toFixed(0)}%</div>
                      <div className="caption">confidence</div>
                    </div>
                    <StatusBadge status={gate.status} />
                  </div>
                </div>
                <div className="body-sm" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
                  {gate.reasoning}
                </div>
                {gate.gate_name === 'openshell_supervisor' && <VisionNote gate={gate} />}
                {idx < run.gates.length - 1 && (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 12, fontSize: 18 }}>↓</div>
                )}
              </div>
            </TiltCard>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
