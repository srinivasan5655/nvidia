import StatusBadge from '../components/StatusBadge.jsx';

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
    desc: 'Supervises the sandboxed vision specialist\u2019s execution and validates its structured output before trust.',
  },
  policy_verifier: {
    title: '4 · Policy Verifier',
    desc: 'Confirms no upstream gate is blocked and no disallowed identifier-shaped fields entered the evidence bundle.',
  },
};

export default function DecisionGates({ run }) {
  if (!run) return <EmptyState />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card">
        <div className="label-upper" style={{ color: 'var(--accent)' }}>Decision Gates</div>
        <div className="title-lg" style={{ marginTop: 6 }}>
          No operational action leaves the system without a passed gate
        </div>
        <div className="body-sm" style={{ marginTop: 6 }}>
          Every gate below is wrapped in its own NeMo Relay Guardrail scope — see Audit Trail for the exported trace.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {run.gates.map((gate, idx) => {
          const meta = GATE_META[gate.gate_name] || { title: gate.gate_name, desc: '' };
          return (
            <div key={gate.gate_name} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="title-md">{meta.title}</div>
                  <div className="caption" style={{ marginTop: 4 }}>{meta.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div className="spec-cell__value" style={{ fontSize: 22 }}>
                      {(gate.confidence * 100).toFixed(0)}%
                    </div>
                    <div className="caption">confidence</div>
                  </div>
                  <StatusBadge status={gate.status} />
                </div>
              </div>
              <div className="body-sm" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
                {gate.reasoning}
              </div>
              {gate.details && Object.keys(gate.details).length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary className="caption" style={{ cursor: 'pointer' }}>Gate details</summary>
                  <pre className="mono body-sm" style={{ marginTop: 8, overflowX: 'auto' }}>
                    {JSON.stringify(gate.details, null, 2)}
                  </pre>
                </details>
              )}
              {idx < run.gates.length - 1 && (
                <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 12, fontSize: 18 }}>↓</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card">
      <div className="body-md">No event has been run yet. Go to Overview and replay the Houston event first.</div>
    </div>
  );
}
