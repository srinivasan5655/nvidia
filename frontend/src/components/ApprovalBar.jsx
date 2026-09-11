import { useState } from 'react';
import { motion } from 'framer-motion';
import StatusBadge from './StatusBadge.jsx';

// Same approve/reject logic and endpoint call as the old Outputs.jsx page —
// only the placement changed: this now sits at the top of the persistent
// workspace so it's visible regardless of which of the three tabs is open,
// since one approval decision covers both outputs (life-safety + insurer
// exposure), not just whichever tab happens to be active.
export default function ApprovalBar({ run, onApprove, approving }) {
  const [note, setNote] = useState('');
  if (!run) return null;

  const canDecide = run.overall_status === 'awaiting_approval';

  return (
    <motion.div
      layout
      className="card"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        borderColor: canDecide ? 'var(--warning)' : 'var(--hairline)',
        background: canDecide ? 'rgba(223,101,0,0.06)' : 'var(--surface-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 260 }}>
        <StatusBadge status={run.approval_status} />
        <div>
          <div className="body-strong">
            {canDecide ? 'Human review required before release' : 'Approval record'}
          </div>
          <div className="caption">
            {canDecide
              ? 'Neither output is dispatched until a duty officer signs off here.'
              : run.approval_note
                ? `"${run.approval_note}"`
                : 'No note recorded.'}
          </div>
        </div>
      </div>

      {canDecide && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="text-input"
            placeholder="Optional note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ maxWidth: 260 }}
          />
          <button className="btn-primary" disabled={approving} onClick={() => onApprove('approved', note)}>
            Approve
          </button>
          <button className="btn-danger" disabled={approving} onClick={() => onApprove('rejected', note)}>
            Reject
          </button>
        </div>
      )}
    </motion.div>
  );
}
