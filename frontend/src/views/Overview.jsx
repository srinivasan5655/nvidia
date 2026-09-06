import { useState } from 'react';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Overview({ run, loading, error, onRunReplay, onNavigate }) {
  const [label, setLabel] = useState('Houston heavy-rain event (replayed)');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
        <div>
          <div className="label-upper" style={{ color: 'var(--accent)' }}>Today's demo</div>
          <div className="display-md" style={{ marginTop: 6 }}>One replayed Houston event</div>
          <div className="body-md" style={{ marginTop: 8, maxWidth: 640 }}>
            NWS alert with heavy-rain forecast → USGS/HCFCD gauges corroborate → TranStar flags flooded roads →
            evidence bundle assembled with source lineage → gated through NVIDIA-governed decision agents →
            two outputs, both citing the same evidence record.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260 }}>
          <input className="text-input" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn-primary" disabled={loading} onClick={() => onRunReplay(label)}>
            {loading ? 'Running pipeline…' : 'Replay Houston Event'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <span style={{ color: '#f87171' }}>Pipeline error: {error}</span>
        </div>
      )}

      {run && (
        <>
          <div className="grid-4">
            <div className="spec-cell">
              <div className="spec-cell__value">{run.event.items.length}</div>
              <div className="spec-cell__label">Evidence items</div>
            </div>
            <div className="spec-cell">
              <div className="spec-cell__value">{run.gates.length}</div>
              <div className="spec-cell__label">Gates evaluated</div>
            </div>
            <div className="spec-cell">
              <div className="spec-cell__value">
                {run.insurer_exposure ? `$${(run.insurer_exposure.total_estimated_exposure / 1000).toFixed(0)}k` : '—'}
              </div>
              <div className="spec-cell__label">Estimated insurer exposure</div>
            </div>
            <div className="spec-cell">
              <div className="spec-cell__value"><StatusBadge status={run.overall_status} /></div>
              <div className="spec-cell__label">Overall status</div>
            </div>
          </div>

          <div className="grid-3">
            <button className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => onNavigate('evidence')}>
              <div className="title-md">Evidence Layer →</div>
              <div className="body-sm" style={{ marginTop: 6 }}>
                {run.event.items.length} items from {new Set(run.event.items.map((i) => i.source)).size} independent sources.
              </div>
            </button>
            <button className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => onNavigate('gates')}>
              <div className="title-md">Decision Gates →</div>
              <div className="body-sm" style={{ marginTop: 6 }}>
                Evidence verifier → confidence gate → OpenShell supervisor → policy verifier.
              </div>
            </button>
            <button className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => onNavigate('outputs')}>
              <div className="title-md">Outputs & Approval →</div>
              <div className="body-sm" style={{ marginTop: 6 }}>
                Life-safety guidance and insurer exposure, gated on human sign-off.
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
