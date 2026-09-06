export default function AuditTrail({ run }) {
  if (!run) return <EmptyState />;

  const rows = [
    ...run.gates.map((g) => ({
      time: g.ran_at,
      type: 'gate',
      name: g.gate_name,
      status: g.status,
      confidence: g.confidence,
      detail: g.reasoning,
      relayScope: g.relay_scope_id,
    })),
  ];
  rows.sort((a, b) => new Date(a.time) - new Date(b.time));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card">
        <div className="label-upper" style={{ color: 'var(--accent)' }}>Audit Trail</div>
        <div className="title-lg" style={{ marginTop: 6 }}>Event {run.event.event_id}</div>
        <div className="body-sm" style={{ marginTop: 6 }}>
          Every row below corresponds to a NeMo Relay scope in the exported <span className="mono">lifeshield_event.atof.jsonl</span> trace
          file (default: <span className="mono">backend/var/relay_traces/</span>). Relay scope IDs are shown for cross-reference.
        </div>
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Name</th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Relay scope</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono">{fmt(r.time)}</td>
                <td className="mono">{r.type}</td>
                <td className="mono">{r.name}</td>
                <td className="mono">{r.status}</td>
                <td className="mono">{(r.confidence * 100).toFixed(0)}%</td>
                <td className="mono" style={{ fontSize: 11 }}>{r.relayScope || '—'}</td>
                <td>{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="title-md">Approval record</div>
        <div className="body-sm" style={{ marginTop: 8 }}>
          Status: <span className="mono">{run.approval_status}</span>
          {run.approval_note ? ` · Note: "${run.approval_note}"` : ''}
        </div>
      </div>
    </div>
  );
}

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function EmptyState() {
  return (
    <div className="card">
      <div className="body-md">No event has been run yet. Go to Overview and replay the Houston event first.</div>
    </div>
  );
}
