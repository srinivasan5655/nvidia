import { useState } from 'react';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Outputs({ run, onApprove, approving }) {
  const [note, setNote] = useState('');
  if (!run) return <EmptyState />;

  const { life_safety, insurer_exposure, overall_status } = run;
  const canDecide = overall_status === 'awaiting_approval';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="label-upper" style={{ color: 'var(--accent)' }}>Decision Outputs</div>
          <div className="title-lg" style={{ marginTop: 6 }}>Both outputs cite the same evidence record</div>
        </div>
        <StatusBadge status={overall_status} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="title-md">Life-Safety Guidance</div>
          {life_safety ? (
            <>
              <div className="title-lg" style={{ marginTop: 10 }}>{life_safety.headline}</div>
              <ul style={{ marginTop: 12, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {life_safety.guidance_points.map((p, i) => (
                  <li key={i} className="body-sm">{p}</li>
                ))}
              </ul>
              <div className="body-sm" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
                {life_safety.hazard_narrative}
              </div>
              <div className="caption" style={{ marginTop: 10 }}>
                Confidence {(life_safety.confidence * 100).toFixed(0)}% · cites {life_safety.citing_evidence.length} evidence item(s)
              </div>
            </>
          ) : (
            <div className="body-sm muted" style={{ marginTop: 10 }}>Not computed — event was blocked upstream.</div>
          )}
        </div>

        <div className="card">
          <div className="title-md">Insurer Exposure</div>
          {insurer_exposure ? (
            <>
              <div className="grid-2" style={{ marginTop: 14 }}>
                <div className="spec-cell">
                  <div className="spec-cell__value">{insurer_exposure.total_policies_in_footprint}</div>
                  <div className="spec-cell__label">Policies in footprint</div>
                </div>
                <div className="spec-cell">
                  <div className="spec-cell__value">${(insurer_exposure.total_estimated_exposure / 1000).toFixed(0)}k</div>
                  <div className="spec-cell__label">Estimated exposure</div>
                </div>
              </div>
              <table className="data-table" style={{ marginTop: 16 }}>
                <thead>
                  <tr>
                    <th>Policy</th>
                    <th>TIV</th>
                    <th>Damage ratio</th>
                    <th>Exposure</th>
                  </tr>
                </thead>
                <tbody>
                  {insurer_exposure.lines.map((l) => (
                    <tr key={l.policy_id}>
                      <td className="mono">{l.policy_id}</td>
                      <td className="mono">${l.total_insured_value.toLocaleString()}</td>
                      <td className="mono">{(l.estimated_damage_ratio * 100).toFixed(1)}%</td>
                      <td className="mono">${l.capped_at_limit.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="caption" style={{ marginTop: 10 }}>{insurer_exposure.methodology}</div>
            </>
          ) : (
            <div className="body-sm muted" style={{ marginTop: 10 }}>Not computed — event was blocked upstream.</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="title-md">Human Approval Gate</div>
        <div className="body-sm" style={{ marginTop: 8 }}>
          Neither output is dispatched until a duty officer explicitly approves it here.
        </div>
        {canDecide ? (
          <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
            <input
              className="text-input"
              placeholder="Optional note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ maxWidth: 360 }}
            />
            <button className="btn-primary" disabled={approving} onClick={() => onApprove('approved', note)}>
              Approve
            </button>
            <button className="btn-danger" disabled={approving} onClick={() => onApprove('rejected', note)}>
              Reject
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <StatusBadge status={run.approval_status} />
            {run.approval_note && <span className="body-sm" style={{ marginLeft: 10 }}>“{run.approval_note}”</span>}
          </div>
        )}
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
